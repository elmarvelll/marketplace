// .../vendor-cart/[itemId]/route.controller.ts
//
// Controller for PATCH/DELETE /api/marketplace/vendor-cart/[itemId]. See
// services/marketplace/vendor-cart/update-vendor-cart-item-quantity.ts.
// Removal reuses services/marketplace/cart/remove-cart-item.ts as-is — a
// plain (id, userId)-scoped delete has no Business/Vendor distinction to
// make.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { updateVendorCartItemQuantity } from "@/services/marketplace/vendor-cart/update-vendor-cart-item-quantity";
import { removeCartItem } from "@/services/marketplace/cart/remove-cart-item";

export async function updateVendorCartItem(itemId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ quantity?: number }>(request);
    const item = await updateVendorCartItemQuantity(userId, itemId, Math.trunc(body.quantity ?? NaN));
    return NextResponse.json({ item });
  });
}

export async function removeVendorCartItem(itemId: string): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    await removeCartItem(userId, itemId);
    return NextResponse.json({ message: "Removed from cart." });
  });
}
