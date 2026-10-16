// scripts/provision-db-roles.mjs — creates/refreshes the Marketplace's two restricted database roles on AkadVerse's
// database. Run by an OPERATOR with a privileged connection, once per environment (and again after a reviewed change
// to db/runtime-grants.json). The app itself never runs this and never holds the privileged credential.
//
//   node scripts/provision-db-roles.mjs --print
//       Prints the SQL that would run (passwords shown as <redacted>). Connects to nothing. Review this.
//
//   PROVISION_ADMIN_DATABASE_URL=...           privileged URL (Supabase: the "postgres" role, direct/session port)
//   MARKETPLACE_APP_DB_PASSWORD=...            new password for marketplace_app       (omit on a re-run to keep it)
//   MARKETPLACE_MIGRATOR_DB_PASSWORD=...       new password for marketplace_migrator  (omit on a re-run to keep it)
//   node scripts/provision-db-roles.mjs --apply --confirm-host=<exact host of PROVISION_ADMIN_DATABASE_URL>
//       Applies it in ONE transaction (all or nothing), then prints the resulting privileges (no secrets).
//
// What it creates (see README "Database roles"):
//   marketplace_app       LOGIN, no attributes (not superuser, no CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS), no memberships. CONNECT; USAGE on public + marketplace; exactly the
//                         row privileges in db/runtime-grants.json. Owns nothing, so it can't ALTER/DROP anything.
//   marketplace_migrator  LOGIN, no attributes, no memberships. Owns ONLY schema "marketplace"; USAGE on public and
//                         REFERENCES on public."User"(id) (for the AccountState foreign key). No row access to public.
// Passwords are sent as SCRAM-SHA-256 verifiers computed here, so the plaintext never reaches the server or its logs.
// The script never creates, alters or drops a table in "public" — it only GRANTs and REVOKEs on them.

import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_ROLE = "marketplace_app";
export const MIGRATOR_ROLE = "marketplace_migrator";
export const MARKETPLACE_SCHEMA = "marketplace";

export function loadGrants() {
  return JSON.parse(readFileSync(join(ROOT, "db/runtime-grants.json"), "utf8"));
}

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;

// PostgreSQL's SCRAM-SHA-256 verifier format (what CREATE/ALTER ROLE ... PASSWORD accepts pre-hashed).
export function scramVerifier(password, { salt = randomBytes(16), iterations = 4096 } = {}) {
  const salted = pbkdf2Sync(Buffer.from(password, "utf8"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

function checkPassword(name, value) {
  if (value === undefined || value === "") return null;
  // Printable ASCII only: avoids SASLprep differences between this verifier and the server's own normalisation.
  if (!/^[\x21-\x7e]{24,128}$/.test(value)) throw new Error(`${name} must be 24-128 printable ASCII characters without spaces (e.g. openssl rand -base64 33).`);
  return value;
}

// The statements, in order. `passwords` values are SCRAM verifiers (or null to keep the current password).
export function buildStatements(grants, { appVerifier = null, migratorVerifier = null, redact = false } = {}) {
  const pw = (v) => (v ? ` PASSWORD ${redact ? "'<redacted>'" : literal(v)}` : "");
  const both = `${APP_ROLE}, ${MIGRATOR_ROLE}`;
  const s = [];

  s.push("-- 1. Roles. Created if missing; attributes are always reset to the restricted set.");
  for (const role of [APP_ROLE, MIGRATOR_ROLE]) {
    s.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)}) THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
  }
  // NOSUPERUSER isn't written: PostgreSQL 16+ lets only a superuser mention that attribute, and Supabase's "postgres"
  // isn't one. New roles are never superusers and a non-superuser can't make them one; asserted just below.
  s.push(`ALTER ROLE ${APP_ROLE} WITH LOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 40${pw(appVerifier)}`);
  s.push(`ALTER ROLE ${MIGRATOR_ROLE} WITH LOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3${pw(migratorVerifier)}`);
  s.push(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN (${literal(APP_ROLE)}, ${literal(MIGRATOR_ROLE)}) AND rolsuper) THEN RAISE EXCEPTION 'A Marketplace role is a superuser. Nothing was changed.'; END IF; END $$`);
  s.push(`ALTER ROLE ${APP_ROLE} SET statement_timeout = '30s'`);
  s.push(`ALTER ROLE ${APP_ROLE} SET idle_in_transaction_session_timeout = '60s'`);
  s.push(`ALTER ROLE ${MIGRATOR_ROLE} SET lock_timeout = '10s'`);

  s.push("-- 2. No role memberships: neither role can SET ROLE to (or inherit from) anything — postgres, service_role, authenticated, pg_read_all_data, ...");
  s.push(`DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT m.roleid::regrole::text AS granted, m.member::regrole::text AS member FROM pg_auth_members m
           WHERE m.member IN (${literal(APP_ROLE)}::regrole, ${literal(MIGRATOR_ROLE)}::regrole) LOOP
    EXECUTE format('REVOKE %s FROM %s', r.granted, r.member);
  END LOOP;
END $$`);

  s.push("-- 3. Database: CONNECT only, never CREATE (no new schemas).");
  s.push(`DO $$ BEGIN
  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM ${both}', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${both}', current_database());
