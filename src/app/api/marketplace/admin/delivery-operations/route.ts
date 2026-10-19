// .../admin/delivery-operations/route.ts
//
// GET ?date=YYYY-MM-DD -> one day of Vendor Market deliveries for the admin
// (vendor manager): per slot, the bookings, vendor orders, deliverers,
// masked codes, deadlines, late confirmations and delivery cards. See
// services/marketplace/vendor-delivery/handover/admin-operations.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { getVendorOperationsDay } from "@/services/marketplace/vendor-delivery/handover/admin-operations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return runController(async () => {
    await requireAdmin();
    return NextResponse.json(await getVendorOperationsDay(request.nextUrl.searchParams.get("date") ?? undefined));
  });
}
