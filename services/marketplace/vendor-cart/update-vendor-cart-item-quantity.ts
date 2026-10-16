// services/marketplace/vendor-cart/update-vendor-cart-item-quantity.ts
//
// Updates a Vendor cart line's quantity — clamped against the side's, the
// selected variant's, or the product's own stock. Mirrors
// services/marketplace/cart/update-cart-item-quantity.ts. Called by
// src/app/api/marketplace/vendor-cart/[itemId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest } from "@/lib/service-error";
import type { VendorCartLineItem } from "@/types/vendor-cart";
import { vendorCartItemSelect, toVendorCartLineItem } from "./shared/vendor-cart-mappers";

export async function updateVendorCartItemQuantity(userId: string, itemId: string, quantity: number): Promise<VendorCartLineItem> {
  const existing = await prisma.cartItem.findFirst({
    where: { id: itemId, userId, OR: [{ sideId: { not: null } }, { product: { business: { type: "SCHOOL_VENDOR" } } }] },
    select: { id: true, product: { select: { stock: true } }, side: { select: { stock: true } }, variant: { select: { stock: true } } },
  });
  if (!existing) throw notFound("Cart item not found.");
  if (!Number.isFinite(quantity) || quantity < 1) throw badRequest("quantity must be at least 1.");

  // A side/product with no stock cap (null) is treated as unlimited.
  const stock = existing.variant?.stock ?? existing.product?.stock ?? existing.side?.stock ?? null;
  const clamped = stock === null ? Math.trunc(quantity) : Math.min(Math.trunc(quantity), stock);

  const cartItem = await prisma.cartItem.update({ where: { id: itemId }, data: { quantity: clamped }, select: vendorCartItemSelect });
  return toVendorCartLineItem(cartItem);
}
