// services/marketplace/product/shared/product-mappers.ts
//
// Prisma select shapes + row-to-DTO mappers + form-field parsing, shared
// across every product action file — kept in one place so the owner
// dashboard, the edit form, and public browsing can never drift into
// slightly different shapes for the same underlying Product row.

import type { Prisma } from "@prisma/client";
import { badRequest } from "@/lib/service-error";
import type { ProductFormValues, ProductSummary, ProductDetail } from "@/types/product";
import { productVariantSelect, toVariantSummary } from "./product-variants";
import { productImageSelect, toImageRows } from "./product-images";

export const productListSelect = {
  id: true,
  name: true,
  category: true,
  price: true,
  cost: true,
  stock: true,
  secure_url: true,
  images: { select: productImageSelect },
  variants: { select: productVariantSelect },
} satisfies Prisma.ProductSelect;

export const productDetailSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  price: true,
  cost: true,
  stock: true,
  public_id: true,
  secure_url: true,
  images: { select: productImageSelect },
  variants: { select: productVariantSelect },
} satisfies Prisma.ProductSelect;

type ProductListRow = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;
type ProductDetailRow = Prisma.ProductGetPayload<{ select: typeof productDetailSelect }>;

export function toProductSummary(product: ProductListRow): ProductSummary {
  const { secure_url, images, variants, ...rest } = product;
  return { ...rest, secureUrl: secure_url, images: toImageRows(images), variants: variants.map(toVariantSummary) };
}

export function toProductDetail(product: ProductDetailRow): ProductDetail {
  const { public_id, secure_url, images, variants, ...rest } = product;
  return {
    ...rest,
    publicId: public_id,
    secureUrl: secure_url,
    images: toImageRows(images),
    variants: variants.map(toVariantSummary),
  };
}

export function parseProductFields(body: Partial<ProductFormValues>) {
  const name = body.name?.trim();
  const category = body.category?.trim();
  const description = body.description?.trim();
  const price = Number(body.price);
  const stock = Number(body.stock);
  const cost = body.cost?.trim() ? Number(body.cost) : 0;

  if (!name || !category || !description || !Number.isFinite(price) || !Number.isFinite(stock) || !Number.isFinite(cost)) {
    throw badRequest("Name, category, description, price, and stock are required.");
  }

  return { name, category, description, price, stock: Math.max(0, Math.trunc(stock)), cost };
}
