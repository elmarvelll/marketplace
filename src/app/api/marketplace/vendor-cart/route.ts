// .../vendor-cart/route.ts
//
// GET  -> the current user's Vendor cart.
// POST -> adds a product(+variant) or side line.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listVendorCart, addVendorCartItem } from "./route.controller";

export async function GET() {
  return listVendorCart();
}

export async function POST(request: NextRequest) {
  return addVendorCartItem(request);
}