END $$`);

  s.push('-- 4. Schema "public" (AkadVerse\'s): USAGE only — never CREATE. Every existing privilege is cleared, then exactly the manifest is granted.');
  s.push(`REVOKE ALL ON SCHEMA public FROM ${both}`);
  s.push(`GRANT USAGE ON SCHEMA public TO ${both}`);
  s.push(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${both}`);
  s.push(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${both}`);
  s.push(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${both}`);
  // Fail with a clear message (inside the transaction, before granting) if a manifest table doesn't exist yet.
  const required = Object.keys(grants.public).map(literal).join(", ");
  s.push(`DO $$ DECLARE missing text; BEGIN
  SELECT string_agg(t, ', ') INTO missing FROM unnest(ARRAY[${required}]) AS t WHERE to_regclass(format('public.%I', t)) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'AkadVerse tables missing: % — apply AkadVerse''s pending migrations first (see README). Nothing was changed.', missing; END IF;
END $$`);
  for (const [table, spec] of Object.entries(grants.public)) {
    if (spec.privileges) {
      s.push(`GRANT ${spec.privileges.join(", ")} ON public.${ident(table)} TO ${APP_ROLE}`);
    } else {
      const parts = ["SELECT", "INSERT", "UPDATE"].filter((p) => spec[p]).map((p) => `${p} (${spec[p].map(ident).join(", ")})`);
      s.push(`GRANT ${parts.join(", ")} ON public.${ident(table)} TO ${APP_ROLE}`);
    }
  }
  s.push(`GRANT REFERENCES ("id") ON public."User" TO ${MIGRATOR_ROLE}`);

  s.push(`-- 5. Schema "${MARKETPLACE_SCHEMA}": owned by the migrator; the app can use it but not create in it.`);
  // Creating/handing over a schema owned by another role needs SET ROLE to it (PostgreSQL 16+), and only the owner can
  // grant on the schema's tables: the provisioning user is given SET on the migrator for this step only, does the
  // marketplace-schema grants AS the migrator, and the membership is revoked again before the transaction commits.
  s.push(`GRANT ${MIGRATOR_ROLE} TO CURRENT_USER WITH INHERIT FALSE, SET TRUE`);
  s.push(`CREATE SCHEMA IF NOT EXISTS ${MARKETPLACE_SCHEMA} AUTHORIZATION ${MIGRATOR_ROLE}`);
  s.push(`ALTER SCHEMA ${MARKETPLACE_SCHEMA} OWNER TO ${MIGRATOR_ROLE}`);
  s.push(`SET LOCAL ROLE ${MIGRATOR_ROLE}`);
  s.push(`REVOKE ALL ON SCHEMA ${MARKETPLACE_SCHEMA} FROM PUBLIC`);
  s.push(`REVOKE ALL ON SCHEMA ${MARKETPLACE_SCHEMA} FROM ${APP_ROLE}`);
  s.push(`GRANT USAGE ON SCHEMA ${MARKETPLACE_SCHEMA} TO ${APP_ROLE}`);
  // On a re-run the tables exist already: reset their grants to the manifest too. (The first migration grants them.)
  for (const [table, spec] of Object.entries(grants.marketplace)) {
    const rel = `${MARKETPLACE_SCHEMA}.${ident(table)}`;
    s.push(`DO $$ BEGIN IF to_regclass(${literal(rel)}) IS NOT NULL THEN
  EXECUTE ${literal(`REVOKE ALL ON ${rel} FROM ${APP_ROLE}`)};
  EXECUTE ${literal(`GRANT ${spec.privileges.join(", ")} ON ${rel} TO ${APP_ROLE}`)};
END IF; END $$`);
  }
  s.push("RESET ROLE");
  s.push(`REVOKE ${MIGRATOR_ROLE} FROM CURRENT_USER`);
  return s;
}

