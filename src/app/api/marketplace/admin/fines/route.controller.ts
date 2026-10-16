// src/app/api/marketplace/admin/fines/route.controller.ts
//
// Controller for GET /api/marketplace/admin/fines. See
// services/marketplace/admin/list-fines.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listFines } from "@/services/marketplace/admin/list-fines";

export async function listAllFines(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await listFines(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
