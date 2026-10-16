// .../vendor-checkout/summary/route.ts
//
// GET -> the Vendor checkout page's preview (cart, fees, slot
// availability for an optional ?date= — defaults to today). Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getVendorCheckoutSummary } from "./route.controller";

export async function GET(request: NextRequest) {
  return getVendorCheckoutSummary(request);
}
