// services/marketplace/vendor-delivery/handover/manifest.ts
//
// The delivery card: everything a deliverer needs to collect and deliver one
// slot's Vendor Market orders, and nothing more. Built from the REAL
// assignment (Delivery/DeliveryItem), not the roster plan, so it always
// matches who is actually carrying what.
//
// Per slot occurrence and deliverer: the vendor pickups (name, location,
// contact the vendor chose to publish, order refs, item counts) and the
// student deliveries (booking ref, student's first name, delivery location,
// items, status, deadline, and the MASKED code). Never included: the full
// code, payment or bank details, student email or other personal data.
//
// Used by the deliverer's own dashboard (only their items) and by the admin
// operations page (any deliverer — admins see the same mask, never the code).

import { prisma } from "@/lib/prisma";
import { MAX_DELIVERY_CODE_ATTEMPTS } from "@/lib/delivery-code";
import { formatArrivalTime } from "@/services/marketplace/vendor-delivery/deliverer-arrival";
import { deliveryConfirmationDeadline, slotEndsAt } from "./delivery-deadline";
import { getCheckInLocation, shiftState, type ShiftState } from "./shift";

export type ManifestDeliveryStatus = "AWAITING_PICKUP" | "COLLECTED" | "ON_THE_WAY" | "DELIVERED" | "FAILED" | "CANCELLED";

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
  failedAttempts: number;
  retryDeliveryAt: string | null;
  pendingLateReview: boolean;
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
  // The shift (shift.ts): SCHEDULED -> IN_PROGRESS (admin check-in at the
  // meeting point) -> DELIVERED, or MISSED. unlocked = actions are allowed.
  shift: { state: ShiftState; unlocked: boolean; checkedInAt: string | null; late: boolean; endsAt: string };
  meetingPoint: string | null;
  pickups: { businessId: string; name: string; location: string | null; contact: string | null; orderRefs: string[]; itemCount: number; collected: boolean }[];
  deliveries: ManifestDelivery[];
}

function statusOf(statuses: string[], cancelled: boolean): ManifestDeliveryStatus {
  if (cancelled || statuses.length === 0) return "CANCELLED";
  if (statuses.every((s) => s === "DELIVERED")) return "DELIVERED";
  if (statuses.some((s) => s === "ASSIGNED")) return "AWAITING_PICKUP";
  if (statuses.some((s) => s === "OUT_FOR_DELIVERY")) return "ON_THE_WAY";
  if (statuses.some((s) => s === "PICKED_UP")) return "COLLECTED";
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
  const [codes, lateReviews, handovers] = await Promise.all([
    prisma.deliveryHandoverCode.findMany({ where: { bookingId: { in: bookingIds } }, select: { bookingId: true, maskedCode: true, failedAttempts: true } }),
    prisma.deliveryCodeSubmission.findMany({ where: { bookingId: { in: bookingIds }, outcome: "LATE_REVIEW", reviewedAt: null }, select: { bookingId: true } }),
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
          // state filled in once every delivery of the card is known (below)
          shift: { state: "SCHEDULED", unlocked: false, checkedInAt: checkIn?.checkedInAt.toISOString() ?? null, late: checkIn?.late ?? false, endsAt: slotEndsAt(booking.bookedFor, booking.slot.windowEnd).toISOString() },
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
    if (!acc.pickups.has(biz.id)) acc.pickups.set(biz.id, { businessId: biz.id, name: biz.name, location: biz.location, contact: biz.contactInfo, orderRefs: [], itemCount: 0, collected: true, refs: new Set() });
    const pickup = acc.pickups.get(biz.id)!;
    if (!row.orderItem.cancelledAt) {
      pickup.refs.add(order.id.slice(0, 8));
      pickup.itemCount += row.orderItem.quantity;
      if (row.status === "ASSIGNED") pickup.collected = false;
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
      acc.card.deliveries.push({
        bookingId,
        reference: bookingId.slice(0, 8).toUpperCase(),
        studentFirstName: first.user.firstName,
        deliveryLocation: first.deliveryLocation,
        vendors: Array.from(vendors.values()),
        status: statusOf(live.map((r) => r.status), live.length === 0),
        maskedCode: code?.maskedCode ?? null,
        codeLocked: (code?.failedAttempts ?? 0) >= MAX_DELIVERY_CODE_ATTEMPTS,
        attemptsLeft: Math.max(0, MAX_DELIVERY_CODE_ATTEMPTS - (code?.failedAttempts ?? 0)),
        deadlineAt: deliveryConfirmationDeadline(booking.bookedFor, booking.slot.windowEnd, retryAts).toISOString(),
        failedAttempts: Math.max(0, ...live.map((r) => r.orderItem.failedDeliveryAttempts)),
        retryDeliveryAt: latestRetry?.toISOString() ?? null,
        pendingLateReview: lateSet.has(bookingId),
      });
    }
    acc.card.deliveries.sort((a, b) => a.reference.localeCompare(b.reference));
    const done = acc.card.deliveries.every((d) => d.status === "DELIVERED" || d.status === "CANCELLED" || d.status === "FAILED");
    const checkIn = acc.card.shift.checkedInAt ? { checkedInAt: new Date(acc.card.shift.checkedInAt), late: acc.card.shift.late } : null;
    acc.card.shift = { ...acc.card.shift, ...shiftState(checkIn, new Date(acc.card.shift.endsAt), done, now) };
    result.push(acc.card);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.windowStart.localeCompare(b.windowStart) || a.deliverer.name.localeCompare(b.deliverer.name));
}
