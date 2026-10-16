// src/app/api/marketplace/admin/disputes/route.controller.ts
//
// Controller for GET /api/marketplace/admin/disputes. See
// services/marketplace/admin/list-disputed-orders.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listDisputedOrders } from "@/services/marketplace/admin/list-disputed-orders";

export async function listDisputes(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await listDisputedOrders(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
