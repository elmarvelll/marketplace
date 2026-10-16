// services/marketplace/vendor-delivery/validate-delivery-date.ts
//
// THE single reusable function for "is this customer-submitted delivery
// date acceptable" — both the checkout summary preview and the booking
// transaction call this; never re-implemented ad hoc anywhere else (same
// convention as is-slot-bookable.ts's own header comment). Backend is
// always authoritative here — a client-supplied date is never trusted on
// its own (spec §6/§28).

import { badRequest } from "@/lib/service-error";
import { nowInSchoolTimezone } from "./is-slot-bookable";

// Vendor deliveries are same-day/near-term food orders — this caps how far
// ahead a customer can pick a date, matching the weekly-recurring nature of
// VendorTimeframeCapacity's default capacity (a vendor plans a rolling
// week ahead, not months). A documented decision, not an arbitrary gap.
export const MAX_ADVANCE_BOOKING_DAYS = 7;

// THE canonical "today, as a calendar Date in SCHOOL_TIMEZONE" — every
// other module that needs "today" for vendor-delivery purposes imports
// this rather than recomputing it (calculate-vendor-checkout-summary.ts
// re-exports it for its existing callers).
export function todayInSchoolTimezone(now: Date = new Date()): Date {
  const school = nowInSchoolTimezone(now);
  return new Date(Date.UTC(school.getUTCFullYear(), school.getUTCMonth(), school.getUTCDate()));
}

// Parses "YYYY-MM-DD" and validates it against the delivery-date business
// rules: must be a real calendar date, not before today (school
// timezone), and not more than MAX_ADVANCE_BOOKING_DAYS ahead. Returns the
// normalized UTC calendar Date (midnight, matching
// VendorDeliveryBooking.bookedFor's existing convention). Throws a
// service-error `badRequest` on any violation — callers don't need to
// re-validate.
// How far ahead a VENDOR may configure its own schedule (close a date, add
// a custom date, set a date's capacity). Longer than the customer booking
// window above on purpose: a vendor plans closures weeks ahead, even though
// customers can only book MAX_ADVANCE_BOOKING_DAYS out.
export const MAX_SCHEDULE_CONFIG_DAYS = 90;

export function parseAndValidateDeliveryDate(
  dateStr: string | undefined | null,
  now: Date = new Date(),
  maxDaysAhead: number = MAX_ADVANCE_BOOKING_DAYS
): Date {
  const trimmed = dateStr?.trim();
  if (!trimmed) {
    // No date supplied — default to today, same as the pre-date-selection
    // behavior, so existing callers that don't pass a date keep working.
    return todayInSchoolTimezone(now);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) throw badRequest('date must be "YYYY-MM-DD".');

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Reject "2026-02-30"-style overflow (Date normally rolls it forward) by
  // checking the components round-trip exactly.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw badRequest("date is not a valid calendar date.");
  }

  const today = todayInSchoolTimezone(now);
  if (parsed.getTime() < today.getTime()) {
    throw badRequest("Delivery date cannot be in the past.");
  }

  const maxDate = new Date(today);
  maxDate.setUTCDate(maxDate.getUTCDate() + maxDaysAhead);
  if (parsed.getTime() > maxDate.getTime()) {
    throw badRequest(`Delivery date cannot be more than ${maxDaysAhead} days from now.`);
  }

  return parsed;
}
