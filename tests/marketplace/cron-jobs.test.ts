// Every scheduled job (src/app/api/cron/*), against the local test replica with Paystack/Resend faked: the job's
// main effect, its safety rules (never twice, retry caps, what it must skip) and its HTTP route. Deliveries are
// driven through the real flow (checkout -> payment -> assignment -> check-in -> pickup -> student's code) rather
// than written into the database, so the jobs see exactly what production would.
import "../helpers/env";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { akadverseDb } from "../helpers/akadverse";
import { addToCart, businessCheckoutScenario, lagosDatePlus, makeUser, vendorCheckoutScenario } from "../helpers/fixtures";
import { createOrdersForCheckout } from "@/services/marketplace/checkout/create-orders-for-checkout";
import { createVendorOrdersForCheckout } from "@/services/marketplace/vendor-checkout/create-vendor-orders-for-checkout";
import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { assignDelivery } from "@/services/marketplace/delivery/assign-delivery";
import { submitDeliveryCode } from "@/services/marketplace/vendor-delivery/handover/submit-delivery-code";
import { reportBookingFailedAttempt } from "@/services/marketplace/vendor-delivery/handover/booking-delivery";
import { disputeOrder } from "@/services/marketplace/order/dispute-order";
import { runDisputeWindowSweep } from "@/services/marketplace/vendor-delivery/dispute-window-sweep";
import { runDelivererPayoutSweep } from "@/services/marketplace/vendor-delivery/payout/run-deliverer-payout-sweep";
import { runPayoutSweep } from "@/services/marketplace/payout/run-payout-sweep";
import { runDeliveryRetrySweep } from "@/services/marketplace/delivery/run-delivery-retry-sweep";
import { sendPickupDeadlineReminders } from "@/services/marketplace/delivery/send-pickup-deadline-reminders";
import { sendDailyScheduleEmails } from "@/services/marketplace/delivery/send-daily-schedule-emails";
import { getInventorySnapshot } from "@/services/marketplace/delivery/get-inventory-snapshot";

before(() => installFakeProviders());
beforeEach(async () => {
  paystack.reset();
  resend.reset();
  await prisma.rosterException.deleteMany({});
  await prisma.rosterAssignment.deleteMany({});
  await prisma.rosterSlotDay.deleteMany({});
  await prisma.deliveryRosterSettings.updateMany({ data: { defaultMaxDeliveries: null } });
});
afterEach(() => {
  delete process.env.MARKETPLACE_SCHEDULED_JOBS;
});
after(async () => {
  await prisma.$disconnect();
  await akadverseDb.$disconnect();
});

let adminId: string;
const admin = async () => (adminId ??= (await makeUser({ isAdmin: true })).id);
const DAY = 24 * 60 * 60 * 1000;

async function makeDeliverer({ bank = true } = {}) {
  const user = await makeUser();
  return prisma.deliverer.create({
    data: {
      userId: user.id,
      firstName: "Del",
      lastName: user.lastName,
      email: user.email,
      status: "APPROVED",
      ...(bank ? { bankName: "GTBank", bankCode: "058", accountNumber: `9${user.lastName.replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`, accountHolderName: "DEL RIDER" } : {}),
    },
  });
}

type S = Awaited<ReturnType<typeof vendorCheckoutScenario>>;
const codeFrom = (to: string) => /letter-spacing:4px;">(\d{6})</.exec(resend.sent.filter((m) => m.to === to && /delivery code/i.test(m.subject + m.html)).at(-1)!.html)![1];

async function bookAndPay(s: S, date = s.date) {
  const res = await createVendorOrdersForCheckout(s.buyer.id, { slotId: s.slot.id, location: "Hall B", date });
  paystack.set(res.reference, { status: "success", amount: res.amountKobo });
  assert.equal((await reconcileCheckoutPayment(res.reference, "verify")).state, "paid");
  const booking = await prisma.vendorDeliveryBooking.findFirstOrThrow({ where: { paystackReference: res.reference }, include: { orders: { include: { items: true } } } });
  return { booking, code: codeFrom(s.buyer.email), itemIds: booking.orders.flatMap((o) => o.items.map((i) => i.id)), orderId: booking.orders[0].id };
}

