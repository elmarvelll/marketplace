// services/marketplace/product/list-business-products.ts
//
// This business's product listing, for the dashboard's Products tab.
// Called by
// src/app/api/marketplace/businesses/[id]/products/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { productListSelect, toProductSummary } from "./shared/product-mappers";

export async function listBusinessProducts(businessId: string) {
  const products = await prisma.product.findMany({
    where: { businessId },
    select: productListSelect,
    orderBy: { createdAt: "desc" },
  });
  return products.map(toProductSummary);
}
