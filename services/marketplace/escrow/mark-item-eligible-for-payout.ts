// services/marketplace/escrow/mark-item-eligible-for-payout.ts
//
// Marks a delivered order item eligible for seller payout — moves its
// escrow state from HELD to PAYOUT_PENDING. Called the moment an item is
// confirmed DELIVERED (services/marketplace/delivery/confirm-delivery.ts);
// the actual bank transfer happens later, on the seller-payout cron —
// kept as two steps so a delivery confirmation never has to wait on a
// Paystack transfer call to complete before responding to the deliverer.

import type { Db } from "@/services/marketplace/order/shared/db";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";

export async function markItemEligibleForPayout(db: Db, orderItemId: string, orderId: string) {
  await db.orderItem.update({
    where: { id: orderItemId },
    data: { escrowStatus: "PAYOUT_PENDING", payoutStatus: "PAYOUT_PENDING" },
  });
  await recordOrderEvent(db, { orderId, orderItemId, type: "PAYOUT_PENDING", actorType: "system" });
}
