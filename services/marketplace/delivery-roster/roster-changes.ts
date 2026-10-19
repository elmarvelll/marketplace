// services/marketplace/delivery-roster/roster-changes.ts
//
// Every admin write to a roster goes through applyRosterChange: a weekly cell (staff + limit), a date-specific
// exception, restoring a date to the weekly roster, or the operation's default limit. Each one is checked against the
// deliveries already booked from today through IMPACT_HORIZON_DAYS, inside the same transaction as the write:
//
//   over capacity  — the change would leave an occurrence with more booked deliveries than its new limit (including
//                    closing it). Those deliveries are KEPT (never dropped, moved or cancelled); new bookings stop until
//                    it's back under the limit. Requires acknowledgeOverCapacity: true.
//   re-plans       — live, not-yet-dispatched deliveries planned FROM THE ROSTER whose planned deliverer is no longer
//                    on that occurrence's staff (or that had nobody and now could). Requires planResolution:
//                    "replan" (re-plan them to the new roster) or "keep" (leave their planned deliverer as is).
//   manual/frozen  — deliveries an admin planned by hand or that are already dispatched: listed for information,
//                    never changed.
//
// Without the required decision the write is refused (409) — the server enforces it, not just the UI, which calls
// previewRosterChange first to show the admin exactly what's affected. Every write is audited in AdminActionLog.

import type { DeliveryOperation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict } from "@/lib/service-error";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { todayInSchoolTimezone } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import type { Db } from "@/services/marketplace/order/shared/db";
import {
  IMPACT_HORIZON_DAYS,
  WEEKDAY_NAMES,
  addDays,
  formatSlotDate,
  isoDate,
  isoWeekday,
  parseMaxDeliveries,
  parseRosterDate,
  parseWeekday,
} from "./shared/roster-calendar";
import { decideOccurrence, loadDeliverers, loadRosterWindow, type OccurrenceInputs, type ResolvedOccurrence, type RosterWindow } from "./roster-resolution";
import { loadOccurrenceUsage, liveOrderWhere, usageKey, usedOf } from "./roster-capacity";
import { dispatchedPlanIds, replanDeliveries } from "./delivery-plans";
import { requireRosterSlot, type RosterSlot } from "./roster-slots";

export type RosterChange =
  | { kind: "cell"; slotId: string; weekday: number; delivererIds: string[]; maxDeliveries: number | null }
  | { kind: "exception"; slotId: string; date: Date; closed: boolean; maxDeliveries: number | null; replaceDeliverers: boolean; delivererIds: string[]; note: string | null }
  | { kind: "clear-exception"; slotId: string; date: Date }
  | { kind: "default"; defaultMaxDeliveries: number | null };

export interface RosterImpact {
  overCapacity: { slotId: string; slotLabel: string; date: string; booked: number; newLimit: number }[];
  replans: { scheduledDeliveryId: string; slotLabel: string; date: string; plannedDeliverer: string | null }[];
  unchanged: { scheduledDeliveryId: string; slotLabel: string; date: string; plannedDeliverer: string | null; reason: "manual" | "dispatched" }[];
}

export interface ChangeDecision {
  planResolution?: "replan" | "keep";
  acknowledgeOverCapacity?: boolean;
}

// ---- input parsing (nothing from the browser is trusted as-is) -------------------------------------------------------

function parseIdList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !v.trim())) throw badRequest(`${field} must be a list of deliverer ids.`);
  return Array.from(new Set(value as string[]));
}

