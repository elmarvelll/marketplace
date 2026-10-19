// services/marketplace/delivery-roster/roster-resolution.ts
//
// THE single place that answers "for this operation, slot and calendar date: is it open, how many deliveries may it
// take, and who is working it" — used by the admin calendar, both checkouts, the late-payment re-check, delivery
// planning and the deliverer's own schedule, so none of them can disagree.
//
// Resolution order for one occurrence (operation, slot, date):
//   1. A RosterException for that exact date (date-specific; never changes the template):
//        closed            -> limit 0, whatever else is configured;
//        maxDeliveries     -> that date's limit;
//        replaceDeliverers -> that date's staff is exactly the exception's list.
//   2. Otherwise the recurring template for the date's weekday:
//        limit = RosterSlotDay.maxDeliveries, else DeliveryRosterSettings.defaultMaxDeliveries, else no limit;
//        staff = RosterAssignment rows for (slot, weekday) — plus, for VENDOR only, any date-specific
//                public."DelivererRosterAssignment" rows (the roster that existed before the weekly template; AkadVerse
//                may still write it), so nobody already rostered for a date silently disappears.
// "No limit" (null) is the default everywhere, so nothing changes for either operation until an admin sets a limit.
// The limit counts deliveries, never people: assigning more staff never raises it, and raising it never requires staff.

import type { DeliveryOperation, RosterException } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Db } from "@/services/marketplace/order/shared/db";
import { addDays, isoDate, isoWeekday } from "./shared/roster-calendar";
import { listRosterSlots, type RosterSlot } from "./roster-slots";

export type ExceptionLike = Pick<RosterException, "closed" | "maxDeliveries" | "replaceDeliverers" | "delivererIds" | "note">;

export interface OccurrenceInputs {
  templateStaff: string[];
  legacyStaff: string[];
  exception: ExceptionLike | null;
  // RosterSlotDay.maxDeliveries for (slot, weekday); null when the cell has no limit of its own.
  cellMax: number | null;
  defaultMax: number | null;
}

export interface ResolvedOccurrence {
  closed: boolean;
  // The enforced delivery limit; 0 when closed; null = no limit.
  limit: number | null;
  limitSource: "closed" | "exception" | "weekly" | "default" | "none";
  staff: string[];
  staffSource: "exception" | "weekly";
  hasException: boolean;
  note: string | null;
}

export function decideOccurrence(inputs: OccurrenceInputs): ResolvedOccurrence {
  const { exception } = inputs;
  const staff = exception?.replaceDeliverers ? [...exception.delivererIds] : Array.from(new Set([...inputs.templateStaff, ...inputs.legacyStaff]));
  const staffSource = exception?.replaceDeliverers ? "exception" : "weekly";
  const base = { staff, staffSource, hasException: Boolean(exception), note: exception?.note ?? null } as const;
  if (exception?.closed) return { ...base, closed: true, limit: 0, limitSource: "closed" };
  if (exception && exception.maxDeliveries !== null) return { ...base, closed: false, limit: exception.maxDeliveries, limitSource: "exception" };
  if (inputs.cellMax !== null) return { ...base, closed: false, limit: inputs.cellMax, limitSource: "weekly" };
  if (inputs.defaultMax !== null) return { ...base, closed: false, limit: inputs.defaultMax, limitSource: "default" };
  return { ...base, closed: false, limit: null, limitSource: "none" };
}

const key = (slotId: string, date: Date | string) => `${slotId}|${typeof date === "string" ? date : isoDate(date)}`;
const cellKey = (slotId: string, weekday: number) => `${slotId}|${weekday}`;

export interface RosterWindow {
  operation: DeliveryOperation;
  dates: Date[];
  // Every slot of the operation, inactive ones included (a delivery booked into a slot that was later retired still
  // resolves). Callers that build new bookings or the calendar filter on `active`.
  slots: RosterSlot[];
  defaultMax: number | null;
  inputs(slotId: string, date: Date): OccurrenceInputs;
  occurrence(slotId: string, date: Date): ResolvedOccurrence;
  // The template itself, independent of any date.
  templateStaff(slotId: string, weekday: number): string[];
  cellMax(slotId: string, weekday: number): number | null;
  exception(slotId: string, date: Date): (ExceptionLike & { id: string }) | null;
  legacyStaff(slotId: string, date: Date): string[];
}

