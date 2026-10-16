// .../orders/[orderId]/items/[itemId]/reject/route.controller.ts
//
// Controller for POST .../items/[itemId]/reject. See
// services/marketplace/order/reject-order-item.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { rejectOrderItem as rejectOrderItemAction } from "@/services/marketplace/order/reject-order-item";

export async function rejectOrderItem(businessId: string, orderId: string, itemId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A rejection reason is required.");
    await rejectOrderItemAction(owned.businessId, orderId, itemId, owned.session.user.id, body.reason.trim());
    return NextResponse.json({ message: "Item rejected." });
  });
}
