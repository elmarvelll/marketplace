// services/marketplace/vendor-delivery/handover/booking-delivery.ts
//
// Per-booking deliverer actions for a Vendor delivery (one student, possibly
// several vendors): set off towards the student, or report that the attempt
// failed. Both act only on the calling deliverer's own items of that booking.
// Confirming the delivery is submit-delivery-code.ts.
//
// Starting is idempotent (only PICKED_UP items move). A failed attempt reuses
// the existing per-item rule unchanged (report-failed-attempt.ts: first
// failure schedules a retry, second cancels and refunds).

import { prisma } from "@/lib/prisma";
import { badRequest, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { reportFailedAttempt } from "@/services/marketplace/delivery/report-failed-attempt";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { loadDelivererBooking } from "./submit-delivery-code";

export async function startBookingDelivery(delivererId: string, bookingId: string) {
  const { booking, mine } = await loadDelivererBooking(delivererId, bookingId);
  const pickedUp = mine.filter((m) => !m.orderCancelled && !m.item.cancelledAt && m.item.deliveryItem!.status === "PICKED_UP");
  if (pickedUp.length === 0) {
    if (mine.some((m) => m.item.deliveryItem!.status === "OUT_FOR_DELIVERY")) return { started: 0 };
    throw conflict("Confirm pickup at the vendor before starting this delivery.");
  }

  await prisma.$transaction(async (tx) => {
    for (const m of pickedUp) {
      const moved = await tx.deliveryItem.updateMany({ where: { id: m.item.deliveryItem!.id, status: "PICKED_UP" }, data: { status: "OUT_FOR_DELIVERY" } });
      if (moved.count === 0) continue;
      await tx.orderItem.update({ where: { id: m.item.id }, data: { deliveryStatus: "OUT_FOR_DELIVERY" } });
      await recordOrderEvent(tx, { orderId: m.orderId, orderItemId: m.item.id, type: "OUT_FOR_DELIVERY", actorType: "deliverer", actorId: delivererId });
    }
  });

  await createNotification({
    recipientId: booking.userId,
    type: "ORDER_OUT_FOR_DELIVERY",
    title: "Your order is on its way",
    message: "Your deliverer is on the way. Have your delivery code ready (it's in My Orders) and give it only once you've received your order.",
    targetUrl: "/orders",
  });
  return { started: pickedUp.length };
}

export async function reportBookingFailedAttempt(delivererId: string, bookingId: string, reason: string | undefined) {
  if (!reason?.trim()) throw badRequest("A reason is required.");
  const { mine } = await loadDelivererBooking(delivererId, bookingId);
  const outForDelivery = mine.filter((m) => m.item.deliveryItem!.status === "OUT_FOR_DELIVERY");
  if (outForDelivery.length === 0) throw conflict("Only a delivery that's on its way can be marked as a failed attempt.");
  for (const m of outForDelivery) await reportFailedAttempt(delivererId, m.item.deliveryItem!.id, reason);
  return { reported: outForDelivery.length };
}
