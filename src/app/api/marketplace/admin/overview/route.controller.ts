// src/app/api/marketplace/admin/overview/route.controller.ts
//
// Controller for GET /api/marketplace/admin/overview. See
// services/marketplace/admin/get-overview-stats.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { getOverviewStats } from "@/services/marketplace/admin/get-overview-stats";

export async function getOverview(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    return NextResponse.json(await getOverviewStats());
  });
}
