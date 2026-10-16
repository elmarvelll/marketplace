// General-marketplace School Vendor checkout: same payment lifecycle as the Business checkout (shared finalize /
// release / reconcile code), plus delivery-slot capacity. Real local Postgres; Paystack/Resend faked.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { vendorCheckoutScenario, makeUser, addToCart, stockOf } from "../helpers/fixtures";
import { createVendorOrdersForCheckout } from "@/services/marketplace/vendor-checkout/create-vendor-orders-for-checkout";
import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { reconcileUserPendingCheckouts } from "@/services/marketplace/checkout/reconcile-user-pending-checkouts";
import { countVendorBookingsForSlot } from "@/services/marketplace/vendor/capacity/manage-vendor-capacity";
import { deliverEmails } from "@/services/marketplace/notifications/email-outbox";
import { ServiceError } from "@/lib/service-error";

before(() => installFakeProviders());
beforeEach(() => {
  paystack.reset();
  resend.reset();
});
after(() => prisma.$disconnect());

type Scenario = Awaited<ReturnType<typeof vendorCheckoutScenario>>;
const init = (s: Scenario, userId = s.buyer.id) => createVendorOrdersForCheckout(userId, { slotId: s.slot.id, location: "Hall B", date: s.date });
const bookedFor = (s: Scenario) => new Date(`${s.date}T00:00:00.000Z`);
const used = (s: Scenario) => countVendorBookingsForSlot(s.vendor.id, s.slot.id, bookedFor(s));
const paidVendorOrders = (s: Scenario) => prisma.order.findMany({ where: { businessId: s.vendor.id, paymentStatus: "paid" } });
const isConflict = (e: unknown) => e instanceof ServiceError && e.status === 409;

describe("vendor checkout — payment lifecycle", () => {
  it("initialize reserves stock + one capacity unit and charges items + fees, without a paid order", async () => {
    const s = await vendorCheckoutScenario({ stock: 5, price: 2000, capacity: 3 });
    const res = await init(s);
    const settings = await prisma.marketplaceSettings.findUniqueOrThrow({ where: { id: "default" } });
    assert.equal(res.amountKobo, Math.round((2000 + settings.vendorDeliveryFee + settings.vendorServiceFeeAmount) * 100));
    assert.equal(await stockOf(s.product.id), 4);
    assert.equal(await used(s), 1, "a live reservation holds capacity");
    assert.equal((await paidVendorOrders(s)).length, 0);
    const p = await prisma.checkoutPayment.findUniqueOrThrow({ where: { reference: res.reference } });
    assert.deepEqual([p.kind, p.status, p.amountKobo], ["VENDOR", "PENDING", res.amountKobo]);
    assert.equal((await prisma.vendorDeliveryBooking.findFirstOrThrow({ where: { paystackReference: res.reference } })).status, "PENDING_PAYMENT");
  });

  it("success: booking confirmed, order auto-accepted, owner emailed once with the vendor dashboard link", async () => {
    const s = await vendorCheckoutScenario();
    const res = await init(s);
    paystack.set(res.reference, { status: "success", amount: res.amountKobo });
    const [a, b] = await Promise.all([reconcileCheckoutPayment(res.reference, "webhook"), reconcileCheckoutPayment(res.reference, "verify")]);
    assert.ok(a.state === "paid" && b.state === "paid");
    assert.equal([a, b].filter((r) => r.state === "paid" && r.newlyConfirmed).length, 1);

    const orders = await paidVendorOrders(s);
    assert.equal(orders.length, 1);
    assert.deepEqual([orders[0].status, orders[0].fulfillmentStatus], ["ACCEPTED", "PROCESSING"]);
    assert.equal((await prisma.vendorDeliveryBooking.findFirstOrThrow({ where: { paystackReference: res.reference } })).status, "CONFIRMED");
    assert.equal(await stockOf(s.product.id), 4);
    assert.equal(await used(s), 1);
    assert.equal(await prisma.cartItem.count({ where: { userId: s.buyer.id } }), 0);

    const notes = await prisma.notification.findMany({ where: { userId: s.owner.id, type: "NEW_ORDER" } });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].link, `/vendor-dashboard/${s.vendor.id}/orders`);
    for (const r of [a, b]) if (r.state === "paid") await deliverEmails(r.emailIds);
    assert.equal(resend.sent.length, 1);
    assert.match(resend.sent[0].html, new RegExp(`/vendor-dashboard/${s.vendor.id}/orders`));
  });

  it("cancel: stock and delivery capacity are both released, exactly once; nothing is sent", async () => {
    const s = await vendorCheckoutScenario({ stock: 5, capacity: 1 });
    const res = await init(s);
    paystack.set(res.reference, { status: "abandoned", amount: res.amountKobo });
    assert.equal((await reconcileCheckoutPayment(res.reference, "cancel")).state, "cancelled");
    await reconcileCheckoutPayment(res.reference, "cancel");
    assert.equal(await stockOf(s.product.id), 5);
    assert.equal(await used(s), 0, "capacity is free again");
    assert.equal((await prisma.vendorDeliveryBooking.findFirstOrThrow({ where: { paystackReference: res.reference } })).status, "CANCELLED");
    assert.equal(await prisma.cartItem.count({ where: { userId: s.buyer.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { userId: s.owner.id } }), 0);
    assert.equal(resend.sent.length, 0);
    // The freed slot can be booked again by the same buyer.
    await init(s);
    assert.equal(await used(s), 1);
  });

  it("failed payment and provider timeout behave as in the business checkout", async () => {
    const s = await vendorCheckoutScenario({ stock: 5 });
    const res = await init(s);
    paystack.fail("timeout");
    assert.equal((await reconcileCheckoutPayment(res.reference, "verify")).state, "unknown");
    assert.equal(await stockOf(s.product.id), 4);
    paystack.fail(null);
    paystack.set(res.reference, { status: "failed", amount: res.amountKobo });
    assert.equal((await reconcileCheckoutPayment(res.reference, "verify")).state, "failed");
    assert.equal(await stockOf(s.product.id), 5);
    assert.equal(await used(s), 0);
  });

  it("wrong amount is never finalized", async () => {
    const s = await vendorCheckoutScenario();
    const res = await init(s);
    paystack.set(res.reference, { status: "success", amount: res.amountKobo - 100000 }); // paid without the delivery fee
    assert.equal((await reconcileCheckoutPayment(res.reference, "verify")).state, "needs_review");
    assert.equal((await paidVendorOrders(s)).length, 0);
  });

  it("retrying checkout settles the buyer's earlier abandoned attempt first (no double reservation)", async () => {
    const s = await vendorCheckoutScenario({ stock: 5, capacity: 1 });
    const first = await init(s);
    paystack.set(first.reference, { status: "abandoned", amount: first.amountKobo });
    await reconcileUserPendingCheckouts(s.buyer.id, "VENDOR"); // what the initialize controller does first
    const second = await init(s); // would be "fully booked" (capacity 1) if the first still held it
    assert.notEqual(second.reference, first.reference);
    assert.equal(await stockOf(s.product.id), 4, "one reservation, not two");
    assert.equal(await used(s), 1);
  });
});

