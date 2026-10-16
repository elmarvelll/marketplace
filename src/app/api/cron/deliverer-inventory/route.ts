// src/app/api/cron/deliverer-inventory/route.ts
//
// Runs at 12:00 AM (see vercel.json). Reports ready/picked-up DeliveryItem
// counts per business as a diagnostic. Thin route — see
// services/marketplace/delivery/get-inventory-snapshot.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { getInventorySnapshot } from "@/services/marketplace/delivery/get-inventory-snapshot";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return NextResponse.json({ readyInventory: await getInventorySnapshot() });
}
