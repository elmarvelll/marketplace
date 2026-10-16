// The Marketplace's database boundary on (a local replica of) AkadVerse's database:
//   - shared records written by the Marketplace are AkadVerse's own rows, visible to AkadVerse immediately;
//   - the runtime role (marketplace_app) can do the row operations it needs and nothing else: no DDL, no unrelated
//     tables, no privileged roles, no changing the environment marker;
//   - the startup verifier accepts the provisioned role and notices any extra privilege;
//   - prisma/schema.prisma matches AkadVerse's schema file and the replica exactly.
// Local TEST replica only (tests/helpers/env.ts refuses anything else).
import "../helpers/env";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyDatabaseTarget } from "@/lib/db-target";
import { akadverseDb } from "../helpers/akadverse";
import { makeUser } from "../helpers/fixtures";
import { createBusiness } from "@/services/marketplace/business/create-business";
import { updateBusiness } from "@/services/marketplace/business/update-business";
import { approveBusiness } from "@/services/marketplace/admin/approve-business";
import { rejectBusiness } from "@/services/marketplace/admin/reject-business";
import { createProduct } from "@/services/marketplace/product/create-product";
import { updateProduct } from "@/services/marketplace/product/update-product";
import { installFakeProviders } from "../helpers/fake-providers";

installFakeProviders();
after(async () => {
  await prisma.$disconnect();
  await akadverseDb.$disconnect();
});

const denied = /permission denied|must be owner|must be able to SET ROLE|not owner/i;
// Runs one statement as the runtime role and expects PostgreSQL to refuse it.
const refuses = async (sql: string) => assert.rejects(prisma.$executeRawUnsafe(sql), (e: unknown) => denied.test(String((e as Error).message)), sql);

describe("shared records are AkadVerse's own rows", () => {
  it("a business created and edited in the Marketplace is the record AkadVerse reads, owned by the right AkadVerse user", async () => {
    const owner = await makeUser();
    const created = await createBusiness(owner.id, { name: `Shop ${randomUUID().slice(0, 6)}`, industry: "Food", description: "Jollof", deliveryDays: ["MONDAY"] });
    // Read back through the owner connection = what AkadVerse's own code sees.
    const row = await akadverseDb.business.findUniqueOrThrow({ where: { id: created.id }, include: { user: true, deliveryDays: true } });
    assert.equal(row.userId, owner.id);
    assert.equal(row.user.email, owner.email);
    assert.equal(row.approvalStatus, "PENDING_APPROVAL");
    assert.deepEqual(row.deliveryDays.map((d) => d.day), ["MONDAY"]);

    await updateBusiness(created.id, owner.id, { name: row.name, industry: "Food", description: "Jollof and plantain", deliveryDays: ["MONDAY"] });
    assert.equal((await akadverseDb.business.findUniqueOrThrow({ where: { id: created.id } })).description, "Jollof and plantain", "same record updated, not a copy");
  });

  it("approval and rejection by a Marketplace admin update the record AkadVerse's admin dashboard reads", async () => {
    const [owner, admin] = await Promise.all([makeUser(), makeUser({ isAdmin: true })]);
    const a = await createBusiness(owner.id, { name: "Approve me", industry: "Food", description: "x" });
    const b = await createBusiness(owner.id, { name: "Reject me", industry: "Food", description: "x" });
    await approveBusiness(a.id, admin.id);
    await rejectBusiness(b.id, "Incomplete details", admin.id);
    assert.equal((await akadverseDb.business.findUniqueOrThrow({ where: { id: a.id } })).approvalStatus, "APPROVED");
    assert.equal((await akadverseDb.business.findUniqueOrThrow({ where: { id: b.id } })).approvalStatus, "REJECTED");
    // A business created by AkadVerse is equally visible to the Marketplace.
    const fromAkadverse = await akadverseDb.business.create({ data: { name: "From AkadVerse", industry: "Books", description: "x", userId: owner.id } });
    assert.equal((await prisma.business.findUniqueOrThrow({ where: { id: fromAkadverse.id } })).name, "From AkadVerse");
  });

  it("products created and edited in the Marketplace (with variants and images) are AkadVerse's product rows", async () => {
    const owner = await makeUser();
    const business = await createBusiness(owner.id, { name: "Gadgets", industry: "Tech", description: "x" });
    const product = await createProduct(business.id, {
      name: "Power bank",
      category: "Tech",
      description: "10,000 mAh",
      price: "8000",
      cost: "6000",
      stock: "4",
      variants: [{ name: "Black", price: "8000", stock: "2" }],
      images: [{ publicId: "p1", secureUrl: "https://res.cloudinary.com/demo/p1.jpg", position: 0 }],
    });
    await updateProduct(business.id, product.id, { name: "Power bank", category: "Tech", description: "20,000 mAh", price: "9000", cost: "6000", stock: "4", variants: [], images: [] });
    const row = await akadverseDb.product.findUniqueOrThrow({ where: { id: product.id }, include: { business: true } });
    assert.deepEqual([row.description, row.price, row.business.userId], ["20,000 mAh", 9000, owner.id]);
  });
});

