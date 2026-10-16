// services/marketplace/product/update-product.ts
//
// Saves the owner's "Update Inventory" edit form. Variants and images are
// both replaced wholesale (delete then recreate) rather than diffed — much
// simpler, and fine for a handful of rows per product. Called by
// src/app/api/marketplace/businesses/[id]/products/[productId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import type { ProductFormValues } from "@/types/product";
import { productDetailSelect, toProductDetail, parseProductFields } from "./shared/product-mappers";
import { parseVariantRows, replaceVariantRows } from "./shared/product-variants";
import { parseImageRows, replaceProductImages, resolvePrimaryImage } from "./shared/product-images";

export async function updateProduct(businessId: string, productId: string, body: Partial<ProductFormValues>) {
  const existing = await prisma.product.findFirst({ where: { id: productId, businessId }, select: { id: true } });
  if (!existing) throw notFound("Product not found.");

  const { name, category, description, price, stock, cost } = parseProductFields(body);
  const variants = parseVariantRows(body.variants);
  const images = parseImageRows(body.images);
  const primary = resolvePrimaryImage(images, { publicId: body.publicId, secureUrl: body.secureUrl });

  const product = await prisma.$transaction(async (tx) => {
    await replaceVariantRows(tx, productId, variants);
    await replaceProductImages(tx, productId, images);

    return tx.product.update({
      where: { id: productId },
      data: {
        name,
        category,
        description,
        price,
        cost,
        stock,
        public_id: primary?.publicId ?? null,
        secure_url: primary?.secureUrl ?? null,
      },
      select: productDetailSelect,
    });
  });

  return toProductDetail(product);
}
