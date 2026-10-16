// src/app/api/marketplace/admin/dropoffs/route.controller.ts
//
// Controller for GET .../admin/dropoffs. See
// services/marketplace/delivery/list-pending-dropoffs.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listPendingDropoffs as listPendingDropoffsAction } from "@/services/marketplace/delivery/list-pending-dropoffs";

export async function listPendingDropoffs(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const dropoffs = await listPendingDropoffsAction();
    return NextResponse.json({ dropoffs });
  });
}
