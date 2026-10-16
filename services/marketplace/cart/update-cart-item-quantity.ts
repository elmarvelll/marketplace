// services/marketplace/cart/update-cart-item-quantity.ts
//
// Updates a cart line's quantity (the CartDrawer's +/- controls). Clamped
// against the selected variant's stock when the line has one, else the
// product's own stock. Called by
// src/app/api/marketplace/cart/[itemId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest } from "@/lib/service-error";
import type { CartLineItem } from "@/types/cart";
import { cartItemSelect, toCartLineItem } from "./shared/cart-mappers";

export async function updateCartItemQuantity(userId: string, itemId: string, quantity: number): Promise<CartLineItem> {
  const existing = await prisma.cartItem.findFirst({
    // productId != null keeps this Business-cart action scoped to
    // product-based lines — a Side line (School Vendor cart) is updated
    // through its own vendor-cart action instead, since it has no
    // ProductVariant/Product stock to clamp against.
    where: { id: itemId, userId, productId: { not: null } },
    select: { id: true, product: { select: { stock: true } }, variant: { select: { stock: true } } },
  });
  if (!existing) throw notFound("Cart item not found.");
  if (!Number.isFinite(quantity) || quantity < 1) throw badRequest("quantity must be at least 1.");

  const stock = existing.variant?.stock ?? existing.product!.stock;

  const cartItem = await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity: Math.min(Math.trunc(quantity), stock) },
    select: cartItemSelect,
  });
  return toCartLineItem(cartItem);
}
