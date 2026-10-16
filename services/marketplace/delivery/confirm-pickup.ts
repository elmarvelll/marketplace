// services/marketplace/delivery/confirm-pickup.ts
//
// Step 2 of the Coordinator -> Deliverer handoff (the second of the three
// chain-of-custody handoffs): the coordinator/business had already handed
// physical custody at assign-delivery.ts time (the coordinator generated
// pickupOtp there); here the deliverer enters that OTP to confirm they've
// actually received the batch. Called by
// src/app/api/marketplace/deliverer/handoffs/[handoffId]/confirm-pickup/route.controller.ts.
// See docs/marketplace/security/otp-security.md.

import { prisma } from "@/lib/prisma";
import { notFound, conflict, badRequest } from "@/lib/service-error";
import { verifyOtp } from "@/lib/otp";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { recomputeOrderDeliveryOutcome } from "@/services/marketplace/order/recompute-order-delivery-outcome";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { getMarketplaceSettings } from "@/services/marketplace/admin/shared/marketplace-settings";

export async function confirmPickup(delivererId: string, handoffId: string, suppliedOtp: string) {
  const handoff = await prisma.delivery_x_businesses.findFirst({
    where: { id: handoffId, deliverymanId: delivererId },
    include: { business: { select: { name: true, userId: true, type: true } } },
  });
  if (!handoff) throw notFound("Handoff not found.");
  if (handoff.delivererConfirmedPickupAt) throw conflict("This handoff has already been confirmed.");

  const result = verifyOtp({
    suppliedCode: suppliedOtp,
    storedCode: handoff.pickupOtp,
    storedExpiry: handoff.pickupOtpExpiry,
    attempts: handoff.pickupOtpAttempts,
  });

  await prisma.delivery_x_businesses.update({ where: { id: handoffId }, data: { pickupOtpAttempts: { increment: 1 } } });

  const items = await prisma.deliveryItem.findMany({
    where: { businessId: handoff.businessId, status: "ASSIGNED", delivery: { deliverymanId: delivererId } },
    select: { id: true, orderItemId: true, orderItem: { select: { orderId: true, order: { select: { userId: true } } } } },
  });

  for (const item of items) {
    await recordOrderEvent(prisma, {
      orderId: item.orderItem.orderId,
      orderItemId: item.orderItemId,
      type: "DELIVERER_PICKUP_OTP_VERIFIED",
      actorType: "deliverer",
      actorId: delivererId,
      metadata: { success: result.ok },
    });
  }

  if (!result.ok) throw badRequest(`OTP verification failed: ${result.reason}.`);

  // Deliverer payout rate is snapshotted the moment the handoff is
  // confirmed — never re-read live later, so an admin changing the rate
  // afterward never alters an already-confirmed handoff's payout amount
  // (spec §55). School-Vendor-only; a Business handoff never pays a
  // deliverer (Business sellers are paid via the existing seller-payout
  // system instead — see docs/marketplace/decisions/vendor-extends-business.md).
  const delivererPayoutAmount = handoff.business.type === "SCHOOL_VENDOR" ? (await getMarketplaceSettings()).delivererPayoutAmount : undefined;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.delivery_x_businesses.update({
      where: { id: handoffId },
      data: { deliveryStatus: "PICKED_UP", delivererConfirmedPickupAt: now, ...(delivererPayoutAmount !== undefined ? { delivererPayoutAmount } : {}) },
    });
    await tx.deliveryItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { status: "PICKED_UP" } });
    await tx.orderItem.updateMany({ where: { id: { in: items.map((i) => i.orderItemId) } }, data: { deliveryStatus: "PICKED_UP" } });

    const orderIds = Array.from(new Set(items.map((i) => i.orderItem.orderId)));
    for (const orderId of orderIds) {
      await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus: "HANDED_TO_DELIVERER", delivererConfirmedPickupAt: now } });
      await recordOrderEvent(tx, { orderId, type: "DELIVERER_CONFIRMED_PICKUP", actorType: "deliverer", actorId: delivererId });
      await recordOrderEvent(tx, { orderId, type: "HANDED_TO_DELIVERER", actorType: "system" });
      await recomputeOrderDeliveryOutcome(tx, orderId);
    }
  });

  await createNotification({
    recipientId: handoff.business.userId,
    type: "PICKUP_CONFIRMED",
    title: "Order picked up",
    message: `The deliverer has picked up your parcel from ${handoff.business.name}.`,
    // Vendor handoffs come through here too — link to the right dashboard.
    targetUrl: ownerDashboardPath({ id: handoff.businessId, type: handoff.business.type }, "orders"),
    businessId: handoff.businessId,
  });

  const notifiedBuyers = new Set<string>();
  for (const item of items) {
    const orderId = item.orderItem.orderId;
    if (notifiedBuyers.has(orderId)) continue;
    notifiedBuyers.add(orderId);
    await createNotification({
      recipientId: item.orderItem.order.userId,
      type: "ORDER_PICKED_UP",
      title: "Order picked up",
      message: "Your order has been picked up by a deliverer.",
      targetUrl: "/orders",
      orderId,
    });
  }

  return { itemsConfirmed: items.length };
}
