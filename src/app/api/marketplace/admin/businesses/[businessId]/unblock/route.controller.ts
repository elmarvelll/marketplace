// .../admin/businesses/[businessId]/unblock/route.controller.ts
//
// Controller for POST .../unblock. See
// services/marketplace/admin/unblock-business.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { unblockBusiness } from "@/services/marketplace/admin/unblock-business";

export async function unblock(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    await unblockBusiness(businessId, admin.user.id);
    return NextResponse.json({ message: "Business unblocked." });
  });
}
