// .../admin/delivery-operations/bookings/[bookingId]/reassign/route.ts
//
// POST { delivererId, reason } -> give a booking's uncollected items to
// another deliverer (or assign unassigned ones). Audited.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { reassignBooking } from "@/services/marketplace/vendor-delivery/handover/admin-operations";

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return runController(async () => {
    const admin = await requireAdmin();
    return NextResponse.json(await reassignBooking(admin.user.id, bookingId, await readJsonBody(request)));
  });
}
