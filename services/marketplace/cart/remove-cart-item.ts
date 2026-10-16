// services/marketplace/cart/remove-cart-item.ts
//
// Removes a cart line. Called by
// src/app/api/marketplace/cart/[itemId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";

export async function removeCartItem(userId: string, itemId: string): Promise<void> {
  const existing = await prisma.cartItem.findFirst({ where: { id: itemId, userId } });
  if (!existing) throw notFound("Cart item not found.");
  await prisma.cartItem.delete({ where: { id: itemId } });
}
