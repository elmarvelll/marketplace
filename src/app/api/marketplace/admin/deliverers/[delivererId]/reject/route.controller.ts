// .../admin/deliverers/[delivererId]/reject/route.controller.ts
//
// Controller for POST .../reject. See
// services/marketplace/deliverer/reject-deliverer-application.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireAdmin } from "@/lib/admin";
import { rejectDelivererApplication } from "@/services/marketplace/deliverer/reject-deliverer-application";

export async function rejectDeliverer(delivererId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A reason is required.");
    await rejectDelivererApplication(delivererId, body.reason.trim());
    return NextResponse.json({ message: "Application rejected." });
  });
}
