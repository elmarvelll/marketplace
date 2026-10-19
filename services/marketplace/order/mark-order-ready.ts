// services/marketplace/order/mark-order-ready.ts
//
// Seller marks an accepted, processing order READY_FOR_PICKUP. Buyer is
// emailed the estimated delivery date/window. Called by
// src/app/api/marketplace/businesses/[id]/orders/[orderId]/ready/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { formatEstimatedDelivery } from "@/services/marketplace/delivery/estimated-delivery.service";
import { sendEmail, buyerOrderReadyEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function markOrderReady(businessId: string, orderId: string, actorUserId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, ...PAID_ORDER, business: { type: "BUSINESS" } }, // vendors never mark orders ready
    select: {
      id: true,
      status: true,
      userId: true,
      fulfillmentStatus: true,
      estimatedDeliveryAt: true,
      deliveryWindowStart: true,
      deliveryWindowEnd: true,
      business: { select: { name: true } },
      user: { select: { email: true } },
    },
  });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "ACCEPTED" || order.fulfillmentStatus !== "PROCESSING") {
    throw conflict("Only an order currently being processed can be marked ready.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus: "READY_FOR_PICKUP", sellerMarkedReadyAt: now } });
    await recordOrderEvent(tx, { orderId, type: "SELLER_MARKED_READY", actorType: "seller", actorId: actorUserId });
  });

  if (order.user?.email && order.estimatedDeliveryAt && order.deliveryWindowStart && order.deliveryWindowEnd) {
    const { date, window } = formatEstimatedDelivery({
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      deliveryWindowStart: order.deliveryWindowStart,
      deliveryWindowEnd: order.deliveryWindowEnd,
    });
    void sendEmail({
      to: order.user.email,
      ...buyerOrderReadyEmail({ businessName: order.business.name, orderId, estimatedDeliveryDate: date, deliveryWindow: window }),
    });
  }

  await createNotification({
    recipientId: order.userId,
    type: "ORDER_READY",
    title: "Order ready",
    message: `Your order from ${order.business.name} is ready and on its way to our delivery network.`,
    targetUrl: "/orders",
    orderId,
    businessId,
  });
}
