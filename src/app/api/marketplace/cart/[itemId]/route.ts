// src/app/api/marketplace/cart/[itemId]/route.ts
//
// PATCH  -> updates a cart line's quantity.
// DELETE -> removes a cart line.
//
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { updateCartItem, removeCartItem } from "./route.controller";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return updateCartItem(itemId, request);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return removeCartItem(itemId);
}
