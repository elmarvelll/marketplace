// services/marketplace/checkout/ensure-checkout-payment.ts
//
// Returns the CheckoutPayment row for a reference, creating ("adopting") one
// for a checkout initialized before CheckoutPayment existed. Those legacy
// checkouts only have Order rows (paymentStatus "pending" or "paid") — they
// already took stock at initialize time, exactly like a new reservation — so
// once adopted they go through the same finalize/release/reconcile code as
// any new checkout, instead of a second legacy-only path.
//
// The adopted amount is recomputed from what initialize charged (order
// totals + the platform fee rule, plus a vendor booking's delivery/service
// fees). cartItemIds is empty: the old code never recorded which cart lines a
// checkout covered, so an adopted checkout clears none of the buyer's cart.

import { Prisma, type CheckoutPayment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SERVICE_FEE_RATE } from "./shared/service-fee";
import { CHECKOUT_CURRENCY, reservationExpiry, toKobo } from "./shared/checkout-payment-config";
import { ORDER_PAYMENT_STATUS } from "@/services/marketplace/order/shared/paid-order";

export async function ensureCheckoutPayment(reference: string): Promise<CheckoutPayment | null> {
  const existing = await prisma.checkoutPayment.findUnique({ where: { reference } });
  if (existing) return existing;

  const orders = await prisma.order.findMany({
    where: { paystackReference: reference },
    select: { userId: true, totalAmount: true, paymentStatus: true, createdAt: true, vendorDeliveryBookingId: true },
  });
  if (orders.length === 0) return null;

  const booking = orders.some((o) => o.vendorDeliveryBookingId)
    ? await prisma.vendorDeliveryBooking.findFirst({ where: { paystackReference: reference }, select: { deliveryFee: true, serviceFee: true } })
    : null;
  const subtotal = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const total = booking ? subtotal + booking.deliveryFee + booking.serviceFee : subtotal + subtotal * SERVICE_FEE_RATE;
  const createdAt = orders.reduce((min, o) => (o.createdAt < min ? o.createdAt : min), orders[0].createdAt);
  const allPaid = orders.every((o) => o.paymentStatus === ORDER_PAYMENT_STATUS.PAID);

  try {
    return await prisma.checkoutPayment.create({
      data: {
        reference,
        userId: orders[0].userId,
        kind: booking ? "VENDOR" : "BUSINESS",
        status: allPaid ? "PAID" : "PENDING",
        amountKobo: toKobo(total),
        currency: CHECKOUT_CURRENCY,
        cartItemIds: [],
        expiresAt: reservationExpiry(createdAt),
        paidAt: allPaid ? createdAt : null,
        createdAt,
      },
    });
  } catch (err) {
    // Two callers adopting the same reference at once — the other one won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.checkoutPayment.findUnique({ where: { reference } });
    }
    throw err;
  }
}
