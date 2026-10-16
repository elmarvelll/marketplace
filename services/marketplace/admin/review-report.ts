// services/marketplace/admin/review-report.ts
//
// Admin marks a report reviewed. Idempotent — reviewing an
// already-reviewed report is a no-op. Called by
// src/app/api/marketplace/admin/reports/[reportId]/review/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";

export async function reviewReport(reportId: string, adminUserId: string) {
  const report = await prisma.businessReport.findUnique({ where: { id: reportId }, select: { id: true, status: true, businessId: true } });
  if (!report) throw notFound("Report not found.");
  if (report.status === "REVIEWED") return;

  await prisma.businessReport.update({ where: { id: reportId }, data: { status: "REVIEWED", reviewedAt: new Date(), reviewedBy: adminUserId } });
  await logAdminAction({ adminId: adminUserId, action: "REPORT_REVIEWED", targetType: "report", targetId: reportId, message: `Business ${report.businessId}` });
}
