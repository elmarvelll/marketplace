// services/marketplace/order/recompute-order-delivery-outcome.ts
//
// Recomputes Order.deliveryOutcome from the current DeliveryStatus /
// cancellation state of all of an order's items. Call this after any
// change to an OrderItem's deliveryStatus or cancelledAt — it's cheap (one
// extra query) and keeps the order-level rollup from silently drifting out
// of sync with its authoritative, item-level source of truth.

import type { OrderDeliveryOutcome, DeliveryStatus } from "@prisma/client";
import type { Db } from "./shared/db";

export async function recomputeOrderDeliveryOutcome(db: Db, orderId: string): Promise<OrderDeliveryOutcome> {
  const [items, order] = await Promise.all([
    db.orderItem.findMany({ where: { orderId }, select: { deliveryStatus: true, cancelledAt: true } }),
    db.order.findUnique({ where: { id: orderId }, select: { vendorDeliveryBookingId: true, deliveryOutcome: true, deliveredPendingDisputeAt: true } }),
  ]);

  let outcome = computeDeliveryOutcome(items);
  let enteringDisputeWindow = false;

  // School Vendor orders hold at DELIVERED_PENDING_DISPUTE_WINDOW instead
  // of going straight to DELIVERED — the buyer's 24-hour dispute window
  // (spec §52) and deliverer payment both gate on that state. A cron
  // (vendor-dispute-window-sweep) is the only thing that ever promotes it
  // to DELIVERED — never re-derive DELIVERED here for a vendor order once
  // that's already happened, or a later item-status touch (e.g. a
  // same-order dispute resolution) would incorrectly re-open the window.
  if (order?.vendorDeliveryBookingId && outcome === "DELIVERED" && order.deliveryOutcome !== "DELIVERED") {
    outcome = "DELIVERED_PENDING_DISPUTE_WINDOW";
    enteringDisputeWindow = !order.deliveredPendingDisputeAt;
  }

  await db.order.update({
    where: { id: orderId },
    data: { deliveryOutcome: outcome, ...(enteringDisputeWindow ? { deliveredPendingDisputeAt: new Date() } : {}) },
  });
  return outcome;
}

function computeDeliveryOutcome(items: { deliveryStatus: DeliveryStatus | null; cancelledAt: Date | null }[]): OrderDeliveryOutcome {
  if (items.length === 0) return "PENDING";

  const delivered = items.filter((item) => item.deliveryStatus === "DELIVERED");
  const cancelled = items.filter((item) => item.cancelledAt !== null);
  const stillInProgress = items.filter(
    (item) => item.cancelledAt === null && item.deliveryStatus !== "DELIVERED" && item.deliveryStatus !== "FAILED"
  );

  if (stillInProgress.length > 0) return "PENDING";
  if (delivered.length === items.length) return "DELIVERED";
  if (delivered.length > 0) return "PARTIALLY_DELIVERED";
  if (cancelled.length === items.length) return "CANCELLED";
  return "FAILED";
}
