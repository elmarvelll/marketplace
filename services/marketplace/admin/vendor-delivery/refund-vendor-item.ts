// services/marketplace/admin/vendor-delivery/refund-vendor-item.ts
//
// Vendor Manager (admin) marks one order item unavailable/unfulfillable
// and refunds just that item — the rest of the order stays fulfilled
// (spec §29-31). Reuses services/marketplace/escrow/refund-order-item.ts
// unchanged rather than a parallel refund system; only ever touches the
// one item passed in, never siblings. Called by
// src/app/api/marketplace/admin/vendor-delivery/orders/[orderId]/items/[itemId]/refund/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest } from "@/lib/service-error";
import { refundOrderItem } from "@/services/marketplace/escrow/refund-order-item";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";
import { createNotification } from "@/services/marketplace/notifications/notification.service";

export async function refundVendorItem(orderId: string, orderItemId: string, reason: string | undefined, adminUserId: string) {
  if (!reason?.trim()) throw badRequest("A reason is required.");

  const item = await prisma.orderItem.findFirst({
    where: { id: orderItemId, orderId },
    select: {
      id: true,
      order: { select: { id: true, businessId: true, userId: true, business: { select: { type: true, name: true } } } },
      product: { select: { name: true } },
      side: { select: { name: true } },
    },
  });
  if (!item) throw notFound("Order item not found.");
  if (item.order.business.type !== "SCHOOL_VENDOR") {
    throw badRequest("This action is for School Vendor orders only — use the Business dispute/refund flow instead.");
  }

  await refundOrderItem(orderItemId, reason.trim(), "admin", adminUserId);
  await logAdminAction({
    adminId: adminUserId,
    action: "VENDOR_ITEM_REFUNDED",
    targetType: "order_item",
    targetId: orderItemId,
    message: reason.trim(),
  });

  const itemName = item.product?.name ?? item.side?.name ?? "an item";
  await createNotification({
    recipientId: item.order.userId,
    type: "VENDOR_ITEM_REFUNDED",
    title: "Item refunded",
    message: `${itemName} from your order at ${item.order.business.name} was unavailable and has been refunded. The rest of your order is unaffected.`,
    targetUrl: "/orders",
    orderId: item.order.id,
    businessId: item.order.businessId,
  });

  return { orderItemId };
}
