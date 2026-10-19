// services/marketplace/delivery-roster/roster-views.ts
//
// Read models for Admin -> Delivery Roster: the recurring weekly grid (slots x Monday..Sunday, each cell showing the
// template plus its next upcoming occurrence's bookings), and one calendar date resolved with its exceptions and the
// deliveries booked into it. Display only — every write goes through roster-changes.ts / delivery-plans.ts, and
// checkout re-checks capacity inside its own transaction.

import type { DeliveryOperation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { SCHOOL_TIMEZONE } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { WEEKDAY_NAMES, WEEKDAY_NUMBERS, addDays, isoDate, isoWeekday, parseRosterDate, upcomingWeek } from "./shared/roster-calendar";
import { loadDeliverers, loadRosterWindow, type ResolvedOccurrence } from "./roster-resolution";
import { liveOrderWhere, loadOccurrenceUsage, usageKey, type OccurrenceUsage } from "./roster-capacity";
import { dispatchedPlanIds, pickPlannedDeliverer } from "./delivery-plans";
import type { RosterSlot } from "./roster-slots";

export type OccurrenceStatus = "closed" | "full" | "partial" | "available";

export interface PersonRef {
  id: string;
  name: string;
  status: string;
}

export interface OccurrenceView {
  date: string;
  closed: boolean;
  limit: number | null;
  limitSource: ResolvedOccurrence["limitSource"];
  staff: PersonRef[];
  staffSource: ResolvedOccurrence["staffSource"];
  hasException: boolean;
  note: string | null;
  paid: number;
  pending: number;
  booked: number;
  remaining: number | null;
  status: OccurrenceStatus;
  overCapacity: boolean;
}

export function occurrenceStatus(o: { closed: boolean; limit: number | null; booked: number }): OccurrenceStatus {
  if (o.closed) return "closed";
  if (o.limit !== null && o.booked >= o.limit) return "full";
  if (o.booked > 0) return "partial";
  return "available";
}

function toOccurrenceView(date: Date, occ: ResolvedOccurrence, usage: OccurrenceUsage | undefined, people: Map<string, PersonRef>): OccurrenceView {
  const paid = usage?.paid ?? 0;
  const pending = usage?.pending ?? 0;
  const booked = paid + pending;
  return {
    date: isoDate(date),
    closed: occ.closed,
    limit: occ.limit,
    limitSource: occ.limitSource,
    staff: occ.staff.map((id) => people.get(id) ?? { id, name: "Unknown deliverer", status: "UNKNOWN" }),
    staffSource: occ.staffSource,
    hasException: occ.hasException,
    note: occ.note,
    paid,
    pending,
    booked,
    remaining: occ.limit === null ? null : Math.max(0, occ.limit - booked),
    status: occurrenceStatus({ closed: occ.closed, limit: occ.limit, booked }),
    overCapacity: occ.limit !== null && booked > occ.limit,
  };
}

async function eligibleDeliverers(): Promise<PersonRef[]> {
  const rows = await prisma.deliverer.findMany({ where: { status: "APPROVED" }, select: { id: true, firstName: true, lastName: true, status: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] });
  return rows.map((d) => ({ id: d.id, name: `${d.firstName} ${d.lastName}`.trim(), status: d.status }));
}

export interface RosterCellView {
  slotId: string;
  weekday: number;
  // The template: this cell's own limit (null = uses the default) and its weekly staff.
  maxDeliveries: number | null;
  effectiveMax: number | null;
  deliverers: PersonRef[];
  upcoming: OccurrenceView;
}

export interface RosterWeekView {
  operation: DeliveryOperation;
  timezone: string;
  today: string;
  defaultMaxDeliveries: number | null;
  slots: RosterSlot[];
  days: { weekday: number; name: string; date: string }[];
  cells: RosterCellView[];
  deliverers: PersonRef[];
}

export async function getRosterWeek(operation: DeliveryOperation): Promise<RosterWeekView> {
  const today = todayInSchoolTimezone();
  const week = upcomingWeek(today);
  const [window, usage, deliverers] = await Promise.all([
    loadRosterWindow(operation, today, 7),
    loadOccurrenceUsage(operation, today, addDays(today, 6)),
    eligibleDeliverers(),
  ]);
  const slots = window.slots.filter((s) => s.active);

  const ids = new Set<string>();
  for (const slot of slots) {
    for (const w of WEEKDAY_NUMBERS) {
      window.templateStaff(slot.id, w).forEach((id) => ids.add(id));
      window.occurrence(slot.id, week.get(w)!).staff.forEach((id) => ids.add(id));
    }
  }
  const people = new Map(Array.from((await loadDeliverers(ids)).values()).map((p) => [p.id, { id: p.id, name: p.name, status: p.status }]));

  const cells: RosterCellView[] = [];
  for (const slot of slots) {
    for (const weekday of WEEKDAY_NUMBERS) {
      const date = week.get(weekday)!;
      const cellMax = window.cellMax(slot.id, weekday);
      cells.push({
        slotId: slot.id,
        weekday,
        maxDeliveries: cellMax,
        effectiveMax: cellMax ?? window.defaultMax,
        deliverers: window.templateStaff(slot.id, weekday).map((id) => people.get(id) ?? { id, name: "Unknown deliverer", status: "UNKNOWN" }),
        upcoming: toOccurrenceView(date, window.occurrence(slot.id, date), usage.get(usageKey(slot.id, date)), people),
      });
    }
  }

  return {
    operation,
    timezone: SCHOOL_TIMEZONE,
    today: isoDate(today),
    defaultMaxDeliveries: window.defaultMax,
    slots,
    days: WEEKDAY_NUMBERS.map((weekday) => ({ weekday, name: WEEKDAY_NAMES[weekday - 1], date: isoDate(week.get(weekday)!) })),
    cells,
    deliverers,
  };
}

export interface DeliveryRow {
  // Null for a vendor booking made before rosters existed (no plan row yet).
  scheduledDeliveryId: string | null;
  bookingId: string | null;
  orderIds: string[];
  reference: string;
  buyerName: string;
  businessNames: string[];
  paid: boolean;
  dispatched: boolean;
  plannedDeliverer: PersonRef | null;
  planSource: "ROSTER" | "MANUAL" | "SUGGESTED" | null;
  assignedDeliverers: PersonRef[];
}

export interface RosterDateSlotView {
  slot: RosterSlot;
  occurrence: OccurrenceView;
  weekly: { maxDeliveries: number | null; deliverers: PersonRef[] };
  exception: { id: string; closed: boolean; maxDeliveries: number | null; replaceDeliverers: boolean; delivererIds: string[]; note: string | null } | null;
  // VENDOR only: deliverers rostered for this date through the older date-only roster.
  dateRoster: PersonRef[];
  deliveries: DeliveryRow[];
}

export async function getRosterDate(operation: DeliveryOperation, dateStr: unknown) {
  const date = parseRosterDate(dateStr, { forWrite: false });
  const today = todayInSchoolTimezone();
  const [window, usage, deliverers, deliveries] = await Promise.all([
    loadRosterWindow(operation, date, 1),
    loadOccurrenceUsage(operation, date, date),
    eligibleDeliverers(),
    loadDeliveriesOn(operation, date),
  ]);

  const ids = new Set<string>();
  for (const slot of window.slots) {
    window.templateStaff(slot.id, isoWeekday(date)).forEach((id) => ids.add(id));
    window.occurrence(slot.id, date).staff.forEach((id) => ids.add(id));
    window.legacyStaff(slot.id, date).forEach((id) => ids.add(id));
  }
  const people = new Map(Array.from((await loadDeliverers(ids)).values()).map((p) => [p.id, { id: p.id, name: p.name, status: p.status }]));
  const ref = (id: string) => people.get(id) ?? { id, name: "Unknown deliverer", status: "UNKNOWN" };

  // Active slots, plus any retired slot that still has deliveries booked on this date.
  const slots = window.slots.filter((s) => s.active || deliveries.some((d) => d.slotId === s.id));
  return {
    operation,
    date: isoDate(date),
    weekday: isoWeekday(date),
    editable: date.getTime() >= today.getTime(),
    deliverers,
    slots: slots.map<RosterDateSlotView>((slot) => {
      const exception = window.exception(slot.id, date);
      return {
        slot,
        occurrence: toOccurrenceView(date, window.occurrence(slot.id, date), usage.get(usageKey(slot.id, date)), people),
        weekly: { maxDeliveries: window.cellMax(slot.id, isoWeekday(date)), deliverers: window.templateStaff(slot.id, isoWeekday(date)).map(ref) },
        exception: exception
          ? { id: exception.id, closed: exception.closed, maxDeliveries: exception.maxDeliveries, replaceDeliverers: exception.replaceDeliverers, delivererIds: exception.delivererIds, note: exception.note }
          : null,
        dateRoster: window.legacyStaff(slot.id, date).map(ref),
        deliveries: deliveries.filter((d) => d.slotId === slot.id).map((d) => d.row),
      };
    }),
  };
}

// The live deliveries (those taking up capacity) on one date, with their plan and real assignment.
async function loadDeliveriesOn(operation: DeliveryOperation, date: Date): Promise<{ slotId: string; row: DeliveryRow }[]> {
  const live = liveOrderWhere();
  const orderSelect = {
    id: true,
    paystackReference: true,
    paymentStatus: true,
    user: { select: { firstName: true, lastName: true } },
    business: { select: { name: true } },
    items: { select: { deliveryItem: { select: { delivery: { select: { deliverymanId: true } } } } } },
  } as const;

  type Unit = { slotId: string; bookingId: string | null; orders: { id: string; paystackReference: string | null; paymentStatus: string; user: { firstName: string; lastName: string }; business: { name: string }; items: { deliveryItem: { delivery: { deliverymanId: string } } | null }[] }[]; planOrderId: string | null };
  let units: Unit[];
  if (operation === "VENDOR") {
    const bookings = await prisma.vendorDeliveryBooking.findMany({
      where: { bookedFor: date, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, orders: { some: live } },
      select: { id: true, slotId: true, orders: { where: live, select: orderSelect } },
      orderBy: { createdAt: "asc" },
    });
    units = bookings.map((b) => ({ slotId: b.slotId, bookingId: b.id, orders: b.orders, planOrderId: null }));
  } else {
    const scheduled = await prisma.scheduledDelivery.findMany({ where: { operation, date }, select: { orderId: true, slotId: true }, orderBy: { createdAt: "asc" } });
    const orders = await prisma.order.findMany({ where: { id: { in: scheduled.map((s) => s.orderId!) }, ...live }, select: orderSelect });
    const byId = new Map(orders.map((o) => [o.id, o]));
    units = scheduled.filter((s) => byId.has(s.orderId!)).map((s) => ({ slotId: s.slotId, bookingId: null, orders: [byId.get(s.orderId!)!], planOrderId: s.orderId }));
  }
  if (units.length === 0) return [];

  const plans = await prisma.scheduledDelivery.findMany({
    where: operation === "VENDOR" ? { bookingId: { in: units.map((u) => u.bookingId!) } } : { orderId: { in: units.map((u) => u.planOrderId!) } },
  });
  const planOf = (u: Unit) => plans.find((p) => (u.bookingId ? p.bookingId === u.bookingId : p.orderId === u.planOrderId));
  const dispatched = await dispatchedPlanIds(plans);

  // Bookings from before rosters existed get the roster's suggestion (not stored) so the admin sees who's on.
  const window = await loadRosterWindow(operation, date, 1);
  const suggestions = new Map<string, string | null>();
  for (const u of units) {
    if (!planOf(u) && !suggestions.has(u.slotId)) suggestions.set(u.slotId, await pickPlannedDeliverer(operation, u.slotId, date, window.occurrence(u.slotId, date).staff));
  }

  const assigned = (u: Unit) => Array.from(new Set(u.orders.flatMap((o) => o.items.map((i) => i.deliveryItem?.delivery.deliverymanId).filter(Boolean) as string[])));
  const people = await loadDeliverers([...plans.map((p) => p.plannedDelivererId).filter(Boolean) as string[], ...units.flatMap(assigned), ...(Array.from(suggestions.values()).filter(Boolean) as string[])]);
  const ref = (id: string) => {
    const p = people.get(id);
    return p ? { id, name: p.name, status: p.status } : { id, name: "Unknown deliverer", status: "UNKNOWN" };
  };

  return units.map((u) => {
    const plan = planOf(u);
    const plannedId = plan ? plan.plannedDelivererId : (suggestions.get(u.slotId) ?? null);
    const first = u.orders[0];
    return {
      slotId: u.slotId,
      row: {
        scheduledDeliveryId: plan?.id ?? null,
        bookingId: u.bookingId,
        orderIds: u.orders.map((o) => o.id),
        reference: first?.paystackReference ?? "",
        buyerName: first ? `${first.user.firstName} ${first.user.lastName}`.trim() : "",
        businessNames: Array.from(new Set(u.orders.map((o) => o.business.name))),
        paid: u.orders.some((o) => o.paymentStatus === "paid"),
        dispatched: plan ? dispatched.has(plan.id) : u.orders.some((o) => o.items.some((i) => i.deliveryItem)),
        plannedDeliverer: plannedId ? ref(plannedId) : null,
        planSource: plan ? plan.planSource : plannedId ? "SUGGESTED" : null,
        assignedDeliverers: assigned(u).map(ref),
      },
    };
  });
}
