// .../deliverer/bookings/[bookingId]/fail-attempt/route.ts
//
// POST { reason } -> the student couldn't be reached. Same per-item rule as
// before (first failure schedules a retry, second cancels and refunds). See
// services/marketplace/vendor-delivery/handover/booking-delivery.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireDelivererId } from "../../../shared/require-deliverer";
import { reportBookingFailedAttempt } from "@/services/marketplace/vendor-delivery/handover/booking-delivery";

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const body = await readJsonBody<{ reason?: string }>(request);
    return NextResponse.json(await reportBookingFailedAttempt(delivererId, bookingId, body.reason));
  });
}
