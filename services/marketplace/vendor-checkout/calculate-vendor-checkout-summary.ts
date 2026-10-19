// services/marketplace/vendor-checkout/calculate-vendor-checkout-summary.ts
//
// The Vendor checkout page's preview — cart contents, fee breakdown, and
// every active delivery slot with live capacity/bookability. Purely a
// preview: nothing here reserves a slot or commits inventory (see
// docs/marketplace/decisions/vendor-independent-architecture.md — cart/
// checkout is never a reservation). Called by
// src/app/api/marketplace/vendor-checkout/summary/route.controller.ts.
//
// Slot "capacity"/"booked" here reflect each VENDOR represented in the
// cart's own VendorTimeframeCapacity — never
// VendorDeliverySlot.delivererCapacity (that's the admin deliverer-roster
// system, unrelated to whether a customer can book — see the decision doc
// above). A slot is only bookable for this cart if every distinct vendor
// in the cart still has room in it; the numbers shown are the bottleneck
// vendor's remaining capacity, so the UI's "N spot(s) left" always matches
// what create-vendor-orders-for-checkout.ts will actually enforce.
// The Vendor Market delivery roster's operation-wide limit (closed dates,
// max deliveries per timeframe occurrence — services/marketplace/delivery-roster/)
// is folded in the same way: when it's the tighter of the two, its numbers
// are the ones shown.

import { prisma } from "@/lib/prisma";
import { getVendorCartForUser } from "@/services/marketplace/vendor-cart/get-vendor-cart-for-user";
import { getMarketplaceSettings } from "@/services/marketplace/admin/shared/marketplace-settings";
import { isSlotBookable } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { MAX_ADVANCE_BOOKING_DAYS, todayInSchoolTimezone as schoolToday, parseAndValidateDeliveryDate } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { countVendorBookingsForSlot } from "@/services/marketplace/vendor/capacity/manage-vendor-capacity";
import { resolveVendorCapacity } from "@/services/marketplace/vendor/capacity/resolve-vendor-capacity";
import { loadVendorScheduleWindow } from "@/services/marketplace/vendor/capacity/vendor-delivery-schedule";
import { calculateVendorFees, type VendorFeeBreakdown } from "./shared/vendor-fees";
import { loadRosterWindow } from "@/services/marketplace/delivery-roster/roster-resolution";
import { loadOccurrenceUsage, usageKey, usedOf } from "@/services/marketplace/delivery-roster/roster-capacity";
import { addDays } from "@/services/marketplace/delivery-roster/shared/roster-calendar";
import type { VendorCartLineItem } from "@/types/vendor-cart";

export interface VendorSlotAvailability {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  capacity: number;
  booked: number;
  bookable: boolean;
}

export interface VendorCheckoutSummary {
  items: VendorCartLineItem[];
  fees: VendorFeeBreakdown;
  slots: VendorSlotAvailability[];
  // The calendar date these slots' capacity/booked numbers were computed
  // against — echoes back whatever was requested (or today, if none was),
  // so the frontend can confirm it's showing the date it asked for.
  date: string;
  // Every date in the booking window, flagged with whether it can actually
  // be chosen: every vendor in the cart delivers that day AND at least one
  // timeframe still has capacity and hasn't passed its cutoff. The date
  // picker offers only `selectable` dates. Display only — initialize
  // re-validates the chosen date and capacity inside its own transaction.
  dates: VendorDateAvailability[];
}

export interface VendorDateAvailability {
  date: string; // YYYY-MM-DD
  selectable: boolean;
  reason: "ok" | "not_delivering" | "fully_booked" | "closed_for_today";
}

// Re-exported for existing callers (create-vendor-orders-for-checkout.ts)
// — the canonical implementation now lives in validate-delivery-date.ts,
// alongside the date-parsing/validation it's used for.
export { schoolToday as todayInSchoolTimezone };

