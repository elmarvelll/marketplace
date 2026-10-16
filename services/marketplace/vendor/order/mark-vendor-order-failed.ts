// services/marketplace/vendor/order/mark-vendor-order-failed.ts
//
// Vendor's "X — couldn't fulfill" control (spec §11) — the vendor marks an
// already-paid, auto-accepted order as unable to be prepared. Reuses
// services/marketplace/escrow/refund-order-item.ts unchanged (the same
// function admin/vendor-delivery/refund-vendor-item.ts already calls) —
// refunds every item on the order rather than introducing a new
// cancellation/status system (spec §26 — integrate with the existing
// status/escrow architecture, don't duplicate it). Owner+type-scoped via
// requireOwnedVendor. Called by
// src/app/api/marketplace/vendor/[id]/orders/[orderId]/fail/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";
import { refundOrderItem } from "@/services/marketplace/escrow/refund-order-item";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function markVendorOrderFailed(businessId: string, orderId: string, reason: string | undefined) {
  const { session } = await requireOwnedVendor(businessId);

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, ...PAID_ORDER },
    select: {
      id: true,
      userId: true,
      status: true,
      fulfillmentStatus: true,
      business: { select: { name: true } },
      items: { select: { id: true, escrowStatus: true } },
    },
  });
  if (!order) throw notFound("Order not found.");
  if (order.fulfillmentStatus === "HANDED_TO_DELIVERER") {
    throw conflict("This order has already been handed to a deliverer — it can no longer be marked as failed.");
  }

  const refundReason = reason?.trim() || "Vendor could not fulfill this order.";
  for (const item of order.items) {
    if (item.escrowStatus === "REFUNDED" || item.escrowStatus === "REFUND_PENDING") continue; // idempotent, same as refund-order-item.ts itself
    await refundOrderItem(item.id, refundReason, "seller", session.user.id);
  }

  await createNotification({
    recipientId: order.userId,
    type: "VENDOR_ORDER_FAILED",
    title: "Order couldn't be fulfilled",
    message: `${order.business.name} couldn't fulfill your order and it has been refunded.`,
    targetUrl: "/orders",
    orderId: order.id,
    businessId,
  });

  return { orderId };
}
