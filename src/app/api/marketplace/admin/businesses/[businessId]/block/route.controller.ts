// .../admin/businesses/[businessId]/block/route.controller.ts
//
// Controller for POST .../block. See
// services/marketplace/admin/block-business.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireAdmin } from "@/lib/admin";
import { blockBusiness } from "@/services/marketplace/admin/block-business";

export async function block(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A reason is required.");
    await blockBusiness(businessId, body.reason.trim(), admin.user.id);
    return NextResponse.json({ message: "Business blocked." });
  });
}
