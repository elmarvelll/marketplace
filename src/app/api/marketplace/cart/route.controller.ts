// src/app/api/marketplace/cart/route.controller.ts
//
// Controller for GET/POST /api/marketplace/cart. See
// services/marketplace/cart/{get-cart-for-user,add-to-cart}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { getCartForUser } from "@/services/marketplace/cart/get-cart-for-user";
import { addToCart as addToCartAction, type AddToCartInput } from "@/services/marketplace/cart/add-to-cart";

export async function getCart(): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const items = await getCartForUser(userId);
    return NextResponse.json({ items });
  });
}

export async function addToCart(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<AddToCartInput>(request);
    const item = await addToCartAction(userId, body);
    return NextResponse.json({ message: "Added to cart.", item }, { status: 201 });
  });
}
