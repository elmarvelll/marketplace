// src/app/api/cron/seller-payout/route.ts
//
// Runs every 5 hours (see vercel.json). Processes delivered items eligible
// for payout, plus a bounded retry pass. Thin route — see
// services/marketplace/payout/run-payout-sweep.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runPayoutSweep } from "@/services/marketplace/payout/run-payout-sweep";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return NextResponse.json(await runPayoutSweep());
}
