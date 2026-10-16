// services/marketplace/checkout/release-checkout-reservation.ts
//
// Gives back everything an unpaid checkout was holding: the stock its order
// lines reserved at initialize and (vendor) its delivery booking. Only ever
// called once Paystack has told us nothing was paid (failed / abandoned /
// not found / still unpaid past expiry) — never on the browser's word alone,
// and never when the outcome is unknown.
//
// Exactly-once: the CheckoutPayment PENDING -> FAILED|ABANDONED|EXPIRED
// update is conditional and runs in the SAME transaction as the restock, so
// a cancel request, the reconciler, and a second tab racing each other can
// release a checkout at most once — stock that was reserved is restored
// once, and stock that was never reserved is never "restored".
//
// The Order rows are kept (internal record for reconciliation) but marked
// with the released payment status and CANCELLED, so they stay hidden from
// every order list (see order/shared/paid-order.ts) and can't be accepted.

import { prisma } from "@/lib/prisma";
import { releaseLine } from "./shared/stock-reservation";
import { logPayment } from "./shared/payment-log";
import { ORDER_PAYMENT_STATUS } from "@/services/marketplace/order/shared/paid-order";

export type ReleasedStatus = "FAILED" | "ABANDONED" | "EXPIRED";

const ORDER_STATUS_FOR: Record<ReleasedStatus, string> = {
  FAILED: ORDER_PAYMENT_STATUS.FAILED,
  ABANDONED: ORDER_PAYMENT_STATUS.ABANDONED,
  EXPIRED: ORDER_PAYMENT_STATUS.EXPIRED,
};

const REASON_FOR: Record<ReleasedStatus, string> = {
  FAILED: "Payment failed.",
  ABANDONED: "Payment was cancelled before completion.",
  EXPIRED: "Payment was not completed in time.",
};

// Returns true if THIS call released the reservation, false if it was no
// longer PENDING (already released, paid, or flagged by someone else).
export async function releaseCheckoutReservation(
  checkoutPaymentId: string,
  to: ReleasedStatus,
  detail: { providerStatus?: string | null } = {}
): Promise<boolean> {
  const now = new Date();
  const released = await prisma.$transaction(
    async (tx) => {
      const claim = await tx.checkoutPayment.updateMany({
        where: { id: checkoutPaymentId, status: "PENDING" },
        data: {
          status: to,
          stockReleasedAt: now,
          ...(detail.providerStatus !== undefined ? { providerStatus: detail.providerStatus, providerCheckedAt: now } : {}),
        },
      });
      if (claim.count !== 1) return null;

      const payment = await tx.checkoutPayment.findUniqueOrThrow({ where: { id: checkoutPaymentId }, select: { reference: true } });
      const items = await tx.orderItem.findMany({
        where: { order: { paystackReference: payment.reference } },
        select: { productId: true, variantId: true, sideId: true, quantity: true },
      });
      for (const item of items) {
        await releaseLine(tx, item);
      }

      await tx.order.updateMany({
        where: { paystackReference: payment.reference, paymentStatus: { not: ORDER_PAYMENT_STATUS.PAID } },
        data: { paymentStatus: ORDER_STATUS_FOR[to], status: "CANCELLED", cancelledAt: now, cancellationReason: REASON_FOR[to] },
      });
      await tx.vendorDeliveryBooking.updateMany({
        where: { paystackReference: payment.reference, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
      return { reference: payment.reference, lines: items.length };
    },
    { maxWait: 10000, timeout: 15000 }
  );

  if (released) {
    logPayment("info", "reservation_released", { reference: released.reference, to, lines: released.lines, providerStatus: detail.providerStatus });
  }
  return released !== null;
}