// Assigned to `d` — the deliverer's run (and its pay rate) starts there: no pickup code, no check-in.
async function collect(s: S, d: { id: string }, run: Awaited<ReturnType<typeof bookAndPay>>) {
  await assignDelivery(d.id, run.itemIds, await admin());
  return prisma.delivery_x_businesses.findFirstOrThrow({ where: { deliverymanId: d.id, businessId: s.vendor.id }, orderBy: { createdAt: "desc" } });
}

async function deliver(d: { id: string }, run: Awaited<ReturnType<typeof bookAndPay>>) {
  const out = await submitDeliveryCode(d.id, run.booking.id, { code: run.code, submissionId: `sub-${crypto.randomUUID()}` });
  assert.equal(out.outcome, "VERIFIED");
}

// A vendor with a bank account, and one of its orders fully delivered by a deliverer with one.
async function deliveredRun() {
  const s = await vendorCheckoutScenario({ stock: 10, capacity: 10 });
  await prisma.business.update({ where: { id: s.vendor.id }, data: { bankName: "GTBank", bankCode: "058", accountNumber: "0000000001", accountHolderName: "VENDOR KITCHEN" } });
  const d = await makeDeliverer();
  const run = await bookAndPay(s);
  const handoff = await collect(s, d, run);
  await deliver(d, run);
  return { s, d, run, handoff };
}
const age = (orderId: string, ms: number) => prisma.order.update({ where: { id: orderId }, data: { deliveredPendingDisputeAt: new Date(Date.now() - ms) } });

describe("vendor-dispute-window-sweep", () => {
  it("finalizes an undisputed order only after 24 h, then releases and pays the deliverer the locked-in rate exactly once", async () => {
    const { d, run, handoff } = await deliveredRun();
    assert.equal(handoff.delivererPayoutAmount, (await prisma.marketplaceSettings.findUniqueOrThrow({ where: { id: "default" } })).delivererPayoutAmount, "rate locked in at assignment");

    await age(run.orderId, 23 * 60 * 60 * 1000);
    await runDisputeWindowSweep();
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: run.orderId } })).deliveryOutcome, "DELIVERED_PENDING_DISPUTE_WINDOW", "not before 24 h");
    assert.equal((await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } })).delivererPayoutStatus, null);

    await age(run.orderId, DAY + 60_000);
    await runDisputeWindowSweep();
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: run.orderId } })).deliveryOutcome, "DELIVERED");
    assert.equal((await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } })).delivererPayoutStatus, "PAYOUT_PENDING");

    await runDelivererPayoutSweep();
    const mine = paystack.transfers.filter((t) => t.reference === `AKD-DLV-PAYOUT-${handoff.id}`);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].amount, Math.round(handoff.delivererPayoutAmount! * 100));
    const recipient = paystack.recipients.find((r) => r.code === mine[0].recipient)!;
    const del = await prisma.deliverer.findUniqueOrThrow({ where: { id: d.id } });
    assert.deepEqual([recipient.accountNumber, recipient.bankCode], [del.accountNumber, del.bankCode], "paid into the deliverer's own account");
    assert.equal((await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } })).delivererPayoutStatus, "PAYOUT_SUCCESS");

    await runDisputeWindowSweep();
    await runDelivererPayoutSweep();
    assert.equal(paystack.transfers.filter((t) => t.reference === `AKD-DLV-PAYOUT-${handoff.id}`).length, 1, "never paid twice");
  });

  it("never finalizes a disputed order, and holds the deliverer's pay while it's disputed", async () => {
    const { s, run, handoff } = await deliveredRun();
    await disputeOrder(run.orderId, s.buyer.id, "Food was cold");
    await age(run.orderId, 2 * DAY);
    await runDisputeWindowSweep();
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: run.orderId } })).deliveryOutcome, "DELIVERED_PENDING_DISPUTE_WINDOW");
    assert.equal((await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } })).delivererPayoutStatus, null);
  });

  it("pays a finished pickup even while the same deliverer has a later pickup from the same vendor still in progress", async () => {
    const { s, d, run, handoff } = await deliveredRun();
    await addToCart(s.buyer.id, s.product.id, 1);
    const later = await bookAndPay(s, lagosDatePlus(2));
    await collect(s, d, later); // assigned, not yet delivered

    await age(run.orderId, DAY + 60_000);
    await runDisputeWindowSweep();
    assert.equal((await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } })).delivererPayoutStatus, "PAYOUT_PENDING", "the first run's pay doesn't wait for unrelated later runs");
  });

  it("retries a failed transfer up to 5 times, then stops", async () => {
    const { run, handoff } = await deliveredRun();
    await age(run.orderId, DAY + 60_000);
    await runDisputeWindowSweep();
    paystack.transferMode = "fail";
    for (let i = 0; i < 7; i++) await runDelivererPayoutSweep();
    const row = await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } });
    assert.deepEqual([row.delivererPayoutStatus, row.delivererPayoutAttempts], ["PAYOUT_FAILED", 5]);
  });

  it("a transfer Paystack reports as still pending is left processing — not marked paid, never re-sent", async () => {
    const { run, handoff } = await deliveredRun();
    await age(run.orderId, DAY + 60_000);
    await runDisputeWindowSweep();
    paystack.transferMode = "pending";
    await runDelivererPayoutSweep();
    await runDelivererPayoutSweep();
    assert.equal((await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } })).delivererPayoutStatus, "PAYOUT_PROCESSING");
    assert.equal(paystack.transfers.filter((t) => t.reference === `AKD-DLV-PAYOUT-${handoff.id}`).length, 1);
  });
});

