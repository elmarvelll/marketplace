// services/marketplace/vendor/get-featured-vendors.ts
//
// "School Vendors" for the marketplace homepage/Explore page — approved,
// non-paused vendors. Mirrors
// services/marketplace/business/get-featured-businesses.ts, kept as its
// own function (not a parameterized shared one) since the two experiences
// are deliberately separate — see
// docs/marketplace/decisions/vendor-extends-business.md. Called by
// src/app/api/marketplace/vendor/featured/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function getFeaturedVendors() {
  const vendors = await prisma.business.findMany({
    where: { approvalStatus: "APPROVED", type: "SCHOOL_VENDOR", paused: false, blocked: false },
    select: {
      id: true,
      name: true,
      vendorCategory: true,
      secure_url: true,
      location: true,
      availabilityStart: true,
      availabilityEnd: true,
      _count: { select: { products: true, sides: true } },
    },
    orderBy: { products: { _count: "desc" } },
    take: 8,
  });

  return vendors
    .filter((vendor) => vendor._count.products > 0 || vendor._count.sides > 0)
    .map(({ secure_url, _count, ...rest }) => ({ ...rest, secureUrl: secure_url, itemCount: _count.products + _count.sides }));
}
