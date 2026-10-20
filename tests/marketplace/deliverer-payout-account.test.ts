// Deliverer payout accounts (asked for at application, editable from the dashboard, holder name always from
// Paystack), payouts waiting for deliverers without one, and on-demand assignment so a deliverer sees every delivery
// due within two hours even before the scheduled job runs. Real local Postgres; Paystack/Resend faked.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/service-error";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { makeUser, vendorCheckoutScenario } from "../helpers/fixtures";
import { applyForDeliverer } from "@/services/marketplace/deliverer/apply-for-deliverer";
import { getPayoutAccount, setPayoutAccount } from "@/services/marketplace/deliverer/payout-account";
import { runDelivererPayoutSweep } from "@/services/marketplace/vendor-delivery/payout/run-deliverer-payout-sweep";
import { createVendorOrdersForCheckout } from "@/services/marketplace/vendor-checkout/create-vendor-orders-for-checkout";
import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { setPlannedDeliverer } from "@/services/marketplace/delivery-roster/delivery-plans";
import { assignDueDeliveries } from "@/services/marketplace/vendor-delivery/slot-briefing";
import { buildVendorManifests } from "@/services/marketplace/vendor-delivery/handover/manifest";
import { schoolTimeToInstant } from "@/services/marketplace/vendor-delivery/is-slot-bookable";

before(() => installFakeProviders());
beforeEach(() => {
  paystack.reset();
  resend.reset();
});
after(() => prisma.$disconnect());

const status = (n: number) => (e: unknown) => e instanceof ServiceError && e.status === n;

async function verifiedApplicant() {
  const user = await makeUser();
  await prisma.user.update({ where: { id: user.id }, data: { studentEmailVerifiedAt: new Date(), studentEmailLocalPart: user.lastName } });
  return user;
}
const form = (user: { lastName: string; email: string }, bank: Record<string, string> = {}) => ({ firstName: "Ada", lastName: user.lastName, email: user.email, ...bank });

describe("deliverer payout account", () => {
  it("is required when applying, and the holder name is Paystack's, never the form's", async () => {
    const user = await verifiedApplicant();
    await assert.rejects(applyForDeliverer(user.id, form(user)), status(400), "bank details are required");
    await assert.rejects(applyForDeliverer(user.id, form(user, { bankName: "GTBank", bankCode: "058", accountNumber: "12345" })), status(400), "10-digit NUBAN");
    await assert.rejects(applyForDeliverer(user.id, form(user, { bankName: "GTBank", bankCode: "058", accountNumber: "0123456789" })), status(422), "Paystack can't resolve it");

    paystack.accounts.set("058:0123456789", "ADA OBI");
    await applyForDeliverer(user.id, { ...form(user, { bankName: "GTBank", bankCode: "058", accountNumber: "0123456789" }), accountHolderName: "SOMEONE ELSE" } as never);
    const d = await prisma.deliverer.findUniqueOrThrow({ where: { userId: user.id } });
    assert.deepEqual([d.bankCode, d.accountNumber, d.accountHolderName], ["058", "0123456789", "ADA OBI"]);
    assert.deepEqual(await getPayoutAccount(d.id), { complete: true, bankName: "GTBank", bankCode: "058", accountNumberLast4: "6789", accountHolderName: "ADA OBI" });
  });

  it("can be changed from the dashboard; the cached transfer recipient is dropped so the next payout uses the new account", async () => {
    const user = await verifiedApplicant();
    paystack.accounts.set("058:0123456789", "ADA OBI");
    paystack.accounts.set("044:9876543210", "ADA OBI");
    await applyForDeliverer(user.id, form(user, { bankName: "GTBank", bankCode: "058", accountNumber: "0123456789" }));
    const d = await prisma.deliverer.update({ where: { userId: user.id }, data: { status: "APPROVED", paystackRecipientCode: "RCP_old" } });
    const view = await setPayoutAccount(d.id, { bankName: "Access Bank", bankCode: "044", accountNumber: "9876543210" });
    assert.deepEqual([view.bankName, view.accountNumberLast4], ["Access Bank", "3210"]);
    assert.equal((await prisma.deliverer.findUniqueOrThrow({ where: { id: d.id } })).paystackRecipientCode, null);
    await assert.rejects(setPayoutAccount(d.id, { bankName: "Access Bank", bankCode: "044", accountNumber: "1111111111" }), status(422));
  });

  it("payouts wait — untouched, no attempt used — for a deliverer without an account", async () => {
    const owner = await makeUser();
    const vendor = await prisma.business.create({ data: { name: "V", industry: "Food", description: "d", userId: owner.id, type: "SCHOOL_VENDOR", approvalStatus: "APPROVED" } });
    const u = await makeUser();
    const d = await prisma.deliverer.create({ data: { userId: u.id, firstName: "No", lastName: "Bank", email: u.email, status: "APPROVED" } });
    const handoff = await prisma.delivery_x_businesses.create({ data: { deliverymanId: d.id, businessId: vendor.id, delivererPayoutAmount: 500, delivererPayoutStatus: "PAYOUT_PENDING" } });
    await runDelivererPayoutSweep();
    const after = await prisma.delivery_x_businesses.findUniqueOrThrow({ where: { id: handoff.id } });
    assert.deepEqual([after.delivererPayoutStatus, after.delivererPayoutAttempts], ["PAYOUT_PENDING", 0]);
  });
});

describe("deliveries are on the deliverer's card from two hours before the slot", () => {
  it("assigns due deliveries on demand (no double assignment when called concurrently), and not earlier", async () => {
    const s = await vendorCheckoutScenario();
    await prisma.vendorDeliverySlot.update({ where: { id: s.slot.id }, data: { windowStart: "22:13", windowEnd: "22:43" } });
    const res = await createVendorOrdersForCheckout(s.buyer.id, { slotId: s.slot.id, location: "Hall C", date: s.date });
    paystack.set(res.reference, { status: "success", amount: res.amountKobo });
    await reconcileCheckoutPayment(res.reference, "verify");
    const booking = await prisma.vendorDeliveryBooking.findFirstOrThrow({ where: { paystackReference: res.reference } });
    const u = await makeUser();
    const d = await prisma.deliverer.create({ data: { userId: u.id, firstName: "Del", lastName: u.lastName, email: u.email, status: "APPROVED" } });
    await setPlannedDeliverer({ bookingId: booking.id, delivererId: d.id }, (await makeUser({ isAdmin: true })).id);

    const start = schoolTimeToInstant(new Date(`${s.date}T00:00:00.000Z`), "22:13");
    await assignDueDeliveries(new Date(start.getTime() - 3 * 60 * 60_000));
    assert.equal((await buildVendorManifests({ delivererId: d.id })).length, 0, "not before the two-hour mark");

    const due = new Date(start.getTime() - 119 * 60_000);
    await Promise.all([assignDueDeliveries(due), assignDueDeliveries(due), assignDueDeliveries(due)]);
    const cards = await buildVendorManifests({ delivererId: d.id });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].deliveries[0].bookingId, booking.id);
    assert.equal(await prisma.delivery_x_businesses.count({ where: { deliverymanId: d.id, businessId: s.vendor.id } }), 1, "assigned once");
    assert.equal(await prisma.slotBriefingNotice.count({ where: { slotId: s.slot.id, recipientKey: "lock:auto-assign" } }), 0, "lock released");
  });
});
