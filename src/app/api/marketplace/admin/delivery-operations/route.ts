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
import { assignDueDeliveries } from "@/services/marketplace/vendor-delivery/slot-briefing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return runController(async () => {
    await requireAdmin();
    await assignDueDeliveries(); // same as the deliverer view: nothing due within two hours is left unassigned
    return NextResponse.json(await getVendorOperationsDay(request.nextUrl.searchParams.get("date") ?? undefined));
  });
}
