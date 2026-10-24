// services/marketplace/vendor-delivery/handover/overdue-confirmations.ts
//
// Vendor deliveries whose student-code deadline (end of the delivery day,
// school time — delivery-deadline.ts) passed with no valid confirmation.
//
//   - flagOverdueConfirmations: run by the vendor-slot-briefing job. Flags each
//     paid booking a deliverer still holds undelivered items of, once per
//     (booking, deadline) — a DeliveryConfirmationOverdue row — and tells the
//     admins once (claimed before sending, released if the send fails, so a
//     retry or a second scheduler never double-notifies).
//   - resolveSettledOverdue: once nothing of the booking is left to deliver
//     (delivered late, or cancelled/refunded), its open rows are resolved —
//     never deleted, so the overdue history stays.
//
// Overdue means the confirmation is missing, not that the delivery didn't
// happen: nothing here delivers, cancels, refunds or pays anything, and a
// valid code arriving later still completes the delivery (recorded as late).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Db } from "@/services/marketplace/order/shared/db";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { addDays, isoDate } from "@/services/marketplace/delivery-roster/shared/roster-calendar";
import { deliveryConfirmationDeadline, isPastDeadline } from "./delivery-deadline";

// How far back the job looks for unconfirmed deliveries (older ones stay flagged; this only bounds the scan).
const LOOKBACK_DAYS = 14;
const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

// Items of the booking still held by a deliverer and not delivered: the delivery is "processing" (or a failed
// attempt is waiting for its retry, whose day the deadline already follows).
const HELD_UNDELIVERED: Prisma.OrderItemWhereInput = {
  cancelledAt: null,
  rejectedAt: null,
  deliveryStatus: { notIn: ["DELIVERED", "RETURNED"] },
  deliveryItem: { isNot: null },
  order: { status: { not: "CANCELLED" } },
};

// Resolves the booking's open overdue rows once none of its live items is left undelivered.
export async function resolveSettledOverdue(db: Db, bookingId: string, now: Date): Promise<number> {
  const open = await db.deliveryConfirmationOverdue.count({ where: { bookingId, resolvedAt: null } });
  if (open === 0) return 0;
  const live = { cancelledAt: null, rejectedAt: null, order: { vendorDeliveryBookingId: bookingId, status: { not: "CANCELLED" as const } } };
  const [undelivered, delivered] = await Promise.all([
    db.orderItem.count({ where: { ...live, OR: [{ deliveryStatus: null }, { deliveryStatus: { not: "DELIVERED" } }] } }),
    db.orderItem.count({ where: { ...live, deliveryStatus: "DELIVERED" } }),
  ]);
  if (undelivered > 0) return 0;
  const res = await db.deliveryConfirmationOverdue.updateMany({
    where: { bookingId, resolvedAt: null },
    data: { resolvedAt: now, resolution: delivered > 0 ? "DELIVERED" : "CANCELLED" },
  });
  return res.count;
}

export async function flagOverdueConfirmations(now: Date = new Date()): Promise<{ flagged: number; adminsNotified: number; resolved: number }> {
  const today = todayInSchoolTimezone(now);
  const bookings = await prisma.vendorDeliveryBooking.findMany({
    where: {
      status: "CONFIRMED",
      bookedFor: { gte: addDays(today, -LOOKBACK_DAYS), lte: today },
      orders: { some: { items: { some: HELD_UNDELIVERED } } },
    },
    select: { id: true, bookedFor: true, orders: { select: { items: { where: HELD_UNDELIVERED, select: { retryDeliveryAt: true } } } } },
  });

  let flagged = 0;
  for (const b of bookings) {
    const deadlineAt = deliveryConfirmationDeadline(b.bookedFor, b.orders.flatMap((o) => o.items.map((i) => i.retryDeliveryAt)));
    if (!isPastDeadline(deadlineAt, now)) continue;
    try {
      await prisma.deliveryConfirmationOverdue.create({ data: { bookingId: b.id, deadlineAt } });
      flagged += 1;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err; // already flagged
    }
  }

  // Reconcile: anything delivered or cancelled since it was flagged is resolved, not reopened.
  let resolved = 0;
  const open = await prisma.deliveryConfirmationOverdue.findMany({ where: { resolvedAt: null }, select: { bookingId: true }, distinct: ["bookingId"] });
  for (const row of open) resolved += await resolveSettledOverdue(prisma, row.bookingId, now);

  return { flagged, adminsNotified: await notifyAdminsOfOverdue(), resolved };
}

