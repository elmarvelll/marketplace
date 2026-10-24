// services/marketplace/vendor-delivery/handover/delivery-deadline.ts
//
// The server-authoritative deadline for confirming a Vendor delivery with the
// student's code: the END of the school-local calendar day the delivery is due
// (SCHOOL_TIMEZONE, Africa/Lagos) — i.e. midnight starting the next school day.
// Not a rolling 24 hours, and not midnight UTC.
//
// The due day is the booked date. If a failed attempt rescheduled the delivery
// (report-failed-attempt.ts sets retryDeliveryAt), it is the school day of the
// latest retry instead, so a legitimate second attempt isn't already out of time.
//
// The boundary is exclusive: a confirmation received strictly before the
// deadline is on time; at or after it, it is late (isPastDeadline). Judged only
// against the server's own receive time — never a client clock — so an offline
// device can't move it.

import { schoolTimeToInstant } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";

export function slotEndsAt(bookedFor: Date, windowEnd: string): Date {
  return schoolTimeToInstant(bookedFor, windowEnd);
}

// The school calendar day (a UTC-midnight Date, like VendorDeliveryBooking.bookedFor) the delivery is due.
export function deliveryDueDay(bookedFor: Date, retryAts: (Date | null | undefined)[] = []): Date {
  const days = [bookedFor, ...retryAts.filter((d): d is Date => Boolean(d)).map((d) => todayInSchoolTimezone(d))];
  return days.reduce((a, b) => (b > a ? b : a));
}

export function deliveryConfirmationDeadline(bookedFor: Date, retryAts: (Date | null | undefined)[] = []): Date {
  const due = deliveryDueDay(bookedFor, retryAts);
  const nextDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate() + 1));
  return schoolTimeToInstant(nextDay, "00:00");
}

export function isPastDeadline(deadlineAt: Date, at: Date): boolean {
  return at.getTime() >= deadlineAt.getTime();
}
