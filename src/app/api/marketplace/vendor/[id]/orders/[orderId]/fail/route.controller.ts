// .../vendor/[id]/orders/[orderId]/fail/route.controller.ts
//
// Controller for POST .../fail — vendor's "X — couldn't fulfill" control
// (spec §11). See services/marketplace/vendor/order/mark-vendor-order-failed.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { markVendorOrderFailed } from "@/services/marketplace/vendor/order/mark-vendor-order-failed";

export async function markFailed(request: NextRequest, businessId: string, orderId: string): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<{ reason?: string }>(request);
    await markVendorOrderFailed(businessId, orderId, body.reason);
    return NextResponse.json({ message: "Order marked as failed and refunded." });
  });
}
