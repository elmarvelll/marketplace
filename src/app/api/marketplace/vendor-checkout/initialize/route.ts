// .../vendor-checkout/initialize/route.ts
//
// POST -> books the Vendor cart's items + delivery slot as PENDING_PAYMENT
// Orders/booking, returns a Paystack reference to pay. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { initializeVendorCheckout } from "./route.controller";

export async function POST(request: NextRequest) {
  return initializeVendorCheckout(request);
}
