// services/marketplace/delivery-roster/assign-planned.ts
//
// "Assign as planned" on Admin -> Assign deliveries: the coordinator's existing assignment action, driven by the
// roster instead of a hand-picked deliverer. Each selected ready item goes to its delivery's planned deliverer (or the
// roster's suggestion for a vendor booking made before rosters existed), grouped per deliverer, and every group is
// handed to the UNCHANGED assign-delivery.ts — same eligibility filter, same OTPs, events, emails and notifications.
// Items with no eligible planned deliverer are skipped and reported back, never guessed.

import { badRequest } from "@/lib/service-error";
import { prisma } from "@/lib/prisma";
import { assignDelivery } from "@/services/marketplace/delivery/assign-delivery";
import { READY_ITEM_WHERE } from "@/services/marketplace/delivery/shared/ready-item-filter";
import { plansForOrders } from "./delivery-plans";
import { loadDeliverers } from "./roster-resolution";

export async function assignPlannedDeliveries(orderItemIds: unknown, adminUserId: string) {
  if (!Array.isArray(orderItemIds) || orderItemIds.length === 0 || orderItemIds.some((id) => typeof id !== "string")) {
    throw badRequest("orderItemIds must be a non-empty list.");
  }
  const items = await prisma.orderItem.findMany({
    where: { id: { in: orderItemIds as string[] }, ...READY_ITEM_WHERE },
    select: { id: true, order: { select: { id: true, vendorDeliveryBookingId: true, vendorDeliveryBooking: { select: { slotId: true, bookedFor: true } } } } },
  });
  const plans = await plansForOrders(
    Array.from(new Map(items.map((i) => [i.order.id, i.order])).values()).map((o) => ({ id: o.id, vendorDeliveryBookingId: o.vendorDeliveryBookingId, booking: o.vendorDeliveryBooking }))
  );
  const people = await loadDeliverers(Array.from(plans.values()).map((p) => p.delivererId).filter(Boolean) as string[]);

  const groups = new Map<string, string[]>();
  const skipped: { orderItemId: string; reason: string }[] = [];
  const found = new Set(items.map((i) => i.id));
  for (const id of orderItemIds as string[]) if (!found.has(id)) skipped.push({ orderItemId: id, reason: "Not ready for assignment." });
  for (const item of items) {
    const delivererId = plans.get(item.order.id)?.delivererId;
    if (!delivererId) skipped.push({ orderItemId: item.id, reason: "No deliverer is planned for this delivery." });
    else if (people.get(delivererId)?.status !== "APPROVED") skipped.push({ orderItemId: item.id, reason: "The planned deliverer is no longer approved." });
    else groups.set(delivererId, [...(groups.get(delivererId) ?? []), item.id]);
  }

  const assigned = [];
  for (const [delivererId, ids] of groups) {
    const result = await assignDelivery(delivererId, ids, adminUserId);
    assigned.push({ delivererId, delivererName: people.get(delivererId)!.name, itemCount: ids.length, ...result });
  }
  return { assigned, skipped };
}
