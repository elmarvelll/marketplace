// services/marketplace/admin/list-businesses-for-admin.ts
//
// Paginated, searchable, filterable business list — serves the
// Businesses tab (no filter / pending_approval), and the Verifications tab
// (filter=pending_verification — businesses with a currently PENDING
// BusinessVerificationRequest, not just "verified: false" — see
// docs/marketplace/systems/admin-system.md for the distinction). Called by
// src/app/api/marketplace/admin/businesses/route.controller.ts.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "./shared/pagination";

export interface AdminBusinessRow {
  id: string;
  name: string;
  industry: string;
  ownerEmail: string;
  approvalStatus: string;
  rejectionReason: string | null;
  verified: boolean;
  blocked: boolean;
  deliveryRestricted: boolean;
  createdAt: string;
  // School Vendor fields — null/false for an ordinary Business row. See
  // docs/marketplace/decisions/vendor-extends-business.md.
  type: string;
  vendorCategory: string | null;
  paused: boolean;
}

export type BusinessAdminFilter = "all" | "pending_approval" | "pending_verification" | "verified" | "blocked";
// Separate from BusinessAdminFilter (status) — this narrows by
// Business.type. "all" (default) intentionally shows both, so the existing
// Businesses tab keeps working unchanged for anyone not passing `type`.
export type BusinessAdminTypeFilter = "all" | "BUSINESS" | "SCHOOL_VENDOR";

export async function listBusinessesForAdmin(searchParams: URLSearchParams): Promise<PageResult<AdminBusinessRow>> {
  const pageParams = parsePageParams(searchParams);
  const q = searchParams.get("q")?.trim();
  const filter = (searchParams.get("filter") as BusinessAdminFilter | null) ?? "all";
  const typeFilter = (searchParams.get("type") as BusinessAdminTypeFilter | null) ?? "all";

  const where: Prisma.BusinessWhereInput = {
    // mode: "insensitive" — see the identical comment in
    // services/marketplace/product/search-products.ts.
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { industry: { contains: q, mode: "insensitive" } }] } : {}),
    ...(filter === "pending_approval" ? { approvalStatus: "PENDING_APPROVAL" } : {}),
    ...(filter === "pending_verification" ? { verificationRequests: { some: { status: "PENDING" } } } : {}),
    ...(filter === "verified" ? { verified: true } : {}),
    ...(filter === "blocked" ? { blocked: true } : {}),
    ...(typeFilter !== "all" ? { type: typeFilter } : {}),
  };

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      select: {
        id: true,
        name: true,
        industry: true,
        approvalStatus: true,
        rejectionReason: true,
        verified: true,
        blocked: true,
        deliveryRestricted: true,
        createdAt: true,
        type: true,
        vendorCategory: true,
        paused: true,
        user: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
    }),
    prisma.business.count({ where }),
  ]);

  return toPageResult(
    businesses.map(({ user, createdAt, ...rest }) => ({ ...rest, ownerEmail: user.email, createdAt: createdAt.toISOString() })),
    total,
    pageParams
  );
}
