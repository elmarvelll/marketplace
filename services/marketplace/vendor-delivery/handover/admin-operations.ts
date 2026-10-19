// services/marketplace/vendor-delivery/handover/admin-operations.ts
//
// The admin's (vendor manager's) control center for one day of Vendor Market
// deliveries, and the audited interventions it offers. Every action here
// requires a reason where it changes someone's delivery, writes an
// AdminActionLog row, and goes through the same services as the normal flow:
// completing uses complete-delivered-item.ts, assigning uses assign-delivery.ts,
// refunds stay on admin/vendor-delivery/refund-vendor-item.ts. Payment state
// is never changed here: only CONFIRMED (paid) bookings can be completed or
// reassigned.
//
// Admins see the same masked code as the deliverer, never the full code.

import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/service-error";
import { MAX_DELIVERY_CODE_ATTEMPTS } from "@/lib/delivery-code";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";
import { assignDelivery } from "@/services/marketplace/delivery/assign-delivery";
import { completeDeliveredItem } from "@/services/marketplace/delivery/shared/complete-delivered-item";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { parseAndValidateDeliveryDate, MAX_SCHEDULE_CONFIG_DAYS } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { summarizeOccurrence, type SlotBriefingSummary } from "@/services/marketplace/vendor-delivery/slot-briefing";
import { schoolTimeToInstant } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { buildVendorManifests, type ManifestCard } from "./manifest";
import { deliveryConfirmationDeadline } from "./delivery-deadline";
import { markCodeVerifiedIfDone } from "./submit-delivery-code";

const PAST_DAYS_VIEWABLE = 30;

export interface OpsBooking {
  bookingId: string;
  reference: string;
  student: { name: string; email: string };
  paymentStatus: "PAID" | "AWAITING_PAYMENT" | "CANCELLED";
  deliveryLocation: string | null;
  orders: {
    orderId: string;
    vendor: string;
    status: string;
    items: { orderItemId: string; name: string; quantity: number; deliveryStatus: string | null; refunded: boolean; deliverer: string | null }[];
  }[];
  deliverers: string[];
  plannedDeliverer: string | null;
  code: { masked: string; failedAttempts: number; locked: boolean; verified: boolean } | null;
  deadlineAt: string;
  lateSubmissions: { id: string; deliverer: string; receivedAt: string; clientRecordedAt: string | null; codeMatched: boolean }[];
  needsAttention: string[];
}

export interface OpsSlot {
  slot: { id: string; label: string; windowStart: string; windowEnd: string };
  summary: SlotBriefingSummary;
  briefingSentAt: string | null;
  ordersCloseAt: string;
  bookings: OpsBooking[];
  cards: ManifestCard[];
}

