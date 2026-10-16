// services/marketplace/checkout/confirm-payment-by-reference.ts
//
// Finalizes a checkout that Paystack has CONFIRMED as paid (the caller —
// reconcile-checkout-payment.ts — has already called verifyTransaction
// server-side; this file never trusts a browser callback or a webhook body).
//
// Before anything is finalized the verified transaction must match what this
// checkout charged: same reference, same amount in kobo, same currency. A
// mismatch is never finalized — it's flagged NEEDS_REVIEW for an admin.
//
// Idempotent and race-safe for both checkout kinds (Business and School
// Vendor share this one path):
//   - PENDING checkout: a conditional PENDING -> PAID update inside the
//     finalize transaction elects exactly one winner among concurrent
//     callers (webhook, verify, cancel, reconciler). Only the winner marks the
//     orders paid, confirms the vendor booking, records events, enqueues the
//     owner emails (same transaction), clears the cart lines this checkout
//     covered, and creates in-app notifications. Everyone else gets the
//     already-finalized result.
//   - Already-PAID checkout: returns the orders; nothing is re-sent.
//   - Released checkout (ABANDONED/EXPIRED/FAILED) that turns out to have been
//     paid after all (browser said "cancelled" but Paystack says success, or
//     a bank transfer settled late): the stock/capacity it gave back is
//     re-reserved inside a transaction; if that's no longer possible the
//     checkout is flagged NEEDS_REVIEW (the buyer paid — an admin must fulfil
//     or refund), never silently dropped.
// Stock is not touched for a PENDING checkout — it was reserved at
// initialize and simply stops being a reservation. So a successful payment
// results in exactly one deduction.

import { Prisma, type CheckoutPayment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { VerifiedTransaction } from "@/lib/external/paystack";
import type { Db } from "@/services/marketplace/order/shared/db";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { notifyAdmins } from "@/services/marketplace/notifications/notification.service";
import { ORDER_PAYMENT_STATUS } from "@/services/marketplace/order/shared/paid-order";
import { resolveVendorCapacity } from "@/services/marketplace/vendor/capacity/resolve-vendor-capacity";
import { countVendorBookingsForSlot } from "@/services/marketplace/vendor/capacity/manage-vendor-capacity";
import { reserveLine } from "./shared/stock-reservation";
import { logPayment } from "./shared/payment-log";
import { enqueueOrderPaidEmails, createOrderPaidNotifications } from "./notify-order-paid";

export type ConfirmResult =
  | { state: "paid"; orderIds: string[]; newlyConfirmed: boolean; emailIds: string[] }
  | { state: "needs_review"; reason: string };

const RELEASED = ["FAILED", "ABANDONED", "EXPIRED"] as const;

class ReReserveError extends Error {}

export function describeMismatch(payment: Pick<CheckoutPayment, "reference" | "amountKobo" | "currency">, verified: VerifiedTransaction): string | null {
  if (verified.reference !== payment.reference) return `reference mismatch (Paystack returned ${verified.reference})`;
  if (verified.amountKobo !== payment.amountKobo) return `amount mismatch (expected ${payment.amountKobo} kobo, Paystack reported ${verified.amountKobo})`;
  if (verified.currency.toUpperCase() !== payment.currency.toUpperCase()) return `currency mismatch (expected ${payment.currency}, Paystack reported ${verified.currency || "none"})`;
  return null;
}

export async function confirmPaymentByReference(payment: CheckoutPayment, verified: VerifiedTransaction): Promise<ConfirmResult> {
  if (payment.status === "PAID") {
    return { state: "paid", orderIds: await orderIdsFor(payment.reference), newlyConfirmed: false, emailIds: [] };
  }
  if (payment.status === "NEEDS_REVIEW") return { state: "needs_review", reason: payment.reviewReason ?? "Under review." };

  const mismatch = describeMismatch(payment, verified);
  if (mismatch) return flagForReview(payment, mismatch, verified.status);

  if (payment.status === "PENDING") {
    const result = await finalizePending(payment, verified);
    if (result) return result;
  } else {
    const result = await finalizeAfterRelease(payment, verified);
    if (result) return result;
  }

  // Lost a race — someone else changed this checkout between our read and
  // our conditional update. Re-read and report whatever it is now; if it was
  // released in the meantime (cancel racing a late success) try once more
  // through the re-reserve path.
  const fresh = await prisma.checkoutPayment.findUniqueOrThrow({ where: { id: payment.id } });
  if (fresh.status === "PAID") return { state: "paid", orderIds: await orderIdsFor(fresh.reference), newlyConfirmed: false, emailIds: [] };
  if (fresh.status === "NEEDS_REVIEW") return { state: "needs_review", reason: fresh.reviewReason ?? "Under review." };
  const retry = (RELEASED as readonly string[]).includes(fresh.status) ? await finalizeAfterRelease(fresh, verified) : null;
  if (retry) return retry;
  throw new Error(`Checkout ${fresh.reference} changed state concurrently (${fresh.status}); retry.`);
}

async function finalizePending(payment: CheckoutPayment, verified: VerifiedTransaction): Promise<ConfirmResult | null> {
  const now = new Date();
  const finalized = await prisma.$transaction(
    async (tx) => {
      const claim = await tx.checkoutPayment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "PAID", paidAt: now, providerStatus: verified.status, providerCheckedAt: now, lastError: null },
      });
      if (claim.count !== 1) return null;
      return markOrdersPaid(tx, payment, now);
    },
    { maxWait: 10000, timeout: 20000 }
  );
  if (!finalized) return null;
  await afterPaid(payment, finalized.newlyPaidIds);
  logPayment("info", "payment_finalized", { reference: payment.reference, kind: payment.kind, orders: finalized.orderIds.length, path: "pending" });
  return { state: "paid", orderIds: finalized.orderIds, newlyConfirmed: true, emailIds: finalized.emailIds };
}

