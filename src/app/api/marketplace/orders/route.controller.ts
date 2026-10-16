// src/app/api/marketplace/orders/route.controller.ts
//
// Controller for GET /api/marketplace/orders. See
// services/marketplace/order/list-buyer-orders.ts.

import { NextResponse } from "next/server";
import { runController, requireSessionUserId } from "@/lib/controller-helpers";
import { listBuyerOrders } from "@/services/marketplace/order/list-buyer-orders";

export async function listOrders(): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const orders = await listBuyerOrders(userId);
    return NextResponse.json({ orders });
  });
}
