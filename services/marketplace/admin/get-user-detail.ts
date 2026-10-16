// services/marketplace/admin/get-user-detail.ts
//
// One user's detail for the admin Users tab and the new admin User
// Profile page (src/app/admin/users/[userId]/page.tsx)
// — never selects `password` or any auth secret. Includes the user's own
// businesses (not just a count) so the profile page can link straight
// through to each one — see
// services/marketplace/admin/get-business-detail-for-admin.ts. Called by
// src/app/api/marketplace/admin/users/[userId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { toAccountState } from "@/lib/account-state";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      isAdmin: true,
      marketplaceAccount: { select: { blocked: true, blockedAt: true, blockedReason: true } },
      location: true,
      createdAt: true,
      businesses: { select: { id: true, name: true, approvalStatus: true }, orderBy: { createdAt: "desc" } },
      _count: { select: { orders: { where: PAID_ORDER } } },
      deliverer: { select: { status: true } },
    },
  });
  if (!user) throw notFound("User not found.");

  const { _count, deliverer, marketplaceAccount, ...rest } = user;
  const state = toAccountState(marketplaceAccount);
  return {
    ...rest,
    createdAt: rest.createdAt.toISOString(),
    // Marketplace-only block (marketplace."AccountState"); AkadVerse itself is unaffected by it.
    blocked: state.blocked,
    blockedAt: state.blockedAt?.toISOString() ?? null,
    blockedReason: state.blockedReason,
    // Every account is an AkadVerse account now (kept for the profile page's label).
    accountSource: "akadverse" as const,
    businessCount: rest.businesses.length,
    orderCount: _count.orders,
    delivererStatus: deliverer?.status ?? null,
  };
}
