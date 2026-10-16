// services/marketplace/delivery/confirm-seller-dropoff.ts
//
// Step 2 of the Seller -> Delivery Coordinator handoff: the coordinator
// (an admin — requireAdmin()) enters the OTP the seller showed them in
// person. On success, the package is now officially in the coordinator's
// custody: sellerDroppedOffAt and coordinatorReceivedAt are set together
// (there is no state where one is set without the other), the drop-off
// deadline is checked and a late fine issued if missed, and the order
// enters the coordinator's ready pool (list-ready-items.ts, gated on
// sellerDroppedOffAt via shared/ready-item-filter.ts).
//
// Called by
// src/app/api/marketplace/admin/dropoffs/[orderId]/confirm/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict, badRequest } from "@/lib/service-error";
import { verifyOtp } from "@/lib/otp";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { hasMissedDropoffDeadline } from "@/services/marketplace/delivery/dropoff-deadline.service";
import { issueLateDeliveryFine } from "@/services/marketplace/fines/issue-late-delivery-fine";
import { createNotification } from "@/services/marketplace/notifications/notification.service";

export async function confirmSellerDropoff(orderId: string, suppliedOtp: string, coordinatorUserId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      businessId: true,
      status: true,
      fulfillmentStatus: true,
      sellerDroppedOffAt: true,
      dropoffOtp: true,
      dropoffOtpExpiry: true,
      dropoffOtpAttempts: true,
      estimatedDeliveryAt: true,
      business: { select: { name: true, userId: true } },
    },
  });
  if (!order) throw notFound("Order not found.");
  if (order.sellerDroppedOffAt) throw conflict("This order has already been received by the coordinator.");
  if (order.status !== "ACCEPTED" || order.fulfillmentStatus !== "READY_FOR_PICKUP") {
    throw conflict("Only a ready-for-pickup order awaiting drop-off can be received.");
  }

  const result = verifyOtp({
    suppliedCode: suppliedOtp,
    storedCode: order.dropoffOtp,
    storedExpiry: order.dropoffOtpExpiry,
    attempts: order.dropoffOtpAttempts,
  });
  await prisma.order.update({ where: { id: orderId }, data: { dropoffOtpAttempts: { increment: 1 } } });
  await recordOrderEvent(prisma, {
    orderId,
    type: "COORDINATOR_RECEIVED",
    actorType: "admin",
    actorId: coordinatorUserId,
    metadata: { success: result.ok },
  });

  if (!result.ok) throw badRequest(`OTP verification failed: ${result.reason}.`);

  const now = new Date();
  const missedDeadline = order.estimatedDeliveryAt ? hasMissedDropoffDeadline(order.estimatedDeliveryAt, now, now) : false;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        sellerDroppedOffAt: now,
        coordinatorReceivedAt: now,
        coordinatorReceivedBy: coordinatorUserId,
        // The verified code must not be reusable/replayable once spent.
        dropoffOtp: null,
        dropoffOtpExpiry: null,
      },
    });
    await recordOrderEvent(tx, { orderId, type: "SELLER_DROPPED_OFF", actorType: "system" });
    if (missedDeadline) {
      await recordOrderEvent(tx, { orderId, type: "SELLER_MISSED_DROPOFF_DEADLINE", actorType: "system" });
    }
  });

  if (missedDeadline) {
    await issueLateDeliveryFine(order.businessId, orderId);
  }

  await createNotification({
    recipientId: order.business.userId,
    type: "COORDINATOR_RECEIVED",
    title: "Parcel received",
    message: `The Delivery Coordinator has received your order's parcel from ${order.business.name}.`,
    targetUrl: `/business/${order.businessId}/orders`,
    orderId,
    businessId: order.businessId,
  });

  return { missedDeadline };
}