export async function getVendorOperationsDay(dateStr: string | undefined): Promise<{ date: string; slots: OpsSlot[] }> {
  const date = parseOpsDate(dateStr);
  const [slots, bookings, cards, notices] = await Promise.all([
    prisma.vendorDeliverySlot.findMany({ where: { active: true }, orderBy: { windowStart: "asc" }, select: { id: true, label: true, windowStart: true, windowEnd: true } }),
    prisma.vendorDeliveryBooking.findMany({
      where: { bookedFor: date, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slotId: true,
        status: true,
        bookedFor: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        slot: { select: { windowEnd: true } },
        orders: {
          select: {
            id: true,
            status: true,
            deliveryLocation: true,
            business: { select: { name: true } },
            items: {
              select: {
                id: true,
                quantity: true,
                deliveryStatus: true,
                rejectedAt: true,
                cancelledAt: true,
                retryDeliveryAt: true,
                variantName: true,
                product: { select: { name: true } },
                side: { select: { name: true } },
                deliveryItem: { select: { delivery: { select: { deliveryman: { select: { firstName: true, lastName: true } } } } } },
              },
            },
          },
        },
      },
    }),
    buildVendorManifests({ dates: [date] }),
    prisma.slotBriefingNotice.findMany({ where: { operation: "VENDOR", date }, select: { slotId: true, sentAt: true } }),
  ]);

  const bookingIds = bookings.map((b) => b.id);
  const [codes, late, plans] = await Promise.all([
    prisma.deliveryHandoverCode.findMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.deliveryCodeSubmission.findMany({ where: { bookingId: { in: bookingIds }, outcome: "LATE_REVIEW", reviewedAt: null }, orderBy: { receivedAt: "asc" } }),
    prisma.scheduledDelivery.findMany({ where: { bookingId: { in: bookingIds } }, select: { bookingId: true, plannedDelivererId: true } }),
  ]);
  const delivererIds = Array.from(new Set([...late.map((l) => l.delivererId), ...plans.map((p) => p.plannedDelivererId).filter((id): id is string => Boolean(id))]));
  const people = new Map((await prisma.deliverer.findMany({ where: { id: { in: delivererIds } }, select: { id: true, firstName: true, lastName: true } })).map((d) => [d.id, `${d.firstName} ${d.lastName}`]));
  const now = new Date();

  const result: OpsSlot[] = [];
  for (const slot of slots) {
    const slotBookings = bookings.filter((b) => b.slotId === slot.id);
    const slotCards = cards.filter((c) => c.slotId === slot.id);
    if (slotBookings.length === 0 && slotCards.length === 0) continue;
    const sent = notices.filter((n) => n.slotId === slot.id).map((n) => n.sentAt.getTime());

    result.push({
      slot,
      summary: await summarizeOccurrence(slot, date),
      briefingSentAt: sent.length > 0 ? new Date(Math.min(...sent)).toISOString() : null,
      ordersCloseAt: new Date(schoolTimeToInstant(date, slot.windowStart).getTime() - 120 * 60_000).toISOString(),
      cards: slotCards,
      bookings: slotBookings.map((b): OpsBooking => {
        const code = codes.find((c) => c.bookingId === b.id);
        const items = b.orders.flatMap((o) => o.items);
        const live = items.filter((i) => !i.cancelledAt && !i.rejectedAt);
        const deadline = deliveryConfirmationDeadline(b.bookedFor, b.slot.windowEnd, live.map((i) => i.retryDeliveryAt));
        const delivererNames = Array.from(
          new Set(items.map((i) => i.deliveryItem?.delivery.deliveryman).filter(Boolean).map((m) => `${m!.firstName} ${m!.lastName}`))
        );
        const lateRows = late.filter((l) => l.bookingId === b.id);
        const needsAttention: string[] = [];
        if (b.status === "CONFIRMED") {
          if (live.some((i) => !i.deliveryStatus)) needsAttention.push("Not assigned to a deliverer");
          if (slotCards.some((c) => c.shift.state === "MISSED" && !c.shift.unlocked && c.deliveries.some((d) => d.bookingId === b.id))) {
            needsAttention.push("Deliverer missed the shift — reassign or unlock it");
          }
          if ((code?.failedAttempts ?? 0) >= MAX_DELIVERY_CODE_ATTEMPTS && !code?.verifiedAt) needsAttention.push("Code locked after wrong attempts");
          if (!code) needsAttention.push("No delivery code issued");
          if (lateRows.length > 0) needsAttention.push("Late confirmation to review");
          if (now > deadline && live.some((i) => i.deliveryStatus !== "DELIVERED")) needsAttention.push("Past the 24-hour confirmation deadline");
          if (live.some((i) => i.deliveryStatus === "FAILED" || i.deliveryStatus === "DELIVERY_ATTEMPTED")) needsAttention.push("Failed delivery attempt");
        }
        const plan = plans.find((p) => p.bookingId === b.id);
        return {
          bookingId: b.id,
          reference: b.id.slice(0, 8).toUpperCase(),
          student: { name: `${b.user.firstName} ${b.user.lastName}`, email: b.user.email },
          paymentStatus: b.status === "CONFIRMED" ? "PAID" : "AWAITING_PAYMENT",
          deliveryLocation: b.orders[0]?.deliveryLocation ?? null,
          orders: b.orders.map((o) => ({
            orderId: o.id,
            vendor: o.business.name,
            status: o.status,
            items: o.items.map((i) => {
              const man = i.deliveryItem?.delivery.deliveryman;
              const name = i.product?.name ?? i.side?.name ?? "Item";
              return {
                orderItemId: i.id,
                name: i.variantName ? `${name} (${i.variantName})` : name,
                quantity: i.quantity,
                deliveryStatus: i.deliveryStatus,
                refunded: Boolean(i.cancelledAt || i.rejectedAt),
                deliverer: man ? `${man.firstName} ${man.lastName}` : null,
              };
            }),
          })),
          deliverers: delivererNames,
          plannedDeliverer: plan?.plannedDelivererId ? (people.get(plan.plannedDelivererId) ?? null) : null,
          code: code ? { masked: code.maskedCode, failedAttempts: code.failedAttempts, locked: code.failedAttempts >= MAX_DELIVERY_CODE_ATTEMPTS, verified: Boolean(code.verifiedAt) } : null,
          deadlineAt: deadline.toISOString(),
          lateSubmissions: lateRows.map((l) => ({
            id: l.id,
            deliverer: people.get(l.delivererId) ?? "Deliverer",
            receivedAt: l.receivedAt.toISOString(),
            clientRecordedAt: l.clientRecordedAt?.toISOString() ?? null,
            codeMatched: l.codeMatched,
          })),
          needsAttention,
        };
      }),
    });
  }
  return { date: date.toISOString().slice(0, 10), slots: result };
}

