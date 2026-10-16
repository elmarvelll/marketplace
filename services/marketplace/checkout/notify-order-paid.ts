// services/marketplace/checkout/notify-order-paid.ts
//
// Owner notifications for a just-finalized (paid) checkout — the paid-order
// email and the in-app "New order" bell entry, for both Business and School
// Vendor orders. Only ever called by the one caller that won the
// PENDING -> PAID transition in confirm-payment-by-reference.ts, so a
// webhook + verify race can't double-notify; the email additionally carries
// the dedupe key `order-paid:<orderId>` in the outbox as a second guard.
//
// enqueueOrderPaidEmails runs INSIDE the finalize transaction (true outbox:
// the email row commits iff the order is paid). createOrderPaidNotifications
// runs after commit (it publishes to live SSE connections).

import { prisma } from "@/lib/prisma";
import type { Db } from "@/services/marketplace/order/shared/db";
import { enqueueEmail } from "@/services/marketplace/notifications/email-outbox";
import { appUrl, newOrderEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";
import { CHECKOUT_CURRENCY } from "./shared/checkout-payment-config";

const lagosDate = new Intl.DateTimeFormat("en-NG", { weekday: "long", month: "long", day: "numeric", timeZone: "Africa/Lagos" });

async function loadPaidOrders(db: Db, orderIds: string[]) {
  return db.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      totalAmount: true,
      paystackReference: true,
      estimatedDeliveryAt: true,
      business: { select: { id: true, type: true, name: true, user: { select: { id: true, email: true } } } },
      vendorDeliveryBooking: { select: { bookedFor: true, slot: { select: { label: true } } } },
      items: {
        select: {
          quantity: true,
          price: true,
          variantName: true,
          product: { select: { name: true } },
          side: { select: { name: true } },
        },
      },
    },
  });
}

export async function enqueueOrderPaidEmails(db: Db, orderIds: string[]): Promise<string[]> {
  const orders = await loadPaidOrders(db, orderIds);
  const ids: string[] = [];
  for (const order of orders) {
    const owner = order.business.user;
    if (!owner?.email) continue;
    const isVendor = order.business.type === "SCHOOL_VENDOR";
    const deliveryInfo = order.vendorDeliveryBooking
      ? `${lagosDate.format(order.vendorDeliveryBooking.bookedFor)} · ${order.vendorDeliveryBooking.slot.label} (a deliverer collects from your location)`
      : order.estimatedDeliveryAt
        ? `Estimated delivery ${lagosDate.format(order.estimatedDeliveryAt)} — drop off at the central drop-off point once ready`
        : null;
    const email = newOrderEmail({
      businessName: order.business.name,
      orderId: order.id,
      paymentReference: order.paystackReference ?? "",
      items: order.items.map((item) => ({
        name: item.product?.name ?? item.side?.name ?? "Item",
        variantName: item.variantName,
        quantity: item.quantity,
        lineTotal: item.price * item.quantity,
      })),
      totalAmount: order.totalAmount,
      currency: CHECKOUT_CURRENCY,
      deliveryInfo,
      nextStep: isVendor
        ? "Vendor orders are accepted automatically. Prepare it and mark it ready before the delivery window."
        : "Please accept or reject this order within 24 hours.",
      orderUrl: appUrl(ownerDashboardPath(order.business, "orders")),
    });
    const id = await enqueueEmail({ dedupeKey: `order-paid:${order.id}`, to: owner.email, ...email }, db);
    if (id) ids.push(id);
  }
  return ids;
}

export async function createOrderPaidNotifications(orderIds: string[]): Promise<void> {
  const orders = await loadPaidOrders(prisma, orderIds);
  for (const order of orders) {
    const owner = order.business.user;
    if (!owner?.id) continue;
    try {
      await createNotification({
        recipientId: owner.id,
        type: "NEW_ORDER",
        title: "New order",
        message: `You have a new paid order on ${order.business.name}.`,
        targetUrl: ownerDashboardPath(order.business, "orders"),
        orderId: order.id,
        businessId: order.business.id,
      });
    } catch (err) {
      console.error(`[notify-order-paid] in-app notification for order ${order.id} failed`, err);
    }
  }
}
