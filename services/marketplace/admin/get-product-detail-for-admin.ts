// services/marketplace/admin/get-product-detail-for-admin.ts
//
// One product's full detail for the admin Product Detail page
// (src/app/admin/products/[productId]/page.tsx)
// — reuses the same image/variant select+mappers every other product
// service uses (services/marketplace/product/shared/product-{images,variants}.ts),
// plus the owning business's id/name/approvalStatus so the page can link
// back to the admin Business Profile page. Called by
// src/app/api/marketplace/admin/products/[productId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { productImageSelect, toImageRows } from "@/services/marketplace/product/shared/product-images";
import { productVariantSelect, toVariantSummary } from "@/services/marketplace/product/shared/product-variants";

export async function getProductDetailForAdmin(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      price: true,
      cost: true,
      stock: true,
      public_id: true,
      secure_url: true,
      createdAt: true,
      images: { select: productImageSelect },
      variants: { select: productVariantSelect },
      business: { select: { id: true, name: true, approvalStatus: true } },
    },
  });
  if (!product) throw notFound("Product not found.");

  const { public_id, secure_url, images, variants, business, createdAt, ...rest } = product;
  return {
    ...rest,
    publicId: public_id,
    secureUrl: secure_url,
    createdAt: createdAt.toISOString(),
    images: toImageRows(images),
    variants: variants.map(toVariantSummary),
    business,
  };
}
