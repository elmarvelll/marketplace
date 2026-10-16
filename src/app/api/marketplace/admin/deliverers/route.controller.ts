// src/app/api/marketplace/admin/deliverers/route.controller.ts
//
// Controller for GET /api/marketplace/admin/deliverers. See
// services/marketplace/deliverer/list-deliverer-applications.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listDelivererApplications } from "@/services/marketplace/deliverer/list-deliverer-applications";

export async function listDeliverers(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const deliverers = await listDelivererApplications();
    return NextResponse.json({ deliverers });
  });
}
