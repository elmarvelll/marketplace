// .../orders/[orderId]/reject/route.controller.ts
//
// Controller for POST .../orders/[orderId]/reject. See
// services/marketplace/order/reject-order.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { rejectOrder as rejectOrderAction } from "@/services/marketplace/order/reject-order";

export async function rejectOrder(businessId: string, orderId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A rejection reason is required.");
    await rejectOrderAction(owned.businessId, orderId, owned.session.user.id, body.reason.trim());
    return NextResponse.json({ message: "Order rejected." });
  });
}
