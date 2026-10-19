// services/marketplace/delivery-roster/delivery-plans.ts
//
// A delivery's plan: its slot occurrence and the deliverer the roster says should take it (ScheduledDelivery). The plan
// is a starting point for the EXISTING assignment flow (assign-delivery.ts creates the real Delivery/DeliveryItem and
// the pickup OTP) — it never replaces it, and nothing here notifies anyone or changes an order's status.
//
// Policy — when a plan may change:
//   - At booking: planned from the resolved roster (planSource ROSTER).
//   - When an admin changes the roster or a date's exception: only ROSTER plans for live, not-yet-dispatched
//     deliveries on today or later are candidates, and only after the admin explicitly chooses "re-plan" for that
//     change (roster-changes.ts). Choosing "keep" leaves them as they are.
//   - MANUAL plans (an admin picked the deliverer for that delivery) are never changed automatically.
//   - Once dispatched (any item has a DeliveryItem — assigned, picked up, out for delivery, delivered...), a plan is
//     frozen; the actual assignment lives in Delivery/DeliveryItem and is mirrored here by syncPlansToAssignment.

import type { DeliveryOperation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/service-error";
import type { Db } from "@/services/marketplace/order/shared/db";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";
import { approvedStaff, loadRosterWindow, resolveOccurrence } from "./roster-resolution";
import { isoDate } from "./shared/roster-calendar";

// Least-loaded approved deliverer among the occurrence's staff (ties keep roster order); null when nobody eligible is
// rostered — the delivery is still booked (staffing never gates customers), and the calendar shows it as unassigned.
export async function pickPlannedDeliverer(operation: DeliveryOperation, slotId: string, date: Date, staff: string[], db: Db = prisma): Promise<string | null> {
  const eligible = await approvedStaff(staff, db);
  if (eligible.length === 0) return null;
  const loads = await db.scheduledDelivery.groupBy({
    by: ["plannedDelivererId"],
    where: { operation, slotId, date, plannedDelivererId: { in: eligible } },
    _count: { _all: true },
  });
  const load = new Map(loads.map((l) => [l.plannedDelivererId!, l._count._all]));
  let best: string | null = null;
  let bestLoad = Infinity;
  for (const id of eligible) {
    const n = load.get(id) ?? 0;
    if (n < bestLoad) {
      best = id;
      bestLoad = n;
    }
  }
  return best;
}

export async function createScheduledDelivery(
  tx: Prisma.TransactionClient,
  params: { operation: DeliveryOperation; orderId?: string; bookingId?: string; slotId: string; date: Date; staff: string[] }
) {
  const plannedDelivererId = await pickPlannedDeliverer(params.operation, params.slotId, params.date, params.staff, tx);
  return tx.scheduledDelivery.create({
    data: {
      operation: params.operation,
      orderId: params.orderId ?? null,
      bookingId: params.bookingId ?? null,
      slotId: params.slotId,
      date: params.date,
      plannedDelivererId,
      planSource: "ROSTER",
      plannedAt: plannedDelivererId ? new Date() : null,
    },
  });
}

// Which plans are frozen because the delivery is already in the real assignment flow.
export async function dispatchedPlanIds(plans: { id: string; operation: DeliveryOperation; orderId: string | null; bookingId: string | null }[], db: Db = prisma): Promise<Set<string>> {
  const orderIds = plans.filter((p) => p.orderId).map((p) => p.orderId!);
  const bookingIds = plans.filter((p) => p.bookingId).map((p) => p.bookingId!);
  if (orderIds.length === 0 && bookingIds.length === 0) return new Set();
  const items = await db.orderItem.findMany({
    where: {
      deliveryStatus: { not: null },
      OR: [...(orderIds.length ? [{ orderId: { in: orderIds } }] : []), ...(bookingIds.length ? [{ order: { vendorDeliveryBookingId: { in: bookingIds } } }] : [])],
    },
    select: { orderId: true, order: { select: { vendorDeliveryBookingId: true } } },
  });
  const dispatchedOrders = new Set(items.map((i) => i.orderId));
  const dispatchedBookings = new Set(items.map((i) => i.order.vendorDeliveryBookingId).filter(Boolean) as string[]);
  return new Set(plans.filter((p) => (p.orderId && dispatchedOrders.has(p.orderId)) || (p.bookingId && dispatchedBookings.has(p.bookingId))).map((p) => p.id));
}

// Admin sets (or clears) the planned deliverer of one delivery by hand. `bookingId` covers a vendor booking made
// before rosters existed (no plan row yet) — its row is created from the booking's own slot/date.
export async function setPlannedDeliverer(params: { scheduledDeliveryId?: unknown; bookingId?: unknown; delivererId?: unknown }, adminUserId: string) {
  const delivererId = params.delivererId === null || params.delivererId === "" ? null : params.delivererId;
  if (delivererId !== null && typeof delivererId !== "string") throw badRequest("delivererId must be a deliverer id or null.");
  if (delivererId) {
    const deliverer = await prisma.deliverer.findUnique({ where: { id: delivererId }, select: { status: true } });
    if (!deliverer || deliverer.status !== "APPROVED") throw badRequest("Deliverer not found or not approved.");
  }

  let plan;
  if (typeof params.scheduledDeliveryId === "string" && params.scheduledDeliveryId) {
    plan = await prisma.scheduledDelivery.findUnique({ where: { id: params.scheduledDeliveryId } });
    if (!plan) throw notFound("Scheduled delivery not found.");
  } else if (typeof params.bookingId === "string" && params.bookingId) {
    plan = await prisma.scheduledDelivery.findUnique({ where: { bookingId: params.bookingId } });
    if (!plan) {
      const booking = await prisma.vendorDeliveryBooking.findUnique({ where: { id: params.bookingId }, select: { id: true, slotId: true, bookedFor: true, status: true } });
      if (!booking || booking.status === "CANCELLED") throw notFound("Booking not found.");
      plan = await prisma.scheduledDelivery.create({ data: { operation: "VENDOR", bookingId: booking.id, slotId: booking.slotId, date: booking.bookedFor } });
    }
  } else {
    throw badRequest("scheduledDeliveryId or bookingId is required.");
  }

  if ((await dispatchedPlanIds([plan])).has(plan.id)) {
    throw conflict("This delivery has already been assigned to a deliverer — change it from Assign deliveries instead.");
  }

  const updated = await prisma.scheduledDelivery.update({
    where: { id: plan.id },
    data: { plannedDelivererId: delivererId, planSource: "MANUAL", plannedBy: adminUserId, plannedAt: new Date() },
  });
  await logAdminAction({
    adminId: adminUserId,
    action: "DELIVERY_PLAN_SET",
    targetType: "scheduled_delivery",
    targetId: plan.id,
    message: `${plan.operation} ${isoDate(plan.date)} deliverer=${delivererId ?? "none"}`,
  });
  return updated;
}

// Called by assign-delivery.ts inside its transaction: once items are really assigned, each affected delivery's plan
// records who actually has it (MANUAL when the coordinator chose someone other than the plan), so the calendar never
// shows a stale planned deliverer for a dispatched delivery.
export async function syncPlansToAssignment(tx: Prisma.TransactionClient, orderIds: string[], delivererId: string, adminUserId: string) {
  if (orderIds.length === 0) return;
  const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, vendorDeliveryBookingId: true } });
  const bookingIds = orders.map((o) => o.vendorDeliveryBookingId).filter(Boolean) as string[];
  const now = new Date();
  await tx.scheduledDelivery.updateMany({
    where: {
      OR: [{ orderId: { in: orderIds } }, ...(bookingIds.length ? [{ bookingId: { in: bookingIds } }] : [])],
      NOT: { plannedDelivererId: delivererId },
    },
    data: { plannedDelivererId: delivererId, planSource: "MANUAL", plannedBy: adminUserId, plannedAt: now },
  });
}

