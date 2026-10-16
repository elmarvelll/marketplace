// .../admin/vendor-delivery/slots/route.controller.ts
//
// Controller for GET/POST .../vendor-delivery/slots. See
// services/marketplace/admin/vendor-delivery/manage-vendor-slots.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listVendorSlots, createVendorSlot, type VendorSlotInput } from "@/services/marketplace/admin/vendor-delivery/manage-vendor-slots";

export async function listSlots(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const slots = await listVendorSlots();
    return NextResponse.json({ slots });
  });
}

export async function createSlot(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<VendorSlotInput>(request);
    const slot = await createVendorSlot(body, admin.user.id);
    return NextResponse.json({ slot }, { status: 201 });
  });
}
