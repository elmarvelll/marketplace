// Student-orchestrated Vendor Market delivery, end to end against the local test replica: the two-hour cutoff at
// checkout, the student's handover code (issued only after verified payment, masked for everyone else), vendors
// as information-only, per-booking delivery confirmation (wrong codes, lock, replay, late -> admin review), and the
// pre-slot briefing (auto-assignment, exactly-once notifications). Paystack/Resend faked.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/service-error";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { signInAs } from "../helpers/session";
import { addToCart, makeBusiness, makeProduct, makeSlot, makeUser, lagosDatePlus, vendorCheckoutScenario } from "../helpers/fixtures";
import { createVendorOrdersForCheckout } from "@/services/marketplace/vendor-checkout/create-vendor-orders-for-checkout";
import { calculateVendorCheckoutSummary } from "@/services/marketplace/vendor-checkout/calculate-vendor-checkout-summary";
import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { assignDelivery } from "@/services/marketplace/delivery/assign-delivery";
import { confirmPickup } from "@/services/marketplace/delivery/confirm-pickup";
import { markOutForDelivery } from "@/services/marketplace/delivery/mark-out-for-delivery";
import { markOrderReady } from "@/services/marketplace/order/mark-order-ready";
import { listVendorOrders } from "@/services/marketplace/vendor/order/list-vendor-orders";
import { listBuyerOrders } from "@/services/marketplace/order/list-buyer-orders";
import { setPlannedDeliverer } from "@/services/marketplace/delivery-roster/delivery-plans";
import { buildVendorManifests } from "@/services/marketplace/vendor-delivery/handover/manifest";
import { submitDeliveryCode } from "@/services/marketplace/vendor-delivery/handover/submit-delivery-code";
import { startBookingDelivery } from "@/services/marketplace/vendor-delivery/handover/booking-delivery";
import { reissueHandoverCode } from "@/services/marketplace/vendor-delivery/handover/handover-code";
import { reviewLateSubmission, reassignBooking } from "@/services/marketplace/vendor-delivery/handover/admin-operations";
import { runSlotBriefings } from "@/services/marketplace/vendor-delivery/slot-briefing";
import { schoolTimeToInstant } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { checkInShift, setCheckInLocation, shiftState } from "@/services/marketplace/vendor-delivery/handover/shift";

before(() => installFakeProviders());
beforeEach(async () => {
  paystack.reset();
  resend.reset();
  signInAs(null);
  await prisma.rosterException.deleteMany({});
  await prisma.rosterAssignment.deleteMany({});
  await prisma.rosterSlotDay.deleteMany({});
  await prisma.deliveryRosterSettings.updateMany({ data: { defaultMaxDeliveries: null } });
});
after(() => prisma.$disconnect());

const status = (n: number) => (e: unknown) => e instanceof ServiceError && e.status === n;
let adminId: string;
const admin = async () => (adminId ??= (await makeUser({ isAdmin: true })).id);
async function makeDeliverer() {
  const user = await makeUser();
  return prisma.deliverer.create({ data: { userId: user.id, firstName: "Del", lastName: user.lastName, email: user.email, status: "APPROVED" } });
}

type S = Awaited<ReturnType<typeof vendorCheckoutScenario>>;
async function bookAndPay(s: S, userId = s.buyer.id) {
  const res = await createVendorOrdersForCheckout(userId, { slotId: s.slot.id, location: "Hall B, room 12", date: s.date });
  paystack.set(res.reference, { status: "success", amount: res.amountKobo });
  assert.equal((await reconcileCheckoutPayment(res.reference, "verify")).state, "paid");
  return prisma.vendorDeliveryBooking.findFirstOrThrow({ where: { paystackReference: res.reference }, include: { orders: { include: { items: true } } } });
}
const codeEmails = (to: string) => resend.sent.filter((m) => m.to === to && /delivery code/i.test(m.subject + m.html) && /letter-spacing/.test(m.html));
const codeFrom = (html: string) => /letter-spacing:4px;">(\d{6})</.exec(html)![1];

