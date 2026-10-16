// .../vendor-checkout/summary/route.controller.ts
//
// Controller for GET /api/marketplace/vendor-checkout/summary?date=. See
// services/marketplace/vendor-checkout/calculate-vendor-checkout-summary.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, requireSessionUserId } from "@/lib/controller-helpers";
import { calculateVendorCheckoutSummary } from "@/services/marketplace/vendor-checkout/calculate-vendor-checkout-summary";

export async function getVendorCheckoutSummary(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const date = request.nextUrl.searchParams.get("date") ?? undefined;
    return NextResponse.json(await calculateVendorCheckoutSummary(userId, date));
  });
}
