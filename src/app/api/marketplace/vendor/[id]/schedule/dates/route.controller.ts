// .../vendor/[id]/schedule/dates/route.controller.ts
//
// Controllers for one date's availability override — close a specific date
// or open an extra one, without touching the weekly rule. See
// services/marketplace/vendor/capacity/vendor-delivery-schedule.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { clearVendorDateAvailability, setVendorDateAvailability } from "@/services/marketplace/vendor/capacity/vendor-delivery-schedule";

export async function putDateOverride(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<{ date?: string; available?: unknown; note?: unknown }>(request);
    const override = await setVendorDateAvailability(businessId, body.date, body.available, body.note);
    return NextResponse.json({ override });
  });
}

export async function deleteDateOverride(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    await clearVendorDateAvailability(businessId, request.nextUrl.searchParams.get("date") ?? undefined);
    return NextResponse.json({ cleared: true });
  });
}
