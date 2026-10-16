// services/marketplace/fines/list-business-fines.ts
//
// This business's late-delivery fines + current restriction state. Called
// by src/app/api/marketplace/businesses/[id]/fines/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function listBusinessFines(businessId: string) {
  const [fines, business] = await Promise.all([
    prisma.lateDeliveryFine.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderId: true, amount: true, status: true, paidAt: true, createdAt: true },
    }),
    prisma.business.findUnique({
      where: { id: businessId },
      select: { deliveryRestricted: true, deliveryRestrictedAt: true, lateDeliveryCount: true },
    }),
  ]);

  return {
    deliveryRestricted: business?.deliveryRestricted ?? false,
    deliveryRestrictedAt: business?.deliveryRestrictedAt?.toISOString() ?? null,
    lateDeliveryCount: business?.lateDeliveryCount ?? 0,
    fines: fines.map((fine) => ({
      id: fine.id,
      orderId: fine.orderId,
      amount: fine.amount,
      status: fine.status,
      paidAt: fine.paidAt?.toISOString() ?? null,
      createdAt: fine.createdAt.toISOString(),
    })),
  };
}
