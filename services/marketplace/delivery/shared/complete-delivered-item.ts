// services/marketplace/delivery/shared/complete-delivered-item.ts
//
// The one place a delivery item becomes DELIVERED: item + order-item state,
// timeline events, escrow -> payout-eligible, and the order's overall
// outcome. Shared by the per-item buyer-OTP flow (confirm-delivery.ts,
// Business orders) and the per-booking student-code flow (Vendor Market,
// vendor-delivery/handover/submit-delivery-code.ts), so both complete a
// delivery identically.
//
// Conditional on the item still being in flight (by default PICKED_UP or
// OUT_FOR_DELIVERY; a Vendor delivery has no online pickup step, so its
// callers pass VENDOR_OPEN_DELIVERY_STATUSES, which includes ASSIGNED):
// returns false and changes nothing if it was already completed or taken out
// of delivery meanwhile, so a duplicate or racing submission never repeats
// side effects.

import type { DeliveryStatus } from "@prisma/client";
import type { Db } from "@/services/marketplace/order/shared/db";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { recomputeOrderDeliveryOutcome } from "@/services/marketplace/order/recompute-order-delivery-outcome";
import { markItemEligibleForPayout } from "@/services/marketplace/escrow/mark-item-eligible-for-payout";

// A Vendor Market item is "processing" from assignment until the student's
// code completes it. PICKED_UP / OUT_FOR_DELIVERY only occur on items from
// before the pickup step was removed, and are treated the same.
export const VENDOR_OPEN_DELIVERY_STATUSES: DeliveryStatus[] = ["ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];

export async function completeDeliveredItem(
  tx: Db,
  item: { deliveryItemId: string; orderItemId: string; orderId: string },
  actor: { delivererId: string; now: Date; by?: { type: "admin"; id: string; note: string }; codeVerified?: boolean },
  fromStatuses: DeliveryStatus[] = ["PICKED_UP", "OUT_FOR_DELIVERY"]
): Promise<boolean> {
  const moved = await tx.deliveryItem.updateMany({
    where: { id: item.deliveryItemId, status: { in: fromStatuses } },
    data: { status: "DELIVERED" },
  });
  if (moved.count === 0) return false;

  await tx.orderItem.update({
    where: { id: item.orderItemId },
    data: { deliveryStatus: "DELIVERED", deliveryAttempted: "TRUE", deliveryConfirmedAt: actor.now, deliveryOtp: null, deliveryOtpExpiry: null },
  });
  const base = { orderId: item.orderId, orderItemId: item.orderItemId, actorType: "deliverer" as const, actorId: actor.delivererId };
  if (actor.codeVerified !== false) await recordOrderEvent(tx, { ...base, type: "BUYER_OTP_VERIFIED" });
  await recordOrderEvent(tx, { ...base, type: "DELIVERY_ATTEMPTED", metadata: { attempted: true } });
  // An admin completing a delivery (e.g. a late code submission they reviewed)
  // is recorded as the admin's action, with their reason.
  if (actor.by) await recordOrderEvent(tx, { ...base, type: "DELIVERED", actorType: "admin", actorId: actor.by.id, message: actor.by.note });
  else await recordOrderEvent(tx, { ...base, type: "DELIVERED" });
  await markItemEligibleForPayout(tx, item.orderItemId, item.orderId);
  await recomputeOrderDeliveryOutcome(tx, item.orderId);
  return true;
}
