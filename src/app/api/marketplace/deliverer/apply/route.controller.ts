// src/app/api/marketplace/deliverer/apply/route.controller.ts
//
// Controller for POST /api/marketplace/deliverer/apply. See
// services/marketplace/deliverer/apply-for-deliverer.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { applyForDeliverer, type DelivererApplicationInput } from "@/services/marketplace/deliverer/apply-for-deliverer";

export async function apply(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<DelivererApplicationInput>(request);
    const deliverer = await applyForDeliverer(userId, body);
    return NextResponse.json({ message: "Application submitted.", deliverer }, { status: 201 });
  });
}
