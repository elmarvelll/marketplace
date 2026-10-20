// services/marketplace/vendor-delivery/slot-briefing.ts
//
// The pre-slot operation for Vendor Market deliveries. From two hours before
// each slot starts (the same moment new orders close — is-slot-bookable.ts),
// and until the slot ends:
//
//   1. assign every paid, unassigned delivery of that slot occurrence to the
//      deliverer the roster planned for it (assign-planned.ts, unchanged
//      rules — anything with no eligible planned deliverer is left for an
//      admin and reported as unassigned);
//   2. brief every admin (the vendor managers) once: bookings, vendor orders,
//      excluded unpaid checkouts, deliverers, capacity, unassigned items;
//   3. brief each assigned deliverer once: counts, pickup points and the
//      meeting point where an admin checks them in — their delivery card
//      (manifest.ts) holds the rest.
//
// And after each slot ends: any shift nobody checked in is MISSED
// (handover/shift.ts) — admins and the deliverer are told once.
//
// Exactly-once per (slot occurrence, recipient): a SlotBriefingNotice row is
// claimed BEFORE sending (unique index), and deleted again only if the send
// itself fails, so the next run retries it. Running this every few minutes —
// or from two schedulers at once — therefore never double-notifies. A
// deliverer assigned later (by an admin) is briefed on the next run.
//
// Triggered by GET /api/cron/vendor-slot-briefing (an external scheduler —
// see README "Scheduled jobs"). Nothing about checkout depends on it: the
// two-hour cutoff is enforced by the checkout backend itself.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { READY_ITEM_WHERE } from "@/services/marketplace/delivery/shared/ready-item-filter";
import { assignPlannedDeliveries } from "@/services/marketplace/delivery-roster/assign-planned";
import { resolveOccurrence } from "@/services/marketplace/delivery-roster/roster-resolution";
import { countReservedDeliveries } from "@/services/marketplace/delivery-roster/roster-capacity";
import { addDays, isoDate } from "@/services/marketplace/delivery-roster/shared/roster-calendar";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { appUrl, delivererSlotBriefingEmail, escapeHtml, getAdminEmail, sendEmailWithResult } from "@/services/marketplace/notifications/email.service";
import { MIN_ORDER_CUTOFF_MINS, schoolTimeToInstant } from "./is-slot-bookable";
import { todayInSchoolTimezone } from "./validate-delivery-date";
import { buildVendorManifests } from "./handover/manifest";

// Recorded as the actor of automatic assignments (order events, plans).
export const SLOT_BRIEFING_ACTOR = "system:slot-briefing";
export const BRIEFING_LEAD_MINS = MIN_ORDER_CUTOFF_MINS;

