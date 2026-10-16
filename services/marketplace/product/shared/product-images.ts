// services/marketplace/product/shared/product-images.ts
//
// Wires the product form's multi-image list (src/types/product.ts's
// ProductImageRow[]) onto the new ProductImage model, and keeps
// Product.image/public_id/secure_url mirroring position 0 so every
// existing single-image consumer (product cards, etc.) keeps working
// unchanged. Used by create-product.ts and update-product.ts, inside the
// same transaction as the product write.

import type { Prisma, PrismaClient } from "@prisma/client";
import type { ProductImageRow } from "@/types/product";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface ParsedImageRow {
  publicId: string;
  secureUrl: string;
}

export function parseImageRows(rows: ProductImageRow[] | undefined): ParsedImageRow[] {
  if (!rows || rows.length === 0) return [];
  return rows
    .filter((row) => row.publicId.trim() && row.secureUrl.trim())
    .map((row) => ({ publicId: row.publicId.trim(), secureUrl: row.secureUrl.trim() }))
    .slice(0, 8); // sane upper bound — a product doesn't need more than a handful of gallery images
}

// The primary (position 0) image, if any — mirrored onto
// Product.image/public_id/secure_url. Falls back to the legacy
// publicId/secureUrl form fields (single-image upload, still supported)
// when the seller never used the multi-image picker at all.
export function resolvePrimaryImage(
  images: ParsedImageRow[],
  legacy: { publicId?: string; secureUrl?: string }
): ParsedImageRow | null {
  if (images.length > 0) return images[0];
  if (legacy.publicId?.trim() && legacy.secureUrl?.trim()) {
    return { publicId: legacy.publicId.trim(), secureUrl: legacy.secureUrl.trim() };
  }
  return null;
}

export async function replaceProductImages(tx: Tx, productId: string, images: ParsedImageRow[]): Promise<void> {
  await tx.productImage.deleteMany({ where: { productId } });
  if (images.length === 0) return;
  await tx.productImage.createMany({
    data: images.map((image, position) => ({ productId, publicId: image.publicId, secureUrl: image.secureUrl, position })),
  });
}

export const productImageSelect = {
  id: true,
  publicId: true,
  secureUrl: true,
  position: true,
} satisfies Prisma.ProductImageSelect;

type ProductImageRowSelected = Prisma.ProductImageGetPayload<{ select: typeof productImageSelect }>;

export function toImageRows(images: ProductImageRowSelected[]): ProductImageRow[] {
  return images
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((image) => ({ id: image.id, publicId: image.publicId, secureUrl: image.secureUrl, position: image.position }));
}
