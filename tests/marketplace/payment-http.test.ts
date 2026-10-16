// The HTTP surface of payment confirmation: Paystack webhook controller (signature, malformed bodies, retries,
// duplicates) and the verify/cancel status mapping that replaced the blanket 502.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { businessCheckoutScenario, stockOf } from "../helpers/fixtures";
import { createOrdersForCheckout } from "@/services/marketplace/checkout/create-orders-for-checkout";
import { handleWebhook } from "@/app/api/webhooks/paystack/route.controller";
import { paymentResultResponse } from "@/app/api/marketplace/checkout/verify/route.controller";
import { getPaystackMode, getPaystackPublicKey, getPaystackSecretKey, verifyTransaction, PaystackError } from "@/lib/external/paystack";
import { listSellerOrders } from "@/services/marketplace/order/list-seller-orders";

before(() => installFakeProviders());
beforeEach(() => {
  paystack.reset();
  resend.reset();
});
after(() => prisma.$disconnect());

function webhookRequest(body: string, signature?: string) {
  const sig = signature ?? createHmac("sha512", process.env.PAYSTACK_TEST_SECRET_KEY!).update(body).digest("hex");
  return new NextRequest("https://marketplace.test/api/webhooks/paystack", { method: "POST", body, headers: { "x-paystack-signature": sig } });
}
const chargeSuccess = (reference: string, extra: Record<string, unknown> = {}) => JSON.stringify({ event: "charge.success", data: { reference, ...extra } });

describe("paystack webhook", () => {
  it("rejects a bad or missing signature and changes nothing", async () => {
    const s = await businessCheckoutScenario();
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    assert.equal((await handleWebhook(webhookRequest(chargeSuccess(init.reference), "deadbeef"))).status, 401);
    assert.equal((await handleWebhook(new NextRequest("https://marketplace.test/api/webhooks/paystack", { method: "POST", body: chargeSuccess(init.reference) }))).status, 401);
    assert.equal((await prisma.checkoutPayment.findUniqueOrThrow({ where: { reference: init.reference } })).status, "PENDING");
  });

  it("a correctly signed but malformed body is a 400, not a crash", async () => {
    assert.equal((await handleWebhook(webhookRequest("not json {"))).status, 400);
  });

  it("ignores events it doesn't handle with a 200", async () => {
    assert.equal((await handleWebhook(webhookRequest(JSON.stringify({ event: "transfer.success", data: {} })))).status, 200);
    assert.equal((await handleWebhook(webhookRequest(JSON.stringify({ event: "charge.success", data: null })))).status, 200);
  });

  it("does not trust the event body: a forged 'success' event for an unpaid transaction finalizes nothing", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "abandoned", amount: init.amountKobo });
    const res = await handleWebhook(webhookRequest(chargeSuccess(init.reference, { status: "success", amount: init.amountKobo })));
    assert.equal(res.status, 200);
    assert.equal((await listSellerOrders(s.business.id)).length, 0);
    assert.equal(await stockOf(s.product.id), 4, "an unpaid webhook neither finalizes nor releases");
  });

  it("finalizes on a real success, and repeated deliveries are harmless", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    for (let i = 0; i < 3; i++) assert.equal((await handleWebhook(webhookRequest(chargeSuccess(init.reference)))).status, 200);
    assert.equal((await listSellerOrders(s.business.id)).length, 1);
    assert.equal(await stockOf(s.product.id), 4);
    assert.equal(await prisma.notification.count({ where: { userId: s.owner.id, type: "NEW_ORDER" } }), 1);
    assert.equal(await prisma.emailDelivery.count({ where: { to: s.owner.email } }), 1);
  });

  it("answers 503 (so Paystack redelivers) when verification is unavailable, leaving state unchanged", async () => {
    const s = await businessCheckoutScenario();
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    paystack.fail("timeout");
    assert.equal((await handleWebhook(webhookRequest(chargeSuccess(init.reference)))).status, 503);
    assert.equal((await prisma.checkoutPayment.findUniqueOrThrow({ where: { reference: init.reference } })).status, "PENDING");
    paystack.fail(null);
    assert.equal((await handleWebhook(webhookRequest(chargeSuccess(init.reference)))).status, 200);
    assert.equal((await listSellerOrders(s.business.id)).length, 1);
  });

  it("a database failure during finalization is a 500 and rolls everything back", async () => {
    const s = await businessCheckoutScenario({ stock: 5 });
    const init = await createOrdersForCheckout(s.buyer.id, "A");
    paystack.set(init.reference, { status: "success", amount: init.amountKobo });
    // Force the finalize transaction to fail part-way: the owner-email insert collides.
    const [order] = await prisma.order.findMany({ where: { paystackReference: init.reference } });
    const original = prisma.orderEvent.create;
    const client = prisma as unknown as { $transaction: (...args: unknown[]) => Promise<unknown> };
    const realTransaction = client.$transaction.bind(prisma);
    let failed = false;
    client.$transaction = async (...args: unknown[]) => {
      if (!failed && typeof args[0] === "function") {
        failed = true;
        return realTransaction(async (tx: { $executeRawUnsafe: (sql: string) => Promise<unknown> }) => {
          await (args[0] as (tx: unknown) => Promise<unknown>)(tx);
          await tx.$executeRawUnsafe("SELECT 1/0"); // simulated DB failure before commit
        });
      }
      return realTransaction(...args);
    };
    try {
      const silence = console.error;
      console.error = () => {};
      const res = await handleWebhook(webhookRequest(chargeSuccess(init.reference)));
      console.error = silence;
      assert.equal(res.status, 500);
    } finally {
      client.$transaction = realTransaction;
      void original;
    }
    assert.equal((await prisma.checkoutPayment.findUniqueOrThrow({ where: { reference: init.reference } })).status, "PENDING", "rolled back");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "pending");
    assert.equal(await prisma.emailDelivery.count({ where: { dedupeKey: `order-paid:${order.id}` } }), 0, "no email queued for an order that isn't paid");
    // The retry succeeds.
    assert.equal((await handleWebhook(webhookRequest(chargeSuccess(init.reference)))).status, 200);
    assert.equal((await listSellerOrders(s.business.id)).length, 1);
  });
});

