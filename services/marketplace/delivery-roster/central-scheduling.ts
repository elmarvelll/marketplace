// services/marketplace/delivery-roster/central-scheduling.ts
//
// Gives a Business (central Marketplace delivery) order its slot occurrence at checkout. Business buyers never pick a
// slot — they get an estimated delivery day from the seller's delivery weekdays (estimated-delivery.service.ts), never
// sooner than MIN_LEAD_DAYS out. With central slots configured, that estimate becomes a real booking:
//
//   from the first allowed day (today + MIN_LEAD_DAYS + 1, school timezone), walk forward day by day, skipping days the
//   seller doesn't deliver on, and take the first slot (earliest window first) whose occurrence isn't closed and still
//   has room under its limit. A full slot is never over-filled — the order goes to the next slot, then the next day.
//
// Nothing found within CENTRAL_SCHEDULING_HORIZON_DAYS -> "full": checkout refuses with a clear message rather than
// exceeding capacity. No ACTIVE central slot at all -> null: the roster isn't in use for central deliveries yet, and
// checkout keeps the existing estimate exactly as before.
//
// Only checkout's call (inside its transaction, after lockRosterOperation) is authoritative; the summary page uses the
// same function without the lock purely to show what the buyer will most likely get.

import type { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Db } from "@/services/marketplace/order/shared/db";
import { MIN_LEAD_DAYS } from "@/services/marketplace/delivery/estimated-delivery.service";
import { todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { WEEKDAYS } from "@/services/marketplace/vendor/capacity/vendor-delivery-schedule";
import { addDays, schoolWallClockToInstant } from "./shared/roster-calendar";
import { loadRosterWindow, type ResolvedOccurrence } from "./roster-resolution";
import { loadOccurrenceUsage, usageKey, usedOf } from "./roster-capacity";
import type { RosterSlot } from "./roster-slots";

export const CENTRAL_SCHEDULING_HORIZON_DAYS = 28;

export interface CentralPlan {
  slot: RosterSlot;
  date: Date;
  occurrence: ResolvedOccurrence;
  windowStartAt: Date;
  windowEndAt: Date;
}

export async function findCentralSlot(businessId: string, db: Db = prisma, now: Date = new Date()): Promise<CentralPlan | "full" | null> {
  const start = addDays(todayInSchoolTimezone(now), MIN_LEAD_DAYS + 1);
  const end = addDays(start, CENTRAL_SCHEDULING_HORIZON_DAYS - 1);
  const [window, usage, days] = await Promise.all([
    loadRosterWindow("MARKETPLACE", start, CENTRAL_SCHEDULING_HORIZON_DAYS, db),
    loadOccurrenceUsage("MARKETPLACE", start, end, db, { now }),
    db.businessDeliveryDay.findMany({ where: { businessId }, select: { day: true } }),
  ]);
  const slots = window.slots.filter((s) => s.active);
  if (slots.length === 0) return null;

  // Same rule as calculateEstimatedDelivery: no configured days = every day.
  const deliveryDays = new Set<DayOfWeek>(days.map((d) => d.day));
  for (const date of window.dates) {
    if (deliveryDays.size > 0 && !deliveryDays.has(WEEKDAYS[date.getUTCDay()])) continue;
    for (const slot of slots) {
      const occurrence = window.occurrence(slot.id, date);
      if (occurrence.closed) continue;
      if (occurrence.limit !== null && usedOf(usage.get(usageKey(slot.id, date))) >= occurrence.limit) continue;
      return { slot, date, occurrence, windowStartAt: schoolWallClockToInstant(date, slot.windowStart), windowEndAt: schoolWallClockToInstant(date, slot.windowEnd) };
    }
  }
  return "full";
}

export function centralFullMessage(businessName: string): string {
  return `Central delivery for ${businessName} is fully booked for the next ${CENTRAL_SCHEDULING_HORIZON_DAYS} days — please try again later.`;
}
