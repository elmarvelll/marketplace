// Business-storefront checkout: payment lifecycle, inventory, visibility, notifications.
// Paystack and Resend are in-memory fakes (tests/helpers/fake-providers.ts); the database is a real local Postgres.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { businessCheckoutScenario, makeUser, addToCart, stockOf } from "../helpers/fixtures";
import { createOrdersForCheckout } from "@/services/marketplace/checkout/create-orders-for-checkout";
import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { runCheckoutReconcileSweep } from "@/services/marketplace/checkout/run-checkout-reconcile-sweep";
import { loadOwnedCheckoutPayment } from "@/services/marketplace/checkout/load-owned-checkout-payment";
import { listSellerOrders } from "@/services/marketplace/order/list-seller-orders";
import { listBuyerOrders } from "@/services/marketplace/order/list-buyer-orders";
import { runSellerResponseSweep } from "@/services/marketplace/order/run-seller-response-sweep";
import { deliverEmails } from "@/services/marketplace/notifications/email-outbox";
import { ServiceError } from "@/lib/service-error";

before(() => installFakeProviders());
beforeEach(() => {
  paystack.reset();
  resend.reset();
});
after(() => prisma.$disconnect());

const payment = (reference: string) => prisma.checkoutPayment.findUniqueOrThrow({ where: { reference } });
const ordersOf = (reference: string) => prisma.order.findMany({ where: { paystackReference: reference } });
const ownerNotifications = (ownerId: string) => prisma.notification.count({ where: { userId: ownerId, type: "NEW_ORDER" } });
const ownerEmails = (orderIds: string[]) => prisma.emailDelivery.count({ where: { dedupeKey: { in: orderIds.map((id) => `order-paid:${id}`) } } });

