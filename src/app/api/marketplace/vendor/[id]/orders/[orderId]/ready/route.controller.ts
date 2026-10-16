// .../vendor/[id]/orders/[orderId]/ready/route.controller.ts
//
// Controller for POST .../ready — vendor marks an order ready for pickup
// (no accept/reject step exists for vendor — spec §6). See
// services/marketplace/vendor/order/mark-vendor-order-ready.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { markVendorOrderReady } from "@/services/marketplace/vendor/order/mark-vendor-order-ready";

export async function markReady(businessId: string, orderId: string): Promise<NextResponse> {
  return runController(async () => {
    await markVendorOrderReady(businessId, orderId);
    return NextResponse.json({ message: "Order marked ready for pickup." });
  });
}
