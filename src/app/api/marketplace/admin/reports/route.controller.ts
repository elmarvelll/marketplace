// src/app/api/marketplace/admin/reports/route.controller.ts
//
// Controller for GET /api/marketplace/admin/reports. See
// services/marketplace/admin/list-reports.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listReports } from "@/services/marketplace/admin/list-reports";

export async function listAllReports(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await listReports(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
