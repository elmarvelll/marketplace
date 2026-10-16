// Business approval -> notification destination -> owner access, and admin block -> email + enforcement.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, paystack, resend } from "../helpers/fake-providers";
import { makeBusiness, makeProduct, makeUser, addToCart } from "../helpers/fixtures";
import { approveBusiness } from "@/services/marketplace/admin/approve-business";
import { rejectBusiness } from "@/services/marketplace/admin/reject-business";
import { blockBusiness } from "@/services/marketplace/admin/block-business";
import { unblockBusiness } from "@/services/marketplace/admin/unblock-business";
import { getBusinessDetail } from "@/services/marketplace/business/get-business-detail";
import { getVendorProfile } from "@/services/marketplace/vendor/get-vendor-profile";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";
import { addToCart as addToCartService } from "@/services/marketplace/cart/add-to-cart";
import { addToVendorCart } from "@/services/marketplace/vendor-cart/add-to-vendor-cart";
import { getVendorStorefront } from "@/services/marketplace/vendor/get-vendor-storefront";
import { getPublicProductDetail } from "@/services/marketplace/product/get-public-product-detail";
import { searchProducts } from "@/services/marketplace/product/search-products";
import { createOrdersForCheckout } from "@/services/marketplace/checkout/create-orders-for-checkout";
import { runEmailRetrySweep } from "@/services/marketplace/notifications/email-outbox";
import { ServiceError } from "@/lib/service-error";

before(() => installFakeProviders());
beforeEach(() => {
  paystack.reset();
  resend.reset();
});
after(() => prisma.$disconnect());

const status = (code: number) => (e: unknown) => e instanceof ServiceError && e.status === code;
const notifications = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });
const quietly = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

describe("business approval notification", () => {
  it("a Business: created pending, approved, notified with a link the owner can actually open", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const business = await makeBusiness(owner.id, { approvalStatus: "PENDING_APPROVAL" });
    assert.equal((await getBusinessDetail(business.id, owner.id)).approvalStatus, "PENDING_APPROVAL");

    await approveBusiness(business.id, admin.id);
    const [note] = await notifications(owner.id, "BUSINESS_APPROVED");
    assert.equal(note.link, `/business/${business.id}`);
    assert.equal(note.businessId, business.id);
    // The page that link opens loads this (owner-scoped) and must succeed, already approved.
    assert.equal((await getBusinessDetail(business.id, owner.id)).approvalStatus, "APPROVED");
  });

  it("a School Vendor is linked to the vendor dashboard — the route whose API accepts it", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const vendor = await makeBusiness(owner.id, { type: "SCHOOL_VENDOR", approvalStatus: "PENDING_APPROVAL" });
    await approveBusiness(vendor.id, admin.id);

    const [note] = await notifications(owner.id, "BUSINESS_APPROVED");
    assert.equal(note.link, `/vendor-dashboard/${vendor.id}`);
    assert.equal((await getVendorProfile(vendor.id, owner.id)).approvalStatus, "APPROVED");
    // The old (wrong) destination — the Business API — 404s for a vendor: the reported bug.
    await assert.rejects(getBusinessDetail(vendor.id, owner.id), status(404));
    // The approval email carries the same correct link.
    await new Promise((r) => setTimeout(r, 50));
    const email = resend.sent.find((e) => e.to === owner.email);
    assert.ok(email?.html.includes(`https://marketplace.test/vendor-dashboard/${vendor.id}`));
  });

  it("rejection uses the same type-aware destination", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const vendor = await makeBusiness(owner.id, { type: "SCHOOL_VENDOR", approvalStatus: "PENDING_APPROVAL" });
    await rejectBusiness(vendor.id, "Incomplete details", admin.id);
    assert.equal((await notifications(owner.id, "BUSINESS_REJECTED"))[0].link, ownerDashboardPath(vendor));
  });

  it("approving twice (double click / retry) notifies once", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const business = await makeBusiness(owner.id, { approvalStatus: "PENDING_APPROVAL" });
    await Promise.all([approveBusiness(business.id, admin.id), approveBusiness(business.id, admin.id)]);
    await approveBusiness(business.id, admin.id);
    assert.equal((await notifications(owner.id, "BUSINESS_APPROVED")).length, 1);
  });

  it("another user can't open the owner's business or vendor dashboard data", async () => {
    const [owner, stranger] = await Promise.all([makeUser(), makeUser()]);
    const business = await makeBusiness(owner.id);
    const vendor = await makeBusiness(owner.id, { type: "SCHOOL_VENDOR" });
    await assert.rejects(getBusinessDetail(business.id, stranger.id), status(404));
    await assert.rejects(getVendorProfile(vendor.id, stranger.id), status(404));
    await assert.rejects(getBusinessDetail("no-such-id", owner.id), status(404));
  });
});

