// services/marketplace/business/list-user-businesses.ts
//
// The current user's own businesses, for the navbar's "My Businesses"
// dropdown. Called by
// src/app/api/marketplace/businesses/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function listUserBusinesses(userId: string) {
  const businesses = await prisma.business.findMany({
    where: { userId },
    // type is included so the navbar dropdown can route each entry to the
    // correct dashboard — a School Vendor row must link to
    // vendor-dashboard/[id], never business/[id] (see
    // docs/marketplace/decisions/vendor-independent-architecture.md).
    select: { id: true, name: true, industry: true, secure_url: true, approvalStatus: true, type: true },
    orderBy: { createdAt: "desc" },
  });
  return businesses.map(({ secure_url, ...rest }) => ({ ...rest, secureUrl: secure_url }));
}
