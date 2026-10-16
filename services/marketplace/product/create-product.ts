// services/marketplace/product/create-product.ts
//
// Creates a product from the dashboard's "Create Product" form. Called by
// src/app/api/marketplace/businesses/[id]/products/route.controller.ts.

import { prisma } from "@/lib/prisma";
import type { ProductFormValues } from "@/types/product";
import { productDetailSelect, toProductDetail, parseProductFields } from "./shared/product-mappers";
import { parseVariantRows, createVariantRows } from "./shared/product-variants";
import { parseImageRows, replaceProductImages, resolvePrimaryImage } from "./shared/product-images";

export async function createProduct(businessId: string, body: Partial<ProductFormValues>) {
  const { name, category, description, price, stock, cost } = parseProductFields(body);
  const variants = parseVariantRows(body.variants);
  const images = parseImageRows(body.images);
  const primary = resolvePrimaryImage(images, { publicId: body.publicId, secureUrl: body.secureUrl });

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name,
        category,
        description,
        price,
        cost,
        stock,
        public_id: primary?.publicId,
        secure_url: primary?.secureUrl,
        businessId,
      },
    });

    await createVariantRows(tx, created.id, variants);
    await replaceProductImages(tx, created.id, images);

    return tx.product.findUniqueOrThrow({ where: { id: created.id }, select: productDetailSelect });
  },
  {timeout: 30000}
);

  return toProductDetail(product);
}
