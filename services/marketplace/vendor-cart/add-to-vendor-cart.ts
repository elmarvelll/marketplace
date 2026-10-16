// services/marketplace/vendor-cart/add-to-vendor-cart.ts
//
// Adds a Vendor cart line — either a School Vendor product(+variant) or a
// universal Side, never both in one call (mirrors
// services/marketplace/cart/add-to-cart.ts's shape). A product with
// variants requires a variantId, same rule as the Business cart, so
// "Small x2, Large x1" naturally becomes two distinct CartItem rows keyed
// by (userId, productId, variantId) — each with its own quantity, giving
// independent +/- controls for free (spec §8). Called by
// src/app/api/marketplace/vendor-cart/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";
import type { VendorCartLineItem } from "@/types/vendor-cart";
import { vendorCartItemSelect, toVendorCartLineItem } from "./shared/vendor-cart-mappers";

export interface AddToVendorCartInput {
  productId?: string;
  variantId?: string;
  sideId?: string;
  quantity?: number;
}

export async function addToVendorCart(userId: string, input: AddToVendorCartInput): Promise<VendorCartLineItem> {
  const productId = input.productId?.trim() || undefined;
  const sideId = input.sideId?.trim() || undefined;
  const variantId = input.variantId?.trim() || null;
  const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));

  if (!productId && !sideId) throw badRequest("productId or sideId is required.");
  if (productId && sideId) throw badRequest("Provide either productId or sideId, not both.");

  if (sideId) {
    const side = await prisma.side.findUnique({ where: { id: sideId }, select: { id: true, stock: true, available: true, business: { select: { type: true, approvalStatus: true, paused: true, blocked: true } } } });
    if (!side || side.business.type !== "SCHOOL_VENDOR" || side.business.approvalStatus !== "APPROVED" || side.business.blocked) throw notFound("Side not found.");
    if (side.business.paused || !side.available) throw conflict("This side isn't currently available.");
    const stock = side.stock;
    if (stock !== null && stock === 0) throw conflict("This side is out of stock.");

    const existing = await prisma.cartItem.findFirst({ where: { userId, sideId } });
    const nextQuantity = stock !== null ? Math.min(stock, (existing?.quantity ?? 0) + quantity) : (existing?.quantity ?? 0) + quantity;

    const cartItem = existing
      ? await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity }, select: vendorCartItemSelect })
      : await prisma.cartItem.create({ data: { userId, sideId, quantity: nextQuantity }, select: vendorCartItemSelect });

    return toVendorCartLineItem(cartItem);
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, stock: true, variants: { select: { id: true } }, business: { select: { type: true, approvalStatus: true, paused: true, blocked: true } } },
  });
  if (!product || product.business.type !== "SCHOOL_VENDOR" || product.business.approvalStatus !== "APPROVED" || product.business.blocked) throw notFound("Product not found.");
  if (product.business.paused) throw conflict("This vendor isn't currently accepting orders.");
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

  const existing = await prisma.cartItem.findFirst({ where: { userId, productId, variantId } });

  const cartItem = existing
    ? await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: Math.min(stock, existing.quantity + quantity) }, select: vendorCartItemSelect })
    : await prisma.cartItem.create({ data: { userId, productId, variantId, quantity: Math.min(stock, quantity) }, select: vendorCartItemSelect });

  return toVendorCartLineItem(cartItem);
}