function parseOpsDate(dateStr: string | undefined): Date {
  if (!dateStr) return parseAndValidateDeliveryDate(undefined);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) throw badRequest('date must be "YYYY-MM-DD".');
  const date = new Date(`${dateStr.trim()}T00:00:00.000Z`);
  const today = parseAndValidateDeliveryDate(undefined);
  // Past days stay viewable (late confirmations, disputes); the future is the configurable horizon.
  if (date.getTime() < today.getTime() - PAST_DAYS_VIEWABLE * 86_400_000) throw badRequest(`Only the last ${PAST_DAYS_VIEWABLE} days can be viewed.`);
  if (date.getTime() > today.getTime()) return parseAndValidateDeliveryDate(dateStr, new Date(), MAX_SCHEDULE_CONFIG_DAYS);
  return date;
}

function requireReason(reason: string | undefined): string {
  const clean = reason?.trim();
  if (!clean) throw badRequest("A reason is required.");
  return clean.slice(0, 500);
}

// Decide a delivery confirmation that reached the server after its deadline.
// COMPLETED is allowed only when the student's code was correct: the late
// arrival is excused, the code check is not. Anything else is DECLINED (the
// order stays undelivered for normal resolution: retry, refund, dispute).
export async function reviewLateSubmission(adminUserId: string, submissionRowId: string, input: { decision?: string; note?: string }) {
  const note = requireReason(input.note);
  if (input.decision !== "COMPLETED" && input.decision !== "DECLINED") throw badRequest('decision must be "COMPLETED" or "DECLINED".');
  const row = await prisma.deliveryCodeSubmission.findUnique({ where: { id: submissionRowId } });
  if (!row || row.outcome !== "LATE_REVIEW") throw notFound("Late confirmation not found.");
  if (row.reviewedAt) throw conflict("This late confirmation was already reviewed.");
  if (input.decision === "COMPLETED" && !row.codeMatched) throw conflict("The code submitted was wrong — this can't be completed as delivered.");

  const booking = await prisma.vendorDeliveryBooking.findUnique({ where: { id: row.bookingId }, select: { status: true, userId: true } });
  if (!booking) throw notFound("Booking not found.");
  if (input.decision === "COMPLETED" && booking.status !== "CONFIRMED") throw conflict("Only a paid, confirmed booking can be completed.");

  const now = new Date();
  const delivered = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.deliveryCodeSubmission.updateMany({
        where: { id: row.id, reviewedAt: null },
        data: { reviewedAt: now, reviewedBy: adminUserId, reviewDecision: input.decision, reviewNote: note },
      });
      if (claimed.count === 0) throw conflict("This late confirmation was already reviewed.");
      if (input.decision !== "COMPLETED") return 0;
      const items = await tx.deliveryItem.findMany({
        where: {
          status: { in: ["PICKED_UP", "OUT_FOR_DELIVERY"] },
          delivery: { deliverymanId: row.delivererId },
          orderItem: { cancelledAt: null, order: { vendorDeliveryBookingId: row.bookingId, status: { not: "CANCELLED" } } },
        },
        select: { id: true, orderItemId: true, orderItem: { select: { orderId: true } } },
      });
      let count = 0;
      for (const item of items) {
        const done = await completeDeliveredItem(
          tx,
          { deliveryItemId: item.id, orderItemId: item.orderItemId, orderId: item.orderItem.orderId },
          { delivererId: row.delivererId, now, codeVerified: true, by: { type: "admin", id: adminUserId, note: `Late confirmation approved: ${note}` } }
        );
        if (done) count += 1;
      }
      await markCodeVerifiedIfDone(tx, row.bookingId, now);
      return count;
    },
    { timeout: 15000 }
  );

  await logAdminAction({ adminId: adminUserId, action: `VENDOR_LATE_CONFIRMATION_${input.decision}`, targetType: "VendorDeliveryBooking", targetId: row.bookingId, message: note });
  if (delivered > 0) {
    await createNotification({ recipientId: booking.userId, type: "ORDER_DELIVERED", title: "Order delivered", message: "Your Vendor Market order has been confirmed as delivered.", targetUrl: "/orders" });
  }
  return { delivered };
}

