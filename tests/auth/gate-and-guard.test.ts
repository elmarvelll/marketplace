// The request gate (src/proxy.ts), post-login redirect safety, the runtime-URL safeguards, the migration guard
// (scripts/db-guard.mjs), scheduled-job gating, and upload validation.
import "../helpers/env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { proxy } from "@/proxy";
import { safeCallbackPath } from "@/app/login/LoginForm";
import { assertRuntimeUrl, sameDatabase } from "@/lib/prisma";
import { checkUrlIdentity } from "@/lib/db-target";
import { requireCronSecret } from "@/lib/cron-auth";
import { GuardError, identifyTarget, reviewMigrations } from "../../scripts/db-guard.mjs";

const ORIGIN = "https://marketplace.test";
const SECRET = process.env.NEXTAUTH_SECRET!;
const token = (claims: Record<string, unknown> = {}, secret = SECRET) => encode({ secret, token: { id: "u1", sub: "u1", email: "u1@stu.cu.edu.ng", firstName: "U", isAdmin: false, sv: 0, ...claims } });
const request = (path: string, cookies: Record<string, string> = {}) =>
  new NextRequest(`${ORIGIN}${path}`, { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } });
const location = (res: Response) => res.headers.get("location");

describe("request gate", () => {
  it("lets public pages and public APIs through without a session", async () => {
    for (const path of ["/login", "/signup", "/api/auth/csrf", "/api/webhooks/paystack", "/api/cron/email-retry"]) {
      const res = await proxy(request(path));
      assert.equal(res.status, 200, path);
      assert.equal(location(res), null, path);
    }
  });

  it("sends signed-out visitors to sign in (pages) or answers 401 (APIs)", async () => {
    const page = await proxy(request("/business/abc/orders"));
    assert.equal(page.status, 307);
    assert.equal(location(page), `${ORIGIN}/login?callbackUrl=%2Fbusiness%2Fabc%2Forders`);
    assert.equal(location(await proxy(request("/"))), `${ORIGIN}/login`);
    for (const path of ["/api/marketplace/cart", "/api/marketplace/admin/users", "/api/marketplace/checkout/verify", "/api/authx", "/api/signup/start", "/api/password/forgot", "/forgot-password"]) {
      const res = await proxy(request(path));
      assert.equal(res.status, path.startsWith("/api/") ? 401 : 307, path);
    }
  });

  it("accepts only this app's own session cookie, signed with this app's own secret", async () => {
    const mine = await token();
    assert.equal((await proxy(request("/orders", { "mkt.session-token": mine }))).status, 200);
    // The same token under AkadVerse's cookie name is not a Marketplace session…
    assert.equal((await proxy(request("/orders", { "next-auth.session-token": mine }))).status, 307);
    // …and a token signed with another secret (e.g. a real AkadVerse session) is not accepted under our name.
    const foreign = await token({}, "some-other-apps-secret-value-123456");
    assert.equal((await proxy(request("/orders", { "mkt.session-token": foreign }))).status, 307);
    assert.equal((await proxy(request("/api/marketplace/cart", { "mkt.session-token": foreign }))).status, 401);
  });

  it("keeps non-admins out of /admin and signed-in users off the sign-in pages", async () => {
    const user = { "mkt.session-token": await token() };
    const admin = { "mkt.session-token": await token({ isAdmin: true }) };
    assert.equal(location(await proxy(request("/admin", user))), `${ORIGIN}/`);
    assert.equal(location(await proxy(request("/admin/users/123", user))), `${ORIGIN}/`);
    assert.equal((await proxy(request("/admin/users", admin))).status, 200);
    assert.equal((await proxy(request("/administrator-lookalike", user))).status, 200, "only /admin itself is the admin area");
    assert.equal(location(await proxy(request("/login", user))), `${ORIGIN}/`);
    assert.equal(location(await proxy(request("/signup", user))), `${ORIGIN}/`);
  });
});

describe("post-login redirect", () => {
  it("only ever goes to a path on this site", () => {
    assert.equal(safeCallbackPath("/orders"), "/orders");
    assert.equal(safeCallbackPath("/business/1/orders?tab=ready"), "/business/1/orders?tab=ready");
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/api/marketplace/cart"]) {
      assert.equal(safeCallbackPath(bad), "/", String(bad));
    }
  });
});