const dayLabel = new Intl.DateTimeFormat("en-NG", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export interface SlotBriefingSummary {
  date: string;
  slotId: string;
  slotLabel: string;
  confirmedBookings: number;
  vendorOrders: number;
  awaitingPayment: number;
  cancelledOrders: number;
  limit: number | null;
  // Places taken against the limit (paid + still-held checkouts), as the roster counts them.
  reservedPlaces: number;
  closed: boolean;
  deliverers: string[];
  unassignedItems: number;
  newlyAssignedItems: number;
}

export interface SlotBriefingRun {
  occurrences: (SlotBriefingSummary & { adminsNotified: number; deliverersNotified: number })[];
  missedShiftNotices: number;
}

// Slot occurrences (today and tomorrow, school time) whose briefing window is open now.
export async function dueOccurrences(now: Date = new Date()) {
  const slots = await prisma.vendorDeliverySlot.findMany({ where: { active: true }, select: { id: true, label: true, windowStart: true, windowEnd: true } });
  const today = todayInSchoolTimezone(now);
  const due: { slot: (typeof slots)[number]; date: Date }[] = [];
  for (const date of [today, addDays(today, 1)]) {
    for (const slot of slots) {
      const start = schoolTimeToInstant(date, slot.windowStart);
      const end = schoolTimeToInstant(date, slot.windowEnd);
      if (now.getTime() >= start.getTime() - BRIEFING_LEAD_MINS * 60_000 && now < end) due.push({ slot, date });
    }
  }
  return due;
}

// Claims a notice; false if it was already sent (or is being sent) by another run.
async function claim(slotId: string, date: Date, recipientKey: string): Promise<boolean> {
  try {
    await prisma.slotBriefingNotice.create({ data: { operation: "VENDOR", slotId, date, recipientKey } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

async function release(slotId: string, date: Date, recipientKey: string) {
  await prisma.slotBriefingNotice.deleteMany({ where: { operation: "VENDOR", slotId, date, recipientKey } });
}

async function sendOnce(slotId: string, date: Date, recipientKey: string, send: () => Promise<void>): Promise<boolean> {
  if (!(await claim(slotId, date, recipientKey))) return false;
  try {
    await send();
    return true;
  } catch (err) {
    await release(slotId, date, recipientKey);
    console.error(`[slot-briefing] ${recipientKey} for ${slotId} on ${isoDate(date)} failed; will retry next run:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function summarizeOccurrence(slot: { id: string; label: string }, date: Date, newlyAssignedItems = 0): Promise<SlotBriefingSummary> {
  const [bookings, occurrence, reserved, unassignedItems, manifests] = await Promise.all([
    prisma.vendorDeliveryBooking.findMany({
      where: { slotId: slot.id, bookedFor: date, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
      select: { status: true, orders: { select: { status: true, paymentStatus: true } } },
    }),
    resolveOccurrence("VENDOR", slot.id, date),
    countReservedDeliveries("VENDOR", slot.id, date),
    prisma.orderItem.count({ where: { ...READY_ITEM_WHERE, order: { vendorDeliveryBooking: { slotId: slot.id, bookedFor: date } } } }),
    buildVendorManifests({ dates: [date] }),
  ]);
  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");
  const confirmedOrders = confirmed.flatMap((b) => b.orders);
  return {
    date: isoDate(date),
    slotId: slot.id,
    slotLabel: slot.label,
    confirmedBookings: confirmed.length,
    vendorOrders: confirmedOrders.filter((o) => o.status !== "CANCELLED").length,
    awaitingPayment: bookings.filter((b) => b.status === "PENDING_PAYMENT").length,
    cancelledOrders: confirmedOrders.filter((o) => o.status === "CANCELLED").length,
    limit: occurrence.limit,
    closed: occurrence.closed,
    deliverers: manifests.filter((m) => m.slotId === slot.id).map((m) => m.deliverer.name),
    unassignedItems,
    newlyAssignedItems,
    reservedPlaces: reserved,
  };
}

function adminMessage(s: SlotBriefingSummary): string {
  const parts = [
    `${s.confirmedBookings} student deliver${s.confirmedBookings === 1 ? "y" : "ies"} (${s.vendorOrders} vendor order${s.vendorOrders === 1 ? "" : "s"})`,
    s.limit === null ? "no delivery limit" : `limit ${s.limit}, ${Math.max(0, s.limit - s.reservedPlaces)} left`,
    s.deliverers.length > 0 ? `deliverers: ${s.deliverers.join(", ")}` : "no deliverer assigned yet",
  ];
  if (s.awaitingPayment > 0) parts.push(`${s.awaitingPayment} checkout(s) still awaiting payment (not counted)`);
  if (s.cancelledOrders > 0) parts.push(`${s.cancelledOrders} cancelled order(s) excluded`);
  if (s.unassignedItems > 0) parts.push(`⚠ ${s.unassignedItems} item(s) still need a deliverer`);
  return parts.join(" · ") + ".";
}

// Slot occurrences that ended within the last day — checked for missed shifts.
export async function recentlyEndedOccurrences(now: Date = new Date()) {
  const slots = await prisma.vendorDeliverySlot.findMany({ where: { active: true }, select: { id: true, label: true, windowStart: true, windowEnd: true } });
  const today = todayInSchoolTimezone(now);
  const ended: { slot: (typeof slots)[number]; date: Date }[] = [];
  for (const date of [addDays(today, -1), today]) {
    for (const slot of slots) {
      const end = schoolTimeToInstant(date, slot.windowEnd);
      if (now >= end && now.getTime() < end.getTime() + 24 * 60 * 60_000) ended.push({ slot, date });
    }
  }
  return ended;
}

// A shift nobody checked in by the slot's end is MISSED (shift.ts). Tell the
// admins (its deliveries need reassigning or the shift unlocking) and the
// deliverer — once each.
async function notifyMissedShifts(now: Date): Promise<number> {
  let notified = 0;
  for (const { slot, date } of await recentlyEndedOccurrences(now)) {
    const missed = (await buildVendorManifests({ dates: [date] })).filter((c) => c.slotId === slot.id && c.shift.state === "MISSED" && !c.shift.unlocked);
    if (missed.length === 0) continue;
    const people = await prisma.deliverer.findMany({ where: { id: { in: missed.map((c) => c.deliverer.id) } }, select: { id: true, userId: true } });
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    for (const card of missed) {
      const open = card.deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length;
      const title = `${dayLabel.format(date)} ${slot.label}: ${card.deliverer.name} missed their shift`;
      for (const admin of admins) {
        const sent = await sendOnce(slot.id, date, `missed:${card.deliverer.id}:admin:${admin.id}`, async () => {
          await createNotification({
            recipientId: admin.id,
            scope: "ADMIN",
            type: "VENDOR_SHIFT_MISSED",
            title,
            message: `They weren't checked in before the slot ended. ${open} deliver${open === 1 ? "y" : "ies"} still open — reassign them or unlock the shift.`,
            targetUrl: `/admin/delivery-operations?date=${isoDate(date)}`,
          });
        });
        if (sent) notified += 1;
      }
      const person = people.find((p) => p.id === card.deliverer.id);
      if (person) {
        await sendOnce(slot.id, date, `missed:${card.deliverer.id}`, async () => {
          await createNotification({
            recipientId: person.userId,
            type: "DELIVERER_SHIFT_MISSED",
            title: `Missed shift: ${dayLabel.format(date)} ${slot.label}`,
            message: "You weren't checked in at the meeting point before this slot ended, so the shift was recorded as missed. Contact the Marketplace admin.",
            targetUrl: "/deliverer",
          });
        });
      }
    }
  }
  return notified;
}

