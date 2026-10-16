// services/marketplace/delivery/report-failed-attempt.ts
//
// Deliverer reports a failed delivery attempt. First failure schedules a
// 24h retry; second failure cancels the item and refunds it. Called by
// src/app/api/marketplace/deliverer/deliveries/[deliveryItemId]/fail-attempt/route.controller.ts.
// See docs/marketplace/decisions/second-failed-delivery-cancels.md.

import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { recomputeOrderDeliveryOutcome } from "@/services/marketplace/order/recompute-order-delivery-outcome";
import { refundOrderItem } from "@/services/marketplace/escrow/refund-order-item";
import { sendEmail, sellerDeliveryFailedEmail, buyerDeliveryFailedEmail } from "@/services/marketplace/notifications/email.service";
import { notifyAdmins } from "@/services/marketplace/notifications/notification.service";
import { requireDeliveryItem } from "./shared/require-delivery-item";

const RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

export async function reportFailedAttempt(delivererId: string, deliveryItemId: string, reasonInput: string) {
  const deliveryItem = await requireDeliveryItem(delivererId, deliveryItemId);
  if (deliveryItem.status !== "OUT_FOR_DELIVERY") throw conflict("Only an item out for delivery can be marked as a failed attempt.");

  const reason = reasonInput.trim() || "Delivery attempt failed.";
  const orderId = deliveryItem.orderItem.orderId;
  const isSecondFailure = deliveryItem.orderItem.failedDeliveryAttempts >= 1;

  if (isSecondFailure) {
    await prisma.$transaction(async (tx) => {
      await tx.deliveryItem.update({ where: { id: deliveryItemId }, data: { status: "RETURNED" } });
      await tx.orderItem.update({
        where: { id: deliveryItem.orderItemId },
        data: {
          deliveryStatus: "FAILED",
          deliveryAttempted: "FALSE",
          failedDeliveryAttempts: { increment: 1 },
          cancelledAt: new Date(),
          cancellationReason: `Second failed delivery attempt: ${reason}`,
        },
      });
      await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "DELIVERY_ATTEMPTED", actorType: "deliverer", actorId: delivererId, metadata: { attempted: true, success: false } });
      await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "DELIVERY_FAILED", actorType: "deliverer", actorId: delivererId, message: reason });
      await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "ITEM_CANCELLED", actorType: "system", message: "Cancelled after second failed delivery attempt." });
      await recomputeOrderDeliveryOutcome(tx, orderId);
    });

    await refundOrderItem(deliveryItem.orderItemId, "Cancelled after second failed delivery attempt.", "system");

    await notifyAdmins({
      type: "DELIVERY_CANCELLED",
      title: "Delivery cancelled after two failed attempts",
      message: `Order ${orderId.slice(0, 8)} was cancelled and refunded after a second failed delivery attempt: ${reason}`,
      targetUrl: "/admin/deliveries",
      orderId,
    });

    return { secondFailure: true };
  }

  const retryAt = new Date(Date.now() + RETRY_DELAY_MS);
  await prisma.$transaction(async (tx) => {
    await tx.deliveryItem.update({ where: { id: deliveryItemId }, data: { status: "FAILED" } });
    await tx.orderItem.update({
      where: { id: deliveryItem.orderItemId },
      data: { deliveryStatus: "FAILED", deliveryAttempted: "FALSE", failedDeliveryAttempts: { increment: 1 }, retryDeliveryAt: retryAt },
    });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "DELIVERY_ATTEMPTED", actorType: "deliverer", actorId: delivererId, metadata: { attempted: true, success: false } });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "DELIVERY_FAILED", actorType: "deliverer", actorId: delivererId, message: reason });
    await recordOrderEvent(tx, { orderId, orderItemId: deliveryItem.orderItemId, type: "DELIVERY_RETRY_SCHEDULED", actorType: "system", metadata: { retryAt: retryAt.toISOString() } });
    await recomputeOrderDeliveryOutcome(tx, orderId);
  });

  const sellerEmail = deliveryItem.orderItem.order.business.user?.email;
  if (sellerEmail) {
    void sendEmail({ to: sellerEmail, ...sellerDeliveryFailedEmail({ businessName: deliveryItem.orderItem.order.business.name, orderId }) });
  }
  const buyerEmail = deliveryItem.orderItem.order.user?.email;
  if (buyerEmail) {
    void sendEmail({ to: buyerEmail, ...buyerDeliveryFailedEmail({ orderId, retryAt: retryAt.toLocaleString() }) });
  }

  return { secondFailure: false };
}
