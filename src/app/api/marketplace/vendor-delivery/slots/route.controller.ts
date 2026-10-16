// .../vendor-delivery/slots/route.controller.ts
//
// Controller for GET /api/marketplace/vendor-delivery/slots — the public
// (not admin-gated) list of active delivery slots plus today's roster
// fill, e.g. for the deliverer application's ranked preferred-availability
// picker (spec §16: applicants should see remaining positions per
// timeframe). "capacity"/"filled"/"available" here are the DELIVERER
// roster numbers (VendorDeliverySlot.delivererCapacity /
// DelivererRosterAssignment) — completely unrelated to any vendor's own
// order-fulfillment capacity, which is never exposed by this route. See
// docs/marketplace/decisions/vendor-independent-architecture.md.

import { NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { prisma } from "@/lib/prisma";

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function listActiveSlots(): Promise<NextResponse> {
  return runController(async () => {
    // Checked here as well as by the route gate: only this re-reads the account, so a blocked or signed-out-everywhere
    // session is refused (the gate can only see that a token exists).
    await requireSession();
    const slots = await prisma.vendorDeliverySlot.findMany({
      where: { active: true },
      select: { id: true, label: true, windowStart: true, windowEnd: true, delivererCapacity: true },
      orderBy: { windowStart: "asc" },
    });

    const today = todayDateOnly();
    const withAvailability = await Promise.all(
      slots.map(async (slot) => {
        const filled = await prisma.delivererRosterAssignment.count({
          where: { slotId: slot.id, date: today, status: { not: "CANCELLED" } },
        });
        return {
          id: slot.id,
          label: slot.label,
          windowStart: slot.windowStart,
          windowEnd: slot.windowEnd,
          capacity: slot.delivererCapacity,
          filled,
          available: Math.max(0, slot.delivererCapacity - filled),
        };
      })
    );

    return NextResponse.json({ slots: withAvailability });
  });
}
