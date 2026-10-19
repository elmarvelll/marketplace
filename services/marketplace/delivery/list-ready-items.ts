// services/marketplace/delivery/list-ready-items.ts
//
// Order items dropped off and waiting for delivery-coordinator assignment.
// Called by
// src/app/api/marketplace/admin/deliveries/ready-items/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { READY_ITEM_WHERE } from "./shared/ready-item-filter";
import { plansForOrders } from "@/services/marketplace/delivery-roster/delivery-plans";
import { loadDeliverers } from "@/services/marketplace/delivery-roster/roster-resolution";
import { listRosterSlots } from "@/services/marketplace/delivery-roster/roster-slots";

export async function listReadyItems() {
  const items = await prisma.orderItem.findMany({
    where: READY_ITEM_WHERE,
    select: {
      id: true,
      quantity: true,
      price: true,
      // location is included so admin (and, via the deliverer's own
      // assignment view, the deliverer) can see where to collect a School
      // Vendor item — the vendor's own address, since there is no central
      // drop-off for vendor pickups (see
      // docs/marketplace/decisions/vendor-independent-architecture.md).
      // Meaningless/unused for a Business item, which still collects from
      // the central point (MarketplaceSettings.dropoffLocation).
      product: { select: { name: true, businessId: true, business: { select: { name: true, type: true, location: true } } } },
      side: { select: { name: true, businessId: true, business: { select: { name: true, type: true, location: true } } } },
      order: {
        select: {
          id: true,
          sellerDroppedOffAt: true,
          estimatedDeliveryAt: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          // Vendor orders carry their delivery date+timeframe via the
          // booking — used to group the assignment pool by order (spec
          // §21-22), never available for a Business item (null).
          vendorDeliveryBookingId: true,
          vendorDeliveryBooking: { select: { bookedFor: true, slotId: true, slot: { select: { id: true, label: true } } } },
        },
      },
    },
    orderBy: { order: { sellerDroppedOffAt: "asc" } },
  });

  // The delivery roster's plan for each order (who should take it, and — for
  // a Business order booked into a central slot — which slot). A suggestion
  // only: the coordinator still assigns through assign-delivery.ts.
  const uniqueOrders = Array.from(new Map(items.map((item) => [item.order.id, item.order])).values());
  const plans = await plansForOrders(
    uniqueOrders.map((o) => ({ id: o.id, vendorDeliveryBookingId: o.vendorDeliveryBookingId, booking: o.vendorDeliveryBooking ? { slotId: o.vendorDeliveryBooking.slotId, bookedFor: o.vendorDeliveryBooking.bookedFor } : null }))
  );
  const planned = await loadDeliverers(Array.from(plans.values()).map((p) => p.delivererId).filter(Boolean) as string[]);
  const centralSlots = new Map((await listRosterSlots("MARKETPLACE", undefined, { includeInactive: true })).map((slot) => [slot.id, slot]));

  return items.map((item) => {
    const plan = plans.get(item.order.id);
    const plannedPerson = plan?.delivererId ? planned.get(plan.delivererId) : undefined;
    const centralSlot = !item.order.vendorDeliveryBooking && plan ? centralSlots.get(plan.slotId) : undefined;
    // Either a Product line or a School Vendor Side line — both belong to
    // exactly one business.
    const source = (item.product ?? item.side)!;
    return {
      id: item.id,
      orderId: item.order.id,
      quantity: item.quantity,
      price: item.price,
      productName: source.name,
      businessId: source.businessId,
      businessName: source.business.name,
      businessType: source.business.type,
      customerName: `${item.order.user.firstName} ${item.order.user.lastName}`,
      orderCreatedAt: item.order.createdAt.toISOString(),
      // Only meaningful (and only ever populated) for a School Vendor —
      // the collection point for a Business item is always the central
      // drop-off location instead.
      collectionLocation: source.business.type === "SCHOOL_VENDOR" ? source.business.location : null,
      sellerDroppedOffAt: item.order.sellerDroppedOffAt?.toISOString() ?? null,
      estimatedDeliveryAt: item.order.estimatedDeliveryAt?.toISOString() ?? null,
      // A central (Business) order booked into a roster slot carries its
      // slot occurrence too, in the same shape as a vendor booking's.
      bookedFor: item.order.vendorDeliveryBooking?.bookedFor.toISOString() ?? (centralSlot ? `${plan!.date}T00:00:00.000Z` : null),
      slot: item.order.vendorDeliveryBooking?.slot ?? (centralSlot ? { id: centralSlot.id, label: centralSlot.label } : null),
      plannedDeliverer: plannedPerson ? { id: plannedPerson.id, name: plannedPerson.name, approved: plannedPerson.status === "APPROVED", source: plan!.source } : null,
    };
  });
}
