// .../deliverer/bookings/[bookingId]/start/route.ts
//
// POST -> set off to the student with this booking's collected items. See
// services/marketplace/vendor-delivery/handover/booking-delivery.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireDelivererId } from "../../../shared/require-deliverer";
import { startBookingDelivery } from "@/services/marketplace/vendor-delivery/handover/booking-delivery";

export async function POST(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return runController(async () => {
    const delivererId = await requireDelivererId();
    return NextResponse.json(await startBookingDelivery(delivererId, bookingId));
  });
}
