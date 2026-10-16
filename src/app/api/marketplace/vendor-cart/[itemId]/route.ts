// .../vendor-cart/[itemId]/route.ts
//
// PATCH  -> updates a Vendor cart line's quantity.
// DELETE -> removes a Vendor cart line.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { updateVendorCartItem, removeVendorCartItem } from "./route.controller";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return updateVendorCartItem(itemId, request);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return removeVendorCartItem(itemId);
}
