// src/app/api/marketplace/admin/businesses/route.controller.ts
//
// Controller for GET /api/marketplace/admin/businesses. See
// services/marketplace/admin/list-businesses-for-admin.ts. Also serves
// the Verifications tab via ?filter=pending_verification.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listBusinessesForAdmin } from "@/services/marketplace/admin/list-businesses-for-admin";

export async function listBusinesses(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await listBusinessesForAdmin(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