export function parseRosterChange(body: Record<string, unknown>): RosterChange {
  switch (body.kind) {
    case "cell":
      return {
        kind: "cell",
        slotId: String(body.slotId ?? ""),
        weekday: parseWeekday(body.weekday),
        delivererIds: parseIdList(body.delivererIds, "delivererIds"),
        maxDeliveries: parseMaxDeliveries(body.maxDeliveries),
      };
    case "exception": {
      const closed = body.closed === true;
      const replaceDeliverers = body.replaceDeliverers === true;
      const maxDeliveries = closed ? null : parseMaxDeliveries(body.maxDeliveries);
      if (!closed && !replaceDeliverers && maxDeliveries === null) {
        throw badRequest("An exception must close the slot, set that date's limit, or replace its deliverers. To go back to the weekly roster, restore it instead.");
      }
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
      return {
        kind: "exception",
        slotId: String(body.slotId ?? ""),
        date: parseRosterDate(body.date, { forWrite: true }),
        closed,
        maxDeliveries,
        replaceDeliverers,
        delivererIds: replaceDeliverers ? parseIdList(body.delivererIds, "delivererIds") : [],
        note,
      };
    }
    case "clear-exception":
      return { kind: "clear-exception", slotId: String(body.slotId ?? ""), date: parseRosterDate(body.date, { forWrite: true }) };
    case "default":
      return { kind: "default", defaultMaxDeliveries: parseMaxDeliveries(body.defaultMaxDeliveries, "defaultMaxDeliveries") };
    default:
      throw badRequest('kind must be "cell", "exception", "clear-exception" or "default".');
  }
}

// Deliverers being ADDED must be approved; ones already on the roster that were since suspended may stay (shown
// flagged, never planned). Staff can't exceed the slot's positions.
async function validateStaff(db: Db, slot: RosterSlot, next: string[], current: string[]) {
  const added = next.filter((id) => !current.includes(id));
  if (added.length > 0) {
    const ok = await db.deliverer.findMany({ where: { id: { in: added }, status: "APPROVED" }, select: { id: true } });
    if (ok.length !== added.length) throw badRequest("Only approved deliverers can be added to the roster.");
  }
  if (next.length > slot.staffPositions) {
    throw badRequest(`${slot.label} has ${slot.staffPositions} deliverer position(s); remove someone or raise its positions first.`);
  }
}

// ---- impact -----------------------------------------------------------------------------------------------------------

// The occurrences a change touches, and their inputs after it.
function touched(change: RosterChange, window: RosterWindow): { slotId: string; date: Date; after: OccurrenceInputs }[] {
  const out: { slotId: string; date: Date; after: OccurrenceInputs }[] = [];
  for (const date of window.dates) {
    for (const slot of window.slots) {
      const before = window.inputs(slot.id, date);
      if (change.kind === "default") {
        out.push({ slotId: slot.id, date, after: { ...before, defaultMax: change.defaultMaxDeliveries } });
      } else if (slot.id !== change.slotId) {
        continue;
      } else if (change.kind === "cell" && isoWeekday(date) === change.weekday) {
        out.push({ slotId: slot.id, date, after: { ...before, templateStaff: change.delivererIds, cellMax: change.maxDeliveries } });
      } else if (change.kind === "exception" && isoDate(date) === isoDate(change.date)) {
        const exception = { closed: change.closed, maxDeliveries: change.maxDeliveries, replaceDeliverers: change.replaceDeliverers, delivererIds: change.delivererIds, note: change.note };
        out.push({ slotId: slot.id, date, after: { ...before, exception } });
      } else if (change.kind === "clear-exception" && isoDate(date) === isoDate(change.date)) {
        out.push({ slotId: slot.id, date, after: { ...before, exception: null } });
      }
    }
  }
  return out;
}

const stricter = (after: ResolvedOccurrence, before: ResolvedOccurrence) => after.limit !== null && (before.limit === null || after.limit < before.limit);
const sameStaff = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

