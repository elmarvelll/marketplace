// services/marketplace/order/reject-order.ts
//
// Seller rejects a PENDING_SELLER order outright (before ever accepting
// it). Requires a reason, moves the order and every item to REJECTED, and
// sends each item's money into the item-level refund path. Called by
// src/app/api/marketplace/businesses/[id]/orders/[orderId]/reject/route.controller.ts.
// For rejecting a *specific* item after acceptance, see reject-order-item.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { refundOrderItem } from "@/services/marketplace/escrow/refund-order-item";
import { sendEmail, sellerRejectedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function rejectOrder(businessId: string, orderId: string, actorUserId: string, reason: string) {
  if (!reason.trim()) throw badRequest("A rejection reason is required.");

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, ...PAID_ORDER },
    select: {
      id: true,
      status: true,
      userId: true,
      business: { select: { name: true } },
      user: { select: { email: true } },
      items: { select: { id: true } },
    },
  });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "PENDING_SELLER") throw conflict(`Order is already ${order.status.toLowerCase()}.`);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "REJECTED", rejectedAt: now, rejectionReason: reason } });
    await tx.orderItem.updateMany({ where: { orderId }, data: { rejectedAt: now, rejectionReason: reason } });
    await recordOrderEvent(tx, { orderId, type: "SELLER_REJECTED", actorType: "seller", actorId: actorUserId, message: reason });
  });

  for (const item of order.items) {
    await refundOrderItem(item.id, reason, "seller", actorUserId);
  }

  if (order.user?.email) {
    void sendEmail({ to: order.user.email, ...sellerRejectedEmail({ businessName: order.business.name, orderId, reason }) });
  }
  await createNotification({
    recipientId: order.userId,
    type: "ORDER_REJECTED",
    title: "Order rejected",
    message: `${order.business.name} was unable to fulfill your order: ${reason}`,
    targetUrl: "/orders",
    orderId,
    businessId,
  });
}