describe("seller-payout", () => {
  it("pays the vendor the full item price (0% fee) once the item is delivered, exactly once", async () => {
    const { run } = await deliveredRun();
    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: run.itemIds[0] } });
    assert.deepEqual([item.escrowStatus, item.payoutStatus], ["PAYOUT_PENDING", "PAYOUT_PENDING"]);
    await runPayoutSweep();
    await runPayoutSweep();
    const mine = paystack.transfers.filter((t) => t.reference.startsWith(`AKD-PAYOUT-${item.id}-`));
    assert.equal(mine.length, 1, "never paid twice");
    assert.equal(mine[0].amount, Math.round(item.price * item.quantity * 100));
    const paid = await prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } });
    assert.deepEqual([paid.escrowStatus, paid.payoutStatus], ["PAID_OUT", "PAYOUT_SUCCESS"]);
  });

  it("never pays an item that isn't delivered yet", async () => {
    const s = await vendorCheckoutScenario();
    await prisma.business.update({ where: { id: s.vendor.id }, data: { bankName: "GTBank", bankCode: "058", accountNumber: "0000000002", accountHolderName: "V" } });
    const run = await bookAndPay(s);
    await runPayoutSweep();
    assert.equal(paystack.transfers.filter((t) => t.reference.startsWith(`AKD-PAYOUT-${run.itemIds[0]}-`)).length, 0);
  });

  it("a vendor without bank details fails each run and is given up on after 5 attempts (current behaviour)", async () => {
    const { s, run } = await deliveredRun();
    await prisma.business.update({ where: { id: s.vendor.id }, data: { accountNumber: null, paystackRecipientCode: null } });
    for (let i = 0; i < 7; i++) await runPayoutSweep();
    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: run.itemIds[0] } });
    assert.deepEqual([item.payoutStatus, item.payoutAttempts], ["PAYOUT_FAILED", 5]);
    assert.equal(paystack.transfers.filter((t) => t.reference.startsWith(`AKD-PAYOUT-${item.id}-`)).length, 0);
  });
});