export async function computeRosterImpact(operation: DeliveryOperation, change: RosterChange, db: Db = prisma): Promise<RosterImpact> {
  const today = todayInSchoolTimezone();
  const to = addDays(today, IMPACT_HORIZON_DAYS - 1);
  const [window, usage] = await Promise.all([loadRosterWindow(operation, today, IMPACT_HORIZON_DAYS, db), loadOccurrenceUsage(operation, today, to, db)]);
  const labelOf = new Map(window.slots.map((s) => [s.id, s.label]));
  const impact: RosterImpact = { overCapacity: [], replans: [], unchanged: [] };

  const changed = touched(change, window).map((t) => ({ ...t, before: window.occurrence(t.slotId, t.date), afterResolved: decideOccurrence(t.after) }));

  for (const c of changed) {
    const booked = usedOf(usage.get(usageKey(c.slotId, c.date)));
    if (booked > 0 && stricter(c.afterResolved, c.before) && booked > c.afterResolved.limit!) {
      impact.overCapacity.push({ slotId: c.slotId, slotLabel: labelOf.get(c.slotId) ?? "", date: isoDate(c.date), booked, newLimit: c.afterResolved.limit! });
    }
  }

  const staffChanged = changed.filter((c) => !sameStaff(c.before.staff, c.afterResolved.staff));
  if (staffChanged.length === 0) return impact;
  const plans = await db.scheduledDelivery.findMany({
    where: { operation, OR: staffChanged.map((c) => ({ slotId: c.slotId, date: c.date })) },
    orderBy: { createdAt: "asc" },
  });
  if (plans.length === 0) return impact;
  const live = await livePlanIds(operation, plans, db);
  const dispatched = await dispatchedPlanIds(plans, db);
  const afterBy = new Map(staffChanged.map((c) => [usageKey(c.slotId, c.date), c.afterResolved.staff]));
  const names = await loadDeliverers(plans.map((p) => p.plannedDelivererId).filter(Boolean) as string[], db);
  const approvedAfter = new Set(
    (await db.deliverer.findMany({ where: { id: { in: staffChanged.flatMap((c) => c.afterResolved.staff) }, status: "APPROVED" }, select: { id: true } })).map((d) => d.id)
  );

  for (const plan of plans) {
    if (!live.has(plan.id)) continue;
    const staffAfter = (afterBy.get(usageKey(plan.slotId, plan.date)) ?? []).filter((id) => approvedAfter.has(id));
    const offRoster = plan.plannedDelivererId ? !staffAfter.includes(plan.plannedDelivererId) : staffAfter.length > 0;
    if (!offRoster) continue;
    const row = { scheduledDeliveryId: plan.id, slotLabel: labelOf.get(plan.slotId) ?? "", date: isoDate(plan.date), plannedDeliverer: plan.plannedDelivererId ? (names.get(plan.plannedDelivererId)?.name ?? "Unknown deliverer") : null };
    if (dispatched.has(plan.id)) impact.unchanged.push({ ...row, reason: "dispatched" });
    else if (plan.planSource === "MANUAL") impact.unchanged.push({ ...row, reason: "manual" });
    else impact.replans.push(row);
  }
  return impact;
}

// Plans whose delivery still takes up capacity (a cancelled/expired one is never re-planned or reported).
async function livePlanIds(operation: DeliveryOperation, plans: { id: string; orderId: string | null; bookingId: string | null }[], db: Db): Promise<Set<string>> {
  const where = liveOrderWhere();
  if (operation === "MARKETPLACE") {
    const orders = await db.order.findMany({ where: { id: { in: plans.map((p) => p.orderId!) }, ...where }, select: { id: true } });
    const ok = new Set(orders.map((o) => o.id));
    return new Set(plans.filter((p) => ok.has(p.orderId!)).map((p) => p.id));
  }
  const bookings = await db.vendorDeliveryBooking.findMany({
    where: { id: { in: plans.map((p) => p.bookingId!) }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, orders: { some: where } },
    select: { id: true },
  });
  const ok = new Set(bookings.map((b) => b.id));
  return new Set(plans.filter((p) => ok.has(p.bookingId!)).map((p) => p.id));
}

export async function previewRosterChange(operation: DeliveryOperation, change: RosterChange): Promise<RosterImpact> {
  if (change.kind !== "default") await requireRosterSlot(operation, change.slotId, prisma, { mustBeActive: change.kind === "cell" });
  return computeRosterImpact(operation, change);
}

// ---- apply ------------------------------------------------------------------------------------------------------------

interface StaffDelta {
  added: string[];
  removed: string[];
  slot: RosterSlot;
  weekday?: number;
  date?: Date;
}