// Assigns one occurrence's paid, unassigned deliveries to their planned
// deliverers. Serialized per occurrence by a short-lived lock row (unique
// index), because it runs both from the scheduled job and whenever a
// deliverer or admin opens their dashboard: two overlapping runs could
// otherwise each pick up the same "ready" items. A lock left by a crashed
// run expires after 2 minutes. Returns how many items it assigned.
const ASSIGN_LOCK = "lock:auto-assign";
const ASSIGN_LOCK_STALE_MS = 2 * 60_000;

async function assignOccurrence(slotId: string, date: Date): Promise<number> {
  await prisma.slotBriefingNotice.deleteMany({
    where: { operation: "VENDOR", slotId, date, recipientKey: ASSIGN_LOCK, sentAt: { lt: new Date(Date.now() - ASSIGN_LOCK_STALE_MS) } },
  });
  if (!(await claim(slotId, date, ASSIGN_LOCK))) return 0; // another run is assigning this occurrence right now
  try {
    const ready = await prisma.orderItem.findMany({
      where: { ...READY_ITEM_WHERE, order: { vendorDeliveryBooking: { slotId, bookedFor: date } } },
      select: { id: true },
    });
    if (ready.length === 0) return 0;
    const result = await assignPlannedDeliveries(ready.map((r) => r.id), SLOT_BRIEFING_ACTOR);
    return result.assigned.reduce((sum, a) => sum + a.itemCount, 0);
  } catch (err) {
    console.error(`[slot-briefing] auto-assign for ${slotId} on ${isoDate(date)} failed:`, err instanceof Error ? err.message : err);
    return 0;
  } finally {
    await release(slotId, date, ASSIGN_LOCK);
  }
}

