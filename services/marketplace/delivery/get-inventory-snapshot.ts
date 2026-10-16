// services/marketplace/delivery/get-inventory-snapshot.ts
//
// Runs from the deliverer-inventory cron (12:00 AM). No separate
// "inventory" table exists to update — this reports live counts as a
// diagnostic; a deliverer's actual ready-to-ship set is always the live
// DeliveryItem rows, already visible via list-assigned-delivery-items.ts.
// Called by src/app/api/cron/deliverer-inventory/route.ts.

import { prisma } from "@/lib/prisma";

export async function getInventorySnapshot() {
  const counts = await prisma.deliveryItem.groupBy({
    by: ["businessId", "status"],
    where: { status: { in: ["ASSIGNED", "PICKED_UP"] } },
    _count: { id: true },
  });

  return counts.map((row) => ({ businessId: row.businessId, status: row.status, count: row._count.id }));
}
