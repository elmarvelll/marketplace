// .../admin/reports/[reportId]/review/route.controller.ts
//
// Controller for POST .../review. See
// services/marketplace/admin/review-report.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { reviewReport } from "@/services/marketplace/admin/review-report";

export async function review(reportId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    await reviewReport(reportId, admin.user.id);
    return NextResponse.json({ message: "Report reviewed." });
  });
}
