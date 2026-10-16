// .../orders/[orderId]/ready/route.controller.ts
//
// Controller for POST .../orders/[orderId]/ready. See
// services/marketplace/order/mark-order-ready.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { markOrderReady as markOrderReadyAction } from "@/services/marketplace/order/mark-order-ready";

export async function markOrderReady(businessId: string, orderId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    await markOrderReadyAction(owned.businessId, orderId, owned.session.user.id);
    return NextResponse.json({ message: "Order marked ready for pickup." });
  });
}
