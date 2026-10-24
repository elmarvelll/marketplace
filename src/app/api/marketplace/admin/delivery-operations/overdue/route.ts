// .../admin/delivery-operations/overdue/route.ts
//
// GET -> every Vendor delivery whose student-code deadline passed without a
// valid confirmation and that hasn't been delivered or cancelled since, across
// all days. See services/marketplace/vendor-delivery/handover/overdue-confirmations.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listOpenOverdueConfirmations } from "@/services/marketplace/vendor-delivery/handover/overdue-confirmations";

export const dynamic = "force-dynamic";

export async function GET() {
  return runController(async () => {
    await requireAdmin();
    return NextResponse.json({ overdue: await listOpenOverdueConfirmations() });
  });
}
