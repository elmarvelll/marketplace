// Accounts in the standalone Marketplace on AkadVerse's database: signing in with an existing AkadVerse account
// (password and Google), throttling, administrators, Marketplace-only blocking, and session revocation.
// Local TEST replica of AkadVerse's database; accounts are created as AkadVerse would (owner connection); the app
// under test runs as the restricted marketplace_app role. Email is a fake.
import "../helpers/env";
import { signInAs } from "../helpers/session";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, resend } from "../helpers/fake-providers";
import { akadverseDb } from "../helpers/akadverse";
import { makeUser, makeBusiness } from "../helpers/fixtures";
import { authenticateWithPassword, googleSignInDecision, LOGIN_ERRORS } from "@/lib/auth";
import { resolveSession, BLOCKED_MESSAGE } from "@/lib/session";
import { requireAdmin } from "@/lib/admin";
import { getAccountState } from "@/lib/account-state";
import { blockUser, unblockUser } from "@/services/marketplace/admin/block-user";
import { approveBusiness } from "@/services/marketplace/admin/approve-business";
import { promoteUserToAdmin } from "@/services/marketplace/admin/promote-user-to-admin";
import { revokeAdmin } from "@/services/marketplace/admin/revoke-admin";
import { ServiceError } from "@/lib/service-error";

before(() => installFakeProviders());
beforeEach(() => {
  resend.reset();
  signInAs(null);
});
after(async () => {
  await prisma.$disconnect();
  await akadverseDb.$disconnect();
});

