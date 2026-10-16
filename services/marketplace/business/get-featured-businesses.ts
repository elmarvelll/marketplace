// services/marketplace/business/get-featured-businesses.ts
//
// "Top Businesses" for the marketplace homepage — every user's businesses,
// ranked by product count (no order-volume data to rank by yet). Called by
// src/app/api/marketplace/businesses/featured/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function getFeaturedBusinesses() {
  const businesses = await prisma.business.findMany({
    // type: "BUSINESS" — keeps School Vendors out of "Top Businesses";
    // they have their own "School Vendors" section, see
    // services/marketplace/vendor/get-featured-vendors.ts.
    // blocked: false — an admin-blocked business is hidden from buyers.
    where: { approvalStatus: "APPROVED", type: "BUSINESS", blocked: false },
    select: { id: true, name: true, industry: true, secure_url: true, _count: { select: { products: true } } },
    orderBy: { products: { _count: "desc" } },
    take: 8,
  });

  return businesses
    .filter((business) => business._count.products > 0)
    .map(({ secure_url, _count, ...rest }) => ({ ...rest, secureUrl: secure_url, productCount: _count.products }));
}
