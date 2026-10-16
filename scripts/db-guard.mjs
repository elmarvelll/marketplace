// scripts/db-guard.mjs — the ONLY way this project runs schema commands (see the db:* scripts in package.json).
//
//   node scripts/db-guard.mjs check            inspect the target, change nothing
//   node scripts/db-guard.mjs status           prisma migrate status (read-only)
//   node scripts/db-guard.mjs migrate-deploy   apply prisma/marketplace-schema/migrations, then write/verify the marker
//
// This project only ever migrates the Marketplace-owned schema "marketplace". AkadVerse's tables (schema "public")
// are migrated by AkadVerse's own deployment, never from here — there is deliberately no command that could.
//
// Before running anything it must establish, read-only, that:
//   1. MARKETPLACE_MIGRATION_DATABASE_URL is set (no fallback; DATABASE_URL / DIRECT_URL are never read), includes
//      ?schema=marketplace, and connects as marketplace_migrator — the role that owns only schema "marketplace" and
//      cannot create, alter, drop or even read anything in "public" (so a wrong migration can't touch AkadVerse).
//   2. MARKETPLACE_ENV is set. A non-local target needs MARKETPLACE_DB_CONFIRM_HOST = its host, and
//      AKADVERSE_DB_PROJECT_REF must match the URL (staging/production). Local/test must be a loopback host.
//   3. The target is AkadVerse's database (it has public."User" and public."Business") and the migrator's
//      privileges are exactly as provisioned: no attributes, no memberships, no CREATE on the database or "public".
//   4. If the marker row exists, its environment equals MARKETPLACE_ENV.
//   5. Every migration's SQL stays inside "marketplace" (the only allowed mention of "public" is the
//      REFERENCES "public"."User"("id") foreign key) and contains no DROP / TRUNCATE / DELETE / RENAME — unless
//      that migration is named in MARKETPLACE_ALLOW_DESTRUCTIVE after review.
// The inspection only runs SELECTs inside a READ ONLY transaction.
//
// Full-access mode (MARKETPLACE_DB_ACCESS=full — AkadVerse's own "postgres" login, by owner decision): the URL may use
// "postgres" instead of the migrator, step 3's privilege-shape checks are skipped, and schema "marketplace" is created
// if missing. Everything else (env, project ref, host confirmation, AkadVerse tables, marker, SQL review) still applies.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_DIR = join(ROOT, "prisma/marketplace-schema/migrations");
export const MIGRATION_SCHEMA_FILE = join(ROOT, "prisma/marketplace-schema/schema.prisma");
export const MARKER_APP = "akadverse-marketplace";
export const MIGRATOR_ROLE = "marketplace_migrator";
const FULL_ACCESS_ROLE = "postgres";
const fullAccess = () => process.env.MARKETPLACE_DB_ACCESS === "full";
const ENVIRONMENTS = ["local", "test", "staging", "production"];

