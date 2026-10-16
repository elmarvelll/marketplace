// services/marketplace/order/accept-order.ts
//
// Seller accepts a PENDING_SELLER order -> ACCEPTED (fulfillmentStatus:
// PROCESSING), buyer emailed. Called by
// src/app/api/marketplace/businesses/[id]/orders/[orderId]/accept/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { sendEmail, sellerOrderProcessingEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function acceptOrder(businessId: string, orderId: string, actorUserId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, ...PAID_ORDER },
    select: { id: true, status: true, userId: true, business: { select: { name: true } }, user: { select: { email: true } } },
  });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "PENDING_SELLER") throw conflict(`Order is already ${order.status.toLowerCase()}.`);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "ACCEPTED", acceptedAt: new Date(), fulfillmentStatus: "PROCESSING" },
    });
    await recordOrderEvent(tx, { orderId, type: "SELLER_ACCEPTED", actorType: "seller", actorId: actorUserId });
    await recordOrderEvent(tx, { orderId, type: "SELLER_PROCESSING", actorType: "system" });
  });

  if (order.user?.email) {
    void sendEmail({ to: order.user.email, ...sellerOrderProcessingEmail({ businessName: order.business.name, orderId }) });
  }
  await createNotification({
    recipientId: order.userId,
    type: "ORDER_ACCEPTED",
    title: "Order accepted",
    message: `${order.business.name} accepted your order and is preparing it.`,
    targetUrl: "/orders",
    orderId,
    businessId,
  });
}
