// src/app/api/cron/email-retry/route.ts
//
// Re-attempts outbox emails (paid-order, business-blocked) whose last send
// failed and whose backoff has elapsed. Thin route — see
// services/marketplace/notifications/email-outbox.ts. Same scheduling note as
// ../checkout-reconcile/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runEmailRetrySweep } from "@/services/marketplace/notifications/email-outbox";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return NextResponse.json(await runEmailRetrySweep({ limit: 50 }));
}