describe("business checkout — initialize", () => {
  it("reserves stock and records a payment attempt, without creating a visible or paid order", async () => {
    const s = await businessCheckoutScenario({ stock: 5, price: 1500, quantity: 2 });
    const init = await createOrdersForCheckout(s.buyer.id, "Hall A");

    assert.equal(init.amountKobo, 300000, "amount is computed server-side from DB prices");
    assert.equal(await stockOf(s.product.id), 3, "stock is reserved");
    const p = await payment(init.reference);
    assert.equal(p.status, "PENDING");
    assert.equal(p.amountKobo, 300000);
    assert.ok(p.expiresAt > new Date());
    assert.deepEqual((await ordersOf(init.reference)).map((o) => o.paymentStatus), ["pending"]);

    assert.equal((await listSellerOrders(s.business.id)).length, 0, "seller must not see an unpaid order");
    assert.equal((await listBuyerOrders(s.buyer.id)).length, 0, "buyer order history must not show an unpaid order");
    assert.equal(await prisma.cartItem.count({ where: { userId: s.buyer.id } }), 1, "cart is untouched until payment");
    assert.equal(await ownerNotifications(s.owner.id), 0);
    assert.equal(resend.sent.length, 0);
  });

  it("refuses to oversell: two buyers racing for the last unit — exactly one reservation succeeds", async () => {
    const s = await businessCheckoutScenario({ stock: 1 });
    const rival = await makeUser();
    await addToCart(rival.id, s.product.id, 1);

    const results = await Promise.allSettled([createOrdersForCheckout(s.buyer.id, "A"), createOrdersForCheckout(rival.id, "B")]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.ok(failed[0].reason instanceof ServiceError && failed[0].reason.status === 409);
    assert.equal(await stockOf(s.product.id), 0, "never negative");
    assert.equal(await prisma.checkoutPayment.count({ where: { userId: { in: [s.buyer.id, rival.id] } } }), 1, "the loser left no payment attempt behind");
  });

  it("rejects checkout from an admin-blocked business", async () => {
    const s = await businessCheckoutScenario();
    await prisma.business.update({ where: { id: s.business.id }, data: { blocked: true } });
    await assert.rejects(createOrdersForCheckout(s.buyer.id, "A"), (e: unknown) => e instanceof ServiceError && e.status === 409);
    assert.equal(await stockOf(s.product.id), 5);
  });
});

describe("business checkout — successful payment", () => {
  it("finalizes one order, keeps the single stock deduction, clears only the paid cart lines, notifies the owner once", async () => {
    const s = await businessCheckoutScenario({ stock: 5, quantity: 2 });
    const init = await createOrdersForCheckout(s.buyer.id, "Hall A");
    // Added to the cart while the popup is open — must survive the payment.
    const other = await businessCheckoutScenario();
    const lateLine = await prisma.cartItem.create({ data: { userId: s.buyer.id, productId: other.product.id, quantity: 1 } });
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });

    const result = await reconcileCheckoutPayment(init.reference, "verify");
    assert.equal(result.state, "paid");
    assert.ok(result.state === "paid" && result.newlyConfirmed);

    assert.equal((await payment(init.reference)).status, "PAID");
    assert.equal(await stockOf(s.product.id), 3, "exactly one deduction of 2");
    const seller = await listSellerOrders(s.business.id);
    assert.equal(seller.length, 1);
    assert.equal(seller[0].section, "pending");
    assert.equal((await listBuyerOrders(s.buyer.id)).length, 1);
    assert.deepEqual((await prisma.cartItem.findMany({ where: { userId: s.buyer.id } })).map((c) => c.id), [lateLine.id]);

    assert.equal(await ownerNotifications(s.owner.id), 1);
    const link = (await prisma.notification.findFirstOrThrow({ where: { userId: s.owner.id, type: "NEW_ORDER" } })).link;
    assert.equal(link, `/business/${s.business.id}/orders`);

    if (result.state === "paid") await deliverEmails(result.emailIds);
    assert.equal(resend.sent.length, 1);
    assert.equal(resend.sent[0].to, s.owner.email);
    assert.match(resend.sent[0].html, new RegExp(`2 × ${s.product.name}`));
    assert.match(resend.sent[0].html, /₦3,000/);
    assert.match(resend.sent[0].html, new RegExp(`https://marketplace.test/business/${s.business.id}/orders`));
    assert.ok(resend.sent[0].html.includes(init.reference));
    assert.ok(!resend.sent[0].html.includes(s.buyer.email), "owner email carries no buyer contact details");
  });

  it("is idempotent: repeated verify + webhook + duplicate verify produce one order, one deduction, one email, one notification", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "Hall A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });

    const results = await Promise.all([
      reconcileCheckoutPayment(init.reference, "verify"),
      reconcileCheckoutPayment(init.reference, "webhook"),
      reconcileCheckoutPayment(init.reference, "verify"),
      reconcileCheckoutPayment(init.reference, "webhook"),
    ]);
    assert.ok(results.every((r) => r.state === "paid"));
    assert.equal(results.filter((r) => r.state === "paid" && r.newlyConfirmed).length, 1, "exactly one caller finalized");
    const again = await reconcileCheckoutPayment(init.reference, "verify");
    assert.ok(again.state === "paid" && !again.newlyConfirmed);

    const orders = await ordersOf(init.reference);
    assert.equal(orders.length, 1);
    assert.equal(await stockOf(s.product.id), 4);
    assert.equal(await ownerNotifications(s.owner.id), 1);
    assert.equal(await ownerEmails(orders.map((o) => o.id)), 1);
    assert.equal(await prisma.orderEvent.count({ where: { orderId: orders[0].id, type: "ORDER_CREATED" } }), 1);

    const callsBefore = paystack.verifyCalls.length;
    await reconcileCheckoutPayment(init.reference, "verify");
    assert.equal(paystack.verifyCalls.length, callsBefore, "an already-finalized checkout does not call Paystack again");
  });
});

