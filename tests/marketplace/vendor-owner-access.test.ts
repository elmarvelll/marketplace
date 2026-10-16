// Owner-scoped vendor operations: only the owner can read/change a vendor's schedule, capacity and orders; the
// vendor order list is newest-first and paid-only.
import "../helpers/env";
import { signInAs } from "../helpers/session";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { installFakeProviders, paystack } from "../helpers/fake-providers";
import { vendorCheckoutScenario, makeUser, addToCart, lagosDatePlus, businessCheckoutScenario } from "../helpers/fixtures";
import * as schedule from "@/services/marketplace/vendor/capacity/vendor-delivery-schedule";
import * as capacity from "@/services/marketplace/vendor/capacity/manage-vendor-capacity";
import { listVendorOrders } from "@/services/marketplace/vendor/order/list-vendor-orders";
import { listSellerOrders } from "@/services/marketplace/order/list-seller-orders";
import { createVendorOrdersForCheckout } from "@/services/marketplace/vendor-checkout/create-vendor-orders-for-checkout";
import { createOrdersForCheckout } from "@/services/marketplace/checkout/create-orders-for-checkout";
import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { acceptOrder } from "@/services/marketplace/order/accept-order";
import { ServiceError } from "@/lib/service-error";

before(() => installFakeProviders());
beforeEach(() => {
  paystack.reset();
  signInAs(null);
});
after(() => prisma.$disconnect());

const denied = (e: unknown) => e instanceof ServiceError && [401, 403, 404].includes(e.status);

describe("vendor schedule + capacity authorization", () => {
  it("the owner can configure weekdays, a closed date, a custom capacity, and see who is consuming it", async () => {
    const s = await vendorCheckoutScenario({ capacity: 5 });
    signInAs(s.owner);
    assert.deepEqual(await schedule.setVendorDeliveryWeekdays(s.vendor.id, ["WEDNESDAY", "MONDAY", "MONDAY"]), ["MONDAY", "WEDNESDAY"]);
    const closed = lagosDatePlus(20);
    assert.deepEqual(await schedule.setVendorDateAvailability(s.vendor.id, closed, false, "Exams"), { date: closed, available: false, note: "Exams" });
    await capacity.upsertVendorCapacity(s.vendor.id, s.slot.id, 3, lagosDatePlus(2));

    const view = await schedule.getVendorDeliverySchedule(s.vendor.id);
    assert.deepEqual(view.weekdays, ["MONDAY", "WEDNESDAY"]);
    assert.equal(view.upcoming.length, 8);
    assert.deepEqual(view.overrides, [{ date: closed, available: false, note: "Exams" }]);
    const day2 = view.upcoming.find((d) => d.date === lagosDatePlus(2))!;
    assert.equal(day2.hasCapacityOverride, true);
    assert.equal(day2.slots.find((x) => x.slotId === s.slot.id)?.capacity, day2.available ? 3 : 0);
    assert.equal((await prisma.vendorTimeframeCapacity.findFirstOrThrow({ where: { businessId: s.vendor.id } })).capacity, 5, "default unchanged by a date edit");

    await capacity.clearVendorCapacityOverride(s.vendor.id, s.slot.id, lagosDatePlus(2));
    await schedule.clearVendorDateAvailability(s.vendor.id, closed);
    assert.equal(await prisma.vendorDeliveryDateOverride.count({ where: { businessId: s.vendor.id } }), 0);
    assert.deepEqual(await schedule.setVendorDeliveryWeekdays(s.vendor.id, []), [], "empty = every day");
  });

  it("validates input", async () => {
    const s = await vendorCheckoutScenario();
    signInAs(s.owner);
    const bad = (e: unknown) => e instanceof ServiceError && e.status === 400;
    await assert.rejects(schedule.setVendorDeliveryWeekdays(s.vendor.id, ["FUNDAY"]), bad);
    await assert.rejects(schedule.setVendorDateAvailability(s.vendor.id, "2020-01-01", false), bad, "past date");
    await assert.rejects(schedule.setVendorDateAvailability(s.vendor.id, lagosDatePlus(1), "yes"), bad);
    await assert.rejects(capacity.upsertVendorCapacity(s.vendor.id, s.slot.id, -1), bad);
  });

  it("another vendor (or a signed-out caller) cannot read or change it", async () => {
    const s = await vendorCheckoutScenario();
    const rival = await vendorCheckoutScenario();
    for (const who of [rival.owner, s.buyer, null]) {
      signInAs(who);
      await assert.rejects(schedule.getVendorDeliverySchedule(s.vendor.id), denied);
      await assert.rejects(schedule.setVendorDeliveryWeekdays(s.vendor.id, ["MONDAY"]), denied);
      await assert.rejects(schedule.setVendorDateAvailability(s.vendor.id, lagosDatePlus(1), false), denied);
      await assert.rejects(schedule.clearVendorDateAvailability(s.vendor.id, lagosDatePlus(1)), denied);
      await assert.rejects(capacity.upsertVendorCapacity(s.vendor.id, s.slot.id, 99), denied);
      await assert.rejects(capacity.listVendorCapacity(s.vendor.id), denied);
      await assert.rejects(listVendorOrders(s.vendor.id), denied);
    }
    assert.equal(await prisma.businessDeliveryDay.count({ where: { businessId: s.vendor.id } }), 0, "nothing was written");
    assert.equal((await prisma.vendorTimeframeCapacity.findFirstOrThrow({ where: { businessId: s.vendor.id } })).capacity, 3);
  });
});

