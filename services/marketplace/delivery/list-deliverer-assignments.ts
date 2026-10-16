// services/marketplace/delivery/list-deliverer-assignments.ts
//
// The delivery coordinator's "who has what right now" overview — every
// approved deliverer, with their pending pickup handoffs (including the
// still-valid pickupOtp, since a coordinator may need to re-read it hours
// after assign-delivery.ts first issued it — see
// services/marketplace/delivery/assign-delivery.ts and
// docs/marketplace/security/otp-security.md) and their currently-active
// delivery items. Called by
// src/app/api/marketplace/admin/deliverers/assignments/route.controller.ts.

import { prisma } from "@/lib/prisma";
import type { DeliveryStatus } from "@prisma/client";

// Items in one of these statuses are done with — excluding them keeps this
// screen reading as "currently on this deliverer's plate", not a full
// history.
const TERMINAL_STATUSES: DeliveryStatus[] = ["DELIVERED", "FAILED", "RETURNED"];

export async function listDelivererAssignments() {
  const deliverers = await prisma.deliverer.findMany({
    where: { status: "APPROVED" },
    orderBy: { firstName: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      businessHandoffs: {
        where: { delivererConfirmedPickupAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          businessId: true,
          business: { select: { name: true } },
          pickupOtp: true,
          pickupOtpExpiry: true,
          pickupOtpAttempts: true,
        },
      },
      deliveries: {
        select: {
          items: {
            where: { status: { notIn: TERMINAL_STATUSES } },
            select: {
              id: true,
              status: true,
              quantity: true,
              business: { select: { name: true } },
              orderItem: {
                select: {
                  orderId: true,
                  product: { select: { name: true } },
                  side: { select: { name: true } },
                  order: { select: { vendorDeliveryBooking: { select: { bookedFor: true, slot: { select: { label: true } } } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  return deliverers.map((deliverer) => ({
    delivererId: deliverer.id,
    delivererName: `${deliverer.firstName} ${deliverer.lastName}`,
    pendingHandoffs: deliverer.businessHandoffs.map((handoff) => ({
      handoffId: handoff.id,
      businessId: handoff.businessId,
      businessName: handoff.business.name,
      pickupOtp: handoff.pickupOtp,
      pickupOtpExpiry: handoff.pickupOtpExpiry?.toISOString() ?? null,
      pickupOtpAttempts: handoff.pickupOtpAttempts,
    })),
    activeItems: deliverer.deliveries.flatMap((delivery) =>
      delivery.items.map((item) => ({
        deliveryItemId: item.id,
        status: item.status,
        quantity: item.quantity,
        businessName: item.business.name,
        productName: item.orderItem.product?.name ?? item.orderItem.side?.name ?? "Unknown item",
        orderId: item.orderItem.orderId,
        bookedFor: item.orderItem.order.vendorDeliveryBooking?.bookedFor.toISOString() ?? null,
        slotLabel: item.orderItem.order.vendorDeliveryBooking?.slot.label ?? null,
      }))
    ),
  }));
}
