// src/app/api/marketplace/businesses/[id]/report/route.controller.ts
//
// Controller for POST .../businesses/[id]/report — buyer-facing, not
// owner-scoped (any signed-in user can report any business). See
// services/marketplace/business/report-business.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { reportBusiness } from "@/services/marketplace/business/report-business";

export async function report(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A reason is required.");
    await reportBusiness(businessId, userId, body.reason.trim());
    return NextResponse.json({ message: "Report submitted." }, { status: 201 });
  });
}
