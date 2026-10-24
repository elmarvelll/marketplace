// services/marketplace/vendor-delivery/handover/submit-delivery-code.ts
//
// THE way a Vendor delivery is completed: the six digits the student gives on
// receiving their order, checked by the server. A Vendor delivery is
// "processing" from assignment until then — there is no vendor pickup code,
// no online pickup step and no admin check-in in between.
//
// Two entry points, one rule:
//   - submitDeliveryCode: the assigned deliverer, straight away when online,
//     or later from the app's offline queue
//     (src/app/deliverer/_components/offline-code-queue.ts);
//   - adminSubmitDeliveryCode: the exception path — the deliverer couldn't
//     submit it, told an admin the student's code, and the admin enters it
//     (with a required reason). The same code check, never a bypass; recorded
//     as ADMIN_FALLBACK with the admin's id, and audited.
//
// The server is the only judge:
//   - only for a CONFIRMED (paid) booking, only the items assigned to that
//     deliverer, only while they're still processing;
//   - the full code is checked against the booking-bound HMAC in constant
//     time; the mask the deliverer sees is never accepted on its own;
//   - wrong codes count towards MAX_DELIVERY_CODE_ATTEMPTS, after which the
//     code locks until an admin reissues it;
//   - the deadline (end of the delivery day, school time —
//     delivery-deadline.ts) is judged on the server's receive time. A correct
//     code received at or after it still completes the delivery, recorded as
//     late (and the booking's overdue flag, if raised, is resolved, not
//     erased). A client timestamp is kept for audit only — a phone that says
//     "entered before the deadline" doesn't make a late arrival on time; the
//     admin sees both times;
//   - idempotent per submissionId (the client's key): a replay returns the
//     stored outcome and changes nothing. Items already delivered are never
//     re-completed (complete-delivered-item.ts is conditional), so
//     notifications, escrow and payouts happen once.
//
// The submitted code is never stored or logged — only whether it matched.

import { Prisma } from "@prisma/client";
import type { DeliveryCodeSubmission, DeliveryConfirmationMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound, tooManyRequests } from "@/lib/service-error";
import { MAX_DELIVERY_CODE_ATTEMPTS, deliveryCodeMatches, normalizeDeliveryCode } from "@/lib/delivery-code";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { completeDeliveredItem, VENDOR_OPEN_DELIVERY_STATUSES } from "@/services/marketplace/delivery/shared/complete-delivered-item";
import { createNotification, notifyAdmins } from "@/services/marketplace/notifications/notification.service";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";
import { getMarketplaceSettings } from "@/services/marketplace/admin/shared/marketplace-settings";
import { deliveryConfirmationDeadline, isPastDeadline } from "./delivery-deadline";
import { ensureHandoverCode } from "./handover-code";
import { resolveSettledOverdue } from "./overdue-confirmations";

export type SubmitOutcome =
  | { outcome: "VERIFIED"; deliveredItems: number; alreadyDelivered: boolean; late: boolean }
  | { outcome: "REJECTED"; reason: "mismatch" | "locked"; attemptsLeft: number }
  // Legacy only: a replayed submission stored before late codes completed the delivery.
  | { outcome: "LATE_REVIEW"; deadlineAt: string };

const SUBMISSION_ID = /^[A-Za-z0-9_-]{8,100}$/;
// Per-person brake across all bookings (the deliverer, or the admin entering codes), on top of each code's own lock.
const MAX_REJECTED_PER_WINDOW = 10;
const REJECTED_WINDOW_MS = 15 * 60 * 1000;
const OPEN = VENDOR_OPEN_DELIVERY_STATUSES as readonly string[];

function fromStored(row: DeliveryCodeSubmission, failedAttempts: number): SubmitOutcome {
  if (row.outcome === "VERIFIED") return { outcome: "VERIFIED", deliveredItems: 0, alreadyDelivered: true, late: row.late };
  if (row.outcome === "LATE_REVIEW") return { outcome: "LATE_REVIEW", deadlineAt: row.deadlineAt.toISOString() };
  return { outcome: "REJECTED", reason: row.reason === "locked" ? "locked" : "mismatch", attemptsLeft: Math.max(0, MAX_DELIVERY_CODE_ATTEMPTS - failedAttempts) };
}

