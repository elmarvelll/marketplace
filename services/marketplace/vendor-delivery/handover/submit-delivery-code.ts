// services/marketplace/vendor-delivery/handover/submit-delivery-code.ts
//
// A deliverer submits the six digits the student gave them, for one Vendor
// delivery booking — straight away when online, or later from the app's
// offline queue (src/app/deliverer/_components/offline-code-queue.ts). The
// server is the only judge:
//
//   - only the deliverer the booking's items are actually assigned to, only
//     for a CONFIRMED (paid) booking, only for items already picked up;
//   - the full code is checked against the booking-bound HMAC in constant
//     time; the mask the deliverer sees is never accepted on its own;
//   - wrong codes count towards MAX_DELIVERY_CODE_ATTEMPTS, after which the
//     code locks until an admin reissues it;
//   - the 24-hour deadline (delivery-deadline.ts) is judged on the server's
//     receive time. A correct code received too late completes nothing: it is
//     recorded as LATE_REVIEW for an admin (admin-operations.ts);
//   - idempotent per submissionId (the client's key): a replay returns the
//     stored outcome and changes nothing. Items already delivered are never
//     re-completed (complete-delivered-item.ts is conditional).
//
// The submitted code is never stored or logged — only whether it matched.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound, tooManyRequests } from "@/lib/service-error";
import { MAX_DELIVERY_CODE_ATTEMPTS, deliveryCodeMatches, normalizeDeliveryCode } from "@/lib/delivery-code";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { completeDeliveredItem } from "@/services/marketplace/delivery/shared/complete-delivered-item";
import { createNotification, notifyAdmins } from "@/services/marketplace/notifications/notification.service";
import { deliveryConfirmationDeadline } from "./delivery-deadline";
import { ensureHandoverCode } from "./handover-code";
import { requireShiftCheckIn } from "./shift";
import type { DeliveryCodeSubmission } from "@prisma/client";

export type SubmitOutcome =
  | { outcome: "VERIFIED"; deliveredItems: number; alreadyDelivered: boolean }
  | { outcome: "REJECTED"; reason: "mismatch" | "locked"; attemptsLeft: number }
  | { outcome: "LATE_REVIEW"; deadlineAt: string };

const SUBMISSION_ID = /^[A-Za-z0-9_-]{8,100}$/;
// Per-deliverer brake across all bookings, on top of each code's own lock.
const MAX_REJECTED_PER_WINDOW = 10;
const REJECTED_WINDOW_MS = 15 * 60 * 1000;
const IN_FLIGHT = ["PICKED_UP", "OUT_FOR_DELIVERY"] as const;

function fromStored(row: DeliveryCodeSubmission, failedAttempts: number): SubmitOutcome {
  if (row.outcome === "VERIFIED") return { outcome: "VERIFIED", deliveredItems: 0, alreadyDelivered: true };
  if (row.outcome === "LATE_REVIEW") return { outcome: "LATE_REVIEW", deadlineAt: row.deadlineAt.toISOString() };
  return { outcome: "REJECTED", reason: row.reason === "locked" ? "locked" : "mismatch", attemptsLeft: Math.max(0, MAX_DELIVERY_CODE_ATTEMPTS - failedAttempts) };
}

