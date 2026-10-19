// services/marketplace/vendor-delivery/handover/delivery-deadline.ts
//
// The server-authoritative deadline for confirming a Vendor delivery with the
// student's code: 24 hours after the booked slot ENDS (school time). If a
// failed attempt rescheduled the delivery (report-failed-attempt.ts sets
// retryDeliveryAt), the window runs from that retry time instead, so a
// legitimate second attempt isn't already out of time.
//
// Judged only against the server's own receive time — never a client clock —
// so an offline device can't extend it.

import { schoolTimeToInstant } from "@/services/marketplace/vendor-delivery/is-slot-bookable";

export const DELIVERY_CONFIRMATION_WINDOW_HOURS = 24;

export function slotEndsAt(bookedFor: Date, windowEnd: string): Date {
  return schoolTimeToInstant(bookedFor, windowEnd);
}

export function deliveryConfirmationDeadline(bookedFor: Date, windowEnd: string, retryAts: (Date | null | undefined)[] = []): Date {
  const from = [slotEndsAt(bookedFor, windowEnd), ...retryAts.filter((d): d is Date => Boolean(d))].reduce((a, b) => (b > a ? b : a));
  return new Date(from.getTime() + DELIVERY_CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000);
}
