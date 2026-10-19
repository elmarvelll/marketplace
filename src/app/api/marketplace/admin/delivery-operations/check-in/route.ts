// .../admin/delivery-operations/check-in/route.ts
//
// POST { date, slotId, delivererId, note? } -> the deliverer reported at the
// meeting point: start their shift (IN_PROGRESS), which unlocks their pickups
// and deliveries. After the slot has ended this unlocks a missed shift and
// needs a note. Audited. See services/marketplace/vendor-delivery/handover/shift.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { checkInShift } from "@/services/marketplace/vendor-delivery/handover/shift";

export async function POST(request: NextRequest) {
  return runController(async () => {
    const admin = await requireAdmin();
    return NextResponse.json(await checkInShift(admin.user.id, await readJsonBody(request)));
  });
}
