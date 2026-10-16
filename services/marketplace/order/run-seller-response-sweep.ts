// services/marketplace/order/run-seller-response-sweep.ts
//
// Runs from the seller-response cron (every 5 hours — see
// docs/marketplace/systems/cron-system.md). Auto-rejects any order still
// PENDING_SELLER more than 24 hours after it was *created* — the deadline
// is anchored to Order.createdAt, not "24 hours since this cron last ran."
// Called by src/app/api/cron/seller-response/route.ts.

import { prisma } from "@/lib/prisma";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { refundOrderItem } from "@/services/marketplace/escrow/refund-order-item";
import { sendEmail, sellerRejectedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

const RESPONSE_DEADLINE_MS = 24 * 60 * 60 * 1000;
const AUTO_REJECT_REASON = "Seller took too long to respond.";

export async function runSellerResponseSweep(): Promise<{ autoRejected: number }> {
  const cutoff = new Date(Date.now() - RESPONSE_DEADLINE_MS);

  const overdueOrders = await prisma.order.findMany({
    // PAID orders only. Unpaid checkout attempts also sit at PENDING_SELLER;
    // before this filter they were auto-"rejected" and the buyer was emailed
    // about a refund for money that was never taken.
    where: { status: "PENDING_SELLER", createdAt: { lte: cutoff }, ...PAID_ORDER },
    select: {
      id: true,
      userId: true,
      businessId: true,
      items: { select: { id: true } },
      business: { select: { name: true } },
      user: { select: { email: true } },
    },
  });

  for (const order of overdueOrders) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: AUTO_REJECT_REASON, autoRejected: true },
      });
      await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { rejectedAt: new Date(), rejectionReason: AUTO_REJECT_REASON } });
      await recordOrderEvent(tx, { orderId: order.id, type: "SELLER_AUTO_REJECTED", actorType: "system", message: AUTO_REJECT_REASON });
    });

    for (const item of order.items) {
      await refundOrderItem(item.id, AUTO_REJECT_REASON, "system");
    }

    if (order.user?.email) {
      void sendEmail({ to: order.user.email, ...sellerRejectedEmail({ businessName: order.business.name, orderId: order.id, reason: AUTO_REJECT_REASON }) });
    }
    await createNotification({
      recipientId: order.userId,
      type: "ORDER_REJECTED",
      title: "Order rejected",
      message: `${order.business.name} was unable to fulfill your order: ${AUTO_REJECT_REASON}`,
      targetUrl: "/orders",
      orderId: order.id,
      businessId: order.businessId,
    });
  }

  return { autoRejected: overdueOrders.length };
}