export async function applyRosterChange(operation: DeliveryOperation, change: RosterChange, adminUserId: string, decision: ChangeDecision = {}) {
  const result = await prisma.$transaction(
    async (tx) => {
      // One admin roster write per operation at a time, so two admins can't each pass the impact check on a state the
      // other is changing.
      await lockAdminRoster(tx, operation);
      const slot = change.kind === "default" ? null : await requireRosterSlot(operation, change.slotId, tx, { mustBeActive: change.kind === "cell" });

      const impact = await computeRosterImpact(operation, change, tx);
      if (impact.overCapacity.length > 0 && decision.acknowledgeOverCapacity !== true) {
        throw conflict(
          `${impact.overCapacity.length} upcoming slot occurrence(s) already have more deliveries booked than this change allows. ` +
            "Confirm to keep those deliveries (nothing is cancelled) and stop new bookings until they're under the limit."
        );
      }
      if (impact.replans.length > 0 && decision.planResolution !== "replan" && decision.planResolution !== "keep") {
        throw conflict(`This change affects ${impact.replans.length} planned delivery(ies). Choose whether to re-plan them to the updated roster or keep their current deliverer.`);
      }

      const delta = await writeChange(tx, operation, change, slot, adminUserId);
      const replanned = decision.planResolution === "replan" ? await replanDeliveries(tx, operation, impact.replans.map((r) => r.scheduledDeliveryId)) : 0;

      await tx.adminActionLog.create({
        data: {
          adminId: adminUserId,
          action: `ROSTER_${change.kind.toUpperCase().replace("-", "_")}`,
          targetType: "delivery_roster",
          targetId: slot ? `${operation}:${slot.id}` : operation,
          message: describeChange(operation, change, slot, impact, decision, replanned),
        },
      });
      return { impact, replanned, delta };
    },
    { maxWait: 10000, timeout: 20000 }
  );

  if (result.delta) await notifyStaffChange(operation, result.delta, change);
  return { impact: result.impact, replanned: result.replanned };
}

