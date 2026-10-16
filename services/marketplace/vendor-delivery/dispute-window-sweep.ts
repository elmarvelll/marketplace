// services/marketplace/vendor-delivery/dispute-window-sweep.ts
//
// Two jobs, run together from the same cron (spec §52/§56-57):
//
// 1. Finalize orders whose 24h buyer dispute window has elapsed with no
//    dispute: DELIVERED_PENDING_DISPUTE_WINDOW -> DELIVERED. A disputed
//    order is left exactly where it is — never auto-finalized.
// 2. Release deliverer payout for any (deliverer, vendor) handoff whose
//    every order has now cleared (DELIVERED, not disputed) — sets
//    delivererPayoutStatus null -> PAYOUT_PENDING. A handoff with any
//    order still pending the window, or any disputed order, stays held.
//
// Idempotent: only ever acts on rows still in the relevant "not yet
// resolved" state, so repeated cron runs never double-finalize or
// double-release. Called by src/app/api/cron/vendor-dispute-window-sweep/route.ts.

import { prisma } from "@/lib/prisma";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";

const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function runDisputeWindowSweep(): Promise<{ ordersFinalized: number; payoutsReleased: number }> {
  const cutoff = new Date(Date.now() - DISPUTE_WINDOW_MS);

  // Job 1 — finalize elapsed, undisputed orders.
  const dueOrders = await prisma.order.findMany({
    where: { deliveryOutcome: "DELIVERED_PENDING_DISPUTE_WINDOW", deliveredPendingDisputeAt: { lte: cutoff }, isDisputed: false },
    select: { id: true },
  });
  for (const order of dueOrders) {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction — only ever act on an order still
      // in this exact state, so a concurrent cron run (or a dispute opened
      // in the gap between the read above and this write) can't
      // double-finalize or wrongly finalize a now-disputed order.
      const updated = await tx.order.updateMany({
        where: { id: order.id, deliveryOutcome: "DELIVERED_PENDING_DISPUTE_WINDOW", isDisputed: false },
        data: { deliveryOutcome: "DELIVERED" },
      });
      if (updated.count > 0) {
        await recordOrderEvent(tx, { orderId: order.id, type: "DISPUTE_WINDOW_ELAPSED", actorType: "system" });
      }
    });
  }

  // Job 2 — release deliverer payout for handoffs whose every order has
  // now cleared. Scoped to School Vendor handoffs only (business.type) —
  // Business sellers are paid via the existing, separate seller-payout
  // system, never this one.
  const pendingHandoffs = await prisma.delivery_x_businesses.findMany({
    where: { delivererPayoutStatus: null, delivererConfirmedPickupAt: { not: null }, business: { type: "SCHOOL_VENDOR" } },
    select: {
      id: true,
      businessId: true,
      deliverymanId: true,
    },
  });

  let payoutsReleased = 0;
  for (const handoff of pendingHandoffs) {
    const orders = await prisma.order.findMany({
      where: { businessId: handoff.businessId, items: { some: { deliveryItem: { delivery: { deliverymanId: handoff.deliverymanId } } } } },
      select: { deliveryOutcome: true, isDisputed: true },
    });
    if (orders.length === 0) continue;

    const anyDisputed = orders.some((o) => o.isDisputed);
    const allCleared = orders.every((o) => o.deliveryOutcome === "DELIVERED");
    if (anyDisputed || !allCleared) continue;

    const updated = await prisma.delivery_x_businesses.updateMany({
      where: { id: handoff.id, delivererPayoutStatus: null },
      data: { delivererPayoutStatus: "PAYOUT_PENDING" },
    });
    if (updated.count > 0) payoutsReleased += 1;
  }

  return { ordersFinalized: dueOrders.length, payoutsReleased };
}
