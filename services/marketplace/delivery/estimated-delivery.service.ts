// services/marketplace/delivery/estimated-delivery.service.ts
//
// The single reusable "estimated delivery" calculation — every screen that
// needs to show a delivery date/window (product profile, checkout page,
// per-order-item display) calls this, so the logic never drifts between
// them. See docs/marketplace/data/delivery-days.md and
// docs/marketplace/data/delivery-windows.md.
//
// Terminology: always "estimated," never "expected" — see
// docs/marketplace/decisions/estimated-not-expected-delivery.md.

import { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// The single delivery window every estimated delivery uses today (5:00 PM
// - 8:30 PM). Not yet configurable per business — see
// docs/marketplace/todo/phase-04-delivery.md for making this
// seller-configurable later; kept as a named constant so there's one place
// to change when that happens.
export const DELIVERY_WINDOW = { startHour: 17, startMinute: 0, endHour: 20, endMinute: 30 } as const;

// A delivery day this close (or closer) to "now" doesn't give the seller
// enough lead time to prepare the order and drop it off by the 15-hour
// drop-off deadline (services/marketplace/delivery/dropoff-deadline.service.ts) — so the calculation
// skips any day within this many days of `from` and picks the next
// appropriate one instead. Business rule, not a display preference.
export const MIN_LEAD_DAYS = 4;

// getDay() order: 0=Sunday..6=Saturday.
const DAY_BY_JS_INDEX: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const ALL_DAYS: DayOfWeek[] = [...DAY_BY_JS_INDEX];

export interface EstimatedDelivery {
  estimatedDeliveryAt: Date;
  deliveryWindowStart: Date;
  deliveryWindowEnd: Date;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function buildResult(deliveryDate: Date): EstimatedDelivery {
  const day = new Date(deliveryDate);
  day.setHours(0, 0, 0, 0);

  const deliveryWindowStart = new Date(day);
  deliveryWindowStart.setHours(DELIVERY_WINDOW.startHour, DELIVERY_WINDOW.startMinute, 0, 0);

  const deliveryWindowEnd = new Date(day);
  deliveryWindowEnd.setHours(DELIVERY_WINDOW.endHour, DELIVERY_WINDOW.endMinute, 0, 0);

  // The "estimated delivery date/time" shown to buyers is the start of the
  // window — the window itself (start-end) is shown alongside it for the
  // full "Wednesday, Sept 2, 5:00 PM - 8:30 PM" picture.
  return { estimatedDeliveryAt: deliveryWindowStart, deliveryWindowStart, deliveryWindowEnd };
}

/**
 * Pure calculation: given a business's configured delivery days (as
 * day-of-week values) and a reference "now," returns the next appropriate
 * estimated delivery date/time + window.
 *
 * Business rules enforced here:
 *  - Only ever picks a day whose day-of-week is in `deliveryDays`.
 *  - Never picks a day that is MIN_LEAD_DAYS (4) or fewer days from `from`
 *    — always the *next best alternative* after that cutoff, even if that
 *    means waiting almost a full week for a business with only one
 *    configured delivery day.
 *  - If a business hasn't configured any delivery days yet (nullable today
 *    — see docs/marketplace/data/delivery-days.md), falls back to treating
 *    every day as available, so checkout still produces a usable estimate
 *    rather than throwing.
 *
 * Pure and synchronous on purpose — no DB access — so it's trivially
 * reusable from anywhere (including from getEstimatedDeliveryForBusiness
 * below, and directly in tests) without needing to mock Prisma.
 */
export function calculateEstimatedDelivery(deliveryDays: DayOfWeek[], from: Date = new Date()): EstimatedDelivery {
  const candidates = deliveryDays.length > 0 ? deliveryDays : ALL_DAYS;

  // Walk forward one day at a time, starting just past the minimum lead
  // time, until we hit a day-of-week the business actually delivers on.
  // At most 7 iterations past the lead-time cutoff will always find a
  // match once `candidates` is non-empty (every day-of-week repeats
  // weekly), so the +8 bound below is just a defensive cap, never hit in
  // practice.
  for (let offset = MIN_LEAD_DAYS + 1; offset <= MIN_LEAD_DAYS + 8; offset++) {
    const candidateDate = addDays(from, offset);
    const dayOfWeek = DAY_BY_JS_INDEX[candidateDate.getDay()];
    if (candidates.includes(dayOfWeek)) {
      return buildResult(candidateDate);
    }
  }

  // Unreachable given the loop bound above, but keeps this function total.
  return buildResult(addDays(from, MIN_LEAD_DAYS + 1));
}

/**
 * DB-backed convenience wrapper: loads a business's configured delivery
 * days and runs calculateEstimatedDelivery. This is what the checkout flow,
 * product profile, and any other server-side caller should use — see
 * src/app/api/marketplace/products/[id]/route.ts and
 * services/marketplace/checkout/{get-checkout-summary,create-orders-for-checkout,confirm-payment-by-reference}.ts for the two call sites today.
 */
export async function getEstimatedDeliveryForBusiness(businessId: string, from: Date = new Date()): Promise<EstimatedDelivery> {
  const rows = await prisma.businessDeliveryDay.findMany({
    where: { businessId },
    select: { day: true },
  });
  return calculateEstimatedDelivery(rows.map((row) => row.day), from);
}

// Formats an EstimatedDelivery for display, e.g.
// "Wednesday, September 2 · 5:00 PM - 8:30 PM" — shared so every screen
// (product profile, checkout, order tracking) renders this identically.
export function formatEstimatedDelivery({ estimatedDeliveryAt, deliveryWindowStart, deliveryWindowEnd }: EstimatedDelivery): {
  date: string;
  window: string;
} {
  const date = estimatedDeliveryAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const timeFormat: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  const window = `${deliveryWindowStart.toLocaleTimeString("en-US", timeFormat)} - ${deliveryWindowEnd.toLocaleTimeString("en-US", timeFormat)}`;
  return { date, window };
}
