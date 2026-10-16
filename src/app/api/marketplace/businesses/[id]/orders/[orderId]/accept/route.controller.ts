// .../orders/[orderId]/accept/route.controller.ts
//
// Controller for POST .../orders/[orderId]/accept. See
// services/marketplace/order/accept-order.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { acceptOrder as acceptOrderAction } from "@/services/marketplace/order/accept-order";

export async function acceptOrder(businessId: string, orderId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    await acceptOrderAction(owned.businessId, orderId, owned.session.user.id);
    return NextResponse.json({ message: "Order accepted." });
  });
}
