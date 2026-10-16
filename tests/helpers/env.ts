// tests/helpers/env.ts
//
// MUST be the first import of every test file. Points the app at the LOCAL TEST REPLICA of AkadVerse's database
// (akadverse_replica_test in this project's own Docker container — built from AkadVerse's migrations by
// npm run test:db:setup) before any app module loads, and replaces every provider secret with a dummy — so a test run
// can never touch AkadVerse's real database, Paystack, Resend or Cloudinary, whatever is in .env.
//
// The app under test connects exactly as in production: as the restricted marketplace_app role. Only fixtures that
// stand in for AkadVerse itself (creating accounts) use the owner connection (tests/helpers/akadverse.ts).
//
//   npm run db:up            # this project's Postgres (127.0.0.1:5434)
//   npm run test:db:setup    # (re)builds the test replica, roles and Marketplace schema
//   npm test

const LOCAL = "postgresql://marketplace_app:marketplace_app_local_only_0000@127.0.0.1:5434/akadverse_replica_test";
const url = process.env.MARKETPLACE_TEST_DATABASE_URL || LOCAL;

const parsed = new URL(url);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing to run tests against a non-local database host (${parsed.hostname}). Set MARKETPLACE_TEST_DATABASE_URL to a local replica.`);
}
if (!/test/i.test(parsed.pathname)) {
  throw new Error(`Refusing to run tests against "${parsed.pathname.slice(1)}": the test database name must contain "test" (tests create data).`);
}

process.env.MARKETPLACE_ENV = "test";
process.env.AKADVERSE_DATABASE_URL = url;
// The AkadVerse stand-in (owner of the public tables) and the local superuser (full catalog visibility, drift check).
process.env.AKADVERSE_TEST_OWNER_URL = `postgresql://akadverse_owner:akadverse_owner_local_only@${parsed.host}${parsed.pathname}`;
process.env.MARKETPLACE_TEST_SUPERUSER_URL = `postgresql://marketplace:marketplace_local_only@${parsed.host}${parsed.pathname}`;
// Set to "" rather than deleted: Prisma's client loads .env into any variable that is still undefined, and .env may
// point at the LIVE database (full-access mode). An empty string is "set", so nothing from .env can leak in.
for (const name of [
  "DATABASE_URL",
  "DIRECT_URL",
  "DATABASE_PUBLIC_URL",
  "MARKETPLACE_MIGRATION_DATABASE_URL",
  "PROVISION_ADMIN_DATABASE_URL",
  "AKADVERSE_AUTH_DATABASE_URL",
  "MARKETPLACE_DB_ACCESS",
  "AKADVERSE_DB_PROJECT_REF",
  "MARKETPLACE_DB_CONFIRM_HOST",
  "MARKETPLACE_ALLOW_DESTRUCTIVE",
]) process.env[name] = "";
process.env.PAYSTACK_MODE = "test";
process.env.PAYSTACK_TEST_SECRET_KEY = "sk_test_dummy_for_automated_tests";
process.env.PAYSTACK_SECRET_KEY = "sk_live_dummy_never_used";
process.env.NEXT_PUBLIC_PAYSTACK_KEY = "pk_test_dummy";
process.env.RESEND_API_KEY = "re_dummy_for_automated_tests";
process.env.NEXTAUTH_URL = "https://marketplace.test";
process.env.NEXTAUTH_SECRET = "test-nextauth-secret-for-automated-tests";
process.env.NEXT_PUBLIC_AKADVERSE_URL = "https://akadverse.test";
process.env.ADMIN_EMAIL = "";
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";
process.env.CRON_SECRET = "test-cron-secret";
delete process.env.MARKETPLACE_SCHEDULED_JOBS;
