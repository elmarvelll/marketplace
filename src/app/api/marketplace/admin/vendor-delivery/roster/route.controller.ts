// .../admin/vendor-delivery/roster/route.controller.ts
//
// Controller for GET/POST .../vendor-delivery/roster?date=YYYY-MM-DD. See
// services/marketplace/admin/roster/manage-roster.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireAdmin } from "@/lib/admin";
import { listRosterForDate, assignDelivererToRoster } from "@/services/marketplace/admin/roster/manage-roster";

export async function getRoster(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const date = request.nextUrl.searchParams.get("date");
    if (!date) throw badRequest("date query param is required.");
    const roster = await listRosterForDate(date);
    return NextResponse.json({ roster });
  });
}

export async function postRosterAssignment(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ date?: string; slotId?: string; delivererId?: string }>(request);
    if (!body.date || !body.slotId || !body.delivererId) throw badRequest("date, slotId, and delivererId are required.");
    const assignment = await assignDelivererToRoster(body.date, body.slotId, body.delivererId, admin.user.id);
    return NextResponse.json({ assignment }, { status: 201 });
  });
}
