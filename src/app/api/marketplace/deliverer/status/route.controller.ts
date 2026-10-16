// src/app/api/marketplace/deliverer/status/route.controller.ts
//
// Controller for GET /api/marketplace/deliverer/status. See
// services/marketplace/deliverer/get-deliverer-state.ts.

import { NextResponse } from "next/server";
import { runController, requireSessionUserId } from "@/lib/controller-helpers";
import { getDelivererState } from "@/services/marketplace/deliverer/get-deliverer-state";

export async function getStatus(): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const state = await getDelivererState(userId);
    return NextResponse.json({ state });
  });
}
