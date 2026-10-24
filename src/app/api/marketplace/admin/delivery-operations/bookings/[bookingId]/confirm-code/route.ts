// .../admin/delivery-operations/bookings/[bookingId]/confirm-code/route.ts
//
// POST { code, reason, submissionId, delivererId? } -> the admin fallback:
// enter the student's code that the deliverer passed on because they couldn't
// submit it themselves. Same code check as the deliverer's own submission
// (wrong codes count towards the lock); recorded as entered by this admin,
// with the reason, and audited. Never a way to complete a delivery without
// the code. See services/marketplace/vendor-delivery/handover/submit-delivery-code.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { adminSubmitDeliveryCode } from "@/services/marketplace/vendor-delivery/handover/submit-delivery-code";

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ code?: unknown; reason?: unknown; submissionId?: unknown; delivererId?: unknown }>(request);
    return NextResponse.json(await adminSubmitDeliveryCode(admin.user.id, bookingId, body));
  });
}
