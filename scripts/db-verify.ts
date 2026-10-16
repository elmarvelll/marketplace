// scripts/db-verify.ts  (npm run db:verify)
//
// Runs the same live checks as server startup (src/lib/db-target.ts) and prints the result: environment, target host
// and database, the effective role, and every problem found. Read-only. Never prints a credential.
// Exit code 0 = this configuration is safe to run the Marketplace with.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs helper without type declarations
import { loadProjectEnv } from "./db-guard.mjs";

async function main() {
  loadProjectEnv();
  const { verifyDatabaseTarget } = await import("../src/lib/db-target");
  const report = await verifyDatabaseTarget();
  console.log(`Environment: ${report.environment}\nTarget:      ${report.target}\nRole:        ${report.role}\nAccess:      ${report.access}`);
  if (report.ok) {
    console.log(
      report.access === "full"
        ? "✔ All database checks passed: AkadVerse's database (expected project), this environment's marker. Full-access login (MARKETPLACE_DB_ACCESS=full): privilege checks skipped."
        : "✔ All database checks passed: AkadVerse's database, this environment's marker, restricted role, privileges exactly as in db/runtime-grants.json.",
    );
  } else {
    for (const p of report.problems) console.error(`✖ ${p}`);
  }
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`✖ ${String(err instanceof Error ? err.message : err).replace(/postgres(ql)?:\/\/\S+/g, "<url>")}`);
  process.exit(1);
});