const uid = () => randomUUID().slice(0, 8);
const status = (code: number) => (e: unknown) => e instanceof ServiceError && e.status === code;
const loginError = (code: string) => (e: unknown) => e instanceof Error && e.message === code;
const ip = () => `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const sessionFor = (user: { id: string; email: string }): Session => ({ expires: "", user: { id: user.id, email: user.email, name: "", firstName: "", isAdmin: false } });
const PASSWORD = "akadverse-pass-1";

describe("signing in with an existing AkadVerse account", () => {
  it("accepts the AkadVerse password and returns that same AkadVerse user — no new account, nothing stored", async () => {
    const account = await makeUser({ password: PASSWORD });
    const before = await akadverseDb.user.count();
    const user = await authenticateWithPassword(account.email, PASSWORD, ip());
    assert.equal(user?.id, account.id, "the session identity is the AkadVerse User.id");
    assert.equal(await akadverseDb.user.count(), before, "no duplicate user");
    const stored = await akadverseDb.user.findUniqueOrThrow({ where: { id: account.id } });
    assert.equal(stored.password, account.password, "the hash is untouched");
    assert.equal(await prisma.accountState.count({ where: { userId: account.id } }), 0, "a plain sign-in writes nothing");
    assert.ok(await authenticateWithPassword(account.email.toUpperCase(), PASSWORD, ip()), "email is case-insensitive");
  });

  it("gives one answer for a wrong password, an unknown email and a password-less (Google-only) account", async () => {
    const account = await makeUser({ password: PASSWORD });
    const googleOnly = await makeUser();
    assert.equal(await authenticateWithPassword(account.email, "wrong password", ip()), null);
    assert.equal(await authenticateWithPassword(`nobody-${uid()}@stu.cu.edu.ng`, PASSWORD, ip()), null);
    assert.equal(await authenticateWithPassword(googleOnly.email, "", ip()), null);
    assert.equal(await authenticateWithPassword(googleOnly.email, "anything-123", ip()), null);
    assert.equal(await authenticateWithPassword("", "", ip()), null);
  });

  it("a password change in AkadVerse applies here at once (the hash is read live, never cached)", async () => {
    const account = await makeUser({ password: PASSWORD });
    await akadverseDb.user.update({ where: { id: account.id }, data: { password: await bcrypt.hash("new-akadverse-pass", 4) } });
    assert.equal(await authenticateWithPassword(account.email, PASSWORD, ip()), null);
    assert.equal((await authenticateWithPassword(account.email, "new-akadverse-pass", ip()))?.id, account.id);
  });

  it("only student accounts may use the Marketplace, and a wrong password doesn't reveal the role", async () => {
    const lecturer = await makeUser({ password: "staff-pass-123", role: "faculty" });
    await assert.rejects(authenticateWithPassword(lecturer.email, "staff-pass-123", ip()), loginError(LOGIN_ERRORS.notEligible));
    assert.equal(await authenticateWithPassword(lecturer.email, "wrong", ip()), null);
  });

  it("locks an email after repeated failures, even when the right password then arrives; success clears the count", async () => {
    const account = await makeUser({ password: PASSWORD });
    for (let i = 0; i < 5; i++) await authenticateWithPassword(account.email, "nope", ip());
    assert.ok(await authenticateWithPassword(account.email, PASSWORD, ip()));
    for (let i = 0; i < 7; i++) await authenticateWithPassword(account.email, "nope", ip());
    assert.ok(await authenticateWithPassword(account.email, PASSWORD, ip()), "still under the limit after the reset");
    for (let i = 0; i < 9; i++) await authenticateWithPassword(account.email, "nope", ip()).catch(() => null);
    await assert.rejects(authenticateWithPassword(account.email, PASSWORD, ip()), loginError(LOGIN_ERRORS.throttled));
  });

  it("the Marketplace can't change an AkadVerse login, create an account, or change a role", async () => {
    const account = await makeUser({ password: PASSWORD });
    await assert.rejects(prisma.user.update({ where: { id: account.id }, data: { password: "x" } }), /permission denied/i);
    await assert.rejects(prisma.user.update({ where: { id: account.id }, data: { email: "takeover@evil.test" } }), /permission denied/i);
    await assert.rejects(prisma.user.update({ where: { id: account.id }, data: { role: "admin" } }), /permission denied/i);
    await assert.rejects(prisma.user.create({ data: { email: `new-${uid()}@stu.cu.edu.ng`, firstName: "A", lastName: "B", password: "" } }), /permission denied/i);
    await assert.rejects(prisma.user.delete({ where: { id: account.id } }), /permission denied/i);
  });
});

describe("Google sign-in", () => {
  it("is accepted only for an existing student account with a verified email", async () => {
    const student = await makeUser();
    const lecturer = await makeUser({ role: "faculty" });
    assert.equal(await googleSignInDecision(student.email.toUpperCase(), true), true);
    assert.equal(await googleSignInDecision(student.email, false), "/login?error=GoogleUnverified");
    assert.equal(await googleSignInDecision(`new-${uid()}@stu.cu.edu.ng`, true), `/login?error=${LOGIN_ERRORS.noAccount}`);
    assert.equal(await googleSignInDecision(lecturer.email, true), `/login?error=${LOGIN_ERRORS.notEligible}`);
  });
});

describe("administrators", () => {
  it("admin is AkadVerse's User.isAdmin — an approved seller isn't one; revocation applies on the next request", async () => {
    const [seller, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const business = await makeBusiness(seller.id, { approvalStatus: "PENDING_APPROVAL" });
    await approveBusiness(business.id, admin.id);
    assert.equal((await akadverseDb.user.findUniqueOrThrow({ where: { id: seller.id } })).isAdmin, false);

    signInAs(seller);
    await assert.rejects(requireAdmin(), status(403));
    signInAs(null);
    await assert.rejects(requireAdmin(), status(401));
    signInAs(admin);
    assert.equal((await requireAdmin()).user.id, admin.id);
    // A change made in AkadVerse is honoured immediately.
    await akadverseDb.user.update({ where: { id: admin.id }, data: { isAdmin: false } });
    await assert.rejects(requireAdmin(), status(403));
  });

  it("promote/revoke from the Marketplace updates the shared flag AkadVerse reads", async () => {
    const [admin, user] = await Promise.all([makeUser({ isAdmin: true }), makeUser()]);
    await promoteUserToAdmin(user.id, admin.id);
    assert.equal((await akadverseDb.user.findUniqueOrThrow({ where: { id: user.id } })).isAdmin, true);
    await revokeAdmin(user.id, admin.id);
    assert.equal((await akadverseDb.user.findUniqueOrThrow({ where: { id: user.id } })).isAdmin, false);
  });
});

describe("blocking an account and revoking sessions", () => {
  it("a blocked user can't sign in, their existing session stops working, and they are emailed once", async () => {
    const user = await makeUser({ password: PASSWORD });
    const admin = await makeUser({ isAdmin: true });
    const oldSession = sessionFor(user);
    assert.ok(await resolveSession(oldSession, 0), "session valid before the block");

    await Promise.all([blockUser(user.id, "Selling <banned> goods", admin.id), blockUser(user.id, "Selling <banned> goods", admin.id)]);
    await blockUser(user.id, "Selling <banned> goods", admin.id);

    await assert.rejects(resolveSession(oldSession, 0), (e: unknown) => e instanceof ServiceError && e.status === 403 && e.message === BLOCKED_MESSAGE);
    assert.equal(await resolveSession(oldSession, 0, { throwIfBlocked: false }), null);
    await assert.rejects(authenticateWithPassword(user.email, PASSWORD, ip()), loginError(LOGIN_ERRORS.blocked));
    assert.equal(await googleSignInDecision(user.email, true), `/login?error=${LOGIN_ERRORS.blocked}`);

    const mine = resend.sent.filter((e) => e.to === user.email);
    assert.equal(mine.length, 1, "one email for one block, despite three requests");
    assert.ok(mine[0].html.includes("Selling &lt;banned&gt; goods"));
    assert.ok(!mine[0].html.includes(admin.email) && !mine[0].html.includes(admin.id));

    // The block is Marketplace-only: the AkadVerse account itself is unchanged.
    const akadverseRow = await akadverseDb.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([akadverseRow.password, akadverseRow.role, akadverseRow.isAdmin], [user.password, user.role, false]);

    // Unblocking restores sign-in, but the pre-block session stays dead (its version was bumped).
    await unblockUser(user.id, admin.id);
    assert.ok(await authenticateWithPassword(user.email, PASSWORD, ip()));
    assert.equal(await resolveSession(oldSession, 0), null);
    assert.ok(await resolveSession(oldSession, (await getAccountState(user.id)).sessionVersion), "a fresh session works");
  });

  it("admins can't block themselves or another admin, and a reason is required", async () => {
    const [admin, otherAdmin, user] = await Promise.all([makeUser({ isAdmin: true }), makeUser({ isAdmin: true }), makeUser()]);
    await assert.rejects(blockUser(admin.id, "x", admin.id), status(400));
    await assert.rejects(blockUser(otherAdmin.id, "x", admin.id), status(409));
    await assert.rejects(blockUser(user.id, "   ", admin.id), status(400));
    await assert.rejects(blockUser("no-such-user", "x", admin.id), status(404));
  });

  it("an email-provider failure doesn't undo the block", async () => {
    const [admin, user] = await Promise.all([makeUser({ isAdmin: true }), makeUser()]);
    resend.failNext(1);
    const quiet = console.error;
    console.error = () => {};
    try {
      await blockUser(user.id, "Reason", admin.id);
    } finally {
      console.error = quiet;
    }
    assert.equal((await getAccountState(user.id)).blocked, true);
    assert.equal((await prisma.emailDelivery.findFirstOrThrow({ where: { to: user.email, type: "account_blocked" } })).status, "FAILED");
  });

  it("a session for an account deleted in AkadVerse, demoted from student, or from before a version bump is rejected", async () => {
    const user = await makeUser();
    assert.ok(await resolveSession(sessionFor(user), 0));
    assert.equal(await resolveSession(sessionFor(user), 7), null, "version mismatch");
    const demoted = await makeUser();
    await akadverseDb.user.update({ where: { id: demoted.id }, data: { role: "faculty" } });
    assert.equal(await resolveSession(sessionFor(demoted), 0), null, "no longer a student account");
    await blockUser(user.id, "Reason", (await makeUser({ isAdmin: true })).id);
    // AkadVerse deleting the account also removes its Marketplace state (foreign key, ON DELETE CASCADE).
    await akadverseDb.user.delete({ where: { id: user.id } });
    assert.equal(await prisma.accountState.count({ where: { userId: user.id } }), 0);
    assert.equal(await resolveSession(sessionFor(user), 0), null);
    assert.equal(await resolveSession(null, 0), null);
  });
});
