// src/app/api/marketplace/admin/events/route.controller.ts
//
// Controller for GET /api/marketplace/admin/events. See
// services/marketplace/admin/list-order-events.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listOrderEvents } from "@/services/marketplace/admin/list-order-events";

export async function listEvents(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await listOrderEvents(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
