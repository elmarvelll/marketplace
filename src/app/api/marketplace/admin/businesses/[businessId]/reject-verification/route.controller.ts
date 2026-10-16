// .../admin/businesses/[businessId]/reject-verification/route.controller.ts
//
// Controller for POST .../reject-verification. See
// services/marketplace/admin/reject-verification-request.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireAdmin } from "@/lib/admin";
import { rejectVerificationRequest } from "@/services/marketplace/admin/reject-verification-request";

export async function rejectVerification(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A reason is required.");
    await rejectVerificationRequest(businessId, body.reason.trim(), admin.user.id);
    return NextResponse.json({ message: "Verification request rejected." });
  });
}
