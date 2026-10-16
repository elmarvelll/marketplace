// src/app/api/cron/pickup-deadline-reminder/route.ts
//
// Runs hourly (see vercel.json). Emails deliverers whose pickup OTP is
// expiring within the next few hours and hasn't been confirmed yet. Thin
// route — see services/marketplace/delivery/send-pickup-deadline-reminders.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { sendPickupDeadlineReminders } from "@/services/marketplace/delivery/send-pickup-deadline-reminders";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return NextResponse.json(await sendPickupDeadlineReminders());
}
