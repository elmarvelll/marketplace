// .../admin/delivery-operations/bookings/[bookingId]/reissue-code/route.ts
//
// POST { reason } -> replace the student's delivery code (lost, locked) and
// send them the new one. The admin never sees the code. Audited.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { reissueHandoverCode } from "@/services/marketplace/vendor-delivery/handover/handover-code";

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    return NextResponse.json(await reissueHandoverCode(bookingId, admin.user.id, body.reason));
  });
}