export interface OrderPlan {
  scheduledDeliveryId: string | null;
  delivererId: string | null;
  source: "ROSTER" | "MANUAL" | "SUGGESTED";
  slotId: string;
  date: string;
}

// The plan for each order (Business: by order; Vendor: by its booking). A vendor booking from before rosters existed
// has no plan row: its roster SUGGESTION is resolved on the fly (not stored) so the coordinator still sees who's on.
export async function plansForOrders(orders: { id: string; vendorDeliveryBookingId: string | null; booking?: { slotId: string; bookedFor: Date } | null }[], db: Db = prisma): Promise<Map<string, OrderPlan>> {
  const result = new Map<string, OrderPlan>();
  if (orders.length === 0) return result;
  const bookingIds = orders.map((o) => o.vendorDeliveryBookingId).filter(Boolean) as string[];
  const plans = await db.scheduledDelivery.findMany({
    where: { OR: [{ orderId: { in: orders.map((o) => o.id) } }, ...(bookingIds.length ? [{ bookingId: { in: bookingIds } }] : [])] },
  });
  const byOrder = new Map(plans.filter((p) => p.orderId).map((p) => [p.orderId!, p]));
  const byBooking = new Map(plans.filter((p) => p.bookingId).map((p) => [p.bookingId!, p]));

  for (const order of orders) {
    const plan = byOrder.get(order.id) ?? (order.vendorDeliveryBookingId ? byBooking.get(order.vendorDeliveryBookingId) : undefined);
    if (plan) {
      result.set(order.id, { scheduledDeliveryId: plan.id, delivererId: plan.plannedDelivererId, source: plan.planSource, slotId: plan.slotId, date: isoDate(plan.date) });
    } else if (order.booking) {
      const occurrence = await resolveOccurrence("VENDOR", order.booking.slotId, order.booking.bookedFor, db);
      const suggested = await pickPlannedDeliverer("VENDOR", order.booking.slotId, order.booking.bookedFor, occurrence.staff, db);
      result.set(order.id, { scheduledDeliveryId: null, delivererId: suggested, source: "SUGGESTED", slotId: order.booking.slotId, date: isoDate(order.booking.bookedFor) });
    }
  }
  return result;
}

// Re-plans the given ROSTER plans against the roster as it is NOW (call after the roster change has been written, in
// the same transaction). Spreads them across the occurrence's staff by load as it goes.
export async function replanDeliveries(tx: Prisma.TransactionClient, operation: DeliveryOperation, planIds: string[]): Promise<number> {
  if (planIds.length === 0) return 0;
  const plans = await tx.scheduledDelivery.findMany({ where: { id: { in: planIds }, operation, planSource: "ROSTER" }, orderBy: { createdAt: "asc" } });
  const dates = plans.map((p) => p.date.getTime());
  const from = new Date(Math.min(...dates));
  const days = Math.round((Math.max(...dates) - from.getTime()) / 86_400_000) + 1;
  const window = await loadRosterWindow(operation, from, days, tx);
  // Plans being moved away still count toward their old deliverer's load in the DB until updated; clear them first so
  // the spread is computed on what remains.
  await tx.scheduledDelivery.updateMany({ where: { id: { in: plans.map((p) => p.id) } }, data: { plannedDelivererId: null } });
  for (const plan of plans) {
    const staff = window.occurrence(plan.slotId, plan.date).staff;
    const next = await pickPlannedDeliverer(operation, plan.slotId, plan.date, staff, tx);
    await tx.scheduledDelivery.update({ where: { id: plan.id }, data: { plannedDelivererId: next, plannedAt: next ? new Date() : null } });
  }
  return plans.length;
}
