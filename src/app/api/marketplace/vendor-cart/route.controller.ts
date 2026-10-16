// .../vendor-cart/route.controller.ts
//
// Controller for GET/POST /api/marketplace/vendor-cart. See
// services/marketplace/vendor-cart/{get-vendor-cart-for-user,add-to-vendor-cart}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { getVendorCartForUser } from "@/services/marketplace/vendor-cart/get-vendor-cart-for-user";
import { addToVendorCart, type AddToVendorCartInput } from "@/services/marketplace/vendor-cart/add-to-vendor-cart";

export async function listVendorCart(): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const items = await getVendorCartForUser(userId);
    return NextResponse.json({ items });
  });
}

export async function addVendorCartItem(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<AddToVendorCartInput>(request);
    const item = await addToVendorCart(userId, body);
    return NextResponse.json({ item }, { status: 201 });
  });
}
