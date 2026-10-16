// .../admin/businesses/[businessId]/reject/route.controller.ts
//
// Controller for POST .../reject. See
// services/marketplace/admin/reject-business.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireAdmin } from "@/lib/admin";
import { rejectBusiness } from "@/services/marketplace/admin/reject-business";

export async function reject(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A reason is required.");
    await rejectBusiness(businessId, body.reason.trim(), admin.user.id);
    return NextResponse.json({ message: "Business rejected." });
  });
}