// Loads THIS project's .env only (never a parent or sibling directory). Values already in the environment win.
export function loadProjectEnv() {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

export class GuardError extends Error {}

const isLocalHost = (host) => host === "127.0.0.1" || host === "localhost" || host === "::1";

// Static review of the migration SQL (step 5). Returns a list of problems.
export function reviewMigrations(dir = MIGRATIONS_DIR, allow = (process.env.MARKETPLACE_ALLOW_DESTRUCTIVE ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const problems = [];
  const names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const name of names) {
    const file = join(dir, name, "migration.sql");
    if (!existsSync(file)) {
      problems.push(`${name}: no migration.sql`);
      continue;
    }
    const sql = readFileSync(file, "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const withoutFk = sql.replace(/REFERENCES\s+"public"\."User"\s*\(\s*"id"\s*\)/gi, "");
    if (/\bpublic\b/i.test(withoutFk)) problems.push(`${name}: mentions schema "public" — Marketplace migrations may only change schema "marketplace".`);
    if (/\b(CREATE|ALTER)\s+(TABLE|TYPE|VIEW|FUNCTION|SEQUENCE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?!IF\b)(?!"?marketplace"?\.)/i.test(sql)) problems.push(`${name}: creates/alters an object without the "marketplace". schema prefix.`);
    if (/\bCREATE\s+SCHEMA\b|\bGRANT\b[^;]*\bTO\s+(PUBLIC|anon|authenticated|service_role)\b/i.test(sql)) problems.push(`${name}: creates a schema or grants to a public/Supabase API role.`);
    if (/\b(DROP|TRUNCATE|RENAME)\b|\bDELETE\s+FROM\b/i.test(sql) && !allow.includes(name)) {
      problems.push(`${name}: contains DROP/TRUNCATE/DELETE/RENAME. Review it, then allow it explicitly with MARKETPLACE_ALLOW_DESTRUCTIVE=${name}.`);
    }
  }
  return problems;
}

// Returns { url, target, env, markerEnv } or throws GuardError. Read-only.
export async function identifyTarget({ url = process.env.MARKETPLACE_MIGRATION_DATABASE_URL, env = process.env.MARKETPLACE_ENV } = {}) {
  if (!url) throw new GuardError("MARKETPLACE_MIGRATION_DATABASE_URL is not set (the marketplace_migrator role — see .env.example). There is no fallback to any other database.");
  if (!ENVIRONMENTS.includes(env)) throw new GuardError(`MARKETPLACE_ENV must be one of ${ENVIRONMENTS.join(", ")}.`);
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new GuardError("MARKETPLACE_MIGRATION_DATABASE_URL is not a valid connection URL.");
  }
  const target = { host: u.hostname, port: u.port || "5432", database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres" };
  const user = decodeURIComponent(u.username);
  if (u.searchParams.get("schema") !== "marketplace") throw new GuardError("MARKETPLACE_MIGRATION_DATABASE_URL must end with ?schema=marketplace (so Prisma's migration history lives in that schema, not AkadVerse's).");
  const urlRole = user.split(".")[0];
  const expectedRole = fullAccess() ? FULL_ACCESS_ROLE : MIGRATOR_ROLE;
  if (urlRole !== MIGRATOR_ROLE && urlRole !== expectedRole) throw new GuardError(`MARKETPLACE_MIGRATION_DATABASE_URL must use the ${MIGRATOR_ROLE} role${fullAccess() ? ` (or ${FULL_ACCESS_ROLE} in full-access mode)` : ""} (got "${urlRole}"). Never run Marketplace migrations as the runtime role.`);
  const local = isLocalHost(target.host);
  if ((env === "local" || env === "test") && !local) throw new GuardError(`MARKETPLACE_ENV=${env} but ${target.host} is not a local database.`);
  if (env === "staging" || env === "production") {
    if (local) throw new GuardError(`MARKETPLACE_ENV=${env} but the target is local.`);
    const ref = process.env.AKADVERSE_DB_PROJECT_REF?.trim();
    if (!ref) throw new GuardError("AKADVERSE_DB_PROJECT_REF must be set (the Supabase project reference of AkadVerse's database).");
    if (!user.endsWith(`.${ref}`) && target.host !== `db.${ref}.supabase.co`) throw new GuardError(`The migration URL is not for Supabase project ${ref}.`);
    if (process.env.MARKETPLACE_DB_CONFIRM_HOST !== target.host) throw new GuardError(`Refusing: set MARKETPLACE_DB_CONFIRM_HOST="${target.host}" to confirm this is the ${env} database you intend to change.`);
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
  } catch (err) {
    throw new GuardError(`Couldn't connect to ${target.host}:${target.port}/${target.database} as ${MIGRATOR_ROLE} (${err.code ?? "connection error"}).`);
  }
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const role = (await client.query(
      `SELECT current_user AS name, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication,
              (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS memberships,
              has_database_privilege(current_database(), 'CREATE') AS db_create,
              has_schema_privilege('public', 'CREATE') AS public_create,
              (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
                  AND (has_table_privilege(c.oid, 'SELECT') OR has_table_privilege(c.oid, 'INSERT') OR has_table_privilege(c.oid, 'UPDATE')
                       OR has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE'))) AS public_row_access
         FROM pg_roles r WHERE r.rolname = current_user`,
    )).rows[0];
    if (role.name !== urlRole) throw new GuardError(`Connected as ${role.name}, expected ${urlRole}.`);
    const bad = [];
    const asMigrator = role.name === MIGRATOR_ROLE;
    for (const [k, label] of [["rolsuper", "SUPERUSER"], ["rolcreaterole", "CREATEROLE"], ["rolcreatedb", "CREATEDB"], ["rolbypassrls", "BYPASSRLS"], ["rolreplication", "REPLICATION"], ["db_create", "CREATE on the database"], ["public_create", 'CREATE on schema "public"']]) if (role[k]) bad.push(label);
    if (role.memberships > 0) bad.push("role memberships");
    if (role.public_row_access > 0) bad.push(`row access to ${role.public_row_access} table(s) in "public"`);
    if (asMigrator && bad.length) throw new GuardError(`${MIGRATOR_ROLE} has more privileges than provisioned (${bad.join(", ")}). Re-run scripts/provision-db-roles.mjs. Nothing was changed.`);

    const akad = (await client.query(`SELECT to_regclass('public."User"') IS NOT NULL AS u, to_regclass('public."Business"') IS NOT NULL AS b, to_regnamespace('marketplace') IS NOT NULL AS s`)).rows[0];
    if (!akad.u || !akad.b) throw new GuardError(`${target.host}/${target.database} doesn't have AkadVerse's tables. This isn't AkadVerse's database. Nothing was changed.`);
    if (!akad.s && asMigrator) throw new GuardError('Schema "marketplace" doesn\'t exist yet. Run scripts/provision-db-roles.mjs first (README "Database roles").');
    if (akad.s) {
      const owner = (await client.query(`SELECT pg_get_userbyid(nspowner) AS o FROM pg_namespace WHERE nspname = 'marketplace'`)).rows[0].o;
      if (owner !== role.name) throw new GuardError(`Schema "marketplace" is owned by ${owner}, but migrations would run as ${role.name}.`);
    }

    let markerEnv = null;
    if (akad.s && (await client.query(`SELECT to_regclass('marketplace."MarketplaceInstance"') IS NOT NULL AS t`)).rows[0].t) {
      const row = (await client.query(`SELECT app, environment FROM marketplace."MarketplaceInstance" WHERE id = 'singleton'`)).rows[0];
      if (row) {
        if (row.app !== MARKER_APP) throw new GuardError("The marker row isn't the Marketplace's. Nothing was changed.");
        if (row.environment !== env) throw new GuardError(`This database is marked "${row.environment}" but MARKETPLACE_ENV is "${env}". Nothing was changed.`);
        markerEnv = row.environment;
      }
    }
    return { url, target, env, markerEnv, role: role.name, schemaExists: akad.s };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

// After migrating: write the marker if absent (as the migrator, which owns the table), then re-check it.
async function ensureMarker(url, env) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query(`INSERT INTO marketplace."MarketplaceInstance" (id, app, environment) VALUES ('singleton', $1, $2) ON CONFLICT (id) DO NOTHING`, [MARKER_APP, env]);
    const row = (await client.query(`SELECT app, environment FROM marketplace."MarketplaceInstance" WHERE id = 'singleton'`)).rows[0];
    if (row?.app !== MARKER_APP || row?.environment !== env) throw new GuardError("The marker row doesn't match after migrating.");
  } finally {
    await client.end().catch(() => {});
  }
}

export function runPrisma(args, url) {
  // Only the migration-only schema file, and only the migrator URL. AkadVerse's variables are removed from the child.
  const env = { ...process.env, MARKETPLACE_MIGRATION_DATABASE_URL: url };
  for (const name of ["DATABASE_URL", "DIRECT_URL", "DATABASE_PUBLIC_URL", "AKADVERSE_DATABASE_URL", "PROVISION_ADMIN_DATABASE_URL"]) delete env[name];
  return spawnSync("npx", ["prisma", ...args, "--schema", MIGRATION_SCHEMA_FILE], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env });
}

