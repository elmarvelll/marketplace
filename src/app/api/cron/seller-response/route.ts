// src/app/api/cron/seller-response/route.ts
//
// Runs every 5 hours (see vercel.json). Auto-rejects orders still
// PENDING_SELLER more than 24 hours after creation. Thin route — see
// services/marketplace/order/run-seller-response-sweep.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runSellerResponseSweep } from "@/services/marketplace/order/run-seller-response-sweep";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return NextResponse.json(await runSellerResponseSweep());
}
