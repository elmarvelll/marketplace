// src/app/api/marketplace/admin/deliverers/assignments/route.controller.ts
//
// Controller for GET .../admin/deliverers/assignments. See
// services/marketplace/delivery/list-deliverer-assignments.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listDelivererAssignments as listDelivererAssignmentsAction } from "@/services/marketplace/delivery/list-deliverer-assignments";

export async function listDelivererAssignments(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const deliverers = await listDelivererAssignmentsAction();
    return NextResponse.json({ deliverers });
  });
}