describe("the runtime role can't change structure or reach unrelated data", () => {
  it("can't create, alter, drop or truncate tables, in either schema, nor create schemas", async () => {
    await refuses('CREATE TABLE public."MarketplaceScratch" (id text)');
    await refuses('CREATE TABLE marketplace."Scratch" (id text)');
    await refuses('ALTER TABLE public."Business" ADD COLUMN "x" text');
    await refuses('ALTER TABLE public."User" DROP COLUMN "location"');
    await refuses('DROP TABLE public."Task"');
    await refuses('DROP TABLE public."Business"');
    await refuses('DROP TABLE marketplace."AccountState"');
    await refuses('TRUNCATE public."Order"');
    await refuses('CREATE INDEX x ON public."Business"("name")');
    await refuses("CREATE SCHEMA scratch");
    await refuses('CREATE TRIGGER t BEFORE INSERT ON public."Business" FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger()');
  });

  it("can't read or modify unrelated AkadVerse tables", async () => {
    for (const table of ["Task", "Schedule", "Suggestion", "EmailConnection", "Skill", "SkillOffer", "Review", "Category", "student_playlists", "PendingSignup", "_prisma_migrations"]) {
      await refuses(`SELECT 1 FROM public."${table}" LIMIT 1`);
      await refuses(`DELETE FROM public."${table}"`);
    }
  });

  it("can't create accounts, change logins/roles, or delete shared records it only appends to", async () => {
    await refuses(`INSERT INTO public."User" (id, "firstName", "lastName", email, password, "updatedAt") VALUES ('x', 'a', 'b', 'x@evil.test', '', now())`);
    await refuses(`UPDATE public."User" SET password = ''`);
    await refuses(`UPDATE public."User" SET role = 'admin'`);
    await refuses(`UPDATE public."User" SET email = 'x@evil.test'`);
    await refuses(`DELETE FROM public."User"`);
    await refuses(`DELETE FROM public."Business"`);
    await refuses(`DELETE FROM public."Order"`);
    await refuses(`DELETE FROM public."AdminActionLog"`);
    await refuses(`UPDATE public."AdminActionLog" SET message = 'tampered'`);
    await refuses(`UPDATE marketplace."MarketplaceInstance" SET environment = 'production'`);
  });

  it("can't become another role or give itself privileges", async () => {
    for (const role of ["akadverse_owner", "marketplace_migrator", "marketplace"]) await refuses(`SET ROLE ${role}`);
    await refuses("ALTER ROLE marketplace_app SUPERUSER");
    await refuses("ALTER ROLE marketplace_app BYPASSRLS");
    await refuses("ALTER ROLE marketplace_app CREATEDB");
    await refuses("CREATE ROLE sneaky LOGIN");
    await refuses('GRANT SELECT ON public."Task" TO marketplace_app');
    await refuses("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  });
});

describe("startup verification", () => {
  it("accepts the provisioned role on the marked test replica", async () => {
    const report = await verifyDatabaseTarget();
    assert.deepEqual(report.problems, []);
    assert.equal(report.role, "marketplace_app");
    assert.equal(report.environment, "test");
  });

  it("notices a privilege beyond the manifest, and a database marked for another environment", async () => {
    await akadverseDb.$executeRawUnsafe('GRANT SELECT ON public."Task" TO marketplace_app');
    await akadverseDb.$executeRawUnsafe('GRANT UPDATE ("password") ON public."User" TO marketplace_app');
    try {
      const report = await verifyDatabaseTarget();
      assert.equal(report.ok, false);
      assert.match(report.problems.join("\n"), /SELECT on public\.Task/);
      assert.match(report.problems.join("\n"), /UPDATE on public\.User\.password/);
    } finally {
      await akadverseDb.$executeRawUnsafe('REVOKE SELECT ON public."Task" FROM marketplace_app');
      await akadverseDb.$executeRawUnsafe('REVOKE UPDATE ("password") ON public."User" FROM marketplace_app');
    }
    process.env.MARKETPLACE_ENV = "local";
    try {
      assert.match((await verifyDatabaseTarget()).problems.join("\n"), /marked as "test", but MARKETPLACE_ENV is "local"/);
    } finally {
      process.env.MARKETPLACE_ENV = "test";
    }
    assert.equal((await verifyDatabaseTarget()).ok, true, "back to clean");
  });

  it("full-access mode skips the privilege checks but still enforces the environment marker", async () => {
    await akadverseDb.$executeRawUnsafe('GRANT SELECT ON public."Task" TO marketplace_app');
    process.env.MARKETPLACE_DB_ACCESS = "full";
    try {
      const report = await verifyDatabaseTarget();
      assert.equal(report.access, "full");
      assert.deepEqual(report.problems, [], "an extra privilege is not a problem with a deliberately full-access login");
      process.env.MARKETPLACE_ENV = "local";
      assert.match((await verifyDatabaseTarget()).problems.join("\n"), /marked as "test", but MARKETPLACE_ENV is "local"/);
    } finally {
      process.env.MARKETPLACE_ENV = "test";
      process.env.MARKETPLACE_DB_ACCESS = "";
      await akadverseDb.$executeRawUnsafe('REVOKE SELECT ON public."Task" FROM marketplace_app');
    }
  });
});

describe("the grant manifest covers the code", () => {
  it("every Prisma operation in services/ and src/ has the privileges it needs in db/runtime-grants.json", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const manifest = JSON.parse(readFileSync("db/runtime-grants.json", "utf8")) as Record<"public" | "marketplace", Record<string, { privileges?: string[]; SELECT?: string[]; UPDATE?: string[]; INSERT?: string[] }>>;
    const tables = new Map<string, Set<string>>();
    for (const schema of ["public", "marketplace"] as const) {
      for (const [table, spec] of Object.entries(manifest[schema])) {
        const privs = new Set(spec.privileges ?? ["SELECT", "INSERT", "UPDATE"].filter((p) => (spec as Record<string, unknown>)[p]));
        tables.set(table.toLowerCase(), privs);
      }
    }
    const needs: Record<string, string[]> = {
      findUnique: ["SELECT"], findUniqueOrThrow: ["SELECT"], findFirst: ["SELECT"], findFirstOrThrow: ["SELECT"], findMany: ["SELECT"], count: ["SELECT"], aggregate: ["SELECT"], groupBy: ["SELECT"],
      create: ["INSERT", "SELECT"], createMany: ["INSERT"], createManyAndReturn: ["INSERT", "SELECT"], update: ["UPDATE", "SELECT"], updateMany: ["UPDATE", "SELECT"],
      upsert: ["INSERT", "UPDATE", "SELECT"], delete: ["DELETE", "SELECT"], deleteMany: ["DELETE", "SELECT"],
    };
    // Nested writes found by review (relation field -> table, privilege).
    const nested: [string, string][] = [["BusinessDeliveryDay", "INSERT"], ["OrderItem", "INSERT"], ["DeliveryItem", "INSERT"]];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk("services");
    walk("src");
    const missing = new Set<string>();
    const re = /\b(?:prisma|tx|db|client)\.([a-z][A-Za-z_]+)\.([A-Za-z]+)\(/g;
    for (const file of files) {
      for (const m of readFileSync(file, "utf8").matchAll(re)) {
        const [, accessor, op] = m;
        if (!(op in needs) || accessor.startsWith("$")) continue;
        const privs = tables.get(accessor.toLowerCase());
        if (!privs) missing.add(`${accessor} (no grant at all) — ${file}`);
        else for (const p of needs[op]) if (!privs.has(p)) missing.add(`${p} on ${accessor} for .${op}() — ${file}`);
      }
    }
    for (const [table, p] of nested) if (!tables.get(table.toLowerCase())?.has(p)) missing.add(`${p} on ${table} (nested write)`);
    assert.deepEqual([...missing], []);
  });
});

describe("schema stays in step with AkadVerse", () => {
  it("prisma/schema.prisma's shared models are exactly AkadVerse's", () => {
    const r = spawnSync(process.execPath, ["scripts/sync-shared-schema.mjs", "--check"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });

  it("the replica built from AkadVerse's migrations matches prisma/schema.prisma (both schemas), apart from tables the Marketplace doesn't use", () => {
    const r = spawnSync("npx", ["prisma", "migrate", "diff", "--from-url", `${process.env.MARKETPLACE_TEST_SUPERUSER_URL}?schema=public`, "--to-schema-datamodel", "prisma/schema.prisma", "--script"], {
      encoding: "utf8",
      env: { ...process.env, AKADVERSE_DATABASE_URL: "postgresql://unused@127.0.0.1/unused" },
    });
    assert.equal(r.status, 0, r.stderr);
    const unused = /"(EmailConnection|Schedule|Skill|SkillCounterOffer|SkillNotification|SkillOffer|SkillReview|SkillType|Suggestion|Task|Review|Category|student_playlists|PendingSignup)"/;
    const drift = r.stdout.split(";").map((s) => s.replace(/--[^\n]*/g, "").trim()).filter((s) => s && !unused.test(s));
    assert.deepEqual(drift, []);
  });
});
