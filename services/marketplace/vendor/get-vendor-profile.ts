// services/marketplace/vendor/get-vendor-profile.ts
//
// Owner-scoped full vendor profile — the vendor's OWN dashboard's Profile
// tab and its approval gate. Deliberately separate from
// get-vendor-storefront.ts (public, no auth, only approved/non-sensitive
// fields) and from Business's own get-business-detail.ts (Business-owned
// fields like deliveryDays/industry that a vendor profile doesn't use) —
// see docs/marketplace/decisions/vendor-independent-architecture.md.
// Called by src/app/api/marketplace/vendor/[id]/profile/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";

export async function getVendorProfile(businessId: string, userId: string) {
  const business = await prisma.business.findFirst({ where: { id: businessId, userId, type: "SCHOOL_VENDOR" } });
  if (!business) throw notFound("Vendor not found.");

  return {
    id: business.id,
    name: business.name,
    vendorCategory: business.vendorCategory,
    description: business.description,
    location: business.location,
    availabilityStart: business.availabilityStart,
    availabilityEnd: business.availabilityEnd,
    paused: business.paused,
    pausedReason: business.pausedReason,
    publicId: business.public_id,
    secureUrl: business.secure_url,
    bankName: business.bankName,
    bankCode: business.bankCode,
    accountNumber: business.accountNumber,
    accountHolderName: business.accountHolderName,
    approvalStatus: business.approvalStatus,
    rejectionReason: business.rejectionReason,
    blocked: business.blocked,
    blockedReason: business.blocked ? business.blockedReason : null,
    createdAt: business.createdAt.toISOString(),
  };
}
