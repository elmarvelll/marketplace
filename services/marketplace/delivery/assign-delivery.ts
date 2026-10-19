// services/marketplace/delivery/assign-delivery.ts
//
// Step 1 of the Coordinator -> Deliverer handoff: the delivery coordinator
// (an admin) assigns a batch of items already in their custody (dropped
// off and OTP-verified via confirm-seller-dropoff.ts — see
// shared/ready-item-filter.ts) to one deliverer, generating the
// coordinator->deliverer pickup OTP the deliverer will later enter via
// confirm-pickup.ts. Called by
// src/app/api/marketplace/admin/deliveries/route.controller.ts. See
// docs/marketplace/systems/delivery-coordinator-system.md.

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { buildPickupOtpExpiry, generateOtp } from "@/lib/otp";
import { sendEmail, delivererPickupAssignedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { READY_ITEM_WHERE } from "./shared/ready-item-filter";
import { syncPlansToAssignment } from "@/services/marketplace/delivery-roster/delivery-plans";

export async function assignDelivery(delivererId: string | undefined, orderItemIds: string[] | undefined, adminUserId: string) {
  const cleanDelivererId = delivererId?.trim();
  const itemIds = (orderItemIds ?? []).filter(Boolean);
  if (!cleanDelivererId || itemIds.length === 0) {
    throw badRequest("delivererId and at least one orderItemId are required.");
  }

  const deliverer = await prisma.deliverer.findUnique({
    where: { id: cleanDelivererId },
    select: { id: true, status: true, firstName: true, email: true },
  });
  if (!deliverer || deliverer.status !== "APPROVED") {
    throw badRequest("Deliverer not found or not approved.");
  }

  const items = await prisma.orderItem.findMany({
    where: { id: { in: itemIds }, ...READY_ITEM_WHERE },
    select: {
      id: true,
      quantity: true,
      orderId: true,
      product: { select: { businessId: true, business: { select: { name: true, type: true } } } },
      side: { select: { businessId: true, business: { select: { name: true, type: true } } } },
      order: { select: { userId: true, estimatedDeliveryAt: true } },
    },
  });
  if (items.length === 0) {
    throw badRequest("None of the selected items are eligible for assignment.");
  }

  // An item is either a Product line or a School Vendor Side line — either
  // way it belongs to exactly one business, that's all this function needs.
  const businessOf = (item: (typeof items)[number]) => (item.product ?? item.side)!;

  const earliestEstimate = items.reduce<Date | null>((min, item) => {
    const estimate = item.order.estimatedDeliveryAt;
    if (!estimate) return min;
    return !min || estimate < min ? estimate : min;
  }, null);

  // Per-business earliest estimate (not the batch-wide one above) — a
  // single assignment call can span several businesses/orders with
  // different delivery dates, and each business's pickupOtp should expire
  // relative to *its own* order(s), not another business's in the same
  // batch.
  const businesses = new Map<string, { name: string; earliestEstimate: Date | null; isVendor: boolean }>();
  for (const item of items) {
    const { businessId, business } = businessOf(item);
    const existing = businesses.get(businessId);
    const estimate = item.order.estimatedDeliveryAt;
    if (!existing) {
      businesses.set(businessId, { name: business.name, earliestEstimate: estimate, isVendor: business.type === "SCHOOL_VENDOR" });
    } else if (estimate && (!existing.earliestEstimate || estimate < existing.earliestEstimate)) {
      existing.earliestEstimate = estimate;
    }
  }

  const { delivery, handoffs } = await prisma.$transaction(async (tx) => {
    const created = await tx.delivery.create({
      data: { deliverymanId: cleanDelivererId, expectedDeliveryAt: earliestEstimate, status: "ASSIGNED" },
    });

    // Upsert, not createMany: DeliveryItem.orderItemId is @unique, and an
    // item retried after a first failed delivery attempt already has a
    // DeliveryItem row from its earlier, failed run — this reassigns that
    // same row to the new Delivery rather than trying (and failing) to
    // insert a duplicate.
    for (const item of items) {
      await tx.deliveryItem.upsert({
        where: { orderItemId: item.id },
        create: { deliveryId: created.id, orderItemId: item.id, quantity: item.quantity, businessId: businessOf(item).businessId, status: "ASSIGNED" },
        update: { deliveryId: created.id, status: "ASSIGNED" },
      });
    }

    await tx.orderItem.updateMany({ where: { id: { in: items.map((item) => item.id) } }, data: { deliveryStatus: "ASSIGNED" } });

    // One pickup handoff record (and one OTP) per distinct business in
    // this batch — the handoff is between one deliverer and one business
    // at a time, even though a Delivery run can span several businesses.
    const createdHandoffs: { businessId: string; businessName: string; pickupOtp: string; pickupOtpExpiry: string }[] = [];
    for (const [businessId, { name, earliestEstimate: businessEstimate, isVendor }] of businesses) {
      // Reassignment guard: if this business already has an unconfirmed
      // handoff (from an earlier assignDelivery call, possibly to a
      // different deliverer) that pickup OTP must die here — an old
      // deliverer's code must never remain valid once the business's
      // parcel has been reassigned. See docs/marketplace/security/otp-security.md.
      // A School Vendor can be collected from by several deliverers in the same
      // slot, each with their own code: there, another deliverer's code dies
      // only once they hold nothing left to collect from this vendor (the
      // upserts above already moved any reassigned items).
      const pending = await tx.delivery_x_businesses.findMany({
        where: { businessId, delivererConfirmedPickupAt: null, pickupOtp: { not: null } },
        select: { id: true, deliverymanId: true },
      });
      const stalePending = [];
      for (const row of pending) {
        const stillCollecting =
          isVendor &&
          row.deliverymanId !== cleanDelivererId &&
          (await tx.deliveryItem.count({ where: { businessId, status: "ASSIGNED", delivery: { deliverymanId: row.deliverymanId } } })) > 0;
        if (!stillCollecting) stalePending.push(row);
      }
      if (stalePending.length > 0) {
        await tx.delivery_x_businesses.updateMany({
          where: { id: { in: stalePending.map((row) => row.id) } },
          data: { pickupOtp: null, pickupOtpExpiry: null },
        });
      }

      const pickupOtp = generateOtp();
      const pickupOtpExpiry = buildPickupOtpExpiry(businessEstimate);
      await tx.delivery_x_businesses.create({
        data: {
          deliverymanId: cleanDelivererId,
          businessId,
          deliveryStatus: "ASSIGNED",
          expectedDeliveryAt: businessEstimate ?? earliestEstimate,
          pickupOtp,
          pickupOtpExpiry,
        },
      });
      createdHandoffs.push({ businessId, businessName: name, pickupOtp, pickupOtpExpiry: pickupOtpExpiry.toISOString() });
    }

    // The delivery roster's plan for these orders now records who actually
    // has them (delivery-roster/delivery-plans.ts) — the plan is frozen from
    // here on and the calendar never shows a stale planned deliverer.
    await syncPlansToAssignment(tx, Array.from(new Set(items.map((item) => item.orderId))), cleanDelivererId, adminUserId);

    for (const item of items) {
      await recordOrderEvent(tx, { orderId: item.orderId, orderItemId: item.id, type: "DELIVERER_ASSIGNED", actorType: "admin", actorId: adminUserId });
      await recordOrderEvent(tx, { orderId: item.orderId, orderItemId: item.id, type: "DELIVERER_PICKUP_OTP_ISSUED", actorType: "admin", actorId: adminUserId });
    }

    return { delivery: created, handoffs: createdHandoffs };
  });

  // Tells the deliverer a pickup is waiting and by when — deliberately
  // never includes the pickupOtp digits, which the coordinator reads to
  // them in person (or the coordinator re-reads later from the
  // "Deliverer assignments" admin screen).
  for (const handoff of handoffs) {
    void sendEmail({
      to: deliverer.email,
      ...delivererPickupAssignedEmail({
        delivererName: deliverer.firstName,
        businessName: handoff.businessName,
        deadline: new Date(handoff.pickupOtpExpiry).toLocaleString(),
      }),
    });
  }

  // One notification per buyer whose order had an item in this batch
  // (a buyer can only have one item per order in most carts, but dedupe
  // by orderId regardless so a multi-item order doesn't double-notify).
  const notifiedOrders = new Set<string>();
  for (const item of items) {
    if (notifiedOrders.has(item.orderId)) continue;
    notifiedOrders.add(item.orderId);
    await createNotification({
      recipientId: item.order.userId,
      type: "ORDER_ASSIGNED_TO_DELIVERER",
      title: "Your order is on its way to a deliverer",
      message: "A deliverer has been assigned to pick up and deliver your order.",
      targetUrl: "/orders",
      orderId: item.orderId,
    });
  }

  return { deliveryId: delivery.id, handoffs };
}