// Move a booking's not-yet-collected items to another deliverer (or assign
// ones nobody holds yet). Items already picked up stay with whoever has them
// — physical custody can't be reassigned from a dashboard.
export async function reassignBooking(adminUserId: string, bookingId: string, input: { delivererId?: string; reason?: string }) {
  const reason = requireReason(input.reason);
  if (!input.delivererId) throw badRequest("delivererId is required.");
  const booking = await prisma.vendorDeliveryBooking.findUnique({ where: { id: bookingId }, select: { status: true } });
  if (!booking) throw notFound("Booking not found.");
  if (booking.status !== "CONFIRMED") throw conflict("Only a paid, confirmed booking can be assigned.");
  const target = await prisma.deliverer.findUnique({ where: { id: input.delivererId }, select: { status: true } });
  if (target?.status !== "APPROVED") throw badRequest("Deliverer not found or not approved.");

  const items = await prisma.orderItem.findMany({
    where: {
      cancelledAt: null,
      rejectedAt: null,
      order: { vendorDeliveryBookingId: bookingId, status: { not: "CANCELLED" } },
      OR: [{ deliveryStatus: null }, { deliveryStatus: "ASSIGNED", deliveryItem: { delivery: { deliverymanId: { not: input.delivererId } } } }],
    },
    select: { id: true, orderId: true, deliveryStatus: true },
  });
  if (items.length === 0) throw conflict("Nothing left to reassign — every item is collected or already with that deliverer.");

  // Return the uncollected items to the pool, then assign them through the
  // normal path (new pickup code, events, plan sync, notifications).
  const moving = items.filter((i) => i.deliveryStatus === "ASSIGNED");
  if (moving.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({ where: { id: { in: moving.map((i) => i.id) }, deliveryStatus: "ASSIGNED" }, data: { deliveryStatus: null } });
      for (const item of moving) {
        await recordOrderEvent(tx, { orderId: item.orderId, orderItemId: item.id, type: "DELIVERER_ASSIGNED", actorType: "admin", actorId: adminUserId, message: `Reassigned: ${reason}` });
      }
    });
  }
  const result = await assignDelivery(input.delivererId, items.map((i) => i.id), adminUserId);
  await logAdminAction({ adminId: adminUserId, action: "VENDOR_DELIVERY_REASSIGNED", targetType: "VendorDeliveryBooking", targetId: bookingId, message: `To deliverer ${input.delivererId}: ${reason}` });
  return { reassignedItems: items.length, deliveryId: result.deliveryId };
}
