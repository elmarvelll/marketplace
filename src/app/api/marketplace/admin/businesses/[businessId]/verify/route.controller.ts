// .../admin/businesses/[businessId]/verify/route.controller.ts
//
// Controller for POST .../verify. See
// services/marketplace/admin/verify-business.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { verifyBusiness } from "@/services/marketplace/admin/verify-business";

export async function verify(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    await verifyBusiness(businessId, admin.user.id);
    return NextResponse.json({ message: "Business verified." });
  });
}