describe("business checkout — shared database with AkadVerse's older webhook", () => {
  it("if AkadVerse already marked the orders paid, the Marketplace settles its checkout without a second event, email or notification", async () => {
    const s = await businessCheckoutScenario({ stock: 5, quantity: 1 });
    const init = await createOrdersForCheckout(s.buyer.id, "Hall A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    // What AkadVerse's committed confirmPaymentByReference does on its webhook: flip the orders by reference, record
    // the created event, notify the owner.
    const [order] = await ordersOf(init.reference);
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
    await prisma.orderEvent.create({ data: { orderId: order.id, type: "ORDER_CREATED", actorType: "buyer", actorId: s.buyer.id } });

    const result = await reconcileCheckoutPayment(init.reference, "verify");
    assert.equal(result.state, "paid");
    assert.ok(result.state === "paid" && result.orderIds.includes(order.id), "the buyer still gets their order back");
    assert.equal((await payment(init.reference)).status, "PAID", "the checkout is settled");
    assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id, type: "ORDER_CREATED" } }), 1, "no duplicate timeline event");
    assert.equal(await ownerNotifications(s.owner.id), 0, "no second notification from the Marketplace");
    assert.equal(await ownerEmails([order.id]), 0, "no second owner email from the Marketplace");
    assert.equal(await prisma.cartItem.count({ where: { userId: s.buyer.id } }), 0, "the paid cart line is cleared");
    assert.equal(await stockOf(s.product.id), 4, "still exactly one stock deduction");
  });
});

describe("business checkout — cancellation and failure", () => {
  it("user cancels: reservation is released once, no order is visible, cart keeps its items, no email", async () => {
    const s = await businessCheckoutScenario({ stock: 5, quantity: 2 });
    const init = await createOrdersForCheckout(s.buyer.id, "Hall A");
    paystack.set(init.reference, { status: "abandoned", amount: init.amountKobo });

    const first = await reconcileCheckoutPayment(init.reference, "cancel");
    assert.equal(first.state, "cancelled");
    assert.equal(await stockOf(s.product.id), 5, "stock restored");
    // Repeated cancel / sweep must not restore twice.
    await reconcileCheckoutPayment(init.reference, "cancel");
    await runCheckoutReconcileSweep({ now: new Date(Date.now() + 2 * 60 * 60 * 1000) });
    assert.equal(await stockOf(s.product.id), 5, "never restored twice");

    assert.equal((await payment(init.reference)).status, "ABANDONED");
    assert.deepEqual((await ordersOf(init.reference)).map((o) => [o.paymentStatus, o.status]), [["abandoned", "CANCELLED"]]);
    assert.equal((await listSellerOrders(s.business.id)).length, 0);
    assert.equal((await listBuyerOrders(s.buyer.id)).length, 0);
    const cart = await prisma.cartItem.findMany({ where: { userId: s.buyer.id } });
    assert.deepEqual(cart.map((c) => [c.id, c.quantity]), [[s.cartItem.id, 2]], "original items and quantities kept");
    assert.equal(await ownerNotifications(s.owner.id), 0);
    assert.equal(await prisma.emailDelivery.count({ where: { to: s.owner.email } }), 0);
  });

  it("cancel for a reference Paystack never saw (popup closed immediately) also releases", async () => {
    const s = await businessCheckoutScenario({ stock: 2 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    assert.equal((await reconcileCheckoutPayment(init.reference, "cancel")).state, "cancelled");
    assert.equal(await stockOf(s.product.id), 2);
  });

  it("browser says cancelled but Paystack says success: the purchase is finalized, not discarded", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    const result = await reconcileCheckoutPayment(init.reference, "cancel");
    assert.equal(result.state, "paid");
    assert.equal(await stockOf(s.product.id), 4);
    assert.equal((await listSellerOrders(s.business.id)).length, 1);
  });

  it("explicit payment failure releases the reservation and sends nothing", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "failed", amount: init.amountKobo });
    assert.equal((await reconcileCheckoutPayment(init.reference, "verify")).state, "failed");
    assert.equal((await payment(init.reference)).status, "FAILED");
    assert.equal(await stockOf(s.product.id), 5);
    assert.equal((await listSellerOrders(s.business.id)).length, 0);
    assert.equal(await ownerNotifications(s.owner.id), 0);
  });

  it("a verify call for an unpaid (abandoned) transaction changes nothing — only cancel/expiry release", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "abandoned", amount: init.amountKobo });
    assert.equal((await reconcileCheckoutPayment(init.reference, "verify")).state, "pending");
    assert.equal((await payment(init.reference)).status, "PENDING");
    assert.equal(await stockOf(s.product.id), 4);
  });

  it("invalid/unknown transaction reference: not found, nothing finalized", async () => {
    assert.equal((await reconcileCheckoutPayment("AKD-does-not-exist", "verify")).state, "no_such_checkout");
    const s = await businessCheckoutScenario();
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    assert.equal((await reconcileCheckoutPayment(init.reference, "verify")).state, "not_found");
    assert.equal((await payment(init.reference)).status, "PENDING");
  });

  it("another user cannot verify or cancel someone else's checkout", async () => {
    const s = await businessCheckoutScenario();
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    const stranger = await makeUser();
    await assert.rejects(loadOwnedCheckoutPayment(init.reference, stranger.id), (e: unknown) => e instanceof ServiceError && e.status === 404);
    assert.equal((await loadOwnedCheckoutPayment(init.reference, s.buyer.id)).reference, init.reference);
  });
});