describe("vendor checkout — delivery capacity", () => {
  it("full capacity: the next customer is refused, and no stock is taken from them", async () => {
    const s = await vendorCheckoutScenario({ stock: 5, capacity: 1 });
    const res = await init(s);
    paystack.set(res.reference, { status: "success", amount: res.amountKobo });
    await reconcileCheckoutPayment(res.reference, "verify");

    const second = await makeUser();
    await addToCart(second.id, s.product.id, 1);
    await assert.rejects(init(s, second.id), isConflict);
    assert.equal(await stockOf(s.product.id), 4);
  });

  it("concurrent checkouts can't exceed capacity: 5 buyers, capacity 2 -> exactly 2 succeed", async () => {
    const s = await vendorCheckoutScenario({ stock: 50, capacity: 2 });
    const buyers = [s.buyer, ...(await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()]))];
    await Promise.all(buyers.slice(1).map((b) => addToCart(b.id, s.product.id, 1)));
    const results = await Promise.allSettled(buyers.map((b) => init(s, b.id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, 2);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => isConflict((r as PromiseRejectedResult).reason)));
    assert.equal(await used(s), 2);
    assert.equal(await stockOf(s.product.id), 48, "only the two winners hold stock");
  });

  it("an unpaid reservation stops consuming capacity once it has lapsed, even before the sweep runs", async () => {
    const s = await vendorCheckoutScenario({ capacity: 1 });
    const res = await init(s);
    assert.equal(await used(s), 1);
    await prisma.order.updateMany({ where: { paystackReference: res.reference }, data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } });
    assert.equal(await used(s), 0);
  });

  it("late success after release when the slot has since filled: flagged for review, capacity not exceeded", async () => {
    const s = await vendorCheckoutScenario({ stock: 5, capacity: 1 });
    const first = await init(s);
    await reconcileCheckoutPayment(first.reference, "cancel");

    const second = await makeUser();
    await addToCart(second.id, s.product.id, 1);
    const taken = await init(s, second.id);
    paystack.set(taken.reference, { status: "success", amount: taken.amountKobo });
    await reconcileCheckoutPayment(taken.reference, "verify");

    paystack.set(first.reference, { status: "success", amount: first.amountKobo });
    assert.equal((await reconcileCheckoutPayment(first.reference, "webhook")).state, "needs_review");
    assert.equal((await paidVendorOrders(s)).length, 1);
    assert.equal(await stockOf(s.product.id), 4);
  });
});
