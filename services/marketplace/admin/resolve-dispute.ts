// services/marketplace/admin/resolve-dispute.ts
//
// Admin resolves a disputed order — records the resolution text and who
// resolved it, clears isDisputed, and writes DISPUTE_RESOLVED to the
// order's own OrderEvent history (dispute events are order-scoped, so
// they use that existing system rather than AdminActionLog). Called by
// src/app/api/marketplace/admin/disputes/[orderId]/resolve/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { createNotification } from "@/services/marketplace/notifications/notification.service";

// Who the admin determined is responsible (spec §54) — "REJECTED" means
// the dispute itself wasn't upheld (buyer unavailable, delivery evidence
// supports the seller/deliverer, etc). Optional: Business disputes don't
// need this (no deliverer-payment consequence to trigger), so existing
// callers that omit it keep working unchanged.
export type DisputeResponsibleParty = "VENDOR" | "DELIVERER" | "BUYER" | "REJECTED";

export async function resolveDispute(orderId: string, resolution: string, adminUserId: string, responsibleParty?: DisputeResponsibleParty) {
  if (!resolution.trim()) throw badRequest("A resolution note is required.");

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, isDisputed: true, businessId: true, userId: true } });
  if (!order) throw notFound("Order not found.");
  if (!order.isDisputed) throw conflict("This order isn't currently disputed.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { isDisputed: false, disputeResolvedAt: now, disputeResolvedBy: adminUserId, disputeResolution: resolution.trim() },
    });
    await recordOrderEvent(tx, { orderId, type: "DISPUTE_RESOLVED", actorType: "admin", actorId: adminUserId, message: resolution.trim() });

    // Deliverer payment consequence (spec §56) — only relevant for a
    // School Vendor order's deliverer handoff, and only when the dispute
    // was resolved AGAINST the deliverer. A "REJECTED" (dispute not
    // upheld) or vendor/buyer-responsible resolution leaves the payout
    // status alone — it stays eligible for the normal 24h-window release
    // via the dispute-window-sweep cron once isDisputed is false (set
    // above), same as an order that was never disputed at all.
    if (responsibleParty === "DELIVERER") {
      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { deliveryItem: { select: { delivery: { select: { deliverymanId: true } } } } },
      });
      const delivererId = orderItems.find((i) => i.deliveryItem?.delivery.deliverymanId)?.deliveryItem?.delivery.deliverymanId;
      if (delivererId) {
        await tx.delivery_x_businesses.updateMany({
          where: {
            businessId: order.businessId,
            deliverymanId: delivererId,
            OR: [{ delivererPayoutStatus: "PAYOUT_PENDING" }, { delivererPayoutStatus: null }],
          },
          data: { delivererPayoutStatus: "REJECTED" },
        });
        await recordOrderEvent(tx, {
          orderId,
          type: "DELIVERER_PAYOUT_REJECTED",
          actorType: "admin",
          actorId: adminUserId,
          message: "Dispute resolved against the deliverer — payment withheld.",
        });
      }
    }
  });

  // Buyer-facing "dispute status" notification (spec §64) — was missing
  // entirely before (a pre-existing gap, not vendor-specific — fixed here
  // since it directly affects vendor dispute resolution visibility too).
  await createNotification({
    recipientId: order.userId,
    type: "DISPUTE_RESOLVED",
    title: "Dispute resolved",
    message: resolution.trim(),
    targetUrl: "/orders",
    orderId,
    businessId: order.businessId,
  });
}
