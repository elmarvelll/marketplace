// src/app/api/marketplace/checkout/cancel/route.ts
//
// POST { reference } -> the buyer closed the Paystack popup. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { cancelCheckout } from "./route.controller";

export async function POST(request: NextRequest) {
  return cancelCheckout(request);
}
