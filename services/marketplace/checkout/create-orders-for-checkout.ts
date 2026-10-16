// services/marketplace/checkout/create-orders-for-checkout.ts
//
// Creates one Order (with its OrderItems) per business represented in the
// cart, all sharing one Paystack reference — see the comment on
// Order.paystackReference in prisma/schema.prisma for why that column
// isn't unique. Called by
// src/app/api/marketplace/checkout/initialize/route.controller.ts.
//
// These Order rows are the INTERNAL side of a payment attempt, not customer
// orders yet: they're created with paymentStatus "pending", hidden from every
// order list (see order/shared/paid-order.ts), and only become real orders
// when Paystack confirms payment (confirm-payment-by-reference.ts).
//
// Stock is re-validated and RESERVED here, inside the same transaction as
// order creation — a conditional decrement (shared/stock-reservation.ts), so
// concurrent checkouts can never oversell. The reservation is recorded as a
// CheckoutPayment row (same transaction) with an expiry; if the payment is
// cancelled, fails, or expires it is released exactly once
// (release-checkout-reservation.ts). The amount the buyer must pay is
// computed here from database prices and stored on that row — verification
// later compares Paystack's reported amount against it.

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/service-error";
import { getCartForUser } from "@/services/marketplace/cart/get-cart-for-user";
import { getEstimatedDeliveryForBusiness } from "@/services/marketplace/delivery/estimated-delivery.service";
import { SERVICE_FEE_RATE } from "./shared/service-fee";
import { EmptyCartError } from "./shared/empty-cart-error";
import { reserveLine } from "./shared/stock-reservation";
import { CHECKOUT_CURRENCY, reservationExpiry, toKobo } from "./shared/checkout-payment-config";

export { EmptyCartError };

export async function createOrdersForCheckout(userId: string, location: string) {
  const cartItems = await getCartForUser(userId);
  if (cartItems.length === 0) {
    throw new EmptyCartError("Your cart is empty.");
  }

  const byBusiness = new Map<string, typeof cartItems>();
  for (const item of cartItems) {
    byBusiness.set(item.businessId, [...(byBusiness.get(item.businessId) ?? []), item]);
  }

  const reference = `AKD-${Date.now()}-${randomUUID().slice(0, 8)}`;

  // The estimated delivery date/window is calculated per business (each
  // business has its own delivery days) before creating the orders, so
  // every order/item is stamped with it at creation time rather than
  // computed lazily later.
  const estimates = new Map(
    await Promise.all(
      Array.from(byBusiness.keys()).map(
        async (businessId) => [businessId, await getEstimatedDeliveryForBusiness(businessId)] as const
      )
    )
  );

  const orders = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const [businessId, items] of byBusiness) {
      // A business already in the buyer's cart could have been rejected
      // (or hasn't been approved yet) since it was added — search/browse
      // already keep unapproved businesses out of reach for a NEW add, but
      // a stale cart line is still possible, so this is checked again
      // here as the actual point of no return.
      const business = await tx.business.findUnique({ where: { id: businessId }, select: { approvalStatus: true, type: true, blocked: true } });
      // An admin-blocked business can't take new orders (its existing
      // orders/history are untouched) — enforced here, not just hidden in the UI.
      if (business?.approvalStatus !== "APPROVED" || business.blocked) {
        throw conflict(`${items[0].sellerName} isn't currently accepting orders.`);
      }
      // A School Vendor's items never flow through Business checkout — see
      // add-to-cart.ts's own guard; this is the actual point of no return,
      // so it's re-checked here too rather than trusted from the cart read.
      if (business.type !== "BUSINESS") {
        throw conflict(`${items[0].sellerName} orders must go through the Vendor checkout.`);
      }

      // Reserve stock for every line before creating anything for this
      // business. Conditional decrement: if another checkout took the last
      // units first, the update matches no row and the whole transaction
      // (every earlier reservation in it included) rolls back.
      for (const item of items) {
        if (!Number.isInteger(item.quantity) || item.quantity < 1) throw conflict(`${item.productName} has an invalid quantity.`);
        const reserved = await reserveLine(tx, { productId: item.productId, variantId: item.variantId, sideId: null, quantity: item.quantity });
        if (!reserved) {
          throw conflict(`${item.productName}${item.variantName ? ` (${item.variantName})` : ""} no longer has enough stock.`);
        }
      }

      const estimate = estimates.get(businessId)!;
      const order = await tx.order.create({
        data: {
          userId,
          businessId,
          status: "PENDING_SELLER",
          paymentStatus: "pending",
          paystackReference: reference,
          deliveryLocation: location || null,
          estimatedDeliveryAt: estimate.estimatedDeliveryAt,
          deliveryWindowStart: estimate.deliveryWindowStart,
          deliveryWindowEnd: estimate.deliveryWindowEnd,
          totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              variantName: item.variantName,
              quantity: item.quantity,
              price: item.price,
              selectedVariants: item.selectedVariants ? JSON.stringify(item.selectedVariants) : null,
            })),
          },
        },
      });
      created.push(order);
    }

    const subtotal = created.reduce((sum, order) => sum + order.totalAmount, 0);
    const totalAmount = subtotal + subtotal * SERVICE_FEE_RATE;
    const amountKobo = toKobo(totalAmount);
    if (amountKobo <= 0) throw conflict("This order has nothing to pay for.");

    // The payment attempt: what must be paid, which cart lines it covers
    // (only those are cleared on success — the cart is left intact until
    // then, so a cancelled payment loses nothing), and when the stock
    // reservation above lapses.
    await tx.checkoutPayment.create({
      data: {
        reference,
        userId,
        kind: "BUSINESS",
        amountKobo,
        currency: CHECKOUT_CURRENCY,
        cartItemIds: cartItems.map((item) => item.id),
        expiresAt: reservationExpiry(),
      },
    });

    return { created, totalAmount, amountKobo };
  }, { maxWait: 10000, timeout: 20000 });

  return { reference, totalAmount: orders.totalAmount, amountKobo: orders.amountKobo, orderIds: orders.created.map((o) => o.id) };
}
