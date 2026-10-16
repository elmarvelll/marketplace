// services/marketplace/product/get-owned-product-detail.ts
//
// One product's full detail, for the owner's "Update Inventory" edit form.
// Called by
// src/app/api/marketplace/businesses/[id]/products/[productId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { productDetailSelect, toProductDetail } from "./shared/product-mappers";

export async function getOwnedProductDetail(businessId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, businessId }, select: productDetailSelect });
  if (!product) throw notFound("Product not found.");
  return toProductDetail(product);
}
