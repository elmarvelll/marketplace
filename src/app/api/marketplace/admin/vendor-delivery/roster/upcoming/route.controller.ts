// .../admin/vendor-delivery/roster/upcoming/route.controller.ts
//
// Controller for GET .../vendor-delivery/roster/upcoming. See
// services/marketplace/admin/roster/manage-roster.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listUpcomingRosterNeeds } from "@/services/marketplace/admin/roster/manage-roster";

export async function getUpcomingRosterNeeds(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const rows = await listUpcomingRosterNeeds();
    return NextResponse.json({ rows });
  });
}
