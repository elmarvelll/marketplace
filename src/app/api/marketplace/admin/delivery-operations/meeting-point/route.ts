// .../admin/delivery-operations/meeting-point/route.ts
//
// GET -> where Vendor deliverers meet before a slot (attendance only — never a
// delivery prerequisite); PUT { location } ->
// change it (empty clears). One place for now — see shift.ts on why that
// will change when female deliverers join.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { getCheckInLocation, setCheckInLocation } from "@/services/marketplace/vendor-delivery/handover/shift";

export const dynamic = "force-dynamic";

export async function GET() {
  return runController(async () => {
    await requireAdmin();
    return NextResponse.json({ location: await getCheckInLocation() });
  });
}

export async function PUT(request: NextRequest) {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ location?: unknown }>(request);
    return NextResponse.json(await setCheckInLocation(admin.user.id, body.location ?? ""));
  });
}
