// src/lib/prisma.ts
//
// Prisma client for AkadVerse's live database (AKADVERSE_DATABASE_URL — see prisma/schema.prisma). Shared records
// (users, businesses, products, orders, ...) are AkadVerse's own rows; Marketplace-only state lives in schema
// "marketplace".
//
// There is no fallback: if the variable is missing the app fails with a clear message rather than connecting to
// anything else. Two access modes:
//   - restricted (default): only the marketplace_app role is accepted; src/lib/db-target.ts verifies against the live
//     server that it has exactly the privileges in db/runtime-grants.json.
//   - full (MARKETPLACE_DB_ACCESS=full, an explicit owner decision): AkadVerse's own "postgres" login is accepted —
//     the same access AkadVerse itself runs with. Supabase-internal roles (supabase_admin, service_role, ...) and the
//     migration role are refused in both modes.
// A single instance is reused across hot reloads in development.

import { PrismaClient } from "@prisma/client";

// Accepted only in full-access mode.
const FULL_ACCESS_ROLE = "postgres";
const NEVER_ROLES = ["supabase_admin", "service_role", "supabase_auth_admin", "supabase_storage_admin", "authenticator", "dashboard_user", "marketplace_migrator"];

// Supabase's pooler expects "<role>.<project-ref>" as the user name.
export function roleOf(url: string): string | null {
  try {
    const user = decodeURIComponent(new URL(url).username);
    return user.split(".")[0] || null;
  } catch {
    return null;
  }
}

export function sameDatabase(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && (x.port || "5432") === (y.port || "5432") && x.pathname === y.pathname && x.username === y.username;
  } catch {
    return false;
  }
}

export function isFullAccessMode(): boolean {
  return process.env.MARKETPLACE_DB_ACCESS === "full";
}

export function assertRuntimeUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("AKADVERSE_DATABASE_URL is not set. The Marketplace connects to AkadVerse's database — see .env.example. (It never falls back to another database.)");
  }
  const role = roleOf(url);
  if (!role) throw new Error("AKADVERSE_DATABASE_URL is not a valid connection URL.");
  if (role === FULL_ACCESS_ROLE && !isFullAccessMode()) {
    throw new Error(`AKADVERSE_DATABASE_URL uses the "${role}" role. Use the restricted marketplace_app role, or set MARKETPLACE_DB_ACCESS=full to run with AkadVerse's own full-access login deliberately (README "Database access").`);
  }
  if (NEVER_ROLES.includes(role)) {
    throw new Error(`AKADVERSE_DATABASE_URL uses the "${role}" role — a Supabase-internal or migration role the Marketplace must never run as (README "Database access").`);
  }
  // The migration connection must not double as the app's.
  const migration = process.env.MARKETPLACE_MIGRATION_DATABASE_URL;
  if (migration && sameDatabase(url, migration)) throw new Error("AKADVERSE_DATABASE_URL is the same connection as MARKETPLACE_MIGRATION_DATABASE_URL.");
  return url;
}

const globalForPrisma = globalThis as unknown as { marketplacePrisma: PrismaClient | undefined };

function create(): PrismaClient {
  assertRuntimeUrl(process.env.AKADVERSE_DATABASE_URL);
  return new PrismaClient();
}

export const prisma = globalForPrisma.marketplacePrisma ?? create();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.marketplacePrisma = prisma;
}