describe("order listings", () => {
  it("vendor orders are newest-first by creation time (not delivery date), ties broken deterministically, unpaid excluded", async () => {
    const s = await vendorCheckoutScenario({ capacity: 10, stock: 50 });
    // Created oldest -> newest, but with delivery dates in the OPPOSITE order.
    const plan = [3, 2, 1];
    const ids: string[] = [];
    for (const [i, days] of plan.entries()) {
      const buyer = i === 0 ? s.buyer : await makeUser();
      if (i > 0) await addToCart(buyer.id, s.product.id, 1);
      const res = await createVendorOrdersForCheckout(buyer.id, { slotId: s.slot.id, location: "Hall", date: lagosDatePlus(days) });
      paystack.set(res.reference, { status: "success", amount: res.amountKobo });
      await reconcileCheckoutPayment(res.reference, "verify");
      ids.push(res.orderIds[0]);
    }
    // Two orders with an identical timestamp.
    const same = new Date(Date.now() - 60_000);
    await prisma.order.updateMany({ where: { id: { in: [ids[0], ids[1]] } }, data: { createdAt: same } });
    // An unpaid attempt must not appear.
    const abandoned = await makeUser();
    await addToCart(abandoned.id, s.product.id, 1);
    await createVendorOrdersForCheckout(abandoned.id, { slotId: s.slot.id, location: "Hall", date: lagosDatePlus(1) });

    signInAs(s.owner);
    const first = (await listVendorOrders(s.vendor.id)).orders.map((o) => o.id);
    const tied = [ids[0], ids[1]].sort().reverse();
    assert.deepEqual(first, [ids[2], ...tied], "newest first; equal timestamps ordered by id desc");
    assert.deepEqual((await listVendorOrders(s.vendor.id)).orders.map((o) => o.id), first, "stable across refreshes");

    // A newly created order lands at the top after refresh.
    const late = await makeUser();
    await addToCart(late.id, s.product.id, 1);
    const res = await createVendorOrdersForCheckout(late.id, { slotId: s.slot.id, location: "Hall", date: lagosDatePlus(5) });
    paystack.set(res.reference, { status: "success", amount: res.amountKobo });
    await reconcileCheckoutPayment(res.reference, "verify");
    assert.equal((await listVendorOrders(s.vendor.id)).orders[0].id, res.orderIds[0]);
  });

  it("a seller cannot accept an order that hasn't been paid", async () => {
    const s = await businessCheckoutScenario();
    const init = await createOrdersForCheckout(s.buyer.id, "Hall");
    await assert.rejects(acceptOrder(s.business.id, init.orderIds[0], s.owner.id), (e: unknown) => e instanceof ServiceError && e.status === 404);
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    await reconcileCheckoutPayment(init.reference, "verify");
    await acceptOrder(s.business.id, init.orderIds[0], s.owner.id);
    assert.equal((await listSellerOrders(s.business.id))[0].status, "ACCEPTED");
  });
});