async function main() {
  const [command] = process.argv.slice(2);
  if (!["check", "status", "migrate-deploy"].includes(command)) {
    console.error("Usage: node scripts/db-guard.mjs <check|status|migrate-deploy>");
    process.exit(2);
  }
  loadProjectEnv();
  let identified;
  try {
    const review = reviewMigrations();
    if (review.length) throw new GuardError(`Migration review failed:\n  - ${review.join("\n  - ")}`);
    identified = await identifyTarget();
  } catch (err) {
    if (err instanceof GuardError) {
      console.error(`\n✖ ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  const { target, env, url, markerEnv, role, schemaExists } = identified;
  console.log(`✔ Target: ${target.host}:${target.port}/${target.database} (AkadVerse database) · env=${env} · role=${role} · marker=${markerEnv ?? "not written yet"}`);
  if (command === "check") return;
  if (command === "status") process.exit(runPrisma(["migrate", "status"], url).status ?? 1);

  if (!schemaExists) {
    // Full-access mode only (identifyTarget refuses a missing schema for the migrator): additive, outside "public".
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
    await client.connect();
    try {
      await client.query("CREATE SCHEMA IF NOT EXISTS marketplace");
    } finally {
      await client.end().catch(() => {});
    }
    console.log('✔ Created schema "marketplace".');
  }
  const result = runPrisma(["migrate", "deploy"], url);
  if (result.status !== 0) process.exit(result.status ?? 1);
  try {
    await ensureMarker(url, env);
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
  console.log(`✔ Marketplace schema migrated; marker = ${env}. Now run npm run db:verify.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
