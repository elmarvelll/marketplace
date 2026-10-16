// services/marketplace/delivery/list-pending-handoffs.ts
//
// The signed-in deliverer's pending pickup handoffs. Called by
// src/app/api/marketplace/deliverer/handoffs/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function listPendingHandoffs(delivererId: string) {
  const handoffs = await prisma.delivery_x_businesses.findMany({
    where: { deliverymanId: delivererId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      businessId: true,
      business: { select: { name: true, location: true } },
      deliveryStatus: true,
      expectedDeliveryAt: true,
      delivererConfirmedPickupAt: true,
      createdAt: true,
    },
  });

  return handoffs.map((h) => ({
    id: h.id,
    businessId: h.businessId,
    businessName: h.business.name,
    businessLocation: h.business.location,
    deliveryStatus: h.deliveryStatus,
    expectedDeliveryAt: h.expectedDeliveryAt?.toISOString() ?? null,
    delivererConfirmedPickupAt: h.delivererConfirmedPickupAt?.toISOString() ?? null,
    createdAt: h.createdAt.toISOString(),
  }));
}
