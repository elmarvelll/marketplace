// src/app/api/cron/vendor-dispute-window-sweep/route.ts
//
// Runs hourly (see vercel.json) — spec §52/§56-57. Two idempotent jobs in
// one run: finalize orders past their 24h buyer dispute window, then
// release/process deliverer payout for handoffs that just became
// eligible. See services/marketplace/vendor-delivery/dispute-window-sweep.ts
// and .../payout/run-deliverer-payout-sweep.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runDisputeWindowSweep } from "@/services/marketplace/vendor-delivery/dispute-window-sweep";
import { runDelivererPayoutSweep } from "@/services/marketplace/vendor-delivery/payout/run-deliverer-payout-sweep";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const disputeWindow = await runDisputeWindowSweep();
  const payout = await runDelivererPayoutSweep();
  return NextResponse.json({ disputeWindow, payout });
}