// Paid booking, assigned to a fresh deliverer (not yet checked in).
async function assigned() {
  const s = await vendorCheckoutScenario();
  const booking = await bookAndPay(s);
  const code = codeFrom(codeEmails(s.buyer.email).at(-1)!.html);
  const d = await makeDeliverer();
  const itemIds = booking.orders.flatMap((o) => o.items.map((i) => i.id));
  await assignDelivery(d.id, itemIds, await admin());
  const handoff = await prisma.delivery_x_businesses.findFirstOrThrow({ where: { deliverymanId: d.id, businessId: s.vendor.id } });
  const shift = { date: s.date, slotId: s.slot.id, delivererId: d.id };
  return { s, booking, code, d, itemIds, handoff, shift };
}
// ...checked in at the meeting point and picked up at the vendor.
async function collected() {
  const a = await assigned();
  await checkInShift(await admin(), a.shift);
  await confirmPickup(a.d.id, a.handoff.id, a.handoff.pickupOtp!);
  return a;
}
const wrongOf = (code: string) => (code === "999999" ? "000000" : String(Number(code) + 1).padStart(6, "0"));
const sid = () => `sub-${crypto.randomUUID()}`;

describe("student handover code", () => {
  it("is issued once, only after verified payment; the student sees it, deliverers and admins only the mask", async () => {
    const s = await vendorCheckoutScenario();
    const unpaid = await createVendorOrdersForCheckout(s.buyer.id, { slotId: s.slot.id, location: "Hall", date: s.date });
    const pendingBooking = await prisma.vendorDeliveryBooking.findFirstOrThrow({ where: { paystackReference: unpaid.reference } });
    assert.equal(await prisma.deliveryHandoverCode.count({ where: { bookingId: pendingBooking.id } }), 0, "no code while awaiting payment");

    paystack.set(unpaid.reference, { status: "success", amount: unpaid.amountKobo });
    await reconcileCheckoutPayment(unpaid.reference, "verify");
    await reconcileCheckoutPayment(unpaid.reference, "webhook"); // replayed confirmation
    const rows = await prisma.deliveryHandoverCode.findMany({ where: { bookingId: pendingBooking.id } });
    assert.equal(rows.length, 1);
    assert.match(rows[0].maskedCode, /^(?=(?:[^_]*_){3}[^_]*$)[0-9_]{6}$/, "three positions hidden");
    const emails = codeEmails(s.buyer.email);
    assert.equal(emails.length, 1, "the student is emailed once");
    const code = codeFrom(emails[0].html);
    assert.ok(!emails[0].subject.includes(code), "never in the subject");
    assert.ok(!rows[0].codeHash.includes(code) && !rows[0].codeCipher.includes(code));
    assert.equal(await prisma.emailDelivery.count({ where: { html: { contains: code } } }), 0, "not persisted in the email outbox");
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: s.buyer.id, type: "VENDOR_DELIVERY_CODE" } });
    assert.ok(!note.message.includes(code), "never in a stored notification");

    const mine = (await listBuyerOrders(s.buyer.id)).find((o) => o.vendorDelivery)!;
    assert.equal(mine.vendorDelivery!.code, code);
    assert.equal((await listBuyerOrders((await makeUser()).id)).length, 0, "nobody else's");
  });
});

describe("vendors are information-only", () => {
  it("a paid vendor order is assignable without any vendor action, and vendors can't mark it ready", async () => {
    const s = await vendorCheckoutScenario();
    const booking = await bookAndPay(s);
    const order = booking.orders[0];
    await assert.rejects(markOrderReady(s.vendor.id, order.id, s.owner.id), status(404));
    const d = await makeDeliverer();
    await setPlannedDeliverer({ bookingId: booking.id, delivererId: d.id }, await admin());
    const { assignPlannedDeliveries } = await import("@/services/marketplace/delivery-roster/assign-planned");
    const out = await assignPlannedDeliveries(order.items.map((i) => i.id), await admin());
    assert.deepEqual(out.assigned.map((a) => a.delivererId), [d.id]);

    signInAs(s.owner);
    const listed = (await listVendorOrders(s.vendor.id)).orders.find((o) => o.id === order.id)!;
    assert.equal(listed.delivererName, `Del ${(await prisma.user.findUniqueOrThrow({ where: { id: d.userId } })).lastName}`);
  });
});

