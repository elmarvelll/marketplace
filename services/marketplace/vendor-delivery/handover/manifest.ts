// services/marketplace/vendor-delivery/handover/manifest.ts
//
// The delivery card: everything a deliverer needs to collect and deliver one
// slot's Vendor Market orders, and nothing more. Built from the REAL
// assignment (Delivery/DeliveryItem), not the roster plan, so it always
// matches who is actually carrying what.
//
// Per slot occurrence and deliverer: the vendors to buy/collect from (name,
// location, contact the vendor chose to publish, order refs, item counts —
// information only, nothing to confirm) and the student deliveries (booking
// ref, student's first name, delivery location, items, status, deadline, and
// the MASKED code). Never included: the full code, payment or bank details,
// student email or other personal data.
//
// A delivery is PROCESSING_ORDER from assignment until the student's code is
// verified (DELIVERED). FAILED (a failed attempt waiting for its retry) and
// CANCELLED are the existing exception states. Legacy PICKED_UP /
// OUT_FOR_DELIVERY items read as processing.
//
// Used by the deliverer's own dashboard (only their items) and by the admin
// operations page (any deliverer — admins see the same mask, never the code).

import { prisma } from "@/lib/prisma";
import { MAX_DELIVERY_CODE_ATTEMPTS } from "@/lib/delivery-code";
import { formatArrivalTime } from "@/services/marketplace/vendor-delivery/deliverer-arrival";
import { deliveryConfirmationDeadline, isPastDeadline, slotEndsAt } from "./delivery-deadline";
import { attendanceOf, getCheckInLocation, type Attendance } from "./shift";

export type ManifestDeliveryStatus = "PROCESSING_ORDER" | "DELIVERED" | "FAILED" | "CANCELLED";

export interface ManifestDelivery {
  bookingId: string;
  reference: string;
  studentFirstName: string;
  deliveryLocation: string | null;
  vendors: { name: string; items: { name: string; quantity: number }[] }[];
  status: ManifestDeliveryStatus;
  maskedCode: string | null;
  codeLocked: boolean;
  attemptsLeft: number;
  deadlineAt: string;
  // Past the deadline with no valid confirmation yet — the code can still be entered.
  overdue: boolean;
  failedAttempts: number;
  retryDeliveryAt: string | null;
  // Legacy: a late code from before late codes completed the delivery, still waiting for an admin.
  pendingLateReview: boolean;
  // How it was confirmed, once delivered (null for a delivery confirmed before this was recorded).
  confirmation: { method: "DELIVERER" | "ADMIN_FALLBACK"; at: string; late: boolean } | null;
}

export interface ManifestCard {
  key: string; // `${date}|${slotId}|${delivererId}`
  date: string;
  slotId: string;
  slotLabel: string;
  windowStart: string;
  windowEnd: string;
  arriveBy: string;
  deliverer: { id: string; name: string; phone: string | null };
  // Attendance at the meeting point (shift.ts) — a record only, never a gate.
  attendance: { state: Attendance; checkedInAt: string | null };
  slotEndsAt: string;
  meetingPoint: string | null;
  pickups: { businessId: string; name: string; location: string | null; contact: string | null; orderRefs: string[]; itemCount: number }[];
  deliveries: ManifestDelivery[];
}