async function finalizeAfterRelease(payment: CheckoutPayment, verified: VerifiedTransaction): Promise<ConfirmResult | null> {
  const now = new Date();
  try {
    const finalized = await prisma.$transaction(
      async (tx) => {
        const claim = await tx.checkoutPayment.updateMany({
          where: { id: payment.id, status: { in: [...RELEASED] } },
          data: { status: "PAID", paidAt: now, stockReleasedAt: null, providerStatus: verified.status, providerCheckedAt: now, lastError: null },
        });
        if (claim.count !== 1) return null;

        const items = await tx.orderItem.findMany({
          where: { order: { paystackReference: payment.reference } },
          select: { productId: true, variantId: true, sideId: true, quantity: true, product: { select: { name: true } }, side: { select: { name: true } } },
        });
        for (const item of items) {
          if (!(await reserveLine(tx, item))) {
            throw new ReReserveError(`${item.product?.name ?? item.side?.name ?? "an item"} no longer has enough stock`);
          }
        }

        if (payment.kind === "VENDOR") {
          const orders = await tx.order.findMany({
            where: { paystackReference: payment.reference },
            select: { businessId: true, vendorDeliveryBooking: { select: { slotId: true, bookedFor: true } } },
          });
          for (const order of orders) {
            if (!order.vendorDeliveryBooking) continue;
            const { slotId, bookedFor } = order.vendorDeliveryBooking;
            const capacity = await resolveVendorCapacity(order.businessId, slotId, bookedFor, tx);
            const used = await countVendorBookingsForSlot(order.businessId, slotId, bookedFor, tx, { excludeReference: payment.reference });
            if (used >= capacity) throw new ReReserveError("the vendor's delivery slot is now fully booked");
          }
        }

        return markOrdersPaid(tx, payment, now);
      },
      {
        isolationLevel: payment.kind === "VENDOR" ? Prisma.TransactionIsolationLevel.Serializable : undefined,
        maxWait: 10000,
        timeout: 20000,
      }
    );
    if (!finalized) return null;
    await afterPaid(payment, finalized.newlyPaidIds);
    logPayment("warn", "payment_finalized", { reference: payment.reference, kind: payment.kind, orders: finalized.orderIds.length, path: "late_success" });
    return { state: "paid", orderIds: finalized.orderIds, newlyConfirmed: true, emailIds: finalized.emailIds };
  } catch (err) {
    if (err instanceof ReReserveError) {
      return flagForReview(payment, `Paid after the reservation was released, and ${err.message}.`, verified.status);
    }
    throw err;
  }
}

