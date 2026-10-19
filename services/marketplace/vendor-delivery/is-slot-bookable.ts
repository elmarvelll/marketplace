// services/marketplace/vendor-delivery/is-slot-bookable.ts
//
// THE single reusable function for "can this VendorDeliverySlot still be
// booked right now" — both the frontend slot picker (via the checkout
// summary response) and the backend booking transaction call this; the
// rule must never be re-implemented ad hoc anywhere else (spec §21).
//
// Timezone: nothing else in this codebase establishes a school/local
// timezone convention (confirmed — no existing TZ handling to match), and
// Vercel's serverless runtime runs in UTC regardless of where a request
// originates, so `new Date()` wall-clock math would silently use the
// wrong offset. SCHOOL_TIMEZONE is the one explicit choice made here
// (Africa/Lagos, WAT/UTC+1 — matches the @stu.cu.edu.ng student email
// domain's institution) and every slot-cutoff calculation goes through
// `nowInSchoolTimezone`/`slotWindowStartToday` below, never raw `Date`
// arithmetic against server-local time.

export const SCHOOL_TIMEZONE = "Africa/Lagos";

export interface BookableSlot {
  windowStart: string; // "HH:MM"
  bookingCutoffMins: number;
}

// "Now," expressed as the wall-clock date/time it actually is in
// SCHOOL_TIMEZONE — computed via Intl rather than assuming the server's
// own local time equals school time.
export function nowInSchoolTimezone(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // Constructed as a UTC instant carrying the school-timezone wall-clock
  // values — never re-interpreted as server-local, so subtracting minutes
  // from it stays correct regardless of where this code runs.
  return new Date(
    Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")), Number(get("hour")), Number(get("minute")), Number(get("second")))
  );
}

// The slot's windowStart ("HH:MM"), as a Date on `targetDate` (defaults to
// today) in SCHOOL_TIMEZONE — comparable directly against
// nowInSchoolTimezone()'s output since both are UTC instants carrying
// school wall-clock values.
export function slotWindowStartToday(windowStart: string, referenceNow: Date = new Date(), targetDate?: Date): Date {
  const base = targetDate ?? nowInSchoolTimezone(referenceNow);
  const [hour, minute] = windowStart.split(":").map(Number);
  const start = new Date(base);
  start.setUTCHours(hour, minute, 0, 0);
  return start;
}

// Every slot closes to NEW orders this long before its window starts
// (operations: deliverers are briefed and assigned two hours ahead — see
// services/marketplace/vendor-delivery/slot-briefing.ts). An admin may set a
// longer per-slot bookingCutoffMins; a shorter one is never honored.
export const MIN_ORDER_CUTOFF_MINS = 120;

export function effectiveCutoffMins(slot: Pick<BookableSlot, "bookingCutoffMins">): number {
  return Math.max(MIN_ORDER_CUTOFF_MINS, slot.bookingCutoffMins ?? 0);
}

// Minutes from `now` until the slot's window opens on `targetDate` (defaults
// to today), both measured as school wall-clock time — so a slot just after
// midnight tomorrow is correctly "soon" late tonight. Negative once started.
export function minutesUntilSlotStart(windowStart: string, now: Date = new Date(), targetDate?: Date): number {
  const schoolNow = nowInSchoolTimezone(now);
  const start = slotWindowStartToday(windowStart, now, targetDate ?? schoolNow);
  return (start.getTime() - schoolNow.getTime()) / 60000;
}

// True if a NEW order may still be placed now for this slot on `targetDate`
// (defaults to today). Strict: with exactly the cutoff remaining the slot is
// already closed (7-8 PM slot: 4:59 PM bookable, 5:00 PM not). Applies to
// creating orders only — a checkout already initialized before the cutoff
// may still be paid within its existing payment hold (confirm-payment never
// calls this).
export function isSlotBookable(slot: BookableSlot, now: Date = new Date(), targetDate?: Date): boolean {
  return minutesUntilSlotStart(slot.windowStart, now, targetDate) > effectiveCutoffMins(slot);
}

// The real instant (UTC) a school wall-clock time on `date` corresponds to —
// for scheduling and deadlines, which compare against `new Date()`.
export function schoolTimeToInstant(date: Date, hhmm: string): Date {
  const [hour, minute] = hhmm.split(":").map(Number);
  const wall = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0);
  // Africa/Lagos has a fixed offset (no DST), so the offset at `wall` is the offset now.
  const probe = new Date(wall);
  const offsetMs = nowInSchoolTimezone(probe).getTime() - Math.floor(probe.getTime() / 1000) * 1000;
  return new Date(wall - offsetMs);
}
