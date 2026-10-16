// .../admin/vendor-delivery/bookings/route.controller.ts
//
// Controller for GET .../vendor-delivery/bookings?slotId=&status=&date=&page=&pageSize=.
// See services/marketplace/admin/vendor-delivery/list-vendor-bookings.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listVendorBookings } from "@/services/marketplace/admin/vendor-delivery/list-vendor-bookings";

export async function listBookings(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await listVendorBookings(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