async function lockAdminRoster(tx: Prisma.TransactionClient, operation: DeliveryOperation) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${operation === "MARKETPLACE" ? 0x6d6b7211 : 0x6d6b7212}::bigint)`;
}

async function writeChange(tx: Prisma.TransactionClient, operation: DeliveryOperation, change: RosterChange, slot: RosterSlot | null, adminUserId: string): Promise<StaffDelta | null> {
  if (change.kind === "default") {
    await tx.deliveryRosterSettings.upsert({
      where: { operation },
      update: { defaultMaxDeliveries: change.defaultMaxDeliveries, updatedBy: adminUserId },
      create: { operation, defaultMaxDeliveries: change.defaultMaxDeliveries, updatedBy: adminUserId },
    });
    return null;
  }
  slot = slot!;

  if (change.kind === "cell") {
    const current = (await tx.rosterAssignment.findMany({ where: { operation, slotId: slot.id, weekday: change.weekday }, select: { delivererId: true } })).map((a) => a.delivererId);
    await validateStaff(tx, slot, change.delivererIds, current);
    const added = change.delivererIds.filter((id) => !current.includes(id));
    const removed = current.filter((id) => !change.delivererIds.includes(id));
    if (removed.length > 0) await tx.rosterAssignment.deleteMany({ where: { operation, slotId: slot.id, weekday: change.weekday, delivererId: { in: removed } } });
    for (const delivererId of added) {
      await tx.rosterAssignment.create({ data: { operation, slotId: slot.id, weekday: change.weekday, delivererId, createdBy: adminUserId } });
    }
    if (change.maxDeliveries === null) {
      await tx.rosterSlotDay.deleteMany({ where: { operation, slotId: slot.id, weekday: change.weekday } });
    } else {
      await tx.rosterSlotDay.upsert({
        where: { operation_slotId_weekday: { operation, slotId: slot.id, weekday: change.weekday } },
        update: { maxDeliveries: change.maxDeliveries, updatedBy: adminUserId },
        create: { operation, slotId: slot.id, weekday: change.weekday, maxDeliveries: change.maxDeliveries, updatedBy: adminUserId },
      });
    }
    return { added, removed, slot, weekday: change.weekday };
  }

  const window = await loadRosterWindow(operation, change.date, 1, tx, { slotId: slot.id });
  const before = window.occurrence(slot.id, change.date).staff;

  if (change.kind === "clear-exception") {
    await tx.rosterException.deleteMany({ where: { operation, slotId: slot.id, date: change.date } });
  } else {
    if (change.replaceDeliverers) await validateStaff(tx, slot, change.delivererIds, before);
    const data = {
      closed: change.closed,
      maxDeliveries: change.maxDeliveries,
      replaceDeliverers: change.replaceDeliverers,
      delivererIds: change.delivererIds,
      note: change.note,
      updatedBy: adminUserId,
    };
    await tx.rosterException.upsert({
      where: { operation_slotId_date: { operation, slotId: slot.id, date: change.date } },
      update: data,
      create: { ...data, operation, slotId: slot.id, date: change.date, createdBy: adminUserId },
    });
  }
  const after = (await loadRosterWindow(operation, change.date, 1, tx, { slotId: slot.id })).occurrence(slot.id, change.date);
  // A closed occurrence needs nobody, so everyone who was due is told.
  const afterStaff = after.closed ? [] : after.staff;
  return { added: afterStaff.filter((id) => !before.includes(id)), removed: before.filter((id) => !afterStaff.includes(id)), slot, date: change.date };
}

function describeChange(operation: DeliveryOperation, change: RosterChange, slot: RosterSlot | null, impact: RosterImpact, decision: ChangeDecision, replanned: number) {
  const where = change.kind === "default" ? operation : change.kind === "cell" ? `${slot!.label} every ${WEEKDAY_NAMES[change.weekday - 1]}` : `${slot!.label} on ${isoDate(change.date)}`;
  const what =
    change.kind === "default"
      ? `default limit=${change.defaultMaxDeliveries ?? "none"}`
      : change.kind === "cell"
        ? `deliverers=[${change.delivererIds.join(",")}] limit=${change.maxDeliveries ?? "default"}`
        : change.kind === "exception"
          ? `closed=${change.closed} limit=${change.maxDeliveries ?? "weekly"} replace=${change.replaceDeliverers ? `[${change.delivererIds.join(",")}]` : "no"}${change.note ? ` note="${change.note}"` : ""}`
          : "restored to weekly roster";
  const effects = [
    impact.overCapacity.length ? `over-capacity acknowledged for ${impact.overCapacity.length} occurrence(s)` : "",
    impact.replans.length ? `${impact.replans.length} planned delivery(ies): ${decision.planResolution === "replan" ? `re-planned ${replanned}` : "kept"}` : "",
  ].filter(Boolean);
  return `${operation} ${where}: ${what}${effects.length ? `; ${effects.join("; ")}` : ""}`;
}

async function notifyStaffChange(operation: DeliveryOperation, delta: StaffDelta, change: RosterChange) {
  const people = await loadDeliverers([...delta.added, ...delta.removed]);
  const service = operation === "MARKETPLACE" ? "Marketplace deliveries" : "Vendor deliveries";
  const when = delta.weekday ? `every ${WEEKDAY_NAMES[delta.weekday - 1]}` : `on ${formatSlotDate(delta.date!)}`;
  const closed = change.kind === "exception" && change.closed;
  for (const [ids, added] of [
    [delta.added, true],
    [delta.removed, false],
  ] as const) {
    for (const id of ids) {
      const person = people.get(id);
      if (!person) continue;
      try {
        await createNotification({
          recipientId: person.userId,
          type: added ? "ROSTER_ASSIGNED" : "ROSTER_CANCELLED",
          title: added ? "You're on the delivery roster" : closed ? "Delivery slot closed" : "Roster change",
          message: added
            ? `You're scheduled for ${service}, ${delta.slot.label}, ${when}.`
            : closed
              ? `${service}, ${delta.slot.label} ${when} is closed — you're not needed.`
              : `You're no longer scheduled for ${service}, ${delta.slot.label}, ${when}.`,
          targetUrl: "/deliverer",
        });
      } catch (err) {
        // The roster change is already committed; a failed bell notification must not undo or fail it.
        console.error("[roster] deliverer notification failed", err);
      }
    }
  }
}
