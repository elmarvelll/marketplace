// .../vendor/[id]/route.controller.ts
//
// Controller for GET .../vendor/[id] — the public storefront. See
// services/marketplace/vendor/get-vendor-storefront.ts.

import { NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { getVendorStorefront } from "@/services/marketplace/vendor/get-vendor-storefront";

export async function getStorefront(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    // Checked here as well as by the route gate: only this re-reads the account, so a blocked or signed-out-everywhere
    // session is refused (the gate can only see that a token exists).
    await requireSession();
    const vendor = await getVendorStorefront(businessId);
    return NextResponse.json({ vendor });
  });
}
