// services/marketplace/vendor/shared/require-owned-vendor.ts
//
// The one ownership+type check every vendor-owned service uses: the
// authenticated user must own this Business row, AND it must actually be
// a SCHOOL_VENDOR (not a plain Business) — every vendor API/operation
// must verify both (spec §13). Combines the existing generic
// requireOwnedBusiness (ownership) with a vendor-type check, so no
// vendor-side action trusts an id from the client without both checks.

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/service-error";
import { requireOwnedBusiness, type OwnedBusiness } from "@/services/marketplace/business/business-ownership.service";

export async function requireOwnedVendor(businessId: string): Promise<OwnedBusiness> {
  const owned = await requireOwnedBusiness(businessId);
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { type: true } });
  if (!business || business.type !== "SCHOOL_VENDOR") {
    throw badRequest("This action is only available for School Vendors.");
  }
  return owned;
}