describe("delivery-retry", () => {
  it("returns a failed-once item to the pool after 24 h, not before; a twice-failed (cancelled) item never comes back", async () => {
    const s = await vendorCheckoutScenario();
    const d = await makeDeliverer();
    const run = await bookAndPay(s);
    await collect(s, d, run);
    await reportBookingFailedAttempt(d.id, run.booking.id, "Nobody at the hall");
    const itemId = run.itemIds[0];
    assert.equal((await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } })).deliveryStatus, "FAILED");

    await runDeliveryRetrySweep();
    assert.equal((await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } })).deliveryStatus, "FAILED", "not before 24 h");

    await prisma.orderItem.update({ where: { id: itemId }, data: { retryDeliveryAt: new Date(Date.now() - 60_000) } });
    await runDeliveryRetrySweep();
    const back = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    assert.deepEqual([back.deliveryStatus, back.retryDeliveryAt, back.failedDeliveryAttempts], [null, null, 1], "unassigned again, ready to be reassigned");

    await prisma.orderItem.update({ where: { id: itemId }, data: { deliveryStatus: "FAILED", failedDeliveryAttempts: 2, cancelledAt: new Date(), retryDeliveryAt: new Date(Date.now() - 60_000) } });
    await runDeliveryRetrySweep();
    assert.equal((await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } })).deliveryStatus, "FAILED", "a cancelled item stays cancelled");
  });
});

describe("pickup-deadline-reminder", () => {
  it("emails a Business deliverer once when their pickup code expires within 3 h, never once picked up — and never for Vendor runs (no pickup code)", async () => {
    const b = await businessCheckoutScenario();
    const res = await createOrdersForCheckout(b.buyer.id, "Hall A");
    paystack.set(res.reference, { status: "success", amount: res.amountKobo });
    await reconcileCheckoutPayment(res.reference, "verify");
    await prisma.order.update({ where: { id: res.orderIds[0] }, data: { status: "ACCEPTED", fulfillmentStatus: "READY_FOR_PICKUP", sellerDroppedOffAt: new Date() } });
    const d = await makeDeliverer();
    await assignDelivery(d.id, (await prisma.orderItem.findMany({ where: { orderId: res.orderIds[0] } })).map((i) => i.id), await admin());
    const handoff = await prisma.delivery_x_businesses.findFirstOrThrow({ where: { deliverymanId: d.id } });
    assert.ok(handoff.pickupOtp, "Business keeps its coordinator pickup code");
    const reminders = (to: string) => resend.sent.filter((m) => m.to === to && !/New pickup/.test(m.subject)).length;

    await prisma.delivery_x_businesses.update({ where: { id: handoff.id }, data: { pickupOtpExpiry: new Date(Date.now() + 5 * 60 * 60 * 1000) } });
    await sendPickupDeadlineReminders();
    assert.equal(reminders(d.email), 0, "not while more than 3 h remain");

    await prisma.delivery_x_businesses.update({ where: { id: handoff.id }, data: { pickupOtpExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000) } });
    await sendPickupDeadlineReminders();
    await sendPickupDeadlineReminders();
    assert.equal(reminders(d.email), 1, "once");

    await prisma.delivery_x_businesses.update({ where: { id: handoff.id }, data: { delivererConfirmedPickupAt: new Date(), pickupDeadlineReminderSentAt: null } });
    await sendPickupDeadlineReminders();
    assert.equal(reminders(d.email), 1, "already picked up");

    // A Vendor run left over from the old flow, still carrying a code: no reminder either.
    const s = await vendorCheckoutScenario();
    const vd = await makeDeliverer();
    const run = await bookAndPay(s);
    const vendorRun = await collect(s, vd, run);
    await prisma.delivery_x_businesses.update({ where: { id: vendorRun.id }, data: { delivererConfirmedPickupAt: null, pickupOtp: "123456", pickupOtpExpiry: new Date(Date.now() + 60 * 60 * 1000) } });
    await sendPickupDeadlineReminders();
    assert.equal(reminders(vd.email), 0);
  });
});

