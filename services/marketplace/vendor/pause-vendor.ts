// services/marketplace/vendor/pause-vendor.ts
//
// A vendor's self-service "temporarily unavailable" toggle — deliberately
// separate from admin-only approvalStatus=SUSPENDED/blocked (see
// prisma/schema.prisma's comment on Business.paused and
// docs/marketplace/decisions/vendor-independent-architecture.md).
// Owner+type-scoped via requireOwnedVendor. Called by
// src/app/api/marketplace/vendor/[id]/pause/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";

export async function pauseVendor(businessId: string, reason: string | undefined) {
  await requireOwnedVendor(businessId);

  return prisma.business.update({
    where: { id: businessId },
    data: { paused: true, pausedAt: new Date(), pausedReason: reason?.trim() || null },
    select: { id: true, paused: true, pausedAt: true, pausedReason: true },
  });
}

export async function unpauseVendor(businessId: string) {
  await requireOwnedVendor(businessId);

  return prisma.business.update({
    where: { id: businessId },
    data: { paused: false, pausedAt: null, pausedReason: null },
    select: { id: true, paused: true, pausedAt: true, pausedReason: true },
  });
}
