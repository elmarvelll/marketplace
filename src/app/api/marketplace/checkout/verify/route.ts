// src/app/api/marketplace/checkout/verify/route.ts
//
// POST { reference } -> client-triggered payment confirmation. Thin route
// — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { verifyCheckout } from "./route.controller";

export async function POST(request: NextRequest) {
  return verifyCheckout(request);
}
