// services/marketplace/product/delete-product.ts
//
// Removes a product. Called by
// src/app/api/marketplace/businesses/[id]/products/[productId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";

export async function deleteProduct(businessId: string, productId: string) {
  const existing = await prisma.product.findFirst({ where: { id: productId, businessId }, select: { id: true } });
  if (!existing) throw notFound("Product not found.");
  await prisma.product.delete({ where: { id: productId } });
}
