// .../deliverer/bookings/[bookingId]/confirm/route.ts
//
// POST { code, submissionId, clientRecordedAt? } -> submit the student's
// six-digit code, live or from the offline queue. Always 200 with the
// server's verdict ({ outcome: VERIFIED | REJECTED | LATE_REVIEW }) so the
// queue can settle it; 4xx only for requests that can never succeed. See
// services/marketplace/vendor-delivery/handover/submit-delivery-code.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireDelivererId } from "../../../shared/require-deliverer";
import { submitDeliveryCode } from "@/services/marketplace/vendor-delivery/handover/submit-delivery-code";

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const body = await readJsonBody<{ code?: unknown; submissionId?: unknown; clientRecordedAt?: unknown }>(request);
    return NextResponse.json(await submitDeliveryCode(delivererId, bookingId, body));
  });
}
