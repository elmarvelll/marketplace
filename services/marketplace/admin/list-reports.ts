// services/marketplace/admin/list-reports.ts
//
// Every business report, joined to the reported business and the
// reporting user, for the admin Reports tab. Called by
// src/app/api/marketplace/admin/reports/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "./shared/pagination";

export interface AdminReportRow {
  id: string;
  businessId: string;
  businessName: string;
  reporterEmail: string;
  reason: string;
  status: string;
  reviewedAt: string | null;
  createdAt: string;
}

export async function listReports(searchParams: URLSearchParams): Promise<PageResult<AdminReportRow>> {
  const pageParams = parsePageParams(searchParams);
  const status = searchParams.get("status"); // "PENDING" | "REVIEWED" | null

  const where = status ? { status: status as "PENDING" | "REVIEWED" } : {};

  const [reports, total] = await Promise.all([
    prisma.businessReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
      select: {
        id: true,
        businessId: true,
        reason: true,
        status: true,
        reviewedAt: true,
        createdAt: true,
        business: { select: { name: true } },
        reporter: { select: { email: true } },
      },
    }),
    prisma.businessReport.count({ where }),
  ]);

  return toPageResult(
    reports.map((report) => ({
      id: report.id,
      businessId: report.businessId,
      businessName: report.business.name,
      reporterEmail: report.reporter.email,
      reason: report.reason,
      status: report.status,
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
      createdAt: report.createdAt.toISOString(),
    })),
    total,
    pageParams
  );
}
