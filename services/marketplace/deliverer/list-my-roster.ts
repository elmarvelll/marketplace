// services/marketplace/deliverer/list-my-roster.ts
//
// The signed-in deliverer's own upcoming roster schedule (spec §18:
// "Deliverers should have access to their upcoming assigned schedule so
// they know date, timeframe, required arrival time..."). Called by
// src/app/api/marketplace/deliverer/roster/route.controller.ts.
//
// Resolved through the delivery roster (services/marketplace/delivery-roster/
// roster-resolution.ts), so it shows exactly what the admin calendar shows:
// recurring weekly slots for both operations (Marketplace and Vendor), plus
// date-only Vendor roster rows (DelivererRosterAssignment), minus any date an
// exception closed or staffed with someone else. Weekly occurrences have no
// row of their own: their id is synthetic and their status is SCHEDULED.

import type { DeliveryOperation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatArrivalTime, DELIVERER_ARRIVAL_LEAD_MINS } from "@/services/marketplace/vendor-delivery/deliverer-arrival";
import { todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { loadRosterWindow } from "@/services/marketplace/delivery-roster/roster-resolution";
import { DAY_MS, isoDate } from "@/services/marketplace/delivery-roster/shared/roster-calendar";

// How far ahead weekly occurrences are listed (date-only rows further out are still included).
const WEEKLY_LOOKAHEAD_DAYS = 14;

export async function listMyRoster(delivererId: string) {
  const today = todayInSchoolTimezone();

  const dated = await prisma.delivererRosterAssignment.findMany({
    where: { delivererId, date: { gte: today }, status: { not: "CANCELLED" } },
    select: { id: true, slotId: true, date: true, status: true, arrivedAt: true },
  });
  const furthest = dated.reduce((max, a) => Math.max(max, a.date.getTime()), today.getTime());
  const days = Math.max(WEEKLY_LOOKAHEAD_DAYS, Math.round((furthest - today.getTime()) / DAY_MS) + 1);
  const datedBy = new Map(dated.map((a) => [`${a.slotId}|${isoDate(a.date)}`, a]));

  const entries = [];
  for (const operation of ["VENDOR", "MARKETPLACE"] as DeliveryOperation[]) {
    const window = await loadRosterWindow(operation, today, days);
    for (const date of window.dates) {
      for (const slot of window.slots) {
        const occurrence = window.occurrence(slot.id, date);
        if (occurrence.closed || !occurrence.staff.includes(delivererId)) continue;
        // Weekly occurrences only for active slots; a date-only row always shows.
        const row = operation === "VENDOR" ? datedBy.get(`${slot.id}|${isoDate(date)}`) : undefined;
        if (!row && !slot.active) continue;
        entries.push({
          id: row?.id ?? `weekly:${operation}:${slot.id}:${isoDate(date)}`,
          operation,
          date: date.toISOString(),
          status: row?.status ?? "SCHEDULED",
          arrivedAt: row?.arrivedAt?.toISOString() ?? null,
          slotLabel: slot.label,
          windowStart: slot.windowStart,
          windowEnd: slot.windowEnd,
          requiredArrivalTime: formatArrivalTime(slot.windowStart),
          arrivalLeadMins: DELIVERER_ARRIVAL_LEAD_MINS,
        });
      }
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.windowStart.localeCompare(b.windowStart));
}
