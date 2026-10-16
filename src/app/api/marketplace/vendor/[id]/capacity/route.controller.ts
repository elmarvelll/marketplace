// .../vendor/[id]/capacity/route.controller.ts
//
// Controller for GET/PUT .../vendor/[id]/capacity — "Set Product
// Deliveries Per Time Range" (spec §3), now date-specific (spec §7). See
// services/marketplace/vendor/capacity/manage-vendor-capacity.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { clearVendorCapacityOverride, listVendorCapacity, upsertVendorCapacity } from "@/services/marketplace/vendor/capacity/manage-vendor-capacity";

export async function getCapacity(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const date = request.nextUrl.searchParams.get("date") ?? undefined;
    const { rows, date: resolvedDate } = await listVendorCapacity(businessId, date);
    return NextResponse.json({ capacity: rows, date: resolvedDate });
  });
}

export async function putCapacity(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<{ slotId?: string; capacity?: number; date?: string }>(request);
    if (!body.slotId) throw badRequest("slotId is required.");
    const row = await upsertVendorCapacity(businessId, body.slotId, Number(body.capacity), body.date?.trim() || undefined);
    return NextResponse.json({ capacity: row });
  });
}

// DELETE ?slotId=&date= -> drop one date's capacity override so that date
// uses the recurring default again.
export async function deleteCapacityOverride(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const slotId = request.nextUrl.searchParams.get("slotId")?.trim();
    const date = request.nextUrl.searchParams.get("date")?.trim();
    if (!slotId || !date) throw badRequest("slotId and date are required.");
    await clearVendorCapacityOverride(businessId, slotId, date);
    return NextResponse.json({ cleared: true });
  });
}
