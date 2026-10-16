// services/marketplace/admin/list-products-for-admin.ts
//
// Every product on the marketplace, for the admin Products tab
// (src/app/admin/products/page.tsx) — grouped by
// business, literally: pagination happens at the BUSINESS level (only
// businesses with >=1 product, ordered by name), and each page's response
// includes each of those businesses' full product list (reusing
// services/marketplace/product/list-business-products.ts as-is). This
// makes the "Business A: [...products], Business B: [...products]"
// grouping real rather than a flat list with a business column.
//
// Deliberately NOT gated on approvalStatus: "APPROVED" (unlike the
// buyer-facing services/marketplace/product/search-products.ts) — admins
// specifically need visibility into products belonging to pending/
// rejected/suspended businesses too.
//
// `q` matches either the business name (shows ALL of that business's
// products) or a product name (narrows to just the matching products
// within businesses that have one) — both are OR'd together at the
// business-selection level, then resolved per-business below. `businessId`
// jumps straight to one business's full product list (no pagination
// needed within one business, same reasoning as list-business-products.ts).
//
// Called by src/app/api/marketplace/admin/products/route.controller.ts.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "./shared/pagination";
import { listBusinessProducts } from "@/services/marketplace/product/list-business-products";
import type { ProductSummary } from "@/types/product";

export interface AdminProductGroup {
  businessId: string;
  businessName: string;
  businessApprovalStatus: string;
  products: ProductSummary[];
}

export async function listProductsForAdmin(searchParams: URLSearchParams): Promise<PageResult<AdminProductGroup>> {
  const pageParams = parsePageParams(searchParams);
  const q = searchParams.get("q")?.trim();
  const businessId = searchParams.get("businessId")?.trim();

  const where: Prisma.BusinessWhereInput = {
    products: { some: {} },
    ...(businessId ? { id: businessId } : {}),
    // mode: "insensitive" — see the identical comment in
    // services/marketplace/product/search-products.ts.
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { products: { some: { name: { contains: q, mode: "insensitive" } } } }] }
      : {}),
  };

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      select: { id: true, name: true, approvalStatus: true },
      orderBy: { name: "asc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
    }),
    prisma.business.count({ where }),
  ]);

  const groups = await Promise.all(
    businesses.map(async (business): Promise<AdminProductGroup> => {
      const products = await listBusinessProducts(business.id);
      const businessNameMatches = q ? business.name.toLowerCase().includes(q.toLowerCase()) : true;
      const filtered = businessNameMatches ? products : products.filter((p) => p.name.toLowerCase().includes(q!.toLowerCase()));
      return {
        businessId: business.id,
        businessName: business.name,
        businessApprovalStatus: business.approvalStatus,
        products: filtered,
      };
    })
  );

  return toPageResult(
    groups.filter((g) => g.products.length > 0),
    total,
    pageParams
  );
}
