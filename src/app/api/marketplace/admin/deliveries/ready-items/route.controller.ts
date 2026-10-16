// .../admin/deliveries/ready-items/route.controller.ts
//
// Controller for GET .../ready-items. See
// services/marketplace/delivery/list-ready-items.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listReadyItems as listReadyItemsAction } from "@/services/marketplace/delivery/list-ready-items";

export async function listReadyItems(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const items = await listReadyItemsAction();
    return NextResponse.json({ items });
  });
}