describe("runtime database URL", () => {
  const remote = (user: string) => `postgresql://${user}:pw@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;

  it("refuses a missing URL and Supabase-internal or migration roles, always", () => {
    assert.throws(() => assertRuntimeUrl(undefined), /AKADVERSE_DATABASE_URL is not set/);
    for (const user of ["supabase_admin", "service_role", "marketplace_migrator.abc", "authenticator"]) {
      assert.throws(() => assertRuntimeUrl(remote(user)), /never run as/, user);
    }
    assert.equal(assertRuntimeUrl(remote("marketplace_app.abcdefghijklmnopqrst")), remote("marketplace_app.abcdefghijklmnopqrst"));
  });

  it("accepts AkadVerse's own postgres login only in explicit full-access mode", () => {
    const postgres = remote("postgres.abcdefghijklmnopqrst");
    assert.throws(() => assertRuntimeUrl(postgres), /MARKETPLACE_DB_ACCESS=full/);
    process.env.MARKETPLACE_DB_ACCESS = "full";
    try {
      assert.equal(assertRuntimeUrl(postgres), postgres);
      assert.throws(() => assertRuntimeUrl(remote("service_role")), /never run as/, "internal roles stay refused in full mode");
    } finally {
      process.env.MARKETPLACE_DB_ACCESS = "";
    }
  });

  it("refuses to share the migration connection", () => {
    const saved = process.env.MARKETPLACE_MIGRATION_DATABASE_URL;
    process.env.MARKETPLACE_MIGRATION_DATABASE_URL = remote("marketplace_app.x");
    try {
      assert.throws(() => assertRuntimeUrl(remote("marketplace_app.x")), /same connection as MARKETPLACE_MIGRATION_DATABASE_URL/);
    } finally {
      if (saved === undefined) delete process.env.MARKETPLACE_MIGRATION_DATABASE_URL;
      else process.env.MARKETPLACE_MIGRATION_DATABASE_URL = saved;
    }
    assert.equal(sameDatabase(remote("a"), remote("a")), true);
    assert.equal(sameDatabase(remote("a"), remote("b")), false);
  });

  it("ties the environment label to the kind of host and the expected Supabase project", () => {
    const local = "postgresql://marketplace_app:pw@127.0.0.1:5434/akadverse_replica";
    const prod = remote("marketplace_app.abcdefghijklmnopqrst");
    assert.deepEqual(checkUrlIdentity(local, "local", undefined), []);
    assert.deepEqual(checkUrlIdentity(prod, "production", "abcdefghijklmnopqrst"), []);
    assert.deepEqual(checkUrlIdentity("postgresql://marketplace_app:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", "staging", "abcdefghijklmnopqrst"), []);
    assert.match(checkUrlIdentity(prod, "local", undefined).join(), /not local/);
    assert.match(checkUrlIdentity(local, "production", "abcdefghijklmnopqrst").join(), /host is local/);
    assert.match(checkUrlIdentity(prod, "production", undefined).join(), /AKADVERSE_DB_PROJECT_REF must be set/);
    assert.match(checkUrlIdentity(prod, "production", "someotherproject").join(), /not for Supabase project someotherproject/);
    assert.match(checkUrlIdentity(prod, undefined, "x").join(), /MARKETPLACE_ENV must be one of/);
    assert.match(checkUrlIdentity(prod, "prod", "x").join(), /MARKETPLACE_ENV must be one of/);
  });
});

describe("migration guard", () => {
  const migrator = (db: string, query = "?schema=marketplace") => `postgresql://marketplace_migrator:marketplace_migrator_local_only_0@127.0.0.1:5434/${db}${query}`;
  const refuses = (pattern: RegExp) => (e: unknown) => e instanceof GuardError && pattern.test((e as Error).message);

  it("identifies AkadVerse's database (test replica) as the migrator, with this environment's marker", async () => {
    const result = await identifyTarget({ url: migrator("akadverse_replica_test"), env: "test" });
    assert.equal(result.target.database, "akadverse_replica_test");
    assert.equal(result.markerEnv, "test");
  });

  it("refuses: no URL, missing ?schema=marketplace, a non-migrator role, or another environment's database", async () => {
    await assert.rejects(identifyTarget({ url: "", env: "test" }), refuses(/MARKETPLACE_MIGRATION_DATABASE_URL is not set/));
    await assert.rejects(identifyTarget({ url: migrator("akadverse_replica_test", ""), env: "test" }), refuses(/schema=marketplace/));
    await assert.rejects(identifyTarget({ url: "postgresql://akadverse_owner:akadverse_owner_local_only@127.0.0.1:5434/akadverse_replica_test?schema=marketplace", env: "test" }), refuses(/must use the marketplace_migrator role/));
    await assert.rejects(identifyTarget({ url: "postgresql://marketplace_app:marketplace_app_local_only_0000@127.0.0.1:5434/akadverse_replica_test?schema=marketplace", env: "test" }), refuses(/must use the marketplace_migrator role/));
    await assert.rejects(identifyTarget({ url: migrator("akadverse_replica_test"), env: "production" }), refuses(/target is local/));
    await assert.rejects(identifyTarget({ url: migrator("akadverse_replica_test"), env: "local" }), refuses(/marked "test" but MARKETPLACE_ENV is "local"/));
    await assert.rejects(identifyTarget({ url: "postgresql://marketplace_migrator.ref:pw@db.example.invalid:5432/postgres?schema=marketplace", env: "test" }), refuses(/not a local database/));
  });

  it("the shipped migrations pass review, and destructive or out-of-schema SQL is refused", async () => {
    assert.deepEqual(reviewMigrations(), []);
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "mkt-migrations-"));
    const write = (name: string, sql: string) => {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, "migration.sql"), sql);
    };
    write("1_ok", 'CREATE TABLE "marketplace"."X" ("id" TEXT); ALTER TABLE "marketplace"."X" ADD CONSTRAINT f FOREIGN KEY ("id") REFERENCES "public"."User"("id");');
    write("2_public", 'ALTER TABLE "public"."Business" ADD COLUMN "x" TEXT;');
    write("3_drop", 'DROP TABLE "marketplace"."X";');
    write("4_unqualified", 'CREATE TABLE "Y" ("id" TEXT);');
    write("5_grant", 'GRANT SELECT ON "marketplace"."X" TO anon;');
    const problems = reviewMigrations(dir, []).join("\n");
    assert.doesNotMatch(problems, /1_ok/);
    for (const name of ["2_public", "3_drop", "4_unqualified", "5_grant"]) assert.match(problems, new RegExp(name));
    assert.doesNotMatch(reviewMigrations(dir, ["3_drop"]).join("\n"), /3_drop/, "a reviewed destructive migration can be allowed by name");
  });
});

