// services/marketplace/admin/search-users.ts
//
// Paginated, searchable user list for the admin Users tab. Called by
// src/app/api/marketplace/admin/users/route.controller.ts.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "./shared/pagination";

export interface AdminUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
  blocked: boolean;
  createdAt: string;
}

export async function searchUsers(searchParams: URLSearchParams): Promise<PageResult<AdminUserRow>> {
  const pageParams = parsePageParams(searchParams);
  const q = searchParams.get("q")?.trim();

  // mode: "insensitive" — see the identical comment in
  // services/marketplace/product/search-products.ts.
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true, isAdmin: true, createdAt: true, marketplaceAccount: { select: { blocked: true } } },
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return toPageResult(
    users.map(({ marketplaceAccount, ...u }) => ({ ...u, blocked: marketplaceAccount?.blocked ?? false, createdAt: u.createdAt.toISOString() })),
    total,
    pageParams
  );
}