// The booking's items this deliverer holds, with what's needed to judge a
// submission. Refuses unless the deliverer's shift for it was checked in.
export async function loadDelivererBooking(delivererId: string, bookingId: string) {
  const booking = await prisma.vendorDeliveryBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      userId: true,
      slotId: true,
      bookedFor: true,
      slot: { select: { windowEnd: true, label: true } },
      orders: {
        select: {
          id: true,
          status: true,
          cancelledAt: true,
          business: { select: { name: true } },
          items: {
            select: {
              id: true,
              cancelledAt: true,
              retryDeliveryAt: true,
              deliveryItem: { select: { id: true, status: true, delivery: { select: { deliverymanId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!booking) throw notFound("Delivery not found.");
  const mine = booking.orders.flatMap((order) =>
    order.items
      .filter((item) => item.deliveryItem?.delivery.deliverymanId === delivererId)
      .map((item) => ({ orderId: order.id, orderCancelled: order.status === "CANCELLED" || Boolean(order.cancelledAt), item }))
  );
  if (mine.length === 0) throw notFound("This delivery isn't assigned to you.");
  if (booking.status !== "CONFIRMED") throw conflict("This delivery isn't a confirmed, paid booking.");
  // Nothing happens on a shift an admin hasn't started at the meeting point (shift.ts).
  await requireShiftCheckIn(delivererId, booking.slotId, booking.bookedFor);
  return { booking, mine };
}

export async function submitDeliveryCode(
  delivererId: string,
  bookingId: string,
  input: { code?: unknown; submissionId?: unknown; clientRecordedAt?: unknown }
): Promise<SubmitOutcome> {
  const submissionId = typeof input.submissionId === "string" ? input.submissionId.trim() : "";
  if (!SUBMISSION_ID.test(submissionId)) throw badRequest("submissionId is required.");
  const code = normalizeDeliveryCode(input.code);
  if (!code) throw badRequest("Enter all six digits of the student's code.");
  const clientRecordedAt = typeof input.clientRecordedAt === "string" && !Number.isNaN(Date.parse(input.clientRecordedAt)) ? new Date(input.clientRecordedAt) : null;

  const replay = await prisma.deliveryCodeSubmission.findUnique({ where: { submissionId } });
  if (replay) {
    if (replay.bookingId !== bookingId || replay.delivererId !== delivererId) throw conflict("This submission id was already used for a different delivery.");
    const codeRow = await prisma.deliveryHandoverCode.findUnique({ where: { bookingId }, select: { failedAttempts: true } });
    return fromStored(replay, codeRow?.failedAttempts ?? 0);
  }

  const recentRejected = await prisma.deliveryCodeSubmission.count({
    where: { delivererId, outcome: "REJECTED", receivedAt: { gt: new Date(Date.now() - REJECTED_WINDOW_MS) } },
  });
  if (recentRejected >= MAX_REJECTED_PER_WINDOW) throw tooManyRequests("Too many wrong codes. Wait a few minutes, then try again.");

  const { booking, mine } = await loadDelivererBooking(delivererId, bookingId);
  const active = mine.filter((m) => !m.orderCancelled && !m.item.cancelledAt);
  const inFlight = active.filter((m) => (IN_FLIGHT as readonly string[]).includes(m.item.deliveryItem!.status));
  if (inFlight.length === 0) {
    if (active.length > 0 && active.every((m) => m.item.deliveryItem!.status === "DELIVERED")) return { outcome: "VERIFIED", deliveredItems: 0, alreadyDelivered: true };
    throw conflict(active.length === 0 ? "This delivery was cancelled." : "Confirm pickup at the vendor before delivering.");
  }

  await ensureHandoverCode(bookingId, { notify: false });
  const codeRow = await prisma.deliveryHandoverCode.findUnique({ where: { bookingId } });
  if (!codeRow) throw conflict("This delivery has no code yet — ask an admin to issue one.");

  const now = new Date();
  const deadlineAt = deliveryConfirmationDeadline(booking.bookedFor, booking.slot.windowEnd, active.map((m) => m.item.retryDeliveryAt));
  const locked = codeRow.failedAttempts >= MAX_DELIVERY_CODE_ATTEMPTS;
  const matched = !locked && deliveryCodeMatches(bookingId, code, codeRow.codeHash);
  const base = { submissionId, bookingId, delivererId, deadlineAt, clientRecordedAt, receivedAt: now, codeMatched: matched };
  const orderIds = Array.from(new Set(inFlight.map((m) => m.orderId)));

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<SubmitOutcome> => {
        if (!matched) {
          const after = locked
            ? codeRow
            : await tx.deliveryHandoverCode.update({ where: { id: codeRow.id }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true } });
          await tx.deliveryCodeSubmission.create({ data: { ...base, outcome: "REJECTED", reason: locked ? "locked" : "mismatch" } });
          for (const orderId of orderIds) {
            await recordOrderEvent(tx, { orderId, type: "BUYER_OTP_VERIFICATION_ATTEMPTED", actorType: "deliverer", actorId: delivererId, metadata: { success: false, locked } });
          }
          return { outcome: "REJECTED", reason: locked ? "locked" : "mismatch", attemptsLeft: Math.max(0, MAX_DELIVERY_CODE_ATTEMPTS - after.failedAttempts) };
        }
        if (now > deadlineAt) {
          await tx.deliveryCodeSubmission.create({ data: { ...base, outcome: "LATE_REVIEW", reason: "received_after_deadline" } });
          return { outcome: "LATE_REVIEW", deadlineAt: deadlineAt.toISOString() };
        }
        let delivered = 0;
        for (const m of inFlight) {
          if (await completeDeliveredItem(tx, { deliveryItemId: m.item.deliveryItem!.id, orderItemId: m.item.id, orderId: m.orderId }, { delivererId, now })) delivered += 1;
        }
        await tx.deliveryCodeSubmission.create({ data: { ...base, outcome: "VERIFIED" } });
        await markCodeVerifiedIfDone(tx, bookingId, now);
        return { outcome: "VERIFIED", deliveredItems: delivered, alreadyDelivered: delivered === 0 };
      },
      { timeout: 15000 }
    );

    if (result.outcome === "VERIFIED" && result.deliveredItems > 0) {
      await createNotification({ recipientId: booking.userId, type: "ORDER_DELIVERED", title: "Order delivered", message: "Your Vendor Market order has been delivered.", targetUrl: "/orders" });
    }
    if (result.outcome === "LATE_REVIEW") {
      await notifyAdmins({
        type: "VENDOR_DELIVERY_LATE_CODE",
        title: "Late delivery confirmation needs review",
        message: `A deliverer confirmed a ${booking.slot.label} delivery after its 24-hour deadline. Review it in Delivery operations.`,
        targetUrl: `/admin/delivery-operations?date=${booking.bookedFor.toISOString().slice(0, 10)}`,
      });
    }
    return result;
  } catch (err) {
    // Two copies of the same queued submission racing: the other one won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const stored = await prisma.deliveryCodeSubmission.findUnique({ where: { submissionId } });
      if (stored) return fromStored(stored, (await prisma.deliveryHandoverCode.findUnique({ where: { bookingId } }))?.failedAttempts ?? 0);
    }
    throw err;
  }
}

// The code is spent once every active item of the booking (whoever carries
// it) is delivered; until then another deliverer holding part of the same
// booking can still use it.
export async function markCodeVerifiedIfDone(tx: Prisma.TransactionClient, bookingId: string, now: Date) {
  const remaining = await tx.orderItem.count({
    where: {
      order: { vendorDeliveryBookingId: bookingId, status: { not: "CANCELLED" } },
      cancelledAt: null,
      OR: [{ deliveryStatus: null }, { deliveryStatus: { not: "DELIVERED" } }],
    },
  });
  if (remaining === 0) await tx.deliveryHandoverCode.updateMany({ where: { bookingId, verifiedAt: null }, data: { verifiedAt: now } });
}
