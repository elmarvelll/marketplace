// .../admin/businesses/[businessId]/route.controller.ts
//
// Controller for GET .../businesses/[businessId]. See
// services/marketplace/admin/get-business-detail-for-admin.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { getBusinessDetailForAdmin } from "@/services/marketplace/admin/get-business-detail-for-admin";

export async function getBusiness(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const business = await getBusinessDetailForAdmin(businessId);
    return NextResponse.json({ business });
  });
}
