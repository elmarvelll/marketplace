// services/marketplace/vendor/get-popular-vendor-items.ts
//
// "Popular Vendor Items" for the homepage/Explore page — real Products
// from approved, non-paused School Vendors. Mirrors
// services/marketplace/product/search-products.ts's shape, kept separate
// since Business and Vendor product browsing are deliberately different
// experiences (see docs/marketplace/decisions/vendor-extends-business.md).
// Called by src/app/api/marketplace/vendor/popular-items/route.controller.ts.

import { prisma } from "@/lib/prisma";
import type { ProductSearchResult } from "@/types/search";

export async function getPopularVendorItems(limit = 8): Promise<ProductSearchResult[]> {
  const take = limit > 0 ? Math.min(limit, 40) : 8;

  const products = await prisma.product.findMany({
    where: { business: { approvalStatus: "APPROVED", type: "SCHOOL_VENDOR", paused: false, blocked: false } },
    select: { id: true, name: true, category: true, price: true, secure_url: true, business: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });

  return products.map(({ secure_url, business, ...rest }) => ({ ...rest, secureUrl: secure_url, sellerName: business.name }));
}