describe("delivery confirmation with the student's code", () => {
  it("wrong codes count, other deliverers can't, the full code completes it once, replays change nothing", async () => {
    const { s, booking, code, d, itemIds } = await collected();
    const cards = await buildVendorManifests({ delivererId: d.id });
    const delivery = cards.flatMap((c) => c.deliveries).find((x) => x.bookingId === booking.id)!;
    assert.match(delivery.maskedCode!, /_/);
    assert.ok(!JSON.stringify(cards).includes(code), "the card never carries the full code");
    assert.equal(delivery.studentFirstName, s.buyer.firstName);

    const deliveryItem = await prisma.deliveryItem.findFirstOrThrow({ where: { orderItemId: itemIds[0] } });
    await assert.rejects(markOutForDelivery(d.id, deliveryItem.id), status(409), "no per-item code for vendor items");
    assert.deepEqual(await startBookingDelivery(d.id, booking.id), { started: 1 });

    const wrong = await submitDeliveryCode(d.id, booking.id, { code: wrongOf(code), submissionId: sid() });
    assert.deepEqual(wrong, { outcome: "REJECTED", reason: "mismatch", attemptsLeft: 4 });
    const other = await makeDeliverer();
    await assert.rejects(submitDeliveryCode(other.id, booking.id, { code, submissionId: sid() }), status(404));
    await assert.rejects(submitDeliveryCode(d.id, booking.id, { code: delivery.maskedCode, submissionId: sid() }), status(400), "the mask is not a code");

    const submissionId = sid();
    const ok = await submitDeliveryCode(d.id, booking.id, { code, submissionId, clientRecordedAt: new Date(0).toISOString() });
    assert.deepEqual(ok, { outcome: "VERIFIED", deliveredItems: 1, alreadyDelivered: false });
    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemIds[0] } });
    assert.deepEqual([item.deliveryStatus, item.escrowStatus], ["DELIVERED", "PAYOUT_PENDING"]);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: item.orderId } })).deliveryOutcome, "DELIVERED_PENDING_DISPUTE_WINDOW");
    assert.ok((await prisma.deliveryHandoverCode.findUniqueOrThrow({ where: { bookingId: booking.id } })).verifiedAt);

    assert.deepEqual(await submitDeliveryCode(d.id, booking.id, { code, submissionId }), { outcome: "VERIFIED", deliveredItems: 0, alreadyDelivered: true });
    await assert.rejects(submitDeliveryCode(other.id, booking.id, { code, submissionId }), status(409), "a submission id can't be reused by someone else");
    assert.equal(await prisma.orderEvent.count({ where: { orderItemId: itemIds[0], type: "DELIVERED" } }), 1, "side effects once");
    const sub = await prisma.deliveryCodeSubmission.findUniqueOrThrow({ where: { submissionId } });
    assert.ok(sub.receivedAt.getTime() > Date.now() - 60_000 && sub.clientRecordedAt!.getTime() === 0, "server time decides; client time kept for audit");
  });

  it("locks after five wrong codes until an admin reissues it; the new code then works", async () => {
    const { s, booking, code, d } = await collected();
    for (let i = 4; i >= 0; i--) {
      assert.deepEqual(await submitDeliveryCode(d.id, booking.id, { code: wrongOf(code), submissionId: sid() }), { outcome: "REJECTED", reason: "mismatch", attemptsLeft: i });
    }
    assert.deepEqual(await submitDeliveryCode(d.id, booking.id, { code, submissionId: sid() }), { outcome: "REJECTED", reason: "locked", attemptsLeft: 0 });

    await assert.rejects(reissueHandoverCode(booking.id, await admin(), ""), status(400), "a reason is required");
    await reissueHandoverCode(booking.id, await admin(), "Student lost the email");
    const fresh = codeFrom(codeEmails(s.buyer.email).at(-1)!.html);
    assert.ok((await prisma.adminActionLog.count({ where: { targetId: booking.id, action: "VENDOR_DELIVERY_CODE_REISSUED" } })) === 1);
    if (fresh !== code) {
      assert.equal((await submitDeliveryCode(d.id, booking.id, { code, submissionId: sid() })).outcome, "REJECTED", "old code dead");
    }
    assert.equal((await submitDeliveryCode(d.id, booking.id, { code: fresh, submissionId: sid() })).outcome, "VERIFIED");
  });

  it("a correct code first received after the 24-hour deadline completes nothing until an admin approves it", async () => {
    const { booking, code, d, itemIds } = await collected();
    // Move the whole shift three days back: the deliverer was checked in on the day, the code only arrives now.
    const past = new Date(`${lagosDatePlus(-3)}T00:00:00.000Z`);
    await prisma.vendorDeliveryBooking.update({ where: { id: booking.id }, data: { bookedFor: past } });
    await checkInShift(await admin(), { date: lagosDatePlus(-3), slotId: booking.slotId, delivererId: d.id, note: "checked in on the day (test setup)" });

    const late = await submitDeliveryCode(d.id, booking.id, { code, submissionId: sid(), clientRecordedAt: new Date().toISOString() });
    assert.equal(late.outcome, "LATE_REVIEW");
    assert.equal((await prisma.orderItem.findUniqueOrThrow({ where: { id: itemIds[0] } })).deliveryStatus, "PICKED_UP", "not delivered");

    const row = await prisma.deliveryCodeSubmission.findFirstOrThrow({ where: { bookingId: booking.id, outcome: "LATE_REVIEW" } });
    await assert.rejects(reviewLateSubmission(await admin(), row.id, { decision: "COMPLETED" }), status(400), "a reason is required");
    assert.deepEqual(await reviewLateSubmission(await admin(), row.id, { decision: "COMPLETED", note: "Student confirmed by phone" }), { delivered: 1 });
    assert.equal((await prisma.orderItem.findUniqueOrThrow({ where: { id: itemIds[0] } })).deliveryStatus, "DELIVERED");
    await assert.rejects(reviewLateSubmission(await admin(), row.id, { decision: "COMPLETED", note: "again" }), status(409));
    const event = await prisma.orderEvent.findFirstOrThrow({ where: { orderItemId: itemIds[0], type: "DELIVERED" } });
    assert.deepEqual([event.actorType, event.actorId], ["admin", await admin()]);
  });

  it("an admin can move uncollected items to another deliverer, with a reason; collected ones stay put", async () => {
    const s = await vendorCheckoutScenario();
    const booking = await bookAndPay(s);
    const [a, b] = [await makeDeliverer(), await makeDeliverer()];
    await assignDelivery(a.id, booking.orders[0].items.map((i) => i.id), await admin());
    await assert.rejects(reassignBooking(await admin(), booking.id, { delivererId: b.id }), status(400));
    assert.equal((await reassignBooking(await admin(), booking.id, { delivererId: b.id, reason: "Del A is ill" })).reassignedItems, 1);
    const di = await prisma.deliveryItem.findFirstOrThrow({ where: { orderItemId: booking.orders[0].items[0].id }, include: { delivery: true } });
    assert.equal(di.delivery.deliverymanId, b.id);
    const oldHandoff = await prisma.delivery_x_businesses.findFirstOrThrow({ where: { deliverymanId: a.id, businessId: s.vendor.id } });
    assert.equal(oldHandoff.pickupOtp, null, "the old deliverer's pickup code no longer works");
  });
});

