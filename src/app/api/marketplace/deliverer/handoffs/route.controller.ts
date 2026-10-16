// src/app/api/marketplace/deliverer/handoffs/route.controller.ts
//
// Controller for GET /api/marketplace/deliverer/handoffs. See
// services/marketplace/delivery/list-pending-handoffs.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireDelivererId } from "../shared/require-deliverer";
import { listPendingHandoffs } from "@/services/marketplace/delivery/list-pending-handoffs";

export async function listHandoffs(): Promise<NextResponse> {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const handoffs = await listPendingHandoffs(delivererId);
    return NextResponse.json({ handoffs });
  });
}
