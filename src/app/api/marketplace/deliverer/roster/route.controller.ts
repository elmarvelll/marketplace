// .../deliverer/roster/route.controller.ts
//
// Controller for GET .../deliverer/roster — the signed-in deliverer's own
// upcoming schedule. See services/marketplace/deliverer/list-my-roster.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireDelivererId } from "../shared/require-deliverer";
import { listMyRoster } from "@/services/marketplace/deliverer/list-my-roster";

export async function getMyRoster(): Promise<NextResponse> {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const roster = await listMyRoster(delivererId);
    return NextResponse.json({ roster });
  });
}
