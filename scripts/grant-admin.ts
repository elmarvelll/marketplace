// scripts/grant-admin.ts  (npm run admin:grant -- person@example.com [--revoke])
//
// Grants or revokes administrator status for an EXISTING AkadVerse account from the command line. Admin status is
// AkadVerse's User.isAdmin — the flag both AkadVerse's Marketplace admin dashboard and this app use — so this changes
// it for both. Runs as the restricted runtime role (it may update only that column), and only after the same
// database-target checks as the app (src/lib/db-target.ts). The usual way is the admin dashboard's Users tab.

import { verifyDatabaseTarget } from "../src/lib/db-target";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run admin:grant -- person@example.com [--revoke]");
    process.exit(2);
  }
  const report = await verifyDatabaseTarget();
  console.log(`Target: env=${report.environment} ${report.target} role=${report.role}`);
  if (!report.ok) {
    for (const p of report.problems) console.error(`✖ ${p}`);
    process.exit(1);
  }
  const { prisma } = await import("../src/lib/prisma");
  const { bumpSessionVersion } = await import("../src/lib/account-state");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`✖ No AkadVerse account with the email ${email}.`);
    process.exit(1);
  }
  await prisma.user.update({ where: { id: user.id }, data: { isAdmin: !revoke } });
  if (revoke) await bumpSessionVersion(user.id);
  await prisma.adminActionLog.create({ data: { adminId: "cli", action: revoke ? "USER_ADMIN_REVOKED" : "USER_PROMOTED_TO_ADMIN", targetType: "user", targetId: user.id, message: "scripts/grant-admin.ts (Marketplace)" } });
  console.log(`✔ ${email} is ${revoke ? "no longer" : "now"} an administrator (AkadVerse and Marketplace).`);
  await prisma.$disconnect();
}

main();
