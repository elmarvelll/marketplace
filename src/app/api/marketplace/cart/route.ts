// src/app/api/marketplace/cart/route.ts
//
// GET  -> the signed-in user's cart.
// POST -> adds a product to the cart.
//
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getCart, addToCart } from "./route.controller";

export async function GET() {
  return getCart();
}

export async function POST(request: NextRequest) {
  return addToCart(request);
}
