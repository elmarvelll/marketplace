// services/marketplace/delivery/mark-out-for-delivery.ts
//
// Deliverer begins taking a picked-up item to the buyer — issues the buyer
// delivery OTP. Called by
// src/app/api/marketplace/deliverer/deliveries/[deliveryItemId]/out-for-delivery/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/service-error";
import { generateOtp, buildOtpExpiry } from "@/lib/otp";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { sendEmail, buyerOutForDeliveryEmail, buyerDeliveryOtpEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { requireDeliveryItem } from "./shared/require-delivery-item";

export async function markOutForDelivery(delivererId: string, deliveryItemId: string) {
  const deliveryItem = await requireDeliveryItem(delivererId, deliveryItemId);
  if (deliveryItem.status !== "PICKED_UP") throw conflict("Only a picked-up item can be marked out for delivery.");

  const otp = generateOtp();
  const otpExpiry = buildOtpExpiry();
  const orderId = deliveryItem.orderItem.orderId;

  await prisma.$transaction(async (tx) => {
    await tx.deliveryItem.update({ where: { id: deliveryItemId }, data: { status: "OUT_FOR_DELIVERY" } });
    await tx.orderItem.update({
      where: { id: deliveryItem.orderItemId },
      data: { deliveryStatus: "OUT_FOR_DELIVERY", deliveryOtp: otp, deliveryOtpExpiry: otpExpiry, deliveryOtpAttempts: 0 },
    });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "OUT_FOR_DELIVERY", actorType: "deliverer", actorId: delivererId });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "BUYER_DELIVERY_OTP_ISSUED", actorType: "system" });
  });

  const buyerEmail = deliveryItem.orderItem.order.user?.email;
  if (buyerEmail) {
    void sendEmail({ to: buyerEmail, ...buyerOutForDeliveryEmail({ orderId }) });
    void sendEmail({ to: buyerEmail, ...buyerDeliveryOtpEmail({ orderId, otp, expiresAt: otpExpiry.toLocaleTimeString() }) });
  }

  await createNotification({
    recipientId: deliveryItem.orderItem.order.userId,
    type: "ORDER_OUT_FOR_DELIVERY",
    title: "Your order is on its way",
    message: "A deliverer has picked up your order and it's on its way. Check your email for the delivery confirmation code.",
    targetUrl: "/orders",
    orderId,
    businessId: deliveryItem.orderItem.order.businessId,
  });
}
