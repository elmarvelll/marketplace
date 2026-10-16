// .../vendor/[id]/pause/route.controller.ts
//
// Controller for POST .../pause and DELETE .../pause (unpause). See
// services/marketplace/vendor/pause-vendor.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { pauseVendor, unpauseVendor } from "@/services/marketplace/vendor/pause-vendor";

export async function pauseVendorHandler(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<{ reason?: string }>(request).catch(() => ({}) as { reason?: string });
    const vendor = await pauseVendor(businessId, body.reason);
    return NextResponse.json({ message: "Vendor paused.", vendor });
  });
}

export async function unpauseVendorHandler(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const vendor = await unpauseVendor(businessId);
    return NextResponse.json({ message: "Vendor unpaused.", vendor });
  });
}
