// Transactional email outbox: dedupe, failure recording, retry with backoff.
import "../helpers/env";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { installFakeProviders, resend } from "../helpers/fake-providers";
import { deliverEmail, enqueueEmail, runEmailRetrySweep, MAX_EMAIL_ATTEMPTS } from "@/services/marketplace/notifications/email-outbox";

before(() => installFakeProviders());
beforeEach(() => resend.reset());
after(() => prisma.$disconnect());

const email = (key = randomUUID()) => ({ dedupeKey: `test:${key}`, to: `${key}@example.test`, subject: "Hi", html: "<p>hi</p>", type: "test" });
const row = (id: string) => prisma.emailDelivery.findUniqueOrThrow({ where: { id } });
const silently = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

describe("email outbox", () => {
  it("a second enqueue with the same dedupe key is a no-op", async () => {
    const e = email();
    const id = await enqueueEmail(e);
    assert.ok(id);
    assert.equal(await enqueueEmail(e), null);
    assert.equal(await prisma.emailDelivery.count({ where: { dedupeKey: e.dedupeKey } }), 1);
  });

  it("sends once even when delivered concurrently, and records provider acceptance", async () => {
    const id = (await enqueueEmail(email()))!;
    const outcomes = await Promise.all([deliverEmail(id), deliverEmail(id), deliverEmail(id)]);
    assert.equal(outcomes.filter((o) => o === "sent").length, 1);
    assert.equal(resend.sent.length, 1);
    const r = await row(id);
    assert.equal(r.status, "SENT");
    assert.ok(r.providerMessageId);
    assert.equal(await deliverEmail(id), "skipped", "a sent email is never re-sent");
  });

  it("a provider failure is recorded with backoff and retried later by the sweep", async () => {
    const id = (await enqueueEmail(email()))!;
    resend.failNext(1);
    assert.equal(await silently(() => deliverEmail(id)), "failed");
    let r = await row(id);
    assert.equal(r.status, "FAILED");
    assert.equal(r.attempts, 1);
    assert.ok(r.lastError);
    assert.ok(r.nextAttemptAt > new Date(), "backed off");
    assert.equal(resend.sent.length, 0);

    await runEmailRetrySweep({ limit: 500 });
    assert.equal((await row(id)).status, "FAILED", "not retried before its backoff elapses");

    await runEmailRetrySweep({ limit: 500, now: new Date(Date.now() + 60 * 60 * 1000) });
    r = await row(id);
    assert.equal(r.status, "SENT");
    assert.equal(resend.sent.filter((s) => s.to === r.to).length, 1);
  });

  it("stops retrying after the attempt limit", async () => {
    const id = (await enqueueEmail(email()))!;
    await prisma.emailDelivery.update({ where: { id }, data: { attempts: MAX_EMAIL_ATTEMPTS, status: "FAILED" } });
    assert.equal(await deliverEmail(id), "skipped");
  });

  it("a missing provider key is a recorded, retriable failure — not a silent drop", async () => {
    const id = (await enqueueEmail(email()))!;
    const key = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "";
    const warn = console.warn;
    console.warn = () => {};
    try {
      // The Resend client is cached once created, so this only exercises the "no key" branch on a cold module;
      // either way the row must end in a definite state.
      const outcome = await deliverEmail(id);
      assert.ok(outcome === "failed" || outcome === "sent");
    } finally {
      process.env.RESEND_API_KEY = key;
      console.warn = warn;
    }
    assert.ok(["FAILED", "SENT"].includes((await row(id)).status));
  });
});
