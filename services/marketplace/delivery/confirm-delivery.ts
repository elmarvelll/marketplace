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
import { recomputeOrderDeliveryOutcome } from "@/services/marketplace/order/recompute-order-delivery-outcome";
import { markItemEligibleForPayout } from "@/services/marketplace/escrow/mark-item-eligible-for-payout";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { requireDeliveryItem } from "./shared/require-delivery-item";

export async function confirmDelivery(delivererId: string, deliveryItemId: string, suppliedOtp: string) {
  const deliveryItem = await requireDeliveryItem(delivererId, deliveryItemId);
  if (deliveryItem.status !== "OUT_FOR_DELIVERY") throw conflict("Only an item out for delivery can be confirmed delivered.");

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
  await prisma.$transaction(async (tx) => {
    await tx.deliveryItem.update({ where: { id: deliveryItemId }, data: { status: "DELIVERED" } });
    await tx.orderItem.update({
      where: { id: deliveryItem.orderItemId },
      data: {
        deliveryStatus: "DELIVERED",
        deliveryAttempted: "TRUE",
        deliveryConfirmedAt: now,
        // Single-use: the verified code must not be reusable/replayable
        // once spent — same rationale as confirm-seller-dropoff.ts's
        // dropoffOtp nulling.
        deliveryOtp: null,
        deliveryOtpExpiry: null,
      },
    });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "BUYER_OTP_VERIFIED", actorType: "deliverer", actorId: delivererId });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "DELIVERY_ATTEMPTED", actorType: "deliverer", actorId: delivererId, metadata: { attempted: true } });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "DELIVERED", actorType: "deliverer", actorId: delivererId });
    await markItemEligibleForPayout(tx, deliveryItem.orderItemId, orderId);
    await recomputeOrderDeliveryOutcome(tx, orderId);
  },
{timeout: 15000});

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
