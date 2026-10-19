// services/marketplace/order/reject-order-item.ts
//
// Seller rejects one item of an already-accepted order (e.g. out of
// stock), without rejecting the rest. Called by
// src/app/api/marketplace/businesses/[id]/orders/[orderId]/items/[itemId]/reject/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { recomputeOrderDeliveryOutcome } from "@/services/marketplace/order/recompute-order-delivery-outcome";
import { refundOrderItem } from "@/services/marketplace/escrow/refund-order-item";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function rejectOrderItem(businessId: string, orderId: string, itemId: string, actorUserId: string, reason: string) {
  if (!reason.trim()) throw badRequest("A rejection reason is required.");

  const order = await prisma.order.findFirst({ where: { id: orderId, businessId, ...PAID_ORDER, business: { type: "BUSINESS" } }, select: { id: true, status: true } });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "ACCEPTED") throw conflict("Only items on an accepted order can be individually rejected.");

  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId },
    select: { id: true, rejectedAt: true, cancelledAt: true },
  });
  if (!item) throw notFound("Order item not found.");
  if (item.rejectedAt || item.cancelledAt) throw conflict("This item has already been rejected/cancelled.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({ where: { id: itemId }, data: { rejectedAt: now, rejectionReason: reason, cancelledAt: now } });
    await recordOrderEvent(tx, { orderId, orderItemId: itemId, type: "ITEM_CANCELLED", actorType: "seller", actorId: actorUserId, message: reason });
    await recomputeOrderDeliveryOutcome(tx, orderId);
  });

  await refundOrderItem(itemId, reason, "seller", actorUserId);
}
