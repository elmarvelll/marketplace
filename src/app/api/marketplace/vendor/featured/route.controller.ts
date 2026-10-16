// src/app/api/marketplace/vendor/featured/route.controller.ts
//
// Controller for GET /api/marketplace/vendor/featured. See
// services/marketplace/vendor/get-featured-vendors.ts.

import { NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { getFeaturedVendors } from "@/services/marketplace/vendor/get-featured-vendors";

export async function listFeaturedVendors(): Promise<NextResponse> {
  return runController(async () => {
    // Checked here as well as by the route gate: only this re-reads the account, so a blocked or signed-out-everywhere
    // session is refused (the gate can only see that a token exists).
    await requireSession();
    const vendors = await getFeaturedVendors();
    return NextResponse.json({ vendors });
  });
}
