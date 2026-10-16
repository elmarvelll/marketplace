// services/marketplace/vendor/capacity/manage-vendor-capacity.ts
//
// A vendor's own "Set Product Deliveries Per Time Range" configuration —
// see VendorTimeframeCapacity's schema comment and
// docs/marketplace/decisions/vendor-independent-architecture.md for why
// this is completely independent of VendorDeliverySlot.delivererCapacity
// (admin's deliverer-roster capacity). Owner-scoped via
// requireOwnedBusiness, same pattern as
// services/marketplace/vendor/side/side.service.ts. Called by
// src/app/api/marketplace/vendor/[id]/capacity/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/service-error";
import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";
import { MAX_SCHEDULE_CONFIG_DAYS, parseAndValidateDeliveryDate } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { isVendorDeliveryDate } from "./vendor-delivery-schedule";
import type { Db } from "@/services/marketplace/order/shared/db";
import { ORDER_PAYMENT_STATUS, PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";
import { liveReservationCutoff } from "@/services/marketplace/checkout/shared/checkout-payment-config";

export interface VendorCapacityRow {
  slotId: string;
  slotLabel: string;
  windowStart: string;
  windowEnd: string;
  // The default/recurring capacity (VendorTimeframeCapacity) — always
  // shown so the vendor can tell "this date is on the default" apart from
  // "this date has its own override."
  defaultCapacity: number;
  // Non-null only when a VendorTimeframeCapacityOverride exists for the
  // requested date.
  overrideCapacity: number | null;
  // defaultCapacity, unless overrideCapacity is set — what checkout
  // actually enforces for this slot/date (spec §7).
  capacity: number;
  // Everything consuming capacity for this slot/date (= paid + reserved).
  booked: number;
  // Paid orders vs. unpaid checkouts still inside their reservation window.
  paid: number;
  reserved: number;
  // False when the vendor doesn't deliver on this date at all (weekly rule
  // or a date override) — checkout then enforces 0 whatever `capacity` says.
  dateAvailable: boolean;
}

// Lists every active slot, this vendor's configured capacity for it on the
// requested date (spec §7 — date-specific capacity), and that date's live
// booked count so the vendor's own dashboard can show remaining capacity
// without a second round trip. Defaults to today when no date is given.
export async function listVendorCapacity(businessId: string, dateStr?: string): Promise<{ rows: VendorCapacityRow[]; date: string }> {
  await requireOwnedVendor(businessId);

  const bookedFor = parseAndValidateDeliveryDate(dateStr, new Date(), MAX_SCHEDULE_CONFIG_DAYS);
  const dateAvailable = await isVendorDeliveryDate(businessId, bookedFor);
  const [slots, defaults, overrides] = await Promise.all([
    prisma.vendorDeliverySlot.findMany({ where: { active: true }, orderBy: { windowStart: "asc" } }),
    prisma.vendorTimeframeCapacity.findMany({ where: { businessId } }),
    prisma.vendorTimeframeCapacityOverride.findMany({ where: { businessId, date: bookedFor } }),
  ]);
  const defaultBySlot = new Map(defaults.map((c) => [c.slotId, c.capacity]));
  const overrideBySlot = new Map(overrides.map((c) => [c.slotId, c.capacity]));

  // Small, fixed number of active slots (3 by default) — one count query
  // per slot is simpler and safer than resolving Order -> booking -> slot
  // through a groupBy, since Order has no slotId column of its own.
  const rows = await Promise.all(
    slots.map(async (slot) => {
      const { paid, reserved } = await countVendorBookingsBreakdown(businessId, slot.id, bookedFor);
      const booked = paid + reserved;
      const defaultCapacity = defaultBySlot.get(slot.id) ?? 0;
      const overrideCapacity = overrideBySlot.get(slot.id) ?? null;
      return {
        slotId: slot.id,
        slotLabel: slot.label,
        windowStart: slot.windowStart,
        windowEnd: slot.windowEnd,
        defaultCapacity,
        overrideCapacity,
        capacity: overrideCapacity ?? defaultCapacity,
        booked,
        paid,
        reserved,
        dateAvailable,
      };
    })
  );

  return { rows, date: bookedFor.toISOString().slice(0, 10) };
}

// The single place that counts "how many orders has this vendor already
// booked for this slot/date" — both the read-only capacity display above
// and the authoritative booking-transaction check in
// create-vendor-orders-for-checkout.ts call this, so the two can never
// drift apart. Accepts an optional Prisma transaction client so the
// booking transaction can call it with the same connection/isolation
// level it's already running under.
//
// What consumes capacity (one unit per vendor Order, unchanged): a PAID
// order, or an unpaid one whose checkout reservation is still live (created
// less than RESERVATION_TTL_MINUTES ago, booking not cancelled). An abandoned,
// failed, or expired checkout therefore stops counting as soon as its
// reservation lapses — even before the reconciler gets to it — instead of
// permanently eating the vendor's capacity as it did before.
export async function countVendorBookingsForSlot(
  businessId: string,
  slotId: string,
  bookedFor: Date,
  db: Db = prisma,
  { excludeReference, now = new Date() }: { excludeReference?: string; now?: Date } = {}
): Promise<number> {
  return db.order.count({
    where: {
      businessId,
      vendorDeliveryBooking: { slotId, bookedFor, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
      OR: [PAID_ORDER, { paymentStatus: ORDER_PAYMENT_STATUS.PENDING, createdAt: { gt: liveReservationCutoff(now) } }],
      ...(excludeReference ? { NOT: { paystackReference: excludeReference } } : {}),
    },
  });
}

// Paid vs. still-reserved split of the same count, for the vendor's own
// capacity dashboard ("3 paid, 1 awaiting payment").
export async function countVendorBookingsBreakdown(businessId: string, slotId: string, bookedFor: Date, now: Date = new Date()) {
  const base = { businessId, vendorDeliveryBooking: { slotId, bookedFor, status: { in: ["PENDING_PAYMENT" as const, "CONFIRMED" as const] } } };
  const [paid, reserved] = await Promise.all([
    prisma.order.count({ where: { ...base, ...PAID_ORDER } }),
    prisma.order.count({ where: { ...base, paymentStatus: ORDER_PAYMENT_STATUS.PENDING, createdAt: { gt: liveReservationCutoff(now) } } }),
  ]);
  return { paid, reserved };
}

// dateStr present -> upserts a date-specific VendorTimeframeCapacityOverride
// (spec §7). dateStr absent -> upserts the default/recurring
// VendorTimeframeCapacity row, same behavior as before date-specific
// capacity existed. "Today" is never implicitly treated as an override —
// callers pass a date explicitly only when they mean to override it.
export async function upsertVendorCapacity(businessId: string, slotId: string, capacity: number, dateStr?: string) {
  await requireOwnedVendor(businessId);

  if (!Number.isInteger(capacity) || capacity < 0) {
    throw badRequest("Capacity must be a non-negative integer.");
  }
  const slot = await prisma.vendorDeliverySlot.findUnique({ where: { id: slotId } });
  if (!slot || !slot.active) throw badRequest("Delivery slot not found.");

  if (dateStr) {
    const date = parseAndValidateDeliveryDate(dateStr, new Date(), MAX_SCHEDULE_CONFIG_DAYS);
    return prisma.vendorTimeframeCapacityOverride.upsert({
      where: { businessId_slotId_date: { businessId, slotId, date } },
      update: { capacity },
      create: { businessId, slotId, date, capacity },
    });
  }

  return prisma.vendorTimeframeCapacity.upsert({
    where: { businessId_slotId: { businessId, slotId } },
    update: { capacity },
    create: { businessId, slotId, capacity },
  });
}

// Removes one date's capacity override for a slot, so that date goes back to
// the recurring default — the counterpart to "change one date without
// changing the default".
export async function clearVendorCapacityOverride(businessId: string, slotId: string, dateStr: string) {
  await requireOwnedVendor(businessId);
  const date = parseAndValidateDeliveryDate(dateStr, new Date(), MAX_SCHEDULE_CONFIG_DAYS);
  await prisma.vendorTimeframeCapacityOverride.deleteMany({ where: { businessId, slotId, date } });
}
