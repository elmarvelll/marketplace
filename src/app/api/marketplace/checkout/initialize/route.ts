// src/app/api/marketplace/checkout/initialize/route.ts
//
// POST { location } -> creates the real Order/OrderItem rows. Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { initializeCheckout } from "./route.controller";

export async function POST(request: NextRequest) {
  return initializeCheckout(request);
}