describe("scheduled jobs", () => {
  const cron = (auth?: string) => new NextRequest(`${ORIGIN}/api/cron/seller-payout`, { headers: auth ? { authorization: auth } : {} });

  it("need the cron secret, and are off unless this deployment is made the job runner", () => {
    assert.equal(requireCronSecret(cron())?.status, 401);
    assert.equal(requireCronSecret(cron("Bearer wrong"))?.status, 401);
    assert.equal(requireCronSecret(cron("Bearer test-cron-secret"))?.status, 503, "AkadVerse runs the shared jobs by default");
    process.env.MARKETPLACE_SCHEDULED_JOBS = "enabled";
    try {
      assert.equal(requireCronSecret(cron("Bearer test-cron-secret")), null);
    } finally {
      delete process.env.MARKETPLACE_SCHEDULED_JOBS;
    }
  });
});

describe("image upload validation", () => {
  it("recognises real images by their bytes and rejects everything else, whatever it is called", async () => {
    const { detectImageType, uploadMarketplaceImage } = await import("@/services/marketplace/uploads/upload.service");
    const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);
    assert.equal(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(detectImageType(pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), "image/gif");
    assert.equal(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0])), "image/webp");
    assert.equal(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
    assert.equal(detectImageType(new TextEncoder().encode("<html><script>alert(1)</script></html>")), null);
    assert.equal(detectImageType(new Uint8Array([0xff, 0xd8])), null);

    const refused = (e: unknown) => e instanceof Error && "status" in e && (e as { status: number }).status === 400;
    // Declared as an image, but it is an SVG with script / an executable / empty / too big.
    await assert.rejects(uploadMarketplaceImage(new File(['<svg onload="alert(1)"/>'], "logo.png", { type: "image/png" })), refused);
    await assert.rejects(uploadMarketplaceImage(new File(["MZ\u0090\u0000"], "photo.jpg", { type: "image/jpeg" })), refused);
    await assert.rejects(uploadMarketplaceImage(new File([], "empty.png", { type: "image/png" })), refused);
    await assert.rejects(uploadMarketplaceImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })), refused);
  });
});