// Batched: a fixed handful of queries however many dates and slots are involved. Accepts a transaction client so
// checkout can resolve inside its own transaction.
export async function loadRosterWindow(operation: DeliveryOperation, from: Date, days: number, db: Db = prisma, { slotId }: { slotId?: string } = {}): Promise<RosterWindow> {
  const dates = Array.from({ length: Math.max(1, days) }, (_, i) => addDays(from, i));
  const to = dates[dates.length - 1];
  const slotFilter = slotId ? { slotId } : {};

  const [slots, settings, cells, assignments, exceptions, legacy] = await Promise.all([
    listRosterSlots(operation, db, { includeInactive: true }),
    db.deliveryRosterSettings.findUnique({ where: { operation } }),
    db.rosterSlotDay.findMany({ where: { operation, ...slotFilter } }),
    db.rosterAssignment.findMany({ where: { operation, ...slotFilter }, orderBy: { createdAt: "asc" } }),
    db.rosterException.findMany({ where: { operation, ...slotFilter, date: { gte: from, lte: to } } }),
    operation === "VENDOR"
      ? db.delivererRosterAssignment.findMany({
          where: { ...slotFilter, date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
          select: { slotId: true, date: true, delivererId: true },
          orderBy: { assignedAt: "asc" },
        })
      : Promise.resolve([] as { slotId: string; date: Date; delivererId: string }[]),
  ]);

  const defaultMax = settings?.defaultMaxDeliveries ?? null;
  const cellMaxBy = new Map(cells.map((c) => [cellKey(c.slotId, c.weekday), c.maxDeliveries]));
  const templateBy = new Map<string, string[]>();
  for (const a of assignments) templateBy.set(cellKey(a.slotId, a.weekday), [...(templateBy.get(cellKey(a.slotId, a.weekday)) ?? []), a.delivererId]);
  const exceptionBy = new Map(exceptions.map((e) => [key(e.slotId, e.date), e]));
  const legacyBy = new Map<string, string[]>();
  for (const l of legacy) legacyBy.set(key(l.slotId, l.date), [...(legacyBy.get(key(l.slotId, l.date)) ?? []), l.delivererId]);

  const window: RosterWindow = {
    operation,
    dates,
    slots,
    defaultMax,
    templateStaff: (s, weekday) => templateBy.get(cellKey(s, weekday)) ?? [],
    cellMax: (s, weekday) => cellMaxBy.get(cellKey(s, weekday)) ?? null,
    exception: (s, date) => exceptionBy.get(key(s, date)) ?? null,
    legacyStaff: (s, date) => legacyBy.get(key(s, date)) ?? [],
    inputs: (s, date) => ({
      templateStaff: window.templateStaff(s, isoWeekday(date)),
      legacyStaff: window.legacyStaff(s, date),
      exception: window.exception(s, date),
      cellMax: window.cellMax(s, isoWeekday(date)),
      defaultMax,
    }),
    occurrence: (s, date) => decideOccurrence(window.inputs(s, date)),
  };
  return window;
}

export async function resolveOccurrence(operation: DeliveryOperation, slotId: string, date: Date, db: Db = prisma): Promise<ResolvedOccurrence> {
  const window = await loadRosterWindow(operation, date, 1, db, { slotId });
  return window.occurrence(slotId, date);
}

export interface DelivererSummary {
  id: string;
  name: string;
  status: string;
  userId: string;
}

export async function loadDeliverers(ids: Iterable<string>, db: Db = prisma): Promise<Map<string, DelivererSummary>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map();
  const rows = await db.deliverer.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true, status: true, userId: true } });
  return new Map(rows.map((d) => [d.id, { id: d.id, name: `${d.firstName} ${d.lastName}`.trim(), status: d.status, userId: d.userId }]));
}

// Eligibility for being planned onto a delivery: an APPROVED deliverer (suspended/rejected/pending ones stay visible on
// the roster, flagged, but are never planned).
export async function approvedStaff(staff: string[], db: Db = prisma): Promise<string[]> {
  if (staff.length === 0) return [];
  const approved = await db.deliverer.findMany({ where: { id: { in: staff }, status: "APPROVED" }, select: { id: true } });
  const ok = new Set(approved.map((d) => d.id));
  return staff.filter((id) => ok.has(id));
}
