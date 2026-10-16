// services/marketplace/cart/add-to-cart.ts
//
// Adds a product to the cart from the product detail modal. Same product +
// same variant already in the cart just increments quantity instead of
// duplicating a row — dedup key is (userId, productId, variantId), NOT
// selectedVariants, so "Small x2" and "Medium x3" of the same product are
// always separate lines even though they share a productId. Called by
// src/app/api/marketplace/cart/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";
import type { CartLineItem } from "@/types/cart";
import { cartItemSelect, toCartLineItem } from "./shared/cart-mappers";

export interface AddToCartInput {
  productId?: string;
  variantId?: string;
  quantity?: number;
  selectedVariants?: Record<string, string>;
}

export async function addToCart(userId: string, input: AddToCartInput): Promise<CartLineItem> {
  const productId = input.productId?.trim();
  const variantId = input.variantId?.trim() || null;
  const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));
  if (!productId) throw badRequest("productId is required.");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, stock: true, variants: { select: { id: true } }, business: { select: { type: true, approvalStatus: true, blocked: true } } },
  });
  // Unapproved or admin-blocked businesses are indistinguishable from "not
  // found" to a buyer — same convention as get-public-product-detail.ts.
  if (!product || product.business.approvalStatus !== "APPROVED" || product.business.blocked) throw notFound("Product not found.");
  // A School Vendor's products go through the separate Vendor cart/checkout
  // (slot booking, shared delivery fee, flat service fee — see
  // docs/marketplace/decisions/vendor-extends-business.md), never this
  // Business cart, even if a client somehow has the product id.
  if (product.business.type !== "BUSINESS") {
    throw badRequest("This item is only available through the Vendor cart.");
  }

  if (product.variants.length > 0 && !variantId) {
    throw badRequest("This product has variants — select one before adding it to your cart.");
  }

  let stock = product.stock;
  if (variantId) {
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId }, select: { stock: true } });
    if (!variant) throw notFound("Variant not found.");
    stock = variant.stock;
  }
  if (stock === 0) throw conflict("This item is out of stock.");

  // Normalize so the comparison below is stable regardless of key order —
  // still stored for display/back-compat, but no longer the dedup key.
  const variantsJson =
    input.selectedVariants && Object.keys(input.selectedVariants).length > 0
      ? JSON.stringify(input.selectedVariants, Object.keys(input.selectedVariants).sort())
      : null;

  const existing = await prisma.cartItem.findFirst({ where: { userId, productId, variantId } });

  const cartItem = existing
    ? await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(stock, existing.quantity + quantity) },
        select: cartItemSelect,
      })
    : await prisma.cartItem.create({
        data: { userId, productId, variantId, quantity: Math.min(stock, quantity), selectedVariants: variantsJson },
        select: cartItemSelect,
      });

  return toCartLineItem(cartItem);
}
