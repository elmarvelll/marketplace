// services/marketplace/product/shared/product-variants.ts
//
// Wires the flat, one-price-each variant list (src/types/product.ts's
// ProductVariantRow — "Small ₦2,000 x10", "Medium ₦2,500 x7", ...) onto
// the existing VariantField/VariantValue/ProductVariant/
// VariantValueOnProductVariant models, without adding any new tables.
// Every product that has variants gets exactly one implicit VariantField
// (name IMPLICIT_VARIANT_FIELD_NAME, never shown to the seller) — one
// VariantValue + one ProductVariant per row, joined together. A
// variant-less product has no VariantField/VariantValue/ProductVariant
// rows at all.
//
// Used by create-product.ts and update-product.ts, both inside a
// transaction so "create the product" and "create its variants" can't
// partially succeed.

import type { Prisma, PrismaClient } from "@prisma/client";
import { badRequest } from "@/lib/service-error";
import type { ProductVariantRow } from "@/types/product";

export const IMPLICIT_VARIANT_FIELD_NAME = "Option";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface ParsedVariantRow {
  name: string;
  price: number;
  stock: number;
}

// Validates + normalizes the raw form rows. Throws badRequest on anything
// malformed — a variant MUST have exactly one name, one price, one stock,
// per the product's requirements (never multiple prices per variant, which
// this shape can't even represent).
export function parseVariantRows(rows: ProductVariantRow[] | undefined): ParsedVariantRow[] {
  if (!rows || rows.length === 0) return [];

  const parsed = rows
    .filter((row) => row.name.trim())
    .map((row) => {
      const name = row.name.trim();
      const price = Number(row.price);
      const stock = Number(row.stock);
      if (!Number.isFinite(price) || price < 0) {
        throw badRequest(`Variant "${name}" needs a valid price.`);
      }
      if (!Number.isFinite(stock) || stock < 0) {
        throw badRequest(`Variant "${name}" needs a valid stock quantity.`);
      }
      return { name, price, stock: Math.trunc(stock) };
    });

  const names = new Set<string>();
  for (const row of parsed) {
    if (names.has(row.name)) throw badRequest(`Variant "${row.name}" is listed more than once.`);
    names.add(row.name);
  }

  return parsed;
}

// Creates the implicit field + one value/variant/join row per entry.
// Assumes the product already exists (productId is real) — called inside
// the same transaction as the product create/update.
export async function createVariantRows(tx: Tx, productId: string, variants: ParsedVariantRow[]): Promise<void> {
  if (variants.length === 0) return;

  const field = await tx.variantField.create({ data: { productId, name: IMPLICIT_VARIANT_FIELD_NAME } });

  for (const variant of variants) {
    const value = await tx.variantValue.create({ data: { fieldId: field.id, value: variant.name } });
    const productVariant = await tx.productVariant.create({
      data: { productId, price: variant.price, stock: variant.stock, isCustomPrice: true },
    });
    await tx.variantValueOnProductVariant.create({ data: { variantId: productVariant.id, valueId: value.id } });
  }
}

// Wholesale replace — same convention update-product.ts already used for
// the old attribute-only variants: delete then recreate, simpler than
// diffing a handful of rows. Deleting the VariantField cascades to its
// VariantValue rows (onDelete: Cascade) and their
// VariantValueOnProductVariant joins, but NOT to the ProductVariant rows
// themselves (they're a separate direct relation to Product) — so those
// are deleted explicitly first.
export async function replaceVariantRows(tx: Tx, productId: string, variants: ParsedVariantRow[]): Promise<void> {
  await tx.productVariant.deleteMany({ where: { productId } });
  await tx.variantField.deleteMany({ where: { productId } });
  await createVariantRows(tx, productId, variants);
}

export const productVariantSelect = {
  id: true,
  price: true,
  stock: true,
  variantValues: { select: { value: { select: { value: true } } } },
} satisfies Prisma.ProductVariantSelect;

type ProductVariantRowSelected = Prisma.ProductVariantGetPayload<{ select: typeof productVariantSelect }>;

export function toVariantSummary(variant: ProductVariantRowSelected) {
  // Every implicit-field variant has exactly one joined value (its name) —
  // see createVariantRows above.
  const name = variant.variantValues[0]?.value.value ?? "";
  return { id: variant.id, name, price: variant.price, stock: variant.stock };
}
