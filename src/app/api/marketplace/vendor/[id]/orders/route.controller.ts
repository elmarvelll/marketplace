// .../vendor/[id]/orders/route.controller.ts
//
// Controller for GET .../vendor/[id]/orders. See
// services/marketplace/vendor/order/list-vendor-orders.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { listVendorOrders } from "@/services/marketplace/vendor/order/list-vendor-orders";

export async function getOrders(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const result = await listVendorOrders(businessId);
    return NextResponse.json(result);
  });
}
