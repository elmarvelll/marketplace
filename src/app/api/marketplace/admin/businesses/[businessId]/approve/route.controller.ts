// .../admin/businesses/[businessId]/approve/route.controller.ts
//
// Controller for POST .../approve. See
// services/marketplace/admin/approve-business.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { approveBusiness } from "@/services/marketplace/admin/approve-business";

export async function approve(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    await approveBusiness(businessId, admin.user.id);
    return NextResponse.json({ message: "Business approved." });
  });
}
