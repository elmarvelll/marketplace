// services/marketplace/delivery/run-delivery-retry-sweep.ts
//
// Runs from the delivery-retry cron (recommended hourly — not on the same
// 5h/24h cadence as the other crons, since it's gating a customer-facing
// SLA more directly — see docs/marketplace/systems/cron-system.md).
// Returns items whose first delivery attempt failed and whose 24-hour
// retryDeliveryAt has passed back to the drop-off pool. Called by
// src/app/api/cron/delivery-retry/route.ts.

import { prisma } from "@/lib/prisma";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";

export async function runDeliveryRetrySweep(): Promise<{ returnedToDropoff: number }> {
  const dueItems = await prisma.orderItem.findMany({
    where: { deliveryStatus: "FAILED", deliveryAttempted: "FALSE", failedDeliveryAttempts: 1, cancelledAt: null, retryDeliveryAt: { lte: new Date() } },
    select: { id: true, orderId: true },
  });

  for (const item of dueItems) {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({ where: { id: item.id }, data: { deliveryStatus: null, deliveryAttempted: "PENDING", retryDeliveryAt: null } });
      await recordOrderEvent(tx, { orderId: item.orderId, orderItemId: item.id, type: "RETURNED_TO_DROPOFF", actorType: "system" });
    });
  }

  return { returnedToDropoff: dueItems.length };
}
