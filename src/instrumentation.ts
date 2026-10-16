// src/instrumentation.ts
//
// Runs once when the server starts. Validates configuration, then verifies against the live server that this process
// is connected to the intended AkadVerse database, for the intended environment, as the restricted runtime role with
// exactly the privileges in db/runtime-grants.json (src/lib/db-target.ts). Prints one line naming the environment,
// host, database and role — never a credential.
//
// Any database problem stops the server, except in MARKETPLACE_ENV=local during `next dev`, where it is logged loudly
// so the developer can fix the local replica (npm run db:local:setup). Migrations are never run from here.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const problems: string[] = [];
  const warnings: string[] = [];
  const env = process.env;

  if (!env.NEXTAUTH_SECRET || env.NEXTAUTH_SECRET.length < 24 || env.NEXTAUTH_SECRET.startsWith("replace-")) problems.push("NEXTAUTH_SECRET must be a long random value generated for this app (never AkadVerse's).");
  if (!env.NEXTAUTH_URL) warnings.push("NEXTAUTH_URL is not set — links in emails and auth callbacks need this app's public origin.");
  if (!env.NEXT_PUBLIC_AKADVERSE_URL) warnings.push("NEXT_PUBLIC_AKADVERSE_URL is not set — the sign-in page can't link people to AkadVerse to create an account.");
  if (!env.CRON_SECRET) warnings.push("CRON_SECRET is not set — /api/cron/* will refuse to run.");
  if (env.MARKETPLACE_SCHEDULED_JOBS !== "enabled") warnings.push("MARKETPLACE_SCHEDULED_JOBS is not \"enabled\" — /api/cron/* is off here (AkadVerse runs the shared scheduled jobs). See README \"Scheduled jobs\".");
  if (!env.RESEND_API_KEY) warnings.push("RESEND_API_KEY is not set — emails are only logged, not sent.");
  const mode = env.PAYSTACK_MODE?.toLowerCase() === "live" ? "live" : "test";
  if (!(mode === "live" ? env.PAYSTACK_SECRET_KEY : env.PAYSTACK_TEST_SECRET_KEY)) warnings.push(`Paystack ${mode} secret key is not set — checkout will not work.`);
  if (!(mode === "live" ? env.NEXT_PUBLIC_PAYSTACK_LIVE_KEY : env.NEXT_PUBLIC_PAYSTACK_KEY)) warnings.push(`Paystack ${mode} public key is not set — checkout will not work.`);
  if (!env.CLOUDINARY_CLOUD_NAME) warnings.push("Cloudinary is not configured — image uploads will fail.");

  let databaseLine = "[marketplace:db] not checked";
  try {
    const { verifyDatabaseTarget } = await import("@/lib/db-target");
    const report = await verifyDatabaseTarget();
    databaseLine = `[marketplace:db] env=${report.environment} target=${report.target} role=${report.role} access=${report.access} checks=${report.ok ? "passed" : "FAILED"}`;
    problems.push(...report.problems);
  } catch (err) {
    // e.g. AKADVERSE_DATABASE_URL missing or a full-access role (thrown by src/lib/prisma.ts).
    problems.push(err instanceof Error ? err.message : String(err));
  }

  console.log(databaseLine);
  for (const w of warnings) console.warn(`[marketplace:config] ${w}`);
  for (const p of problems) console.error(`[marketplace:config] ERROR: ${p}`);

  const lenient = env.MARKETPLACE_ENV === "local" && env.NODE_ENV !== "production";
  if (problems.length > 0 && !lenient) {
    throw new Error(`Marketplace refused to start:\n- ${problems.join("\n- ")}`);
  }
}
