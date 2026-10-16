// services/marketplace/admin/get-overview-stats.ts
//
// The Admin Dashboard's Overview stat cards — real counts from the
// database, not hardcoded. Called by
// src/app/api/marketplace/admin/overview/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function getOverviewStats() {
  const [userCount, businessCount] = await Promise.all([prisma.user.count(), prisma.business.count()]);

  return {
    userCount,
    businessCount,
    // No Skill-ownership concept exists in the schema/UI yet (the "Skills
    // marketplace" is still mock data — see
    // docs/marketplace/systems/skills-marketplace-mock.md) — shown as
    // "Coming Soon" rather than a fabricated number, per spec.
    skillOwnersComingSoon: true,
  };
}
