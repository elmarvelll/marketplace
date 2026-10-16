// src/app/api/marketplace/cart/[itemId]/route.controller.ts
//
// Controller for PATCH/DELETE /api/marketplace/cart/[itemId]. See
// services/marketplace/cart/{update-cart-item-quantity,remove-cart-item}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { updateCartItemQuantity } from "@/services/marketplace/cart/update-cart-item-quantity";
import { removeCartItem as removeCartItemAction } from "@/services/marketplace/cart/remove-cart-item";

export async function updateCartItem(itemId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ quantity?: number }>(request);
    const item = await updateCartItemQuantity(userId, itemId, Math.trunc(body.quantity ?? NaN));
    return NextResponse.json({ item });
  });
}

export async function removeCartItem(itemId: string): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    await removeCartItemAction(userId, itemId);
    return NextResponse.json({ message: "Removed from cart." });
  });
}
