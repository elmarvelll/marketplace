// .../admin/vendor-delivery/slots/[slotId]/route.controller.ts
//
// Controller for PATCH .../vendor-delivery/slots/[slotId]. See
// services/marketplace/admin/vendor-delivery/manage-vendor-slots.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { updateVendorSlot, type VendorSlotInput } from "@/services/marketplace/admin/vendor-delivery/manage-vendor-slots";

export async function updateSlot(request: NextRequest, slotId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<Partial<VendorSlotInput>>(request);
    const slot = await updateVendorSlot(slotId, body, admin.user.id);
    return NextResponse.json({ slot });
  });
}