describe("verify/cancel HTTP mapping", () => {
  const cases: [Parameters<typeof paymentResultResponse>[0], number, string][] = [
    [{ state: "paid", orderIds: ["o1"], newlyConfirmed: true, emailIds: [] }, 200, "success"],
    [{ state: "pending" }, 202, "pending"],
    [{ state: "failed" }, 402, "failed"],
    [{ state: "cancelled" }, 410, "cancelled"],
    [{ state: "expired" }, 410, "expired"],
    [{ state: "not_found" }, 404, "not_found"],
    [{ state: "no_such_checkout" }, 404, "not_found"],
    [{ state: "needs_review", reason: "x" }, 409, "needs_review"],
    [{ state: "unknown", errorKind: "timeout" }, 503, "unknown"],
  ];
  for (const [result, status, label] of cases) {
    it(`${result.state} -> ${status}`, async () => {
      const res = paymentResultResponse(result);
      const body = await res.json();
      assert.equal(res.status, status);
      assert.equal(body.status, label);
      assert.notEqual(res.status, 502, "no outcome maps to 502 any more");
      if (status >= 400 || status === 202) assert.equal(typeof body.error, "string", "clients read `error`");
      if (result.state === "paid") assert.deepEqual(body.confirmedOrderIds, ["o1"], "existing success shape preserved");
      if (result.state === "unknown") assert.equal(res.headers.get("Retry-After"), "5");
      assert.ok(!JSON.stringify(body).includes("sk_"), "no secrets in responses");
    });
  }
});

describe("paystack client", () => {
  it("uses one mode for both the secret and the publishable key", () => {
    assert.equal(getPaystackMode(), "test");
    assert.equal(getPaystackSecretKey(), process.env.PAYSTACK_TEST_SECRET_KEY);
    assert.equal(getPaystackPublicKey(), "pk_test_dummy");
    process.env.PAYSTACK_MODE = "live";
    process.env.NEXT_PUBLIC_PAYSTACK_LIVE_KEY = "pk_live_dummy";
    try {
      assert.equal(getPaystackSecretKey(), process.env.PAYSTACK_SECRET_KEY);
      assert.equal(getPaystackPublicKey(), "pk_live_dummy");
    } finally {
      process.env.PAYSTACK_MODE = "test";
    }
  });

  it("classifies verify outcomes instead of throwing for 'not found'", async () => {
    assert.equal((await verifyTransaction("nope")).outcome, "not_found");
    paystack.set("r1", { status: "reversed", amount: 1 });
    assert.equal((await verifyTransaction("r1")).outcome, "failed");
    paystack.set("r2", { status: "ongoing", amount: 1 });
    assert.equal((await verifyTransaction("r2")).outcome, "pending");
    paystack.set("r3", { status: "some-new-status", amount: 1 });
    await assert.rejects(verifyTransaction("r3"), (e: unknown) => e instanceof PaystackError && e.kind === "malformed");
    paystack.fail("html");
    await assert.rejects(verifyTransaction("r1"), (e: unknown) => e instanceof PaystackError && e.kind === "http");
    paystack.fail("timeout");
    await assert.rejects(verifyTransaction("r1"), (e: unknown) => e instanceof PaystackError && e.kind === "timeout");
  });
});