describe("admin blocks a business account", () => {
  it("updates the status and emails the owner once, with the reason and no internal details", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true, email: `internal-admin-${Date.now()}@example.test` })]);
    const business = await makeBusiness(owner.id);

    const result = await blockBusiness(business.id, "Selling <prohibited> items", admin.id);
    assert.equal(result.blocked, true);
    const row = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    assert.deepEqual([row.blocked, row.blockedReason, row.blockedBy], [true, "Selling <prohibited> items", admin.id]);

    const mine = resend.sent.filter((e) => e.to === owner.email);
    assert.equal(mine.length, 1);
    assert.match(mine[0].subject, /has been blocked/);
    assert.ok(mine[0].html.includes("Selling &lt;prohibited&gt; items"), "reason included and HTML-escaped");
    assert.ok(!mine[0].html.includes(admin.email) && !mine[0].html.includes(admin.id), "admin identity not exposed");
    assert.ok(!/appeal/i.test(mine[0].html), "no invented appeal process");
    assert.equal((await notifications(owner.id, "BUSINESS_BLOCKED")).length, 1);
    assert.equal((await getBusinessDetail(business.id, owner.id)).blocked, true, "owner still has dashboard access and sees the block");
  });

  it("repeated/concurrent block requests send exactly one email", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const business = await makeBusiness(owner.id);
    await Promise.all([blockBusiness(business.id, "Fraud reports", admin.id), blockBusiness(business.id, "Fraud reports", admin.id)]);
    await blockBusiness(business.id, "Fraud reports", admin.id);
    assert.equal(resend.sent.filter((e) => e.to === owner.email).length, 1);
    assert.equal(await prisma.emailDelivery.count({ where: { to: owner.email, type: "business_blocked" } }), 1);
    assert.equal((await notifications(owner.id, "BUSINESS_BLOCKED")).length, 1);
  });

  it("an email-provider failure does not undo the block, and the email is retried later", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const business = await makeBusiness(owner.id);
    resend.failNext(1);
    await quietly(() => blockBusiness(business.id, "Policy violation", admin.id));

    assert.equal((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).blocked, true, "block stands");
    assert.equal(resend.sent.filter((e) => e.to === owner.email).length, 0);
    const queued = await prisma.emailDelivery.findFirstOrThrow({ where: { to: owner.email, type: "business_blocked" } });
    assert.equal(queued.status, "FAILED");

    await runEmailRetrySweep({ limit: 500, now: new Date(Date.now() + 60 * 60 * 1000) });
    assert.equal(resend.sent.filter((e) => e.to === owner.email).length, 1);
    assert.equal((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: queued.id } })).status, "SENT");
  });

  it("a later re-block (after unblock) is a new event and emails again", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const business = await makeBusiness(owner.id);
    await blockBusiness(business.id, "First", admin.id);
    await unblockBusiness(business.id, admin.id);
    await new Promise((r) => setTimeout(r, 5));
    await blockBusiness(business.id, "Second", admin.id);
    assert.equal(resend.sent.filter((e) => e.to === owner.email).length, 2);
  });

  it("a block can't be bypassed through the backend: hidden from buyers, no cart adds, no checkout", async () => {
    const [owner, admin, buyer] = await Promise.all([makeUser(), makeUser({ isAdmin: true }), makeUser()]);
    const business = await makeBusiness(owner.id);
    const product = await makeProduct(business.id);
    const vendor = await makeBusiness(owner.id, { type: "SCHOOL_VENDOR" });
    const vendorProduct = await makeProduct(vendor.id);
    await addToCart(buyer.id, product.id, 1); // already in the cart before the block

    await blockBusiness(business.id, "Blocked", admin.id);
    await blockBusiness(vendor.id, "Blocked", admin.id);

    await assert.rejects(getPublicProductDetail(product.id), status(404));
    await assert.rejects(getVendorStorefront(vendor.id), status(404));
    const found = await searchProducts({ q: product.name });
    assert.ok(!JSON.stringify(found).includes(product.id), "not in search results");
    await assert.rejects(addToCartService(buyer.id, { productId: product.id, quantity: 1 }), status(404));
    await assert.rejects(addToVendorCart(buyer.id, { productId: vendorProduct.id, quantity: 1 }), status(404));
    await assert.rejects(createOrdersForCheckout(buyer.id, "Hall"), status(409));

    await unblockBusiness(business.id, admin.id);
    assert.ok((await createOrdersForCheckout(buyer.id, "Hall")).reference, "works again once unblocked");
  });
});
