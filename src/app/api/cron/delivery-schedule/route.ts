// src/app/api/cron/delivery-schedule/route.ts
//
// Runs at 12:00 AM (see vercel.json). Emails each approved deliverer their
// day's confirmed deliveries. Thin route — see
// services/marketplace/delivery/send-daily-schedule-emails.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { sendDailyScheduleEmails } from "@/services/marketplace/delivery/send-daily-schedule-emails";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return NextResponse.json(await sendDailyScheduleEmails());
}
