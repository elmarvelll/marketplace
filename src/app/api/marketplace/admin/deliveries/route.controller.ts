// src/app/api/marketplace/admin/deliveries/route.controller.ts
//
// Controller for POST /api/marketplace/admin/deliveries. See
// services/marketplace/delivery/assign-delivery.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { assignDelivery as assignDeliveryAction } from "@/services/marketplace/delivery/assign-delivery";

export async function assignDelivery(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ delivererId?: string; orderItemIds?: string[] }>(request);
    const result = await assignDeliveryAction(body.delivererId, body.orderItemIds, admin.user.id);
    return NextResponse.json({ message: "Assigned.", ...result }, { status: 201 });
  });
}
