// services/marketplace/delivery-roster/shared/roster-calendar.ts
//
// Calendar conventions every roster module shares, so weekday maths can't drift between the template, the date view
// and checkout. Dates are calendar days in the school timezone (SCHOOL_TIMEZONE, Africa/Lagos) stored as UTC midnight —
// the same convention as VendorDeliveryBooking.bookedFor — so a weekday is read with getUTCDay(), never server time.
// Weekdays are ISO numbers: 1 = Monday ... 7 = Sunday (RosterSlotDay.weekday, RosterAssignment.weekday).

import type { DeliveryOperation } from "@prisma/client";
import { badRequest } from "@/lib/service-error";
import { SCHOOL_TIMEZONE } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { MAX_SCHEDULE_CONFIG_DAYS, parseAndValidateDeliveryDate, todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";

export const OPERATIONS: readonly DeliveryOperation[] = ["MARKETPLACE", "VENDOR"];
export const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

// How far ahead roster changes are checked against existing deliveries. Vendor customers book up to
// MAX_ADVANCE_BOOKING_DAYS ahead and central deliveries are scheduled at most CENTRAL_SCHEDULING_HORIZON_DAYS out, so
// nothing can be booked beyond this.
export const IMPACT_HORIZON_DAYS = 60;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export function isoWeekday(date: Date): number {
  const js = date.getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

export function parseOperation(value: unknown): DeliveryOperation {
  if (typeof value === "string" && (OPERATIONS as readonly string[]).includes(value)) return value as DeliveryOperation;
  throw badRequest('operation must be "MARKETPLACE" or "VENDOR".');
}

export function parseWeekday(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7) return value;
  throw badRequest("weekday must be a whole number from 1 (Monday) to 7 (Sunday).");
}

// null = "no limit / use the level above". Anything else must be a whole number >= 0.
export function parseMaxDeliveries(value: unknown, field = "maxDeliveries"): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000) return value;
  throw badRequest(`${field} must be empty (no limit) or a whole number from 0 to 10000.`);
}

// An admin may inspect any date (including the past), but only change today or later, up to the same horizon vendors
// get for their own schedule.
export function parseRosterDate(value: unknown, { forWrite }: { forWrite: boolean }): Date {
  if (typeof value !== "string" || !value.trim()) throw badRequest("date is required.");
  if (forWrite) return parseAndValidateDeliveryDate(value, new Date(), MAX_SCHEDULE_CONFIG_DAYS);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw badRequest('date must be "YYYY-MM-DD".');
  const parsed = utcDate(value.trim());
  if (Number.isNaN(parsed.getTime()) || isoDate(parsed) !== value.trim()) throw badRequest("date is not a valid calendar date.");
  return parsed;
}

// "HH:MM" wall-clock time on a school-timezone calendar date, as the real instant. Uses the zone's actual offset on that
// day (Intl), so it stays right whatever timezone the server runs in.
export function schoolWallClockToInstant(date: Date, hhmm: string): Date {
  const [hour, minute] = hhmm.split(":").map(Number);
  const asIfUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(asIfUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const zoneAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(asIfUtc - (zoneAsUtc - asIfUtc));
}

// The next date (today included) that falls on each ISO weekday — the "upcoming occurrence" a weekly cell shows.
export function upcomingWeek(today: Date = todayInSchoolTimezone()): Map<number, Date> {
  const week = new Map<number, Date>();
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    week.set(isoWeekday(date), date);
  }
  return week;
}

export function formatSlotDate(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}
