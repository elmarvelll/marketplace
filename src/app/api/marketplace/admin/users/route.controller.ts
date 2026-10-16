// src/app/api/marketplace/admin/users/route.controller.ts
//
// Controller for GET /api/marketplace/admin/users. See
// services/marketplace/admin/search-users.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { searchUsers } from "@/services/marketplace/admin/search-users";

export async function listUsers(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await searchUsers(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