const PROCESSING = ["ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];

function statusOf(statuses: string[], cancelled: boolean): ManifestDeliveryStatus {
  if (cancelled || statuses.length === 0) return "CANCELLED";
  if (statuses.every((s) => s === "DELIVERED")) return "DELIVERED";
  if (statuses.some((s) => PROCESSING.includes(s))) return "PROCESSING_ORDER";
  return "FAILED";
}

export async function buildVendorManifests(filter: { delivererId?: string; dates?: Date[]; fromDate?: Date }): Promise<ManifestCard[]> {
  const bookingDate = filter.dates ? { in: filter.dates } : filter.fromDate ? { gte: filter.fromDate } : undefined;
  const rows = await prisma.deliveryItem.findMany({
    where: {
      ...(filter.delivererId ? { delivery: { deliverymanId: filter.delivererId } } : {}),
      orderItem: { order: { vendorDeliveryBookingId: { not: null }, vendorDeliveryBooking: { status: "CONFIRMED", ...(bookingDate ? { bookedFor: bookingDate } : {}) } } },
    },
    select: {
      status: true,
      delivery: { select: { deliveryman: { select: { id: true, firstName: true, lastName: true, phone: true } } } },
      orderItem: {
        select: {
          quantity: true,
          cancelledAt: true,
          failedDeliveryAttempts: true,
          retryDeliveryAt: true,
          variantName: true,
          product: { select: { name: true } },
          side: { select: { name: true } },
          order: {
            select: {
              id: true,
              status: true,
              deliveryLocation: true,
              business: { select: { id: true, name: true, location: true, contactInfo: true } },
              user: { select: { firstName: true } },
              vendorDeliveryBooking: { select: { id: true, bookedFor: true, slot: { select: { id: true, label: true, windowStart: true, windowEnd: true } } } },
            },
          },
        },
      },
    },
  });
  if (rows.length === 0) return [];

  const bookingIds = Array.from(new Set(rows.map((r) => r.orderItem.order.vendorDeliveryBooking!.id)));
  const [codes, lateReviews, verified, handovers] = await Promise.all([
    prisma.deliveryHandoverCode.findMany({ where: { bookingId: { in: bookingIds } }, select: { bookingId: true, maskedCode: true, failedAttempts: true } }),
    prisma.deliveryCodeSubmission.findMany({ where: { bookingId: { in: bookingIds }, outcome: "LATE_REVIEW", reviewedAt: null }, select: { bookingId: true } }),
    prisma.deliveryCodeSubmission.findMany({
      where: { bookingId: { in: bookingIds }, outcome: "VERIFIED" },
      orderBy: { receivedAt: "asc" },
      select: { bookingId: true, delivererId: true, method: true, receivedAt: true, late: true },
    }),
    prisma.deliveryShiftCheckIn.findMany({ where: { operation: "VENDOR", delivererId: filter.delivererId, ...(filter.dates ? { date: { in: filter.dates } } : filter.fromDate ? { date: { gte: filter.fromDate } } : {}) } }),
  ]);
  const meetingPoint = await getCheckInLocation();
  const now = new Date();
  const codeOf = new Map(codes.map((c) => [c.bookingId, c]));
  const lateSet = new Set(lateReviews.map((l) => l.bookingId));

  type Acc = { card: ManifestCard; bookings: Map<string, { rows: typeof rows }>; pickups: Map<string, ManifestCard["pickups"][number] & { refs: Set<string> }> };
  const cards = new Map<string, Acc>();
  for (const row of rows) {
    const order = row.orderItem.order;
    const booking = order.vendorDeliveryBooking!;
    const man = row.delivery.deliveryman;
    const date = booking.bookedFor.toISOString().slice(0, 10);
    const key = `${date}|${booking.slot.id}|${man.id}`;
    let acc = cards.get(key);
    if (!acc) {
      const checkIn = handovers.find((h) => h.delivererId === man.id && h.slotId === booking.slot.id && h.date.toISOString().slice(0, 10) === date) ?? null;
      acc = {
        card: {
          key,
          date,
          slotId: booking.slot.id,
          slotLabel: booking.slot.label,
          windowStart: booking.slot.windowStart,
          windowEnd: booking.slot.windowEnd,
          arriveBy: formatArrivalTime(booking.slot.windowStart),
          deliverer: { id: man.id, name: `${man.firstName} ${man.lastName}`, phone: man.phone },
          attendance: { state: attendanceOf(checkIn), checkedInAt: checkIn?.checkedInAt.toISOString() ?? null },
          slotEndsAt: slotEndsAt(booking.bookedFor, booking.slot.windowEnd).toISOString(),
          meetingPoint,
          pickups: [],
          deliveries: [],
        },
        bookings: new Map(),
        pickups: new Map(),
      };
      cards.set(key, acc);
    }
    if (!acc.bookings.has(booking.id)) acc.bookings.set(booking.id, { rows: [] });
    acc.bookings.get(booking.id)!.rows.push(row);

    const biz = order.business;
    if (!acc.pickups.has(biz.id)) acc.pickups.set(biz.id, { businessId: biz.id, name: biz.name, location: biz.location, contact: biz.contactInfo, orderRefs: [], itemCount: 0, refs: new Set() });
    const pickup = acc.pickups.get(biz.id)!;
    if (!row.orderItem.cancelledAt) {
      pickup.refs.add(order.id.slice(0, 8));
      pickup.itemCount += row.orderItem.quantity;
    }
  }

  const result: ManifestCard[] = [];
  for (const acc of cards.values()) {
    acc.card.pickups = Array.from(acc.pickups.values()).map(({ refs, ...p }) => ({ ...p, orderRefs: Array.from(refs) }));
    for (const [bookingId, { rows: bRows }] of acc.bookings) {
      const live = bRows.filter((r) => !r.orderItem.cancelledAt && r.orderItem.order.status !== "CANCELLED");
      const vendors = new Map<string, { name: string; items: { name: string; quantity: number }[] }>();
      for (const r of live) {
        const biz = r.orderItem.order.business;
        if (!vendors.has(biz.id)) vendors.set(biz.id, { name: biz.name, items: [] });
        const itemName = r.orderItem.product?.name ?? r.orderItem.side?.name ?? "Item";
        vendors.get(biz.id)!.items.push({ name: r.orderItem.variantName ? `${itemName} (${r.orderItem.variantName})` : itemName, quantity: r.orderItem.quantity });
      }
      const first = bRows[0].orderItem.order;
      const booking = first.vendorDeliveryBooking!;
      const retryAts = live.map((r) => r.orderItem.retryDeliveryAt);
      const latestRetry = retryAts.filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const code = codeOf.get(bookingId);
      const status = statusOf(live.map((r) => r.status), live.length === 0);
      const deadlineAt = deliveryConfirmationDeadline(booking.bookedFor, retryAts);
      const confirmed = verified.filter((v) => v.bookingId === bookingId && v.delivererId === acc.card.deliverer.id).at(-1);
      acc.card.deliveries.push({
        bookingId,
        reference: bookingId.slice(0, 8).toUpperCase(),
        studentFirstName: first.user.firstName,
        deliveryLocation: first.deliveryLocation,
        vendors: Array.from(vendors.values()),
        status,
        maskedCode: code?.maskedCode ?? null,
        codeLocked: (code?.failedAttempts ?? 0) >= MAX_DELIVERY_CODE_ATTEMPTS,
        attemptsLeft: Math.max(0, MAX_DELIVERY_CODE_ATTEMPTS - (code?.failedAttempts ?? 0)),
        deadlineAt: deadlineAt.toISOString(),
        overdue: status === "PROCESSING_ORDER" && isPastDeadline(deadlineAt, now),
        failedAttempts: Math.max(0, ...live.map((r) => r.orderItem.failedDeliveryAttempts)),
        retryDeliveryAt: latestRetry?.toISOString() ?? null,
        pendingLateReview: lateSet.has(bookingId),
        confirmation: status === "DELIVERED" && confirmed ? { method: confirmed.method, at: confirmed.receivedAt.toISOString(), late: confirmed.late } : null,
      });
    }
    acc.card.deliveries.sort((a, b) => a.reference.localeCompare(b.reference));
    result.push(acc.card);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.windowStart.localeCompare(b.windowStart) || a.deliverer.name.localeCompare(b.deliverer.name));
}
