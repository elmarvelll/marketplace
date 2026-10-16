// src/app/api/cron/delivery-retry/route.ts
//
// Returns failed-then-24h-elapsed items to the drop-off pool. Recommended
// hourly (see docs/marketplace/systems/cron-system.md). Thin route — see
// services/marketplace/delivery/run-delivery-retry-sweep.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runDeliveryRetrySweep } from "@/services/marketplace/delivery/run-delivery-retry-sweep";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return NextResponse.json(await runDeliveryRetrySweep());
}