const BOOKING_SELECT = {
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
      businessId: true,
      delivererConfirmedPickupAt: true,
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
} satisfies Prisma.VendorDeliveryBookingSelect;

// The booking's items this deliverer holds, with what's needed to judge a submission. No check-in or pickup is
// required: being assigned is enough.
export async function loadDelivererBooking(delivererId: string, bookingId: string) {
  const booking = await prisma.vendorDeliveryBooking.findUnique({ where: { id: bookingId }, select: BOOKING_SELECT });
  if (!booking) throw notFound("Delivery not found.");
  const mine = booking.orders.flatMap((order) =>
    order.items
      .filter((item) => item.deliveryItem?.delivery.deliverymanId === delivererId)
      .map((item) => ({ orderId: order.id, orderCancelled: order.status === "CANCELLED" || Boolean(order.cancelledAt), item }))
  );
  if (mine.length === 0) throw notFound("This delivery isn't assigned to you.");
  if (booking.status !== "CONFIRMED") throw conflict("This delivery isn't a confirmed, paid booking.");
  return { booking, mine };
}

type Booking = Awaited<ReturnType<typeof loadDelivererBooking>>["booking"];

interface CodeEntry {
  delivererId: string;
  bookingId: string;
  code: unknown;
  submissionId: unknown;
  clientRecordedAt: unknown;
  method: DeliveryConfirmationMethod;
  admin?: { id: string; reason: string };
}

export async function submitDeliveryCode(
  delivererId: string,
  bookingId: string,
  input: { code?: unknown; submissionId?: unknown; clientRecordedAt?: unknown }
): Promise<SubmitOutcome> {
  return confirmWithCode({ delivererId, bookingId, code: input.code, submissionId: input.submissionId, clientRecordedAt: input.clientRecordedAt, method: "DELIVERER" });
}

// Admin fallback. delivererId picks whose items the code completes; it may be omitted when only one deliverer still
// holds undelivered items of the booking.
export async function adminSubmitDeliveryCode(
  adminUserId: string,
  bookingId: string,
  input: { code?: unknown; submissionId?: unknown; reason?: unknown; delivererId?: unknown }
): Promise<SubmitOutcome & { delivererId: string }> {
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  if (!reason) throw badRequest("A reason is required — why is an admin entering this code instead of the deliverer?");

  const booking = await prisma.vendorDeliveryBooking.findUnique({ where: { id: bookingId }, select: BOOKING_SELECT });
  if (!booking) throw notFound("Delivery not found.");
  const holders = new Set<string>();
  const openHolders = new Set<string>();
  for (const order of booking.orders) {
    for (const item of order.items) {
      const id = item.deliveryItem?.delivery.deliverymanId;
      if (!id) continue;
      holders.add(id);
      if (!item.cancelledAt && order.status !== "CANCELLED" && OPEN.includes(item.deliveryItem!.status)) openHolders.add(id);
    }
  }
  let delivererId = typeof input.delivererId === "string" && input.delivererId ? input.delivererId : null;
  if (delivererId && !holders.has(delivererId)) throw badRequest("That deliverer holds nothing in this delivery.");
  if (!delivererId) {
    if (openHolders.size > 1) throw badRequest("Several deliverers hold part of this delivery — choose whose items the code confirms.");
    delivererId = [...openHolders][0] ?? [...holders][0] ?? null;
  }
  if (!delivererId) throw conflict("No deliverer is assigned to this delivery yet.");

  const result = await confirmWithCode({
    delivererId,
    bookingId,
    code: input.code,
    submissionId: input.submissionId,
    clientRecordedAt: null,
    method: "ADMIN_FALLBACK",
    admin: { id: adminUserId, reason },
  });
  await logAdminAction({
    adminId: adminUserId,
    action: result.outcome === "VERIFIED" ? "VENDOR_DELIVERY_CODE_ENTERED_BY_ADMIN" : "VENDOR_DELIVERY_CODE_ENTRY_REJECTED",
    targetType: "VendorDeliveryBooking",
    targetId: bookingId,
    message: `For deliverer ${delivererId} (${result.outcome}${result.outcome === "VERIFIED" && result.late ? ", late" : ""}): ${reason}`,
  });
  return { ...result, delivererId };
}

