// .../deliverer/manifest/route.ts
//
// GET -> the signed-in deliverer's Vendor delivery cards (manifest.ts): from
// yesterday onwards, their own assigned bookings only, codes masked — plus
// their shift record (scheduled / in progress / delivered / missed) for the
// last 30 days.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireDelivererId } from "../shared/require-deliverer";
import { buildVendorManifests } from "@/services/marketplace/vendor-delivery/handover/manifest";
import { assignDueDeliveries } from "@/services/marketplace/vendor-delivery/slot-briefing";
import { todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { addDays } from "@/services/marketplace/delivery-roster/shared/roster-calendar";

export const dynamic = "force-dynamic";

const HISTORY_DAYS = 30;

export async function GET() {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    // Everything due within two hours is assigned before the cards are built,
    // even if the scheduled briefing job hasn't run yet.
    await assignDueDeliveries();
    const today = todayInSchoolTimezone();
    const recent = await buildVendorManifests({ delivererId, fromDate: addDays(today, -HISTORY_DAYS) });
    // Last 30 days of shifts by state — a missed shift stays on the record.
    const shiftCounts = { SCHEDULED: 0, IN_PROGRESS: 0, DELIVERED: 0, MISSED: 0 };
    for (const card of recent) shiftCounts[card.shift.state] += 1;
    const fromIso = addDays(today, -1).toISOString().slice(0, 10);
    // Cards: yesterday onwards, plus anything older still in progress.
    const cards = recent.filter((c) => c.date >= fromIso || c.shift.state === "IN_PROGRESS");
    return NextResponse.json({ cards, shiftCounts, historyDays: HISTORY_DAYS });
  });
}
