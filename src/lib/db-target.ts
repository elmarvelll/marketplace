// src/lib/db-target.ts
//
// "Is this process connected to the database it thinks it is, with only the privileges it should have?" — answered
// against the live server, not from variable names. Run at startup (src/instrumentation.ts; production refuses to
// start on any problem) and on demand by `npm run db:verify`.
//
// Checks, in order:
//   1. Environment label: MARKETPLACE_ENV is one of local | test | staging | production.
//   2. URL identity: local/test must be a loopback host; staging/production must name the expected Supabase project
//      (AKADVERSE_DB_PROJECT_REF) in the pooler user name or the direct host. Never a full-access role (src/lib/prisma.ts).
//   3. Database identity: it has AkadVerse's tables (every shared table in db/runtime-grants.json) AND the Marketplace
//      marker row (marketplace."MarketplaceInstance") with environment = MARKETPLACE_ENV — so a staging deployment
//      pointed at the production database is refused, and so is a database that isn't AkadVerse's.
//   4. Role shape: not superuser / CREATEROLE / CREATEDB / BYPASSRLS / REPLICATION; member of no role (so it can't
//      SET ROLE postgres/service_role/...); owns no table or schema (so it can't ALTER or DROP); no CREATE on the
//      database or on either schema.
//   5. Privileges: every privilege the role effectively holds (directly or via PUBLIC) on every table/column/sequence
//      in "public" and "marketplace" is in db/runtime-grants.json — and everything in the manifest is held.
// In full-access mode (MARKETPLACE_DB_ACCESS=full — AkadVerse's own login, by owner decision) steps 4 and 5 are
// skipped: that login is privileged by definition. Steps 1-3 still apply, so it still can't point at the wrong
// project or another environment's database.
// The report never contains credentials: only host, database, role and table names.

import grantsManifest from "../../db/runtime-grants.json";
import { isFullAccessMode, prisma, roleOf } from "@/lib/prisma";

export const ENVIRONMENTS = ["local", "test", "staging", "production"] as const;
export type MarketplaceEnv = (typeof ENVIRONMENTS)[number];
export const MARKER_APP = "akadverse-marketplace";

const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
const COLUMN_PRIVILEGES = new Set(["SELECT", "INSERT", "UPDATE", "REFERENCES"]);

type TableSpec = { privileges?: string[]; SELECT?: string[]; INSERT?: string[]; UPDATE?: string[] };
type Manifest = Record<"public" | "marketplace", Record<string, TableSpec>>;
const manifest = grantsManifest as unknown as Manifest;

export interface TargetReport {
  ok: boolean;
  access: "restricted" | "full";
  environment: string;
  target: string;
  role: string;
  problems: string[];
}

const isLoopback = (host: string) => host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";

