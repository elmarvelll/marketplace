// .../deliverer/manifest/route.ts
//
// GET -> the signed-in deliverer's Vendor delivery cards (manifest.ts): their
// own assigned bookings only, codes masked — from yesterday onwards, plus any
// older card still holding a delivery that's processing (not yet confirmed).

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
    const fromIso = addDays(today, -1).toISOString().slice(0, 10);
    const cards = recent.filter((c) => c.date >= fromIso || c.deliveries.some((d) => d.status === "PROCESSING_ORDER"));
    return NextResponse.json({ cards });
  });
}
