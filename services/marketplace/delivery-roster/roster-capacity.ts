// services/marketplace/delivery-roster/roster-capacity.ts
//
// How many deliveries already take up a slot occurrence — the ONE counting rule, used by the admin calendar (display)
// and by both checkouts and the late-payment re-check (enforcement), so the number an admin sees is the number checkout
// enforces. Counted from live order state every time, never a stored counter, so a cancellation, rejection, refund or
// expired payment frees the capacity automatically without any reconciliation step.
//
// What one "delivery" is:
//   VENDOR      -> one VendorDeliveryBooking (one checkout = one drop to one buyer, however many vendors it spans —
//                  the unit the booking model was designed around).
//   MARKETPLACE -> one Business Order with a ScheduledDelivery row.
//
// A delivery reserves capacity while ALL of these hold for at least one of its orders:
//   - payment: paid, or still pending inside its checkout reservation window (RESERVATION_TTL_MINUTES) — the same rule
//     vendor capacity already uses, so an abandoned/failed/expired checkout stops counting as soon as it lapses;
//   - Order.status is PENDING_SELLER or ACCEPTED (a REJECTED, auto-rejected or CANCELLED order releases it);
//   - at least one of its items is still live: not rejected, not cancelled (e.g. after two failed delivery attempts),
//     not refunded (vendor "couldn't fulfil", admin item refund).
// A delivered order keeps counting: it used that occurrence. Vendor bookings must also be PENDING_PAYMENT/CONFIRMED.

import type { DeliveryOperation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Db } from "@/services/marketplace/order/shared/db";
import { ORDER_PAYMENT_STATUS, PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";
import { liveReservationCutoff } from "@/services/marketplace/checkout/shared/checkout-payment-config";
import { isoDate } from "./shared/roster-calendar";

export const LIVE_ITEM: Prisma.OrderItemWhereInput = {
  rejectedAt: null,
  cancelledAt: null,
  escrowStatus: { notIn: ["REFUND_PENDING", "REFUNDED"] },
};

export function liveOrderWhere(now: Date = new Date()): Prisma.OrderWhereInput {
  return {
    status: { in: ["PENDING_SELLER", "ACCEPTED"] },
    OR: [PAID_ORDER, { paymentStatus: ORDER_PAYMENT_STATUS.PENDING, createdAt: { gt: liveReservationCutoff(now) } }],
    items: { some: LIVE_ITEM },
  };
}

export interface OccurrenceUsage {
  // Paid deliveries, and unpaid checkouts still inside their reservation window.
  paid: number;
  pending: number;
}

export const usageKey = (slotId: string, date: Date) => `${slotId}|${isoDate(date)}`;
export const usedOf = (usage: OccurrenceUsage | undefined) => (usage ? usage.paid + usage.pending : 0);

interface UsageOptions {
  slotId?: string;
  // Leave one checkout out of the count (the late-payment re-check asks "is there room for THIS checkout").
  excludeReference?: string;
  now?: Date;
}

export async function loadOccurrenceUsage(operation: DeliveryOperation, from: Date, to: Date, db: Db = prisma, { slotId, excludeReference, now = new Date() }: UsageOptions = {}): Promise<Map<string, OccurrenceUsage>> {
  const usage = new Map<string, OccurrenceUsage>();
  const add = (k: string, paid: boolean) => {
    const u = usage.get(k) ?? { paid: 0, pending: 0 };
    if (paid) u.paid += 1;
    else u.pending += 1;
    usage.set(k, u);
  };

  if (operation === "VENDOR") {
    const bookings = await db.vendorDeliveryBooking.findMany({
      where: {
        ...(slotId ? { slotId } : {}),
        bookedFor: { gte: from, lte: to },
        status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
        orders: { some: liveOrderWhere(now) },
        ...(excludeReference ? { NOT: { paystackReference: excludeReference } } : {}),
      },
      select: { slotId: true, bookedFor: true, status: true },
    });
    for (const b of bookings) add(usageKey(b.slotId, b.bookedFor), b.status === "CONFIRMED");
    return usage;
  }

  const scheduled = await db.scheduledDelivery.findMany({
    where: { operation: "MARKETPLACE", ...(slotId ? { slotId } : {}), date: { gte: from, lte: to } },
    select: { orderId: true, slotId: true, date: true },
  });
  if (scheduled.length === 0) return usage;
  const orders = await db.order.findMany({
    where: {
      id: { in: scheduled.map((s) => s.orderId!) },
      ...liveOrderWhere(now),
      ...(excludeReference ? { NOT: { paystackReference: excludeReference } } : {}),
    },
    select: { id: true, paymentStatus: true },
  });
  const live = new Map(orders.map((o) => [o.id, o.paymentStatus === ORDER_PAYMENT_STATUS.PAID]));
  for (const s of scheduled) {
    const paid = live.get(s.orderId!);
    if (paid !== undefined) add(usageKey(s.slotId, s.date), paid);
  }
  return usage;
}

export async function countReservedDeliveries(operation: DeliveryOperation, slotId: string, date: Date, db: Db = prisma, options: Omit<UsageOptions, "slotId"> = {}): Promise<number> {
  const usage = await loadOccurrenceUsage(operation, date, date, db, { ...options, slotId });
  return usedOf(usage.get(usageKey(slotId, date)));
}

// Serializes everything that books central (MARKETPLACE) deliveries: the Business checkout runs at READ COMMITTED, so
// "count, then insert" is only safe if two checkouts can't interleave. A transaction-scoped advisory lock (released at
// commit/rollback, works through a transaction-mode pooler) makes the second checkout wait, then count again — it
// sees the first one's row. Vendor checkout doesn't need it: it already runs SERIALIZABLE, where Postgres aborts one
// of two conflicting bookings (and the checkout retries) instead.
const LOCK_IDS: Record<DeliveryOperation, number> = { MARKETPLACE: 0x6d6b7201, VENDOR: 0x6d6b7202 };

export async function lockRosterOperation(tx: Prisma.TransactionClient, operation: DeliveryOperation): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_IDS[operation]}::bigint)`;
}
