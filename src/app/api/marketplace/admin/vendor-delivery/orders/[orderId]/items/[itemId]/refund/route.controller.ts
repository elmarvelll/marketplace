// .../orders/[orderId]/items/[itemId]/refund/route.controller.ts
//
// Controller for POST .../refund. See
// services/marketplace/admin/vendor-delivery/refund-vendor-item.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { refundVendorItem } from "@/services/marketplace/admin/vendor-delivery/refund-vendor-item";

export async function refundItem(request: NextRequest, orderId: string, itemId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    const result = await refundVendorItem(orderId, itemId, body.reason, admin.user.id);
    return NextResponse.json({ message: "Item refunded.", ...result });
  });
}
