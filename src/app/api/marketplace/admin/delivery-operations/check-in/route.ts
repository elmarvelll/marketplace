// .../admin/delivery-operations/check-in/route.ts
//
// POST { date, slotId, delivererId, note? } -> record that the deliverer
// reported at the meeting point (attendance only — it unlocks nothing; the
// deliverer never needs it to process or deliver). After the slot has ended
// it is recorded as late. Audited. See services/marketplace/vendor-delivery/handover/shift.ts.

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
