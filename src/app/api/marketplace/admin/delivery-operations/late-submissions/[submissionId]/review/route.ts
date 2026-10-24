// .../admin/delivery-operations/late-submissions/[submissionId]/review/route.ts
//
// POST { decision: "COMPLETED" | "DECLINED", note } -> decide a LEGACY late
// confirmation (from before a correct late code completed the delivery by
// itself, recorded as late). Audited.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { reviewLateSubmission } from "@/services/marketplace/vendor-delivery/handover/admin-operations";

export async function POST(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  return runController(async () => {
    const admin = await requireAdmin();
    return NextResponse.json(await reviewLateSubmission(admin.user.id, submissionId, await readJsonBody(request)));
  });
}
