// src/app/api/cron/checkout-reconcile/route.ts
//
// Releases (or finalizes, if they were actually paid) checkouts whose stock
// reservation has expired. Thin route — see
// services/marketplace/checkout/run-checkout-reconcile-sweep.ts. NOT in
// vercel.json (the project's plan only carries daily crons): the same sweep
// also runs opportunistically after checkout requests. Point any scheduler
// at this URL with `Authorization: Bearer $CRON_SECRET` to run it on a clock
// (every 10-15 minutes is plenty).

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runCheckoutReconcileSweep } from "@/services/marketplace/checkout/run-checkout-reconcile-sweep";
import { deliverEmails } from "@/services/marketplace/notifications/email-outbox";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const { emailIds, ...summary } = await runCheckoutReconcileSweep({ limit: 50 });
  await deliverEmails(emailIds);
  return NextResponse.json(summary);
}
