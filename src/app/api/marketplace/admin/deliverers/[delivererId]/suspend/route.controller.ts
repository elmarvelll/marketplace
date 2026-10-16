// .../admin/deliverers/[delivererId]/suspend/route.controller.ts
//
// Controller for POST .../suspend. See
// services/marketplace/deliverer/suspend-deliverer.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireAdmin } from "@/lib/admin";
import { suspendDeliverer as suspendDelivererAction } from "@/services/marketplace/deliverer/suspend-deliverer";

export async function suspendDeliverer(delivererId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A reason is required.");
    await suspendDelivererAction(delivererId, body.reason.trim());
    return NextResponse.json({ message: "Deliverer suspended." });
  });
}