async function notifyAdminsOfOverdue(): Promise<number> {
  const pending = await prisma.deliveryConfirmationOverdue.findMany({ where: { adminsNotifiedAt: null, resolvedAt: null }, orderBy: { flaggedAt: "asc" } });
  if (pending.length === 0) return 0;
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
  let notified = 0;
  for (const row of pending) {
    // Claim first: a concurrent run that loses the claim sends nothing.
    const claimed = await prisma.deliveryConfirmationOverdue.updateMany({ where: { id: row.id, adminsNotifiedAt: null }, data: { adminsNotifiedAt: new Date() } });
    if (claimed.count === 0) continue;
    try {
      const d = await describeBooking(row.bookingId);
      for (const admin of admins) {
        await createNotification({
          recipientId: admin.id,
          scope: "ADMIN",
          type: "VENDOR_DELIVERY_CONFIRMATION_OVERDUE",
          title: `Delivery #${d.reference} not confirmed by its deadline`,
          message: `${d.student} · ${d.slot} on ${d.date} · deliverer: ${d.deliverers.join(", ") || "none"} · deadline ${when.format(row.deadlineAt)} · ${d.open} item(s) still processing. The deliverer can still enter the student's code, or an admin can enter it for them.`,
          targetUrl: `/admin/delivery-operations?date=${d.date}`,
        });
      }
      notified += 1;
    } catch (err) {
      await prisma.deliveryConfirmationOverdue.updateMany({ where: { id: row.id }, data: { adminsNotifiedAt: null } });
      console.error(`[overdue-confirmations] notifying admins about booking ${row.bookingId} failed; will retry next run:`, err instanceof Error ? err.message : err);
    }
  }
  return notified;
}

async function describeBooking(bookingId: string) {
  const b = await prisma.vendorDeliveryBooking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      bookedFor: true,
      user: { select: { firstName: true, lastName: true } },
      slot: { select: { label: true } },
      orders: {
        select: {
          items: {
            where: HELD_UNDELIVERED,
            select: { deliveryItem: { select: { delivery: { select: { deliveryman: { select: { firstName: true, lastName: true } } } } } } },
          },
        },
      },
    },
  });
  const items = b.orders.flatMap((o) => o.items);
  const deliverers = Array.from(new Set(items.map((i) => i.deliveryItem?.delivery.deliveryman).filter(Boolean).map((m) => `${m!.firstName} ${m!.lastName}`)));
  return {
    reference: bookingId.slice(0, 8).toUpperCase(),
    student: `${b.user.firstName} ${b.user.lastName}`,
    slot: b.slot.label,
    date: isoDate(b.bookedFor),
    deliverers,
    open: items.length,
  };
}

export interface OverdueConfirmation {
  id: string;
  bookingId: string;
  reference: string;
  date: string;
  slotLabel: string;
  student: string;
  deliverers: string[];
  openItems: number;
  deadlineAt: string;
  flaggedAt: string;
  adminsNotifiedAt: string | null;
}

// Admin: every unresolved overdue confirmation, oldest deadline first, across all days.
export async function listOpenOverdueConfirmations(): Promise<OverdueConfirmation[]> {
  const rows = await prisma.deliveryConfirmationOverdue.findMany({ where: { resolvedAt: null }, orderBy: { deadlineAt: "asc" } });
  const result: OverdueConfirmation[] = [];
  for (const row of rows) {
    const d = await describeBooking(row.bookingId);
    result.push({
      id: row.id,
      bookingId: row.bookingId,
      reference: d.reference,
      date: d.date,
      slotLabel: d.slot,
      student: d.student,
      deliverers: d.deliverers,
      openItems: d.open,
      deadlineAt: row.deadlineAt.toISOString(),
      flaggedAt: row.flaggedAt.toISOString(),
      adminsNotifiedAt: row.adminsNotifiedAt?.toISOString() ?? null,
    });
  }
  return result;
}