describe("business checkout — amount/currency validation", () => {
  for (const [label, txn] of [
    ["underpaid amount", { status: "success", amount: 100 }],
    ["wrong currency", { status: "success", amount: 150000, currency: "USD" }],
    ["different reference", { status: "success", amount: 150000, reference: "AKD-someone-elses" }],
  ] as const) {
    it(`${label}: never finalized, flagged for admin review`, async () => {
      const s = await businessCheckoutScenario({ price: 1500 });
      const admin = await makeUser({ isAdmin: true });
      const init = await createOrdersForCheckout(s.buyer.id, "A");
      paystack.set(init.reference, txn);
      const result = await reconcileCheckoutPayment(init.reference, "verify");
      assert.equal(result.state, "needs_review");
      assert.equal((await payment(init.reference)).status, "NEEDS_REVIEW");
      assert.equal((await listSellerOrders(s.business.id)).length, 0);
      assert.equal(await ownerNotifications(s.owner.id), 0);
      assert.equal(await prisma.notification.count({ where: { userId: admin.id, type: "PAYMENT_NEEDS_REVIEW" } }), 1);
      // A second delivery of the same bad payment does not re-alert.
      await reconcileCheckoutPayment(init.reference, "webhook");
      assert.equal(await prisma.notification.count({ where: { userId: admin.id, type: "PAYMENT_NEEDS_REVIEW" } }), 1);
    });
  }
});

describe("business checkout — provider trouble and recovery", () => {
  for (const mode of ["timeout", "http500", "html", "garbage"] as const) {
    it(`Paystack ${mode}: state is left untouched and reported as unknown (retryable)`, async () => {
      const s = await businessCheckoutScenario({ stock: 5 });
      const init = await createOrdersForCheckout(s.buyer.id, "A");
      paystack.set(init.reference, { status: "success", amount: init.amountKobo });
      paystack.fail(mode);
      const result = await reconcileCheckoutPayment(init.reference, "verify");
      assert.equal(result.state, "unknown");
      const p = await payment(init.reference);
      assert.equal(p.status, "PENDING", "neither paid nor failed");
      assert.equal(p.verifyAttempts, 1);
      assert.ok(p.lastError);
      assert.equal(await stockOf(s.product.id), 4, "reservation kept");

      // Provider recovers: the same call now finalizes — recovery after uncertainty.
      paystack.fail(null);
      assert.equal((await reconcileCheckoutPayment(init.reference, "verify")).state, "paid");
      assert.equal(await stockOf(s.product.id), 4);
    });
  }

  it("a cancel while Paystack is unreachable releases nothing", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.fail("timeout");
    assert.equal((await reconcileCheckoutPayment(init.reference, "cancel")).state, "unknown");
    assert.equal(await stockOf(s.product.id), 4);
  });
});

