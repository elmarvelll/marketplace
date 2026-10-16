// Vendor delivery scheduling: recurring weekdays, date overrides, per-date capacity, what counts toward capacity,
// checkout date availability, and newest-first order listing.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { vendorCheckoutScenario, makeUser, addToCart, lagosDatePlus } from "../helpers/fixtures";
import { createVendorOrdersForCheckout } from "@/services/marketplace/vendor-checkout/create-vendor-orders-for-checkout";
import { calculateVendorCheckoutSummary } from "@/services/marketplace/vendor-checkout/calculate-vendor-checkout-summary";
import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { resolveVendorCapacity } from "@/services/marketplace/vendor/capacity/resolve-vendor-capacity";
import { decideDateAvailability, isVendorDeliveryDate, loadVendorScheduleWindow, weekdayOf, WEEKDAYS } from "@/services/marketplace/vendor/capacity/vendor-delivery-schedule";
import { ServiceError } from "@/lib/service-error";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

before(() => installFakeProviders());
beforeEach(() => {
  paystack.reset();
  resend.reset();
});
after(() => prisma.$disconnect());

type S = Awaited<ReturnType<typeof vendorCheckoutScenario>>;
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const book = (s: S, date: string, userId = s.buyer.id) => createVendorOrdersForCheckout(userId, { slotId: s.slot.id, location: "Hall", date });
const isConflict = (e: unknown) => e instanceof ServiceError && e.status === 409;
const setWeekdays = (s: S, days: string[]) =>
  prisma.businessDeliveryDay.createMany({ data: days.map((day) => ({ businessId: s.vendor.id, day: day as (typeof WEEKDAYS)[number] })) });

describe("which dates a vendor delivers on", () => {
  it("pure rule: override beats the weekly rule; no weekly rule means every day", () => {
    const monday = utc("2026-10-19");
    assert.equal(weekdayOf(monday), "MONDAY");
    assert.deepEqual(decideDateAvailability(new Set(), undefined, monday), { available: true, source: "every_day" });
    assert.deepEqual(decideDateAvailability(new Set(["MONDAY", "WEDNESDAY"] as const), undefined, monday), { available: true, source: "recurring" });
    assert.equal(decideDateAvailability(new Set(["WEDNESDAY"] as const), undefined, monday).available, false);
    assert.deepEqual(decideDateAvailability(new Set(["MONDAY"] as const), { available: false }, monday), { available: false, source: "override" });
    assert.equal(decideDateAvailability(new Set(["WEDNESDAY"] as const), { available: true }, monday).available, true, "custom extra date");
  });

  it("a vendor with no schedule configured keeps delivering every day (existing behaviour)", async () => {
    const s = await vendorCheckoutScenario({ capacity: 3 });
    assert.equal(await isVendorDeliveryDate(s.vendor.id, utc(s.date)), true);
    assert.equal(await resolveVendorCapacity(s.vendor.id, s.slot.id, utc(s.date)), 3);
  });

  it("recurring weekdays: capacity applies on those days and is 0 on the others", async () => {
    const s = await vendorCheckoutScenario({ capacity: 5 });
    const tomorrow = utc(lagosDatePlus(1));
    const dayAfter = utc(lagosDatePlus(2));
    await setWeekdays(s, [weekdayOf(tomorrow)]);
    assert.equal(await resolveVendorCapacity(s.vendor.id, s.slot.id, tomorrow), 5);
    assert.equal(await resolveVendorCapacity(s.vendor.id, s.slot.id, dayAfter), 0);
    await assert.rejects(book(s, lagosDatePlus(2)), isConflict, "server refuses a non-delivery date even if the client sends it");
    assert.ok((await book(s, lagosDatePlus(1))).reference);
  });

  it("date overrides: a closed date is unbookable; a custom date is bookable; a date's capacity can differ from the default", async () => {
    const s = await vendorCheckoutScenario({ capacity: 5 });
    const d1 = lagosDatePlus(1), d2 = lagosDatePlus(2), d3 = lagosDatePlus(3);
    await setWeekdays(s, [weekdayOf(utc(d1)), weekdayOf(utc(d3))]);
    await prisma.vendorDeliveryDateOverride.create({ data: { businessId: s.vendor.id, date: utc(d1), available: false, note: "Public holiday" } });
    await prisma.vendorDeliveryDateOverride.create({ data: { businessId: s.vendor.id, date: utc(d2), available: true } });
    await prisma.vendorTimeframeCapacityOverride.create({ data: { businessId: s.vendor.id, slotId: s.slot.id, date: utc(d3), capacity: 3 } });

    assert.equal(await resolveVendorCapacity(s.vendor.id, s.slot.id, utc(d1)), 0, "closed");
    assert.equal(await resolveVendorCapacity(s.vendor.id, s.slot.id, utc(d2)), 5, "custom date uses the default capacity");
    assert.equal(await resolveVendorCapacity(s.vendor.id, s.slot.id, utc(d3)), 3, "date-specific capacity");
    assert.equal((await prisma.vendorTimeframeCapacity.findFirstOrThrow({ where: { businessId: s.vendor.id } })).capacity, 5, "recurring default untouched");
    await assert.rejects(book(s, d1), isConflict);
  });

  it("closing a date or cutting capacity never moves existing orders — it only stops new ones, and is flagged", async () => {
    const s = await vendorCheckoutScenario({ capacity: 2, stock: 10 });
    const res = await book(s, s.date);
    paystack.set(res.reference, { status: "success", amount: res.amountKobo });
    await reconcileCheckoutPayment(res.reference, "verify");

    await prisma.vendorDeliveryDateOverride.create({ data: { businessId: s.vendor.id, date: utc(s.date), available: false } });
    const order = await prisma.order.findFirstOrThrow({ where: { businessId: s.vendor.id, ...PAID_ORDER }, include: { vendorDeliveryBooking: true } });
    assert.equal(order.vendorDeliveryBooking?.bookedFor.toISOString().slice(0, 10), s.date, "still scheduled for the same date");
    assert.equal(order.status, "ACCEPTED");

    const window = await loadVendorScheduleWindow([s.vendor.id], utc(lagosDatePlus(0)), 8);
    const day = window.day(s.vendor.id, utc(s.date));
    assert.equal(day.available, false);
    assert.equal(day.overCapacity, true);
    assert.equal(day.slots.find((x) => x.slotId === s.slot.id)?.paid, 1);

    const other = await makeUser();
    await addToCart(other.id, s.product.id, 1);
    await assert.rejects(book(s, s.date, other.id), isConflict);
  });
});