describe("two-hour cutoff at checkout", () => {
  it("the backend refuses a slot starting within two hours, and the summary agrees", async () => {
    const soon = new Date(Date.now() + 60 * 60_000);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(soon).map((p) => [p.type, p.value]));
    const start = `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
    if (start >= "23:30") return; // can't fit a window before midnight; the pure tests cover this boundary
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const [buyer, owner] = await Promise.all([makeUser(), makeUser()]);
    const vendor = await makeBusiness(owner.id, { type: "SCHOOL_VENDOR" });
    const product = await makeProduct(vendor.id, { stock: 5 });
    const slot = await makeSlot({ windowStart: start, windowEnd: "23:59", bookingCutoffMins: 0 });
    await prisma.vendorTimeframeCapacity.create({ data: { businessId: vendor.id, slotId: slot.id, capacity: 5 } });
    await addToCart(buyer.id, product.id, 1);

    await assert.rejects(createVendorOrdersForCheckout(buyer.id, { slotId: slot.id, location: "Hall", date }), status(409));
    const summary = await calculateVendorCheckoutSummary(buyer.id, date);
    assert.equal(summary.slots.find((x) => x.id === slot.id)?.bookable, false);
  });

  it("a payment started before the cutoff still completes after it passes", async () => {
    const s = await vendorCheckoutScenario();
    const res = await createVendorOrdersForCheckout(s.buyer.id, { slotId: s.slot.id, location: "Hall", date: s.date });
    await prisma.vendorDeliverySlot.update({ where: { id: s.slot.id }, data: { bookingCutoffMins: 100_000 } }); // cutoff now passed
    paystack.set(res.reference, { status: "success", amount: res.amountKobo });
    assert.equal((await reconcileCheckoutPayment(res.reference, "verify")).state, "paid");
  });
});

describe("pre-slot briefing", () => {
  it("auto-assigns planned deliveries and notifies admins and the deliverer exactly once, ignoring unpaid checkouts", async () => {
    const [buyer, buyer2, owner] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const vendor = await makeBusiness(owner.id, { type: "SCHOOL_VENDOR" });
    const product = await makeProduct(vendor.id, { stock: 10 });
    const slot = await makeSlot({ windowStart: "21:17", windowEnd: "21:47" });
    await prisma.vendorTimeframeCapacity.create({ data: { businessId: vendor.id, slotId: slot.id, capacity: 5 } });
    await Promise.all([addToCart(buyer.id, product.id, 1), addToCart(buyer2.id, product.id, 1)]);
    const s = { buyer, owner, vendor, product, slot, date: lagosDatePlus(1) } as unknown as S;
    const booking = await bookAndPay(s);
    await createVendorOrdersForCheckout(buyer2.id, { slotId: slot.id, location: "Hall", date: s.date }); // unpaid
    const d = await makeDeliverer();
    await setPlannedDeliverer({ bookingId: booking.id, delivererId: d.id }, await admin());
    await admin();

    const start = schoolTimeToInstant(new Date(`${s.date}T00:00:00.000Z`), "21:17");
    const early = await runSlotBriefings(new Date(start.getTime() - 3 * 60 * 60_000));
    assert.ok(!early.occurrences.some((o) => o.slotId === slot.id), "not before the two-hour mark");

    const run = await runSlotBriefings(new Date(start.getTime() - 100 * 60_000));
    const mine = run.occurrences.find((o) => o.slotId === slot.id)!;
    assert.deepEqual([mine.confirmedBookings, mine.awaitingPayment, mine.newlyAssignedItems, mine.unassignedItems], [1, 1, 1, 0]);
    assert.ok(mine.adminsNotified >= 1);
    assert.equal(mine.deliverersNotified, 1);
    const di = await prisma.deliveryItem.findFirstOrThrow({ where: { orderItemId: booking.orders[0].items[0].id }, include: { delivery: true } });
    assert.equal(di.delivery.deliverymanId, d.id);
    const briefing = await prisma.notification.findFirstOrThrow({ where: { userId: d.userId, type: "DELIVERER_SLOT_BRIEFING" } });
    assert.match(briefing.message, /1 student delivery/);
    assert.ok(resend.sent.some((m) => m.to === d.email && /deliveries for/.test(m.subject) && !m.html.includes(buyer.email)));

    const again = await runSlotBriefings(new Date(start.getTime() - 90 * 60_000));
    const second = again.occurrences.find((o) => o.slotId === slot.id)!;
    assert.deepEqual([second.adminsNotified, second.deliverersNotified], [0, 0]);
    assert.equal(await prisma.notification.count({ where: { userId: d.userId, type: "DELIVERER_SLOT_BRIEFING" } }), 1);
    assert.equal(await prisma.notification.count({ where: { userId: await admin(), type: "VENDOR_SLOT_BRIEFING", title: { contains: slot.label } } }), 1);
  });
});

describe("deliverer shifts: meeting point, check-in, missed", () => {
  it("pure rule: scheduled until checked in, then in progress / delivered; missed after the slot ends; a late unlock stays missed", () => {
    const end = new Date("2026-10-20T17:00:00.000Z");
    const before = new Date("2026-10-20T16:00:00.000Z");
    const after = new Date("2026-10-20T17:01:00.000Z");
    assert.deepEqual(shiftState(null, end, false, before), { state: "SCHEDULED", unlocked: false });
    assert.deepEqual(shiftState(null, end, false, after), { state: "MISSED", unlocked: false });
    assert.deepEqual(shiftState({ checkedInAt: before, late: false }, end, false, after), { state: "IN_PROGRESS", unlocked: true });
    assert.deepEqual(shiftState({ checkedInAt: before, late: false }, end, true, after), { state: "DELIVERED", unlocked: true });
    assert.deepEqual(shiftState({ checkedInAt: after, late: true }, end, true, after), { state: "MISSED", unlocked: true });
  });

  it("nothing can be collected or delivered until an admin checks the deliverer in at the meeting point", async () => {
    await setCheckInLocation(await admin(), "Marketplace office, SUB");
    const { booking, code, d, handoff, shift } = await assigned();
    const card = (await buildVendorManifests({ delivererId: d.id })).find((c) => c.deliveries.some((x) => x.bookingId === booking.id))!;
    assert.deepEqual([card.shift.state, card.shift.unlocked, card.meetingPoint], ["SCHEDULED", false, "Marketplace office, SUB"]);

    await assert.rejects(confirmPickup(d.id, handoff.id, handoff.pickupOtp!), (e: unknown) => status(409)(e) && /Marketplace office, SUB/.test((e as Error).message));
    assert.equal((await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } })).pickupOtpAttempts, 0, "a refused pickup doesn't use up an attempt");
    await assert.rejects(submitDeliveryCode(d.id, booking.id, { code, submissionId: sid() }), status(409));

    assert.deepEqual(await checkInShift(await admin(), shift), { alreadyCheckedIn: false, late: false });
    assert.deepEqual(await checkInShift(await admin(), shift), { alreadyCheckedIn: true, late: false }, "idempotent");
    assert.equal((await buildVendorManifests({ delivererId: d.id })).find((c) => c.deliveries.some((x) => x.bookingId === booking.id))!.shift.state, "IN_PROGRESS");
    await confirmPickup(d.id, handoff.id, handoff.pickupOtp!);
    assert.equal((await submitDeliveryCode(d.id, booking.id, { code, submissionId: sid() })).outcome, "VERIFIED");
    assert.equal((await buildVendorManifests({ delivererId: d.id })).find((c) => c.deliveries.some((x) => x.bookingId === booking.id))!.shift.state, "DELIVERED");
    assert.equal(await prisma.adminActionLog.count({ where: { targetId: d.id, action: "DELIVERY_SHIFT_CHECKED_IN" } }), 1);
  });

  it("a shift with no check-in by the slot's end is missed, flagged to admins once, and can only be unlocked with a reason", async () => {
    const { booking, d, shift } = await assigned();
    await prisma.vendorDeliveryBooking.update({ where: { id: booking.id }, data: { bookedFor: new Date(`${lagosDatePlus(0)}T00:00:00.000Z`) } });
    await prisma.vendorDeliverySlot.update({ where: { id: shift.slotId }, data: { windowStart: "00:00", windowEnd: "00:01" } });
    const today = lagosDatePlus(0);
    const card = (await buildVendorManifests({ delivererId: d.id })).find((c) => c.deliveries.some((x) => x.bookingId === booking.id))!;
    assert.deepEqual([card.shift.state, card.shift.unlocked], ["MISSED", false]);

    const end = schoolTimeToInstant(new Date(`${today}T00:00:00.000Z`), "00:01");
    const first = await runSlotBriefings(new Date(end.getTime() + 60_000));
    assert.ok(first.missedShiftNotices >= 1);
    await runSlotBriefings(new Date(end.getTime() + 120_000));
    assert.equal(await prisma.notification.count({ where: { userId: d.userId, type: "DELIVERER_SHIFT_MISSED" } }), 1, "deliverer told once");
    assert.equal(await prisma.notification.count({ where: { userId: await admin(), type: "VENDOR_SHIFT_MISSED", title: { contains: d.lastName } } }), 1, "each admin told once");

    const late = { ...shift, date: today };
    await assert.rejects(checkInShift(await admin(), late), status(400), "a missed shift needs a reason to unlock");
    assert.deepEqual(await checkInShift(await admin(), { ...late, note: "Phone died, came late" }), { alreadyCheckedIn: false, late: true });
    const after = (await buildVendorManifests({ delivererId: d.id })).find((c) => c.deliveries.some((x) => x.bookingId === booking.id))!;
    assert.deepEqual([after.shift.state, after.shift.unlocked], ["MISSED", true], "unlocked, still counted as missed");
  });
});

