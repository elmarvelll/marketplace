// services/marketplace/product/search-products.ts
//
// Cross-business product search/browse — also used for the homepage's
// "Popular Products" (called with no q/categories, just a small limit).
// Called by src/app/api/marketplace/search/products/route.controller.ts.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { productCategories } from "@/services/marketplace/shared/categories";
import type { ProductSearchResult } from "@/types/search";

const MAX_SEARCH_FILTERS = 4;

export async function searchProducts(params: { q?: string; categoryIds?: string[]; limit?: number }): Promise<ProductSearchResult[]> {
  const q = params.q?.trim();
  const categoryIds = (params.categoryIds ?? []).slice(0, MAX_SEARCH_FILTERS);

  // Category *ids* come in from the URL (what FilterDropdown tracks), but
  // Product.category is stored as the display name — resolved here rather
  // than trusting whatever string the client sends.
  const categoryNames = categoryIds
    .map((id) => productCategories.find((category) => category.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const where: Prisma.ProductWhereInput = {
    // Only products from an admin-approved business are ever
    // buyer-visible — see BusinessApprovalStatus's doc comment in
    // prisma/schema.prisma. type: "BUSINESS" keeps this Business
    // Marketplace search/homepage query from also surfacing School Vendor
    // products — those have their own "Popular Vendor Items" query (see
    // services/marketplace/vendor/get-popular-vendor-items.ts) so the two
    // experiences stay visually and logically separate per
    // docs/marketplace/decisions/vendor-extends-business.md.
    business: { approvalStatus: "APPROVED", type: "BUSINESS", blocked: false },
    // mode: "insensitive" — Postgres' `contains` is case-sensitive by
    // default (unlike MySQL's default collation, which this search relied
    // on being case-insensitive for free); explicit here so search
    // behavior doesn't silently change with the database engine.
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    ...(categoryNames.length > 0 ? { category: { in: categoryNames } } : {}),
  };

  const take = params.limit && params.limit > 0 ? Math.min(params.limit, 40) : 40;

  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, category: true, price: true, secure_url: true, business: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });

  return products.map(({ secure_url, business, ...rest }) => ({ ...rest, secureUrl: secure_url, sellerName: business.name }));
}
