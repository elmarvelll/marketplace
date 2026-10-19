// services/marketplace/delivery/confirm-delivery.ts
//
// Deliverer confirms delivery by entering the buyer's OTP. On match, hands
// the item to escrow as eligible for seller payout. Called by
// src/app/api/marketplace/deliverer/deliveries/[deliveryItemId]/deliver/route.controller.ts.
// See docs/marketplace/systems/escrow-system.md.

import { prisma } from "@/lib/prisma";
import { conflict, badRequest } from "@/lib/service-error";
import { verifyOtp } from "@/lib/otp";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { completeDeliveredItem } from "./shared/complete-delivered-item";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { requireDeliveryItem } from "./shared/require-delivery-item";

export async function confirmDelivery(delivererId: string, deliveryItemId: string, suppliedOtp: string) {
  const deliveryItem = await requireDeliveryItem(delivererId, deliveryItemId);
  if (deliveryItem.status !== "OUT_FOR_DELIVERY") throw conflict("Only an item out for delivery can be confirmed delivered.");
  // Vendor Market deliveries are confirmed per booking with the student's code
  // (vendor-delivery/handover/submit-delivery-code.ts), never per item.
  if (deliveryItem.orderItem.order.vendorDeliveryBookingId) throw conflict("Confirm this delivery from its delivery card with the student's code.");

  const orderId = deliveryItem.orderItem.orderId;
  const result = verifyOtp({
    suppliedCode: suppliedOtp,
    storedCode: deliveryItem.orderItem.deliveryOtp,
    storedExpiry: deliveryItem.orderItem.deliveryOtpExpiry,
    attempts: deliveryItem.orderItem.deliveryOtpAttempts,
  });

  await prisma.orderItem.update({ where: { id: deliveryItem.orderItemId }, data: { deliveryOtpAttempts: { increment: 1 } } });
  await recordOrderEvent(prisma, {
    orderId,
    orderItemId: deliveryItem.orderItemId,
    type: "BUYER_OTP_VERIFICATION_ATTEMPTED",
    actorType: "deliverer",
    actorId: delivererId,
    metadata: { success: result.ok },
  });

  if (!result.ok) throw badRequest(`OTP verification failed: ${result.reason}.`);

  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      await completeDeliveredItem(tx, { deliveryItemId, orderItemId: deliveryItem.orderItemId, orderId }, { delivererId, now });
    },
    { timeout: 15000 }
  );

  await createNotification({
    recipientId: deliveryItem.orderItem.order.userId,
    type: "ORDER_DELIVERED",
    title: "Order delivered",
    message: `Your order from ${deliveryItem.orderItem.order.business.name} has been delivered.`,
    targetUrl: "/orders",
    orderId,
    businessId: deliveryItem.orderItem.order.businessId,
  });
}