describe("business checkout — reservation expiry", () => {
  it("the sweep leaves live reservations alone and releases expired unpaid ones", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "abandoned", amount: init.amountKobo });

    await runCheckoutReconcileSweep({ limit: 200 });
    assert.equal((await payment(init.reference)).status, "PENDING", "not expired yet");

    await prisma.checkoutPayment.update({ where: { reference: init.reference }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await runCheckoutReconcileSweep({ limit: 200 });
    assert.equal((await payment(init.reference)).status, "EXPIRED");
    assert.equal(await stockOf(s.product.id), 5);
  });

  it("the sweep finalizes an expired reservation that was actually paid", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    await prisma.checkoutPayment.update({ where: { reference: init.reference }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await runCheckoutReconcileSweep({ limit: 200 });
    assert.equal((await payment(init.reference)).status, "PAID");
    assert.equal(await stockOf(s.product.id), 4);
  });

  it("late success after release: stock is re-reserved and the order finalized when still available", async () => {
    const s = await businessCheckoutScenario({ stock: 1 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "abandoned", amount: init.amountKobo });
    await reconcileCheckoutPayment(init.reference, "cancel");
    assert.equal(await stockOf(s.product.id), 1);

    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    const result = await reconcileCheckoutPayment(init.reference, "webhook");
    assert.equal(result.state, "paid");
    assert.equal(await stockOf(s.product.id), 0);
    const seller = await listSellerOrders(s.business.id);
    assert.equal(seller.length, 1);
    assert.equal(seller[0].status, "PENDING_SELLER");
  });

  it("late success after release when the stock is gone: flagged for review, stock not driven negative", async () => {
    const s = await businessCheckoutScenario({ stock: 1 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    await reconcileCheckoutPayment(init.reference, "cancel");
    await prisma.product.update({ where: { id: s.product.id }, data: { stock: 0 } }); // someone else bought it
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    const result = await reconcileCheckoutPayment(init.reference, "webhook");
    assert.equal(result.state, "needs_review");
    assert.equal(await stockOf(s.product.id), 0);
    assert.equal((await listSellerOrders(s.business.id)).length, 0);
  });
});

describe("legacy pending orders (created before CheckoutPayment existed)", () => {
  async function legacyOrder(ageMinutes: number) {
    const s = await businessCheckoutScenario({ stock: 4, price: 1000 });
    const reference = `AKD-legacy-${s.product.id.slice(0, 8)}`;
    const createdAt = new Date(Date.now() - ageMinutes * 60 * 1000);
    await prisma.order.create({
      data: {
        userId: s.buyer.id, businessId: s.business.id, status: "PENDING_SELLER", paymentStatus: "pending", paystackReference: reference, totalAmount: 1000, createdAt,
        items: { create: [{ productId: s.product.id, quantity: 1, price: 1000 }] },
      },
    });
    return { ...s, reference };
  }

  it("an abandoned legacy order is adopted, its stock restored once, and it disappears from order lists", async () => {
    const s = await legacyOrder(120);
    assert.equal((await listSellerOrders(s.business.id)).length, 0, "hidden as soon as the new code is deployed");
    await runCheckoutReconcileSweep({ limit: 500 });
    assert.equal((await payment(s.reference)).status, "EXPIRED");
    assert.equal(await stockOf(s.product.id), 5, "the unit the old code deducted at initialize is returned");
    await runCheckoutReconcileSweep({ limit: 500 });
    assert.equal(await stockOf(s.product.id), 5);
  });

  it("a legacy order that Paystack says was paid is finalized", async () => {
    const s = await legacyOrder(120);
    paystack.set(s.reference, { status: "success", amount: 100000 });
    await runCheckoutReconcileSweep({ limit: 500 });
    assert.equal((await payment(s.reference)).status, "PAID");
    assert.equal((await listSellerOrders(s.business.id)).length, 1);
    assert.equal(await stockOf(s.product.id), 4);
  });
});

describe("seller-response sweep", () => {
  it("never auto-rejects or 'refunds' an unpaid checkout attempt", async () => {
    const s = await businessCheckoutScenario();
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    await prisma.order.updateMany({ where: { paystackReference: init.reference }, data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } });
    await runSellerResponseSweep();
    const [order] = await ordersOf(init.reference);
    assert.equal(order.status, "PENDING_SELLER");
    assert.equal(order.autoRejected, false);
    assert.equal(resend.sent.filter((e) => e.to === s.buyer.email).length, 0);
  });
});
