// .../vendor/[id]/sides/route.controller.ts
//
// Controller for GET/POST .../sides. See
// services/marketplace/vendor/side/side.service.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { listSidesForOwner, createSide, type SideFormValues } from "@/services/marketplace/vendor/side/side.service";

export async function listSides(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const sides = await listSidesForOwner(businessId);
    return NextResponse.json({ sides });
  });
}

export async function createSideHandler(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<Partial<SideFormValues>>(request);
    const side = await createSide(businessId, body);
    return NextResponse.json({ message: "Side created.", side }, { status: 201 });
  });
}