async function confirmWithCode(entry: CodeEntry): Promise<SubmitOutcome> {
  const { delivererId, bookingId, method, admin } = entry;
  const submissionId = typeof entry.submissionId === "string" ? entry.submissionId.trim() : "";
  if (!SUBMISSION_ID.test(submissionId)) throw badRequest("submissionId is required.");
  const code = normalizeDeliveryCode(entry.code);
  if (!code) throw badRequest("Enter all six digits of the student's code.");
  const clientRecordedAt = typeof entry.clientRecordedAt === "string" && !Number.isNaN(Date.parse(entry.clientRecordedAt)) ? new Date(entry.clientRecordedAt) : null;

  const replay = await prisma.deliveryCodeSubmission.findUnique({ where: { submissionId } });
  if (replay) {
    if (replay.bookingId !== bookingId || replay.delivererId !== delivererId || replay.method !== method) {
      throw conflict("This submission id was already used for a different delivery.");
    }
    const codeRow = await prisma.deliveryHandoverCode.findUnique({ where: { bookingId }, select: { failedAttempts: true } });
    return fromStored(replay, codeRow?.failedAttempts ?? 0);
  }

  const recentRejected = await prisma.deliveryCodeSubmission.count({
    where: { outcome: "REJECTED", receivedAt: { gt: new Date(Date.now() - REJECTED_WINDOW_MS) }, ...(admin ? { enteredBy: admin.id } : { delivererId, method: "DELIVERER" }) },
  });
  if (recentRejected >= MAX_REJECTED_PER_WINDOW) throw tooManyRequests("Too many wrong codes. Wait a few minutes, then try again.");

  const { booking, mine } = await loadDelivererBooking(delivererId, bookingId);
  const active = mine.filter((m) => !m.orderCancelled && !m.item.cancelledAt);
  const open = active.filter((m) => OPEN.includes(m.item.deliveryItem!.status));
  if (open.length === 0) {
    if (active.length > 0 && active.every((m) => m.item.deliveryItem!.status === "DELIVERED")) return { outcome: "VERIFIED", deliveredItems: 0, alreadyDelivered: true, late: false };
    throw conflict(active.length === 0 ? "This delivery was cancelled." : "A failed attempt on this delivery is waiting to be rescheduled — there's nothing to confirm right now.");
  }

  await ensureHandoverCode(bookingId, { notify: false });
  const codeRow = await prisma.deliveryHandoverCode.findUnique({ where: { bookingId } });
  if (!codeRow) throw conflict("This delivery has no code yet — ask an admin to issue one.");

  const now = new Date();
  const deadlineAt = deliveryConfirmationDeadline(booking.bookedFor, active.map((m) => m.item.retryDeliveryAt));
  const late = isPastDeadline(deadlineAt, now);
  const locked = codeRow.failedAttempts >= MAX_DELIVERY_CODE_ATTEMPTS;
  const matched = !locked && deliveryCodeMatches(bookingId, code, codeRow.codeHash);
  const base = {
    submissionId,
    bookingId,
    delivererId,
    deadlineAt,
    clientRecordedAt,
    receivedAt: now,
    codeMatched: matched,
    late,
    method,
    enteredBy: admin?.id ?? null,
    fallbackReason: admin?.reason ?? null,
  };
  const orderIds = Array.from(new Set(open.map((m) => m.orderId)));
  const actor = admin ? { actorType: "admin" as const, actorId: admin.id } : { actorType: "deliverer" as const, actorId: delivererId };
  // Orders assigned before Vendor runs started at assignment need joining to their payout run (see attachToPayoutRun).
  const needsRun = matched && booking.orders.some((o) => orderIds.includes(o.id) && !o.delivererConfirmedPickupAt);
  const payoutAmount = needsRun ? (await getMarketplaceSettings()).delivererPayoutAmount : null;

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<SubmitOutcome> => {
        if (!matched) {
          const after = locked
            ? codeRow
            : await tx.deliveryHandoverCode.update({ where: { id: codeRow.id }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true } });
          await tx.deliveryCodeSubmission.create({ data: { ...base, outcome: "REJECTED", reason: locked ? "locked" : "mismatch" } });
          for (const orderId of orderIds) {
            await recordOrderEvent(tx, { orderId, type: "BUYER_OTP_VERIFICATION_ATTEMPTED", ...actor, metadata: { success: false, locked, method } });
          }
          return { outcome: "REJECTED", reason: locked ? "locked" : "mismatch", attemptsLeft: Math.max(0, MAX_DELIVERY_CODE_ATTEMPTS - after.failedAttempts) };
        }
        if (payoutAmount !== null) await attachToPayoutRun(tx, booking, delivererId, orderIds, now, payoutAmount);
        const by = admin ? { type: "admin" as const, id: admin.id, note: `Student's code entered by an admin for the deliverer${late ? " (late)" : ""}: ${admin.reason}` } : undefined;
        let delivered = 0;
        for (const m of open) {
          const done = await completeDeliveredItem(
            tx,
            { deliveryItemId: m.item.deliveryItem!.id, orderItemId: m.item.id, orderId: m.orderId },
            { delivererId, now, codeVerified: true, by },
            VENDOR_OPEN_DELIVERY_STATUSES
          );
          if (done) delivered += 1;
        }
        await tx.deliveryCodeSubmission.create({ data: { ...base, outcome: "VERIFIED" } });
        await markCodeVerifiedIfDone(tx, bookingId, now);
        await resolveSettledOverdue(tx, bookingId, now);
        return { outcome: "VERIFIED", deliveredItems: delivered, alreadyDelivered: delivered === 0, late };
      },
      { timeout: 15000 }
    );

    if (result.outcome === "VERIFIED" && result.deliveredItems > 0) {
      await createNotification({ recipientId: booking.userId, type: "ORDER_DELIVERED", title: "Order delivered", message: "Your Vendor Market order has been delivered.", targetUrl: "/orders" });
      if (result.late) await notifyLateConfirmation(booking, deadlineAt, clientRecordedAt, method);
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

async function notifyLateConfirmation(booking: Booking, deadlineAt: Date, clientRecordedAt: Date | null, method: DeliveryConfirmationMethod) {
  const claimedOnTime = clientRecordedAt !== null && clientRecordedAt < deadlineAt;
  await notifyAdmins({
    type: "VENDOR_DELIVERY_LATE_CODE",
    title: "Delivery confirmed after its deadline",
    message:
      `A ${booking.slot.label} delivery (#${booking.id.slice(0, 8).toUpperCase()}) was confirmed with the student's code ${method === "ADMIN_FALLBACK" ? "by an admin " : ""}after its deadline, and is recorded as late.` +
      (claimedOnTime ? " The deliverer's phone recorded it before the deadline (unverified — it may have been offline); review the timing in Delivery operations." : ""),
    targetUrl: `/admin/delivery-operations?date=${booking.bookedFor.toISOString().slice(0, 10)}`,
  });
}

// Joins orders assigned before Vendor runs were started at assignment (assign-delivery.ts) to this deliverer's
// latest run for their vendor, starting that run now if it was still waiting on the removed pickup code — so the
// dispute-window sweep can release the deliverer's pay for it.
async function attachToPayoutRun(tx: Prisma.TransactionClient, booking: Booking, delivererId: string, orderIds: string[], now: Date, payoutAmount: number) {
  for (const order of booking.orders) {
    if (!orderIds.includes(order.id) || order.delivererConfirmedPickupAt) continue;
    const run = await tx.delivery_x_businesses.findFirst({ where: { deliverymanId: delivererId, businessId: order.businessId }, orderBy: { createdAt: "desc" } });
    if (!run) continue;
    let startedAt = run.delivererConfirmedPickupAt;
    if (!startedAt) {
      startedAt = now;
      await tx.delivery_x_businesses.update({
        where: { id: run.id },
        data: { delivererConfirmedPickupAt: now, pickupOtp: null, pickupOtpExpiry: null, delivererPayoutAmount: run.delivererPayoutAmount ?? payoutAmount },
      });
      // Every other order of that run still in this deliverer's hands joins it too, so its pay waits for all of them.
      await tx.order.updateMany({
        where: {
          businessId: order.businessId,
          delivererConfirmedPickupAt: null,
          items: { some: { deliveryItem: { status: { in: VENDOR_OPEN_DELIVERY_STATUSES }, delivery: { deliverymanId: delivererId } } } },
        },
        data: { delivererConfirmedPickupAt: now },
      });
    }
    await tx.order.update({ where: { id: order.id }, data: { delivererConfirmedPickupAt: startedAt } });
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