export function describeUrl(url: string): { host: string; port: string; database: string; user: string } {
  const u = new URL(url);
  return { host: u.hostname, port: u.port || "5432", database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres", user: decodeURIComponent(u.username) };
}

// Step 1-2: what can be checked without connecting.
export function checkUrlIdentity(url: string, env: string | undefined, projectRef: string | undefined): string[] {
  const problems: string[] = [];
  if (!env || !(ENVIRONMENTS as readonly string[]).includes(env)) {
    problems.push(`MARKETPLACE_ENV must be one of ${ENVIRONMENTS.join(", ")} (got ${env ? `"${env}"` : "nothing"}).`);
    return problems;
  }
  let target;
  try {
    target = describeUrl(url);
  } catch {
    return ["AKADVERSE_DATABASE_URL is not a valid connection URL."];
  }
  const local = isLoopback(target.host);
  if (env === "local" || env === "test") {
    if (!local) problems.push(`MARKETPLACE_ENV=${env} but the database host (${target.host}) is not local. Local and test environments may only use a local replica database.`);
  } else {
    if (local) problems.push(`MARKETPLACE_ENV=${env} but the database host is local.`);
    if (!projectRef) {
      problems.push(`AKADVERSE_DB_PROJECT_REF must be set for ${env}: the Supabase project reference of AkadVerse's database.`);
    } else {
      const matches = target.user.endsWith(`.${projectRef}`) || target.host === `db.${projectRef}.supabase.co`;
      if (!matches) problems.push(`The database URL is not for Supabase project ${projectRef} (AKADVERSE_DB_PROJECT_REF). Refusing an unexpected database.`);
    }
  }
  return problems;
}

interface PrivRow { schema: string; table: string; priv: string; tbl: boolean; anycol: boolean }
interface ColRow { column: string; sel: boolean; ins: boolean; upd: boolean }

// Steps 3-5: against the live server. Read-only.
export async function inspectLiveTarget(env: string, { full = false } = {}): Promise<{ role: string; database: string; problems: string[] }> {
  const problems: string[] = [];
  const [who] = await prisma.$queryRaw<{ role: string; database: string }[]>`SELECT current_user::text AS role, current_database()::text AS database`;
  if (!full) problems.push(...(await inspectRoleShape()));
  const present = await inspectIdentity(env, problems);
  if (!full) problems.push(...(await inspectPrivileges(present)));
  return { role: who?.role ?? "?", database: who?.database ?? "?", problems };
}

async function inspectRoleShape(): Promise<string[]> {
  const problems: string[] = [];

  // 4. Role shape.
  const [attrs] = await prisma.$queryRaw<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolbypassrls: boolean; rolreplication: boolean }[]>`
    SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = current_user`;
  for (const [flag, label] of [["rolsuper", "SUPERUSER"], ["rolcreaterole", "CREATEROLE"], ["rolcreatedb", "CREATEDB"], ["rolbypassrls", "BYPASSRLS"], ["rolreplication", "REPLICATION"]] as const) {
    if (attrs?.[flag]) problems.push(`The runtime role has ${label}.`);
  }
  const memberships = await prisma.$queryRaw<{ granted: string }[]>`
    SELECT m.roleid::regrole::text AS granted FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = current_user`;
  if (memberships.length) problems.push(`The runtime role is a member of ${memberships.map((m) => m.granted).join(", ")} (it could SET ROLE to it).`);
  const [owns] = await prisma.$queryRaw<{ relations: number; schemas: number }[]>`
    SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = current_user) AS relations,
           (SELECT count(*)::int FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE r.rolname = current_user) AS schemas`;
  if (owns && (owns.relations > 0 || owns.schemas > 0)) problems.push("The runtime role owns database objects (it could ALTER or DROP them).");
  const [create] = await prisma.$queryRaw<{ db: boolean; pub: boolean; mkt: boolean | null }[]>`
    SELECT has_database_privilege(current_database(), 'CREATE') AS db,
           has_schema_privilege('public', 'CREATE') AS pub,
           CASE WHEN to_regnamespace('marketplace') IS NULL THEN NULL ELSE has_schema_privilege('marketplace', 'CREATE') END AS mkt`;
  if (create?.db) problems.push("The runtime role can CREATE schemas in the database.");
  if (create?.pub) problems.push('The runtime role can CREATE objects in schema "public".');
  if (create?.mkt) problems.push('The runtime role can CREATE objects in schema "marketplace".');
  return problems;
}

async function inspectIdentity(env: string, problems: string[]): Promise<Set<string>> {

  // 3. Database identity: AkadVerse's tables must be there...
  const tables = await prisma.$queryRaw<{ schema: string; table: string }[]>`
    SELECT n.nspname::text AS schema, c.relname::text AS table FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'marketplace') AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`;
  const present = new Set(tables.map((t) => `${t.schema}.${t.table}`));
  const missingShared = Object.keys(manifest.public).filter((t) => !present.has(`public.${t}`));
  if (missingShared.length) problems.push(`AkadVerse tables missing: ${missingShared.join(", ")}. Either this isn't AkadVerse's database or AkadVerse's pending migrations haven't been applied.`);
  // ...and the marker must name this environment.
  if (!present.has("marketplace.MarketplaceInstance")) {
    problems.push('No marketplace."MarketplaceInstance" marker: the Marketplace schema hasn\'t been set up on this database (npm run db:migrate).');
  } else {
    try {
      const marker = await prisma.marketplaceInstance.findUnique({ where: { id: "singleton" } });
      if (!marker || marker.app !== MARKER_APP) problems.push("The Marketplace marker row is missing or not the Marketplace's.");
      else if (marker.environment !== env) problems.push(`This database is marked as "${marker.environment}", but MARKETPLACE_ENV is "${env}". Refusing to use another environment's database.`);
    } catch (err) {
      problems.push(`Couldn't read the Marketplace marker (${err instanceof Error ? err.message.split("\n").pop() : "error"}).`);
    }
  }
  return present;
}

