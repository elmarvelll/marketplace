// scripts/setup-local-db.mjs — builds a LOCAL replica of AkadVerse's database for development or tests.
//
//   npm run db:local:setup            -> database akadverse_replica       (MARKETPLACE_ENV=local; kept if it exists)
//   npm run db:local:setup -- --reset -> drop and rebuild it
//   npm run test:db:setup             -> database akadverse_replica_test  (MARKETPLACE_ENV=test; always rebuilt)
//
// Local only (this project's Docker Postgres on 127.0.0.1:5434 — npm run db:up). It reproduces the production setup
// step by step, so local runs exercise the same permissions:
//   1. A role akadverse_owner stands in for Supabase's "postgres": owns every AkadVerse table; CREATEROLE, CREATEDB,
//      REPLICATION, BYPASSRLS, not superuser — the attributes that role has on AkadVerse's database.
//   2. AkadVerse's schema is built by running AkadVerse's own prisma/migrations SQL, in order (read from the AkadVerse
//      checkout at $AKADVERSE_REPO_PATH, default ../akadverse — only read, never modified). "public" is locked down
//      like Supabase's (no USAGE for PUBLIC).
//   3. scripts/provision-db-roles.mjs's statements create marketplace_app / marketplace_migrator and the grants.
//   4. scripts/db-guard.mjs migrate-deploy applies the Marketplace's own migrations as marketplace_migrator.
// The passwords below are throwaways for a container bound to 127.0.0.1, like docker-compose.yml's.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildStatements, loadGrants, scramVerifier } from "./provision-db-roles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT = 5434;
export const LOCAL = {
  superuser: `postgresql://marketplace:marketplace_local_only@${HOST}:${PORT}/postgres`,
  owner: { user: "akadverse_owner", password: "akadverse_owner_local_only" },
  app: { user: "marketplace_app", password: "marketplace_app_local_only_0000" },
  migrator: { user: "marketplace_migrator", password: "marketplace_migrator_local_only_0" },
};
export const localUrl = (who, database, query = "") => `postgresql://${LOCAL[who].user}:${LOCAL[who].password}@${HOST}:${PORT}/${database}${query}`;

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export async function setupLocalDatabase({ database, env, reset }) {
  if (!/^akadverse_replica(_test)?$/.test(database)) throw new Error(`Refusing to manage database "${database}".`);
  const akadverseRepo = resolve(ROOT, process.env.AKADVERSE_REPO_PATH || "../akadverse");
  const migrationsDir = join(akadverseRepo, "prisma/migrations");
  if (!existsSync(migrationsDir)) throw new Error(`AkadVerse migrations not found at ${migrationsDir}. Set AKADVERSE_REPO_PATH to your AkadVerse checkout.`);

  // 1. Owner role and a fresh database.
  const created = await withClient(LOCAL.superuser, async (c) => {
    await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'akadverse_owner') THEN CREATE ROLE akadverse_owner LOGIN PASSWORD '${LOCAL.owner.password}'; END IF; END $$`);
    // Same attributes as Supabase's "postgres" role (observed on AkadVerse's database): not superuser.
    await c.query("ALTER ROLE akadverse_owner NOSUPERUSER CREATEROLE CREATEDB REPLICATION BYPASSRLS");
    const exists = (await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [database])).rowCount > 0;
    if (exists && !reset) return false;
    if (exists) await c.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await c.query(`CREATE DATABASE "${database}" OWNER akadverse_owner`);
    return true;
  });
  if (!created) {
    console.log(`✔ ${database} already exists (use --reset to rebuild). Re-applying roles and Marketplace migrations.`);
  } else {
    await withClient(LOCAL.superuser.replace(/\/postgres$/, `/${database}`), async (c) => {
      await c.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
      await c.query("ALTER SCHEMA public OWNER TO akadverse_owner");
    });
    // 2. AkadVerse's migrations, as the owner.
    const names = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    // Recorded in public._prisma_migrations exactly as Prisma does, like on the real database.
    await withClient(localUrl("owner", database), async (c) => {
      await c.query(`CREATE TABLE "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
      for (const name of names) {
        const file = join(migrationsDir, name, "migration.sql");
        if (!existsSync(file)) continue;
        const sql = readFileSync(file, "utf8");
        await c.query(sql);
        await c.query(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)`, [randomUUID(), createHash("sha256").update(sql).digest("hex"), name]);
      }
    });
    console.log(`✔ ${database}: applied ${names.length} AkadVerse migrations from ${migrationsDir}`);
  }

  // 3. Restricted roles and grants (the exact statements production gets).
  await withClient(localUrl("owner", database), async (c) => {
    await c.query("BEGIN");
    for (const sql of buildStatements(loadGrants(), { appVerifier: scramVerifier(LOCAL.app.password), migratorVerifier: scramVerifier(LOCAL.migrator.password) })) {
      if (!sql.startsWith("--")) await c.query(sql);
    }
    await c.query("COMMIT");
  });
  console.log(`✔ ${database}: roles provisioned from db/runtime-grants.json`);

  // 4. Marketplace migrations through the guard.
  const result = spawnSync(process.execPath, [join(ROOT, "scripts/db-guard.mjs"), "migrate-deploy"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, MARKETPLACE_ENV: env, MARKETPLACE_MIGRATION_DATABASE_URL: localUrl("migrator", database, "?schema=marketplace") },
  });
  if (result.status !== 0) throw new Error("Marketplace migrations failed.");
}

async function main() {
  const test = process.argv.includes("--test");
  const database = test ? "akadverse_replica_test" : "akadverse_replica";
  try {
    await setupLocalDatabase({ database, env: test ? "test" : "local", reset: test || process.argv.includes("--reset") });
  } catch (err) {
    console.error(`✖ ${err instanceof Error ? err.message : err}${err?.code === "ECONNREFUSED" ? " — is the local database running? (npm run db:up)" : ""}`);
    process.exit(1);
  }
  if (!test) {
    console.log(`\nLocal .env values (throwaway local-only credentials):
MARKETPLACE_ENV="local"
AKADVERSE_DATABASE_URL="${localUrl("app", database)}"
MARKETPLACE_MIGRATION_DATABASE_URL="${localUrl("migrator", database, "?schema=marketplace")}"`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
