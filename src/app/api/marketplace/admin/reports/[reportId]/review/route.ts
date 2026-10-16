// .../admin/reports/[reportId]/review/route.ts
//
// POST -> admin marks a report reviewed. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { review } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return review(reportId);
}