function parseArgs(argv) {
  const args = { print: argv.includes("--print"), apply: argv.includes("--apply") };
  const confirm = argv.find((a) => a.startsWith("--confirm-host="));
  args.confirmHost = confirm ? confirm.slice("--confirm-host=".length) : null;
  return args;
}

async function apply({ url, confirmHost, appPassword, migratorPassword }) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error("PROVISION_ADMIN_DATABASE_URL is not a valid connection URL.");
  }
  const user = decodeURIComponent(target.username);
  if (user.startsWith(APP_ROLE) || user.startsWith(MIGRATOR_ROLE)) throw new Error("PROVISION_ADMIN_DATABASE_URL must be a privileged role, not one of the Marketplace roles.");
  if (confirmHost !== target.hostname) throw new Error(`Refusing: pass --confirm-host=${target.hostname} to confirm this is the database you intend to change.`);

  const grants = loadGrants();
  const statements = buildStatements(grants, {
    appVerifier: appPassword ? scramVerifier(appPassword) : null,
    migratorVerifier: migratorPassword ? scramVerifier(migratorPassword) : null,
  });
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const who = (await client.query("SELECT current_user AS u, current_database() AS d")).rows[0];
    const existing = (await client.query("SELECT rolname FROM pg_roles WHERE rolname = ANY($1)", [[APP_ROLE, MIGRATOR_ROLE]])).rows.map((r) => r.rolname);
    for (const [role, pass] of [[APP_ROLE, appPassword], [MIGRATOR_ROLE, migratorPassword]]) {
      if (!existing.includes(role) && !pass) throw new Error(`${role} doesn't exist yet: set ${role === APP_ROLE ? "MARKETPLACE_APP_DB_PASSWORD" : "MARKETPLACE_MIGRATOR_DB_PASSWORD"} so it can be created with a password.`);
    }
    console.log(`Target: ${target.hostname}/${who.d} as ${who.u}`);
    await client.query("BEGIN");
    for (const sql of statements) {
      if (sql.startsWith("--")) continue;
      await client.query(sql);
    }
    await client.query("COMMIT");
    console.log(`✔ Applied ${statements.filter((x) => !x.startsWith("--")).length} statements in one transaction.`);
    const summary = await client.query(
      `SELECT table_schema || '.' || table_name AS t, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS p
         FROM information_schema.role_table_grants WHERE grantee = $1 GROUP BY 1 ORDER BY 1`,
      [APP_ROLE],
    );
    console.log(`\n${APP_ROLE} table privileges:`);
    for (const row of summary.rows) console.log(`  ${row.t.padEnd(48)} ${row.p}`);
    const cols = await client.query(
      `SELECT privilege_type AS p, string_agg(column_name, ', ' ORDER BY column_name) AS c FROM information_schema.column_privileges
        WHERE grantee = $1 AND table_schema = 'public' AND table_name = 'User' GROUP BY 1`,
      [APP_ROLE],
    );
    for (const row of cols.rows) console.log(`  public.User ${row.p} (${row.c})`);
    console.log("\nNext: npm run db:migrate (as marketplace_migrator), then npm run db:verify (as marketplace_app).");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.print === args.apply) {
    console.error("Usage: node scripts/provision-db-roles.mjs --print | --apply --confirm-host=<host>");
    process.exit(2);
  }
  if (args.print) {
    console.log("-- Generated by scripts/provision-db-roles.mjs from db/runtime-grants.json. Runs in ONE transaction.");
    console.log("BEGIN;");
    for (const sql of buildStatements(loadGrants(), { appVerifier: "x", migratorVerifier: "x", redact: true })) console.log(sql.startsWith("--") ? `\n${sql}` : `${sql};`);
    console.log("COMMIT;");
    return;
  }
  try {
    await apply({
      url: process.env.PROVISION_ADMIN_DATABASE_URL ?? "",
      confirmHost: args.confirmHost,
      appPassword: checkPassword("MARKETPLACE_APP_DB_PASSWORD", process.env.MARKETPLACE_APP_DB_PASSWORD),
      migratorPassword: checkPassword("MARKETPLACE_MIGRATOR_DB_PASSWORD", process.env.MARKETPLACE_MIGRATOR_DB_PASSWORD),
    });
  } catch (err) {
    // Never echo a connection string.
    console.error(`✖ ${String(err instanceof Error ? err.message : err).replace(/postgres(ql)?:\/\/\S+/g, "<url>")}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
