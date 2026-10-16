// src/app/api/marketplace/businesses/[id]/orders/route.controller.ts
//
// Controller for GET .../businesses/[id]/orders. See
// services/marketplace/order/list-seller-orders.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { listSellerOrders } from "@/services/marketplace/order/list-seller-orders";

export async function listOrders(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    const orders = await listSellerOrders(owned.businessId);
    return NextResponse.json({ orders });
  });
}
