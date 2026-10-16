// services/marketplace/vendor/capacity/vendor-delivery-schedule.ts
//
// WHICH DATES a School Vendor delivers on — the layer above per-timeframe
// capacity (manage-vendor-capacity.ts / resolve-vendor-capacity.ts):
//
//   recurring rule  — the vendor's BusinessDeliveryDay rows (weekdays). No
//                     rows = delivers every day, which is how every vendor
//                     behaved before this existed, so nothing changes for a
//                     vendor that never opens this screen.
//   date override   — VendorDeliveryDateOverride: close one specific date,
//                     or open an extra one, without touching the weekly rule.
//
// Dates are calendar dates in the school timezone (Africa/Lagos), stored as
// UTC midnight — the same convention as VendorDeliveryBooking.bookedFor — so
// "which weekday is it" is read with getUTCDay(), never server-local time.
//
// Existing orders are never moved or cancelled by a schedule change: closing
// a date (or cutting capacity below what's already booked) only stops NEW
// bookings; the vendor still sees and fulfils what was already paid for, and
// the dashboard flags the date as over capacity.
//
// Every write is owner-scoped through requireOwnedVendor.

import type { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/service-error";
import type { Db } from "@/services/marketplace/order/shared/db";
import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";
import { MAX_ADVANCE_BOOKING_DAYS, MAX_SCHEDULE_CONFIG_DAYS, parseAndValidateDeliveryDate, todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { ORDER_PAYMENT_STATUS } from "@/services/marketplace/order/shared/paid-order";
import { liveReservationCutoff } from "@/services/marketplace/checkout/shared/checkout-payment-config";

export const WEEKDAYS: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export function weekdayOf(date: Date): DayOfWeek {
  return WEEKDAYS[date.getUTCDay()];
}

export type DateAvailabilitySource = "every_day" | "recurring" | "override";

// The one rule, as a pure function, shared by the single-date check below
// and the batched window loader — so they can't disagree.
export function decideDateAvailability(recurring: ReadonlySet<DayOfWeek>, override: { available: boolean } | undefined, date: Date): { available: boolean; source: DateAvailabilitySource } {
  if (override) return { available: override.available, source: "override" };
  if (recurring.size === 0) return { available: true, source: "every_day" };
  return { available: recurring.has(weekdayOf(date)), source: "recurring" };
}

export async function isVendorDeliveryDate(businessId: string, date: Date, db: Db = prisma): Promise<boolean> {
  const override = await db.vendorDeliveryDateOverride.findUnique({ where: { businessId_date: { businessId, date } }, select: { available: true } });
  if (override) return override.available;
  const days = await db.businessDeliveryDay.findMany({ where: { businessId }, select: { day: true } });
  return decideDateAvailability(new Set(days.map((d) => d.day)), undefined, date).available;
}

export interface ScheduleSlotDay {
  slotId: string;
  slotLabel: string;
  capacity: number;
  // Paid orders, and unpaid checkouts still inside their reservation window.
  paid: number;
  reserved: number;
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  weekday: DayOfWeek;
  available: boolean;
  source: DateAvailabilitySource;
  note: string | null;
  // True when the date has its own per-timeframe capacity override.
  hasCapacityOverride: boolean;
  slots: ScheduleSlotDay[];
  // Already-booked orders exceed what the date now allows (date closed or
  // capacity reduced after they were placed) — they are kept, not moved.
  overCapacity: boolean;
}

// Batched availability/capacity/usage for several vendors over a date
// window — a fixed handful of queries however many dates/slots/vendors are
// involved (the per-date resolver would be one round trip per cell). Used
// for DISPLAY only (vendor dashboard, checkout date picker); the booking
// transaction always re-checks with resolveVendorCapacity +
// countVendorBookingsForSlot inside its own transaction.
export async function loadVendorScheduleWindow(businessIds: string[], from: Date, days: number, now: Date = new Date()) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const to = dates[dates.length - 1];
  const [slots, weekdayRows, dateOverrides, defaults, capacityOverrides, orders] = await Promise.all([
    prisma.vendorDeliverySlot.findMany({ where: { active: true }, orderBy: { windowStart: "asc" } }),
    prisma.businessDeliveryDay.findMany({ where: { businessId: { in: businessIds } }, select: { businessId: true, day: true } }),
    prisma.vendorDeliveryDateOverride.findMany({ where: { businessId: { in: businessIds }, date: { gte: from, lte: to } } }),
    prisma.vendorTimeframeCapacity.findMany({ where: { businessId: { in: businessIds } } }),
    prisma.vendorTimeframeCapacityOverride.findMany({ where: { businessId: { in: businessIds }, date: { gte: from, lte: to } } }),
    prisma.order.findMany({
      where: {
        businessId: { in: businessIds },
        vendorDeliveryBooking: { bookedFor: { gte: from, lte: to }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
        OR: [{ paymentStatus: ORDER_PAYMENT_STATUS.PAID }, { paymentStatus: ORDER_PAYMENT_STATUS.PENDING, createdAt: { gt: liveReservationCutoff(now) } }],
      },
      select: { businessId: true, paymentStatus: true, vendorDeliveryBooking: { select: { slotId: true, bookedFor: true } } },
    }),
  ]);

  const key = (...parts: string[]) => parts.join("|");
  const recurring = new Map<string, Set<DayOfWeek>>();
  for (const row of weekdayRows) recurring.set(row.businessId, (recurring.get(row.businessId) ?? new Set()).add(row.day));
  const overrideByDate = new Map(dateOverrides.map((o) => [key(o.businessId, isoDate(o.date)), o]));
  const defaultCap = new Map(defaults.map((c) => [key(c.businessId, c.slotId), c.capacity]));
  const overrideCap = new Map(capacityOverrides.map((c) => [key(c.businessId, c.slotId, isoDate(c.date)), c.capacity]));
  const usage = new Map<string, { paid: number; reserved: number }>();
  for (const order of orders) {
    const booking = order.vendorDeliveryBooking!;
    const k = key(order.businessId, booking.slotId, isoDate(booking.bookedFor));
    const u = usage.get(k) ?? { paid: 0, reserved: 0 };
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) u.paid += 1;
    else u.reserved += 1;
    usage.set(k, u);
  }

  function day(businessId: string, date: Date): ScheduleDay {
    const iso = isoDate(date);
    const override = overrideByDate.get(key(businessId, iso));
    const { available, source } = decideDateAvailability(recurring.get(businessId) ?? new Set(), override, date);
    let hasCapacityOverride = false;
    const slotDays = slots.map((slot) => {
      const dateCap = overrideCap.get(key(businessId, slot.id, iso));
      if (dateCap !== undefined) hasCapacityOverride = true;
      const configured = dateCap ?? defaultCap.get(key(businessId, slot.id)) ?? 0;
      const u = usage.get(key(businessId, slot.id, iso)) ?? { paid: 0, reserved: 0 };
      return { slotId: slot.id, slotLabel: slot.label, capacity: available ? configured : 0, paid: u.paid, reserved: u.reserved };
    });
    return {
      date: iso,
      weekday: weekdayOf(date),
      available,
      source,
      note: override?.note ?? null,
      hasCapacityOverride,
      slots: slotDays,
      overCapacity: slotDays.some((s) => s.paid + s.reserved > s.capacity),
    };
  }

  return { dates, slots, day, weekdaysOf: (businessId: string) => Array.from(recurring.get(businessId) ?? []) };
}

// The vendor's own schedule screen: the weekly rule, the next
// `MAX_ADVANCE_BOOKING_DAYS + 1` bookable dates with their capacity and what
// is consuming it, and every upcoming date override.
export async function getVendorDeliverySchedule(businessId: string) {
  await requireOwnedVendor(businessId);
  const today = todayInSchoolTimezone();
  const window = await loadVendorScheduleWindow([businessId], today, MAX_ADVANCE_BOOKING_DAYS + 1);
  const overrides = await prisma.vendorDeliveryDateOverride.findMany({
    where: { businessId, date: { gte: today } },
    orderBy: { date: "asc" },
    select: { date: true, available: true, note: true },
  });
  return {
    weekdays: WEEKDAYS.filter((d) => window.weekdaysOf(businessId).includes(d)),
    upcoming: window.dates.map((date) => window.day(businessId, date)),
    overrides: overrides.map((o) => ({ date: isoDate(o.date), available: o.available, note: o.note })),
    maxConfigDays: MAX_SCHEDULE_CONFIG_DAYS,
  };
}

// Replaces the recurring rule. An empty list means "every day". Only ever
// affects which FUTURE dates accept new bookings.
export async function setVendorDeliveryWeekdays(businessId: string, days: unknown): Promise<DayOfWeek[]> {
  await requireOwnedVendor(businessId);
  if (!Array.isArray(days) || days.some((d) => typeof d !== "string" || !WEEKDAYS.includes(d as DayOfWeek))) {
    throw badRequest("weekdays must be a list of weekday names (e.g. MONDAY).");
  }
  const unique = Array.from(new Set(days as DayOfWeek[]));
  await prisma.$transaction(async (tx) => {
    await tx.businessDeliveryDay.deleteMany({ where: { businessId } });
    if (unique.length > 0) await tx.businessDeliveryDay.createMany({ data: unique.map((day) => ({ businessId, day })) });
  });
  return WEEKDAYS.filter((d) => unique.includes(d));
}

export async function setVendorDateAvailability(businessId: string, dateStr: string | undefined, available: unknown, note?: unknown) {
  await requireOwnedVendor(businessId);
  if (!dateStr?.trim()) throw badRequest("date is required.");
  if (typeof available !== "boolean") throw badRequest("available must be true or false.");
  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
  const date = parseAndValidateDeliveryDate(dateStr, new Date(), MAX_SCHEDULE_CONFIG_DAYS);
  const row = await prisma.vendorDeliveryDateOverride.upsert({
    where: { businessId_date: { businessId, date } },
    update: { available, note: cleanNote },
    create: { businessId, date, available, note: cleanNote },
  });
  return { date: isoDate(row.date), available: row.available, note: row.note };
}

// Removes a date's override so it follows the weekly rule again.
export async function clearVendorDateAvailability(businessId: string, dateStr: string | undefined) {
  await requireOwnedVendor(businessId);
  if (!dateStr?.trim()) throw badRequest("date is required.");
  const date = parseAndValidateDeliveryDate(dateStr, new Date(), MAX_SCHEDULE_CONFIG_DAYS);
  await prisma.vendorDeliveryDateOverride.deleteMany({ where: { businessId, date } });
}