describe("delivery-schedule (daily)", () => {
  it("emails a deliverer their deliveries expected today, and nobody with nothing due", async () => {
    const s = await vendorCheckoutScenario();
    const [d, idle] = [await makeDeliverer(), await makeDeliverer()];
    const run = await bookAndPay(s);
    await assignDelivery(d.id, run.itemIds, await admin());
    const now = new Date();
    // Only orders with an estimated delivery window are listed — Business orders carry one; vendor orders don't
    // (their deliverers get the 2-hour briefing instead), so this order is given one to stand in for a Business one.
    await prisma.order.update({ where: { id: run.orderId }, data: { estimatedDeliveryAt: now, deliveryWindowStart: now, deliveryWindowEnd: new Date(now.getTime() + 60 * 60 * 1000) } });
    await akadverseDb.delivery.updateMany({ where: { deliverymanId: d.id }, data: { expectedDeliveryAt: now } });

    await sendDailyScheduleEmails();
    assert.equal(resend.sent.filter((m) => m.to === d.email && !/New pickup/.test(m.subject)).length, 1);
    assert.equal(resend.sent.filter((m) => m.to === idle.email).length, 0);
  });

  it("doesn't include Vendor Market deliveries (they have no estimated window)", async () => {
    const s = await vendorCheckoutScenario();
    const d = await makeDeliverer();
    const run = await bookAndPay(s);
    await assignDelivery(d.id, run.itemIds, await admin());
    await akadverseDb.delivery.updateMany({ where: { deliverymanId: d.id }, data: { expectedDeliveryAt: new Date() } });
    await sendDailyScheduleEmails();
    assert.equal(resend.sent.filter((m) => m.to === d.email && !/New pickup/.test(m.subject)).length, 0);
  });
});

describe("deliverer-inventory (daily)", () => {
  it("reports held items per business and changes nothing", async () => {
    const s = await vendorCheckoutScenario();
    const d = await makeDeliverer();
    const run = await bookAndPay(s);
    await assignDelivery(d.id, run.itemIds, await admin());
    const before = await prisma.deliveryItem.findMany({ where: { businessId: s.vendor.id } });
    const snapshot = await getInventorySnapshot();
    assert.deepEqual(snapshot.find((r) => r.businessId === s.vendor.id), { businessId: s.vendor.id, status: "ASSIGNED", count: 1 });
    assert.deepEqual(await prisma.deliveryItem.findMany({ where: { businessId: s.vendor.id } }), before);
  });
});

describe("cron HTTP routes", () => {
  const ROUTES = [
    "checkout-reconcile",
    "deliverer-inventory",
    "delivery-retry",
    "delivery-schedule",
    "email-retry",
    "pickup-deadline-reminder",
    "seller-payout",
    "seller-response",
    "vendor-dispute-window-sweep",
    "vendor-slot-briefing",
  ];
  const call = async (name: string, auth?: string) => {
    const mod = (await import(`@/app/api/cron/${name}/route`)) as { GET: (req: NextRequest) => Promise<Response> };
    return mod.GET(new NextRequest(`https://marketplace.test/api/cron/${name}`, { headers: auth ? { authorization: auth } : {} }));
  };

  it("every job refuses a wrong secret, and only the briefing runs while scheduled jobs are switched off", async () => {
    for (const name of ROUTES) {
      assert.equal((await call(name)).status, 401, `${name}: no secret`);
      assert.equal((await call(name, "Bearer wrong")).status, 401, `${name}: wrong secret`);
      assert.equal((await call(name, "Bearer test-cron-secret")).status, name === "vendor-slot-briefing" ? 200 : 503, `${name}: switched off`);
    }
  });

  it("every job runs and returns its summary once scheduled jobs are enabled", async () => {
    process.env.MARKETPLACE_SCHEDULED_JOBS = "enabled";
    paystack.transferMode = "pending"; // no real outcome needed here — just that each route runs end to end
    for (const name of ROUTES) {
      const res = await call(name, "Bearer test-cron-secret");
      assert.equal(res.status, 200, name);
      assert.equal(typeof (await res.json()), "object", name);
    }
  });
});
