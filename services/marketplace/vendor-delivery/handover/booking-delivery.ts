// services/marketplace/vendor-delivery/handover/booking-delivery.ts
//
// Reporting that a Vendor delivery (one student, possibly several vendors)
// couldn't be completed. Acts only on the calling deliverer's own items of
// that booking, at any point while they're processing — there is no separate
// "start delivery" step. Confirming the delivery is submit-delivery-code.ts.
//
// A failed attempt reuses the existing per-item rule unchanged
// (report-failed-attempt.ts: first failure schedules a retry, second cancels
// and refunds).

import { badRequest, conflict } from "@/lib/service-error";
import { reportFailedAttempt } from "@/services/marketplace/delivery/report-failed-attempt";
import { VENDOR_OPEN_DELIVERY_STATUSES } from "@/services/marketplace/delivery/shared/complete-delivered-item";
import { loadDelivererBooking } from "./submit-delivery-code";

export async function reportBookingFailedAttempt(delivererId: string, bookingId: string, reason: string | undefined) {
  if (!reason?.trim()) throw badRequest("A reason is required.");
  const { mine } = await loadDelivererBooking(delivererId, bookingId);
  const open = mine.filter((m) => !m.orderCancelled && !m.item.cancelledAt && VENDOR_OPEN_DELIVERY_STATUSES.includes(m.item.deliveryItem!.status));
  if (open.length === 0) throw conflict("Only a delivery that's still being processed can be marked as a failed attempt.");
  for (const m of open) await reportFailedAttempt(delivererId, m.item.deliveryItem!.id, reason, VENDOR_OPEN_DELIVERY_STATUSES);
  return { reported: open.length };
}
