// src/app/api/cron/vendor-slot-briefing/route.ts
//
// Pre-slot Vendor delivery operation: auto-assign planned deliverers and brief
// admins and deliverers two hours before each slot. Call it every 5-10
// minutes with `Authorization: Bearer $CRON_SECRET` (an external scheduler
// such as cron-job.org — see README "Scheduled jobs"). Safe to call more
// often or from two schedulers: every notice is sent at most once. Only this
// app runs it (AkadVerse has no equivalent), so it ignores
// MARKETPLACE_SCHEDULED_JOBS. See services/marketplace/vendor-delivery/slot-briefing.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runSlotBriefings } from "@/services/marketplace/vendor-delivery/slot-briefing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request, { marketplaceOnly: true });
  if (authError) return authError;
  return NextResponse.json(await runSlotBriefings());
}
