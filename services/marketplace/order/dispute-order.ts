// services/marketplace/order/dispute-order.ts
//
// The buyer-facing half of the dispute flow — "Dispute this order" on the
// order-tracking page. Buyer-owned-order check (a buyer can only dispute
// their own order), writes the existing (previously unused)
// Order.isDisputed/disputeReason/disputeCreatedAt columns, and records
// DISPUTE_OPENED. The admin side (list/resolve) lives in
// services/marketplace/admin/. Called by
// src/app/api/marketplace/orders/[id]/dispute/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function disputeOrder(orderId: string, buyerUserId: string, reason: string) {
  if (!reason.trim()) throw badRequest("A reason is required.");

  const order = await prisma.order.findFirst({ where: { id: orderId, userId: buyerUserId, ...PAID_ORDER }, select: { id: true, isDisputed: true } });
  if (!order) throw notFound("Order not found.");
  if (order.isDisputed) throw conflict("This order is already under dispute.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { isDisputed: true, disputeReason: reason.trim(), disputeCreatedAt: now } });
    await recordOrderEvent(tx, { orderId, type: "DISPUTE_OPENED", actorType: "buyer", actorId: buyerUserId, message: reason.trim() });
  });
}