describe("what the customer is offered at checkout", () => {
  it("only dates that are delivery days with capacity remaining are selectable; the server still re-validates", async () => {
    const s = await vendorCheckoutScenario({ capacity: 1, stock: 10 });
    const d1 = lagosDatePlus(1), d2 = lagosDatePlus(2), d3 = lagosDatePlus(3);
    await prisma.vendorDeliveryDateOverride.create({ data: { businessId: s.vendor.id, date: utc(d2), available: false } });
    // Fill d3 with another buyer's paid order.
    const other = await makeUser();
    await addToCart(other.id, s.product.id, 1);
    const taken = await book(s, d3, other.id);
    paystack.set(taken.reference, { status: "success", amount: taken.amountKobo });
    await reconcileCheckoutPayment(taken.reference, "verify");

    const summary = await calculateVendorCheckoutSummary(s.buyer.id, d1);
    const byDate = Object.fromEntries(summary.dates.map((d) => [d.date, d]));
    assert.deepEqual([byDate[d1].selectable, byDate[d1].reason], [true, "ok"]);
    assert.deepEqual([byDate[d2].selectable, byDate[d2].reason], [false, "not_delivering"]);
    assert.deepEqual([byDate[d3].selectable, byDate[d3].reason], [false, "fully_booked"]);
    assert.equal(summary.dates.length, 8, "the whole booking window is described");

    const closed = await calculateVendorCheckoutSummary(s.buyer.id, d2);
    assert.ok(closed.slots.every((slot) => slot.id !== s.slot.id || !slot.bookable), "no bookable timeframe on a closed date");
    await assert.rejects(book(s, d2), isConflict);
    await assert.rejects(book(s, d3), isConflict);
  });
});
