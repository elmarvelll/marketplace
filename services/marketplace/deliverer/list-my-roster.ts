// services/marketplace/deliverer/list-my-roster.ts
//
// The signed-in deliverer's own upcoming roster schedule (spec §18:
// "Deliverers should have access to their upcoming assigned schedule so
// they know date, timeframe, required arrival time..."). Called by
// src/app/api/marketplace/deliverer/roster/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { formatArrivalTime, DELIVERER_ARRIVAL_LEAD_MINS } from "@/services/marketplace/vendor-delivery/deliverer-arrival";

export async function listMyRoster(delivererId: string) {
  const today = new Date();
  const todayDateOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const assignments = await prisma.delivererRosterAssignment.findMany({
    where: { delivererId, date: { gte: todayDateOnly }, status: { not: "CANCELLED" } },
    orderBy: [{ date: "asc" }, { slot: { windowStart: "asc" } }],
    select: {
      id: true,
      date: true,
      status: true,
      arrivedAt: true,
      slot: { select: { id: true, label: true, windowStart: true, windowEnd: true } },
    },
  });

  return assignments.map((a) => ({
    id: a.id,
    date: a.date.toISOString(),
    status: a.status,
    arrivedAt: a.arrivedAt?.toISOString() ?? null,
    slotLabel: a.slot.label,
    windowStart: a.slot.windowStart,
    windowEnd: a.slot.windowEnd,
    requiredArrivalTime: formatArrivalTime(a.slot.windowStart),
    arrivalLeadMins: DELIVERER_ARRIVAL_LEAD_MINS,
  }));
}