async function inspectPrivileges(present: Set<string>): Promise<string[]> {
  const problems: string[] = [];

  // 5. Privileges: held vs manifest.
  const rows = await prisma.$queryRaw<PrivRow[]>`
    SELECT n.nspname::text AS schema, c.relname::text AS table, p.priv,
           has_table_privilege(c.oid, p.priv) AS tbl,
           CASE WHEN p.priv IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') THEN has_any_column_privilege(c.oid, p.priv) ELSE false END AS anycol
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p(priv)
     WHERE n.nspname IN ('public', 'marketplace') AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`;
  const unexpected: string[] = [];
  const missing: string[] = [];
  const byTable = new Map<string, Map<string, PrivRow>>();
  for (const row of rows) {
    const key = `${row.schema}.${row.table}`;
    if (!byTable.has(key)) byTable.set(key, new Map());
    byTable.get(key)!.set(row.priv, row);
  }
  for (const [key, privs] of byTable) {
    const [schema, table] = key.split(".") as ["public" | "marketplace", string];
    const spec = manifest[schema]?.[table];
    for (const priv of PRIVILEGES) {
      const row = privs.get(priv)!;
      const allowedTable = spec?.privileges?.includes(priv) ?? false;
      const allowedColumns = !spec?.privileges && COLUMN_PRIVILEGES.has(priv) ? (spec?.[priv as "SELECT" | "INSERT" | "UPDATE"] ?? []) : [];
      if (row.tbl && !allowedTable) unexpected.push(`${priv} on ${key}`);
      else if (!row.tbl && row.anycol && !allowedTable && allowedColumns.length === 0) unexpected.push(`${priv} on some columns of ${key}`);
      if (allowedTable && !row.tbl) missing.push(`${priv} on ${key}`);
    }
  }
  // Column-level tables (User): exactly the listed columns.
  for (const [schema, tablesSpec] of Object.entries(manifest) as ["public" | "marketplace", Record<string, TableSpec>][]) {
    for (const [table, spec] of Object.entries(tablesSpec)) {
      if (spec.privileges || !present.has(`${schema}.${table}`)) continue;
      const cols = await prisma.$queryRawUnsafe<ColRow[]>(
        `SELECT a.attname::text AS column, has_column_privilege(c.oid, a.attnum, 'SELECT') AS sel,
                has_column_privilege(c.oid, a.attnum, 'INSERT') AS ins, has_column_privilege(c.oid, a.attnum, 'UPDATE') AS upd
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
        schema,
        table,
      );
      for (const col of cols) {
        for (const [priv, held] of [["SELECT", col.sel], ["INSERT", col.ins], ["UPDATE", col.upd]] as const) {
          const allowed = (spec[priv] ?? []).includes(col.column);
          if (held && !allowed) unexpected.push(`${priv} on ${schema}.${table}.${col.column}`);
          if (!held && allowed) missing.push(`${priv} on ${schema}.${table}.${col.column}`);
        }
      }
    }
  }
  const [seq] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'S' AND n.nspname IN ('public', 'marketplace')
       AND (has_sequence_privilege(c.oid, 'USAGE') OR has_sequence_privilege(c.oid, 'SELECT') OR has_sequence_privilege(c.oid, 'UPDATE'))`;
  if (seq && seq.n > 0) unexpected.push(`access to ${seq.n} sequence(s)`);
  if (unexpected.length) problems.push(`The runtime role holds privileges beyond db/runtime-grants.json: ${unexpected.slice(0, 12).join("; ")}${unexpected.length > 12 ? ` (+${unexpected.length - 12} more)` : ""}.`);
  if (missing.length) problems.push(`The runtime role is missing privileges the app needs (re-run scripts/provision-db-roles.mjs): ${missing.slice(0, 12).join("; ")}${missing.length > 12 ? ` (+${missing.length - 12} more)` : ""}.`);
  return problems;
}

export async function verifyDatabaseTarget(): Promise<TargetReport> {
  const env = process.env.MARKETPLACE_ENV ?? "";
  const url = process.env.AKADVERSE_DATABASE_URL ?? "";
  let target = "(not configured)";
  try {
    const d = describeUrl(url);
    target = `${d.host}:${d.port}/${d.database}`;
  } catch {
    /* reported below */
  }
  const problems = url ? checkUrlIdentity(url, env, process.env.AKADVERSE_DB_PROJECT_REF?.trim()) : ["AKADVERSE_DATABASE_URL is not set."];
  let role = (url && roleOf(url)) || "?";
  const full = isFullAccessMode();
  if (problems.length === 0) {
    try {
      const live = await inspectLiveTarget(env, { full });
      role = live.role;
      problems.push(...live.problems);
    } catch (err) {
      problems.push(`Couldn't inspect the database (${err instanceof Error ? err.message.split("\n").filter(Boolean).pop() : "unknown error"}).`);
    }
  }
  return { ok: problems.length === 0, access: full ? "full" : "restricted", environment: env || "(unset)", target, role, problems };
}