export async function calculateVendorCheckoutSummary(userId: string, dateStr?: string): Promise<VendorCheckoutSummary> {
  // Empty cart is a valid, displayable summary state (zero everything) —
  // not an error, same convention as get-checkout-summary.ts.
  const items = await getVendorCartForUser(userId);

  const settings = await getMarketplaceSettings();
  const fees = calculateVendorFees(items, settings);

  // Never trusts the client's date blindly — same validation the booking
  // transaction itself will re-run (spec §6/§28). Defaults to today when
  // the customer hasn't picked one yet (initial page load).
  const bookedFor = parseAndValidateDeliveryDate(dateStr);
  const slotRows = await prisma.vendorDeliverySlot.findMany({ where: { active: true }, orderBy: { windowStart: "asc" } });
  const businessIds = Array.from(new Set(items.map((item) => item.businessId)));

  // The roster limit for every timeframe on every date in the booking
  // window — batched, a fixed number of queries.
  const now = new Date();
  const windowStart = schoolToday(now);
  const windowDays = MAX_ADVANCE_BOOKING_DAYS + 1;
  const [roster, rosterUsage] = await Promise.all([
    loadRosterWindow("VENDOR", windowStart, windowDays),
    loadOccurrenceUsage("VENDOR", windowStart, addDays(windowStart, windowDays - 1), undefined, { now }),
  ]);
  const rosterRoom = (slotId: string, date: Date) => {
    const occurrence = roster.occurrence(slotId, date);
    const booked = usedOf(rosterUsage.get(usageKey(slotId, date)));
    const remaining = occurrence.limit === null ? Infinity : occurrence.limit - booked;
    return { limit: occurrence.limit, booked, remaining };
  };

  const slots: VendorSlotAvailability[] = await Promise.all(
    slotRows.map(async (slot) => {
      const room = rosterRoom(slot.id, bookedFor);
      if (businessIds.length === 0) {
        // Nothing in the cart yet to check vendor capacity for — bookability
        // is the time cutoff and the roster limit; vendor capacity numbers
        // are meaningless until a vendor is actually selected.
        return {
          id: slot.id,
          label: slot.label,
          windowStart: slot.windowStart,
          windowEnd: slot.windowEnd,
          capacity: room.limit ?? 0,
          booked: room.limit === null ? 0 : room.booked,
          bookable: room.remaining > 0 && isSlotBookable(slot, new Date(), bookedFor),
        };
      }

      // The bottleneck vendor determines both the displayed numbers and
      // overall bookability — matches create-vendor-orders-for-checkout.ts's
      // per-vendor gate exactly — unless the roster limit is tighter still.
      let minRemaining = room.remaining;
      let bottleneckCapacity = room.limit ?? 0;
      let bottleneckBooked = room.booked;
      for (const businessId of businessIds) {
        const capacity = await resolveVendorCapacity(businessId, slot.id, bookedFor);
        const booked = await countVendorBookingsForSlot(businessId, slot.id, bookedFor);
        const remaining = capacity - booked;
        if (remaining < minRemaining) {
          minRemaining = remaining;
          bottleneckCapacity = capacity;
          bottleneckBooked = booked;
        }
      }

      return {
        id: slot.id,
        label: slot.label,
        windowStart: slot.windowStart,
        windowEnd: slot.windowEnd,
        capacity: bottleneckCapacity,
        booked: bottleneckBooked,
        bookable: minRemaining > 0 && isSlotBookable(slot, new Date(), bookedFor),
      };
    })
  );

  // Which dates in the booking window are worth offering. Batched (a fixed
  // number of queries for the whole window) — see loadVendorScheduleWindow.
  const window = await loadVendorScheduleWindow(businessIds, windowStart, windowDays, now);
  const dates: VendorDateAvailability[] = window.dates.map((date) => {
    const iso = date.toISOString().slice(0, 10);
    const timeOpen = slotRows.filter((slot) => isSlotBookable(slot, now, date));
    if (timeOpen.length === 0) return { date: iso, selectable: false, reason: "closed_for_today" };
    // Closed or full on the delivery roster counts as fully booked for the buyer.
    const openSlots = timeOpen.filter((slot) => rosterRoom(slot.id, date).remaining > 0);
    if (openSlots.length === 0) return { date: iso, selectable: false, reason: "fully_booked" };
    if (businessIds.length === 0) return { date: iso, selectable: true, reason: "ok" };
    const days = businessIds.map((businessId) => window.day(businessId, date));
    if (days.some((d) => !d.available)) return { date: iso, selectable: false, reason: "not_delivering" };
    // A timeframe works only if EVERY vendor in the cart has room in it.
    const hasRoom = openSlots.some((slot) => days.every((d) => d.slots.some((s) => s.slotId === slot.id && s.capacity - s.paid - s.reserved > 0)));
    return hasRoom ? { date: iso, selectable: true, reason: "ok" } : { date: iso, selectable: false, reason: "fully_booked" };
  });

  return { items, fees, slots, date: bookedFor.toISOString().slice(0, 10), dates };
}
