// src/app/api/marketplace/admin/delivery-roster/route.controller.ts
//
// Controllers for Admin -> Delivery Roster. Every handler is admin-only (requireAdmin, checked against the live
// User.isAdmin) and every value from the browser is re-validated by the services in
// services/marketplace/delivery-roster/ — operation, slot, weekday, date, deliverer, limit.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { parseOperation } from "@/services/marketplace/delivery-roster/shared/roster-calendar";
import { getRosterDate, getRosterWeek } from "@/services/marketplace/delivery-roster/roster-views";
import { applyRosterChange, parseRosterChange, previewRosterChange } from "@/services/marketplace/delivery-roster/roster-changes";
import { createCentralSlot, listRosterSlots, updateCentralSlot } from "@/services/marketplace/delivery-roster/roster-slots";
import { setPlannedDeliverer } from "@/services/marketplace/delivery-roster/delivery-plans";

export async function getWeek(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const roster = await getRosterWeek(parseOperation(request.nextUrl.searchParams.get("operation")));
    return NextResponse.json({ roster });
  });
}

export async function getDate(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const params = request.nextUrl.searchParams;
    const day = await getRosterDate(parseOperation(params.get("operation")), params.get("date"));
    return NextResponse.json({ day });
  });
}

interface ChangeBody {
  operation?: unknown;
  change?: Record<string, unknown>;
  planResolution?: unknown;
  acknowledgeOverCapacity?: unknown;
}

export async function previewChange(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const body = await readJsonBody<ChangeBody>(request);
    const impact = await previewRosterChange(parseOperation(body.operation), parseRosterChange(body.change ?? {}));
    return NextResponse.json({ impact });
  });
}

export async function postChange(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<ChangeBody>(request);
    const planResolution = body.planResolution === "replan" || body.planResolution === "keep" ? body.planResolution : undefined;
    const result = await applyRosterChange(parseOperation(body.operation), parseRosterChange(body.change ?? {}), admin.user.id, {
      planResolution,
      acknowledgeOverCapacity: body.acknowledgeOverCapacity === true,
    });
    return NextResponse.json({ message: "Roster saved.", ...result });
  });
}

export async function getSlots(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const slots = await listRosterSlots(parseOperation(request.nextUrl.searchParams.get("operation")), undefined, { includeInactive: true });
    return NextResponse.json({ slots });
  });
}

// Central (Marketplace) slots only — Vendor timeframes stay managed on Admin -> Vendor Delivery.
export async function postCentralSlot(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const slot = await createCentralSlot(await readJsonBody(request), admin.user.id);
    return NextResponse.json({ slot }, { status: 201 });
  });
}

export async function patchCentralSlot(request: NextRequest, slotId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const slot = await updateCentralSlot(slotId, await readJsonBody(request), admin.user.id);
    return NextResponse.json({ slot });
  });
}

export async function putPlan(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ scheduledDeliveryId?: unknown; bookingId?: unknown; delivererId?: unknown }>(request);
    const plan = await setPlannedDeliverer(body, admin.user.id);
    return NextResponse.json({ plan });
  });
}