// The assignment step on its own, for every occurrence inside its two-hour
// window — called when a deliverer or admin opens their dashboard, so their
// cards are complete from the two-hour mark even if the scheduled job is
// late. Sends no briefings (the job does that). Never throws.
export async function assignDueDeliveries(now: Date = new Date()): Promise<number> {
  try {
    let total = 0;
    for (const { slot, date } of await dueOccurrences(now)) total += await assignOccurrence(slot.id, date);
    return total;
  } catch (err) {
    console.error("[slot-briefing] on-demand auto-assign failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function runSlotBriefings(now: Date = new Date()): Promise<SlotBriefingRun> {
  const run: SlotBriefingRun = { occurrences: [], missedShiftNotices: 0 };
  for (const { slot, date } of await dueOccurrences(now)) {
    // 1. Auto-assign planned deliveries (idempotent: assigned items are no longer "ready").
    const newlyAssigned = await assignOccurrence(slot.id, date);

    const summary = await summarizeOccurrence(slot, date, newlyAssigned);
    let adminsNotified = 0;
    let deliverersNotified = 0;
    if (summary.confirmedBookings === 0 && summary.awaitingPayment === 0) {
      run.occurrences.push({ ...summary, adminsNotified, deliverersNotified });
      continue; // nothing to operate
    }

    // 2. Admins (vendor managers).
    const title = `${dayLabel.format(date)} ${slot.label}: Vendor deliveries in 2 hours`;
    const message = adminMessage(summary);
    const link = `/admin/delivery-operations?date=${summary.date}`;
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    for (const admin of admins) {
      const sent = await sendOnce(slot.id, date, `admin:${admin.id}`, async () => {
        await createNotification({ recipientId: admin.id, scope: "ADMIN", type: "VENDOR_SLOT_BRIEFING", title, message, targetUrl: link });
      });
      if (sent) adminsNotified += 1;
    }
    const adminEmail = getAdminEmail();
    if (adminEmail) {
      await sendOnce(slot.id, date, "admin-email", async () => {
        const res = await sendEmailWithResult({ to: adminEmail, type: "admin_slot_briefing", subject: title, html: `<p>${escapeHtml(message)}</p><p><a href="${appUrl(link)}">Open delivery operations</a></p>` });
        if (!res.ok) throw new Error(res.error);
      });
    }

    // 3. Each assigned deliverer, about their own card only.
    const cards = (await buildVendorManifests({ dates: [date] })).filter((c) => c.slotId === slot.id);
    const people = await prisma.deliverer.findMany({ where: { id: { in: cards.map((c) => c.deliverer.id) } }, select: { id: true, userId: true, email: true, firstName: true } });
    for (const card of cards) {
      const person = people.find((p) => p.id === card.deliverer.id);
      if (!person) continue;
      const active = card.deliveries.filter((d) => d.status !== "CANCELLED");
      if (active.length === 0) continue;
      const sent = await sendOnce(slot.id, date, `deliverer:${person.id}`, async () => {
        await createNotification({
          recipientId: person.userId,
          type: "DELIVERER_SLOT_BRIEFING",
          title: `${dayLabel.format(date)} ${slot.label}: your delivery card is ready`,
          message: `${active.length} student deliver${active.length === 1 ? "y" : "ies"} from ${card.pickups.length} vendor${card.pickups.length === 1 ? "" : "s"}. Report to ${card.meetingPoint ?? "the meeting point"} by ${card.arriveBy} to be checked in.`,
          targetUrl: "/deliverer",
        });
        const res = await sendEmailWithResult({
          to: person.email,
          ...delivererSlotBriefingEmail({
            delivererName: person.firstName,
            deliveryDate: dayLabel.format(date),
            slotLabel: slot.label,
            arriveBy: card.arriveBy,
            meetingPoint: card.meetingPoint,
            studentDeliveries: active.length,
            vendorPickups: card.pickups.map((p) => ({ name: p.name, location: p.location })),
          }),
        });
        if (!res.ok) console.warn(`[slot-briefing] deliverer email to ${person.id} not sent: ${res.error}`); // in-app notice already delivered
      });
      if (sent) deliverersNotified += 1;
    }

    run.occurrences.push({ ...summary, adminsNotified, deliverersNotified });
  }
  run.missedShiftNotices = await notifyMissedShifts(now);
  return run;
}
