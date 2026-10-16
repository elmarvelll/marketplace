// .../vendor/[id]/sides/[sideId]/route.controller.ts
//
// Controller for PATCH/DELETE .../sides/[sideId]. See
// services/marketplace/vendor/side/side.service.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { updateSide, deleteSide, type SideFormValues } from "@/services/marketplace/vendor/side/side.service";

export async function updateSideHandler(request: NextRequest, businessId: string, sideId: string): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<Partial<SideFormValues>>(request);
    const side = await updateSide(businessId, sideId, body);
    return NextResponse.json({ message: "Side updated.", side });
  });
}

export async function deleteSideHandler(businessId: string, sideId: string): Promise<NextResponse> {
  return runController(async () => {
    await deleteSide(businessId, sideId);
    return NextResponse.json({ message: "Side deleted." });
  });
}
