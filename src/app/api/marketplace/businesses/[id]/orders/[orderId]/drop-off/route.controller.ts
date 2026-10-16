// .../orders/[orderId]/drop-off/route.controller.ts
//
// Controller for POST .../orders/[orderId]/drop-off — the seller's side of
// the Seller -> Coordinator handoff (step 1: request the handoff, get
// issued an OTP to show the coordinator). See
// services/marketplace/order/initiate-order-dropoff.ts. The coordinator's
// side (verifying that OTP) is a separate admin route — see
// src/app/api/marketplace/admin/dropoffs/[orderId]/confirm/route.controller.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { initiateOrderDropoff } from "@/services/marketplace/order/initiate-order-dropoff";

export async function confirmDropoff(businessId: string, orderId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    if (!owned) {
      return NextResponse.json({ error: "Business not found or not owned by the current user." }, { status: 404 });
    }
    const result = await initiateOrderDropoff(owned.businessId, orderId, owned.session.user.id);
    return NextResponse.json({ message: "Drop-off code issued — show it to the Delivery Coordinator.", ...result });
  });
}
