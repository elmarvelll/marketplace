// .../vendor/[id]/schedule/route.controller.ts
//
// Controllers for a vendor's own delivery schedule (recurring weekdays +
// upcoming dates with capacity and usage). See
// services/marketplace/vendor/capacity/vendor-delivery-schedule.ts — every
// function there is owner-scoped (requireOwnedVendor), so a vendor can only
// ever read or change its own schedule.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { getVendorDeliverySchedule, setVendorDeliveryWeekdays } from "@/services/marketplace/vendor/capacity/vendor-delivery-schedule";

export async function getSchedule(businessId: string): Promise<NextResponse> {
  return runController(async () => NextResponse.json(await getVendorDeliverySchedule(businessId)));
}

export async function putWeekdays(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<{ weekdays?: unknown }>(request);
    const weekdays = await setVendorDeliveryWeekdays(businessId, body.weekdays);
    return NextResponse.json({ weekdays });
  });
}