// Shared by both finalize paths, inside their transaction.
//
// Shared database: AkadVerse's own (older) Paystack webhook can mark this checkout's orders paid first — it handles
// the same Paystack account and finds orders by reference. Orders already paid are therefore left as they are: no
// second status change, timeline event, owner email or notification (AkadVerse already sent those). The checkout
// itself is still settled (CheckoutPayment -> PAID, snapshot cart lines cleared). `orderIds` is every order of the
// checkout (for the buyer's result); `newlyPaidIds` only those flipped here.
async function markOrdersPaid(tx: Db, payment: CheckoutPayment, now: Date) {
  const all = await tx.order.findMany({ where: { paystackReference: payment.reference }, select: { id: true, userId: true, paymentStatus: true } });
  const orderIds = all.map((o) => o.id);
  const orders = all.filter((o) => o.paymentStatus !== ORDER_PAYMENT_STATUS.PAID);
  const newlyPaidIds = orders.map((o) => o.id);

  if (payment.kind === "VENDOR") {
    // Vendor orders are never manually accepted/rejected — payment
    // confirmation IS the acceptance (docs/marketplace/decisions/vendor-independent-architecture.md).
    await tx.order.updateMany({
      where: { id: { in: newlyPaidIds } },
      data: {
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
        status: "ACCEPTED",
        acceptedAt: now,
        fulfillmentStatus: "PROCESSING",
        cancelledAt: null,
        cancellationReason: null,
      },
    });
    await tx.vendorDeliveryBooking.updateMany({
      where: { paystackReference: payment.reference, status: { in: ["PENDING_PAYMENT", "CANCELLED"] } },
      data: { status: "CONFIRMED" },
    });
    for (const orderId of newlyPaidIds) {
      await recordOrderEvent(tx, { orderId, type: "SELLER_ACCEPTED", actorType: "system", message: "Vendor orders are auto-accepted on payment — no manual accept step." });
    }
  } else {
    await tx.order.updateMany({
      where: { id: { in: newlyPaidIds } },
      data: { paymentStatus: ORDER_PAYMENT_STATUS.PAID, status: "PENDING_SELLER", cancelledAt: null, cancellationReason: null },
    });
  }

  for (const order of orders) {
    await recordOrderEvent(tx, { orderId: order.id, type: "ORDER_CREATED", actorType: "buyer", actorId: order.userId, metadata: { paystackReference: payment.reference } });
    await recordOrderEvent(tx, { orderId: order.id, type: "SELLER_NOTIFIED", actorType: "system" });
  }

  const emailIds = newlyPaidIds.length > 0 ? await enqueueOrderPaidEmails(tx, newlyPaidIds) : [];
  return { orderIds, newlyPaidIds, emailIds };
}

// Post-commit, winner only. Failures here are logged, never surfaced: the
// payment is already final and the owner email is safely in the outbox.
async function afterPaid(payment: CheckoutPayment, newlyPaidIds: string[]) {
  const cartItemIds = Array.isArray(payment.cartItemIds) ? (payment.cartItemIds as unknown[]).filter((v): v is string => typeof v === "string") : [];
  try {
    if (cartItemIds.length > 0) {
      // Only the lines this checkout covered — anything added to the cart
      // while the payment popup was open survives.
      await prisma.cartItem.deleteMany({ where: { userId: payment.userId, id: { in: cartItemIds } } });
    }
  } catch (err) {
    console.error(`[checkout] clearing paid cart lines for ${payment.reference} failed`, err);
  }
  if (newlyPaidIds.length > 0) await createOrderPaidNotifications(newlyPaidIds);
}

async function flagForReview(payment: CheckoutPayment, reason: string, providerStatus: string): Promise<ConfirmResult> {
  const now = new Date();
  const flagged = await prisma.$transaction(async (tx) => {
    const res = await tx.checkoutPayment.updateMany({
      where: { id: payment.id, status: { in: ["PENDING", ...RELEASED] } },
      data: { status: "NEEDS_REVIEW", reviewReason: reason, providerStatus, providerCheckedAt: now },
    });
    if (res.count !== 1) return false;
    await tx.order.updateMany({
      where: { paystackReference: payment.reference, paymentStatus: { not: ORDER_PAYMENT_STATUS.PAID } },
      data: { paymentStatus: ORDER_PAYMENT_STATUS.NEEDS_REVIEW },
    });
    return true;
  });

  if (flagged) {
    logPayment("error", "payment_needs_review", { reference: payment.reference, kind: payment.kind, reason });
    try {
      await notifyAdmins({
        type: "PAYMENT_NEEDS_REVIEW",
        title: "Payment needs review",
        message: `Checkout ${payment.reference} was paid but couldn't be completed automatically: ${reason}`,
      });
    } catch (err) {
      console.error(`[checkout] admin notification for ${payment.reference} failed`, err);
    }
  }
  return { state: "needs_review", reason };
}

async function orderIdsFor(reference: string): Promise<string[]> {
  const orders = await prisma.order.findMany({ where: { paystackReference: reference }, select: { id: true } });
  return orders.map((o) => o.id);
}
