// src/app/api/marketplace/admin/deliveries/assign-planned/route.controller.ts
//
// Controller for POST /api/marketplace/admin/deliveries/assign-planned. See
// services/marketplace/delivery-roster/assign-planned.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { assignPlannedDeliveries } from "@/services/marketplace/delivery-roster/assign-planned";

export async function assignPlanned(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ orderItemIds?: unknown }>(request);
    const result = await assignPlannedDeliveries(body.orderItemIds, admin.user.id);
    return NextResponse.json(result, { status: 201 });
  });
}
