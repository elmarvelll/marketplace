// src/app/api/marketplace/checkout/summary/route.controller.ts
//
// Controller for GET /api/marketplace/checkout/summary. See
// services/marketplace/checkout/get-checkout-summary.ts.

import { NextResponse } from "next/server";
import { runController, requireSessionUserId } from "@/lib/controller-helpers";
import { getCheckoutSummary } from "@/services/marketplace/checkout/get-checkout-summary";

export async function getSummary(): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    return NextResponse.json(await getCheckoutSummary(userId));
  });
}
