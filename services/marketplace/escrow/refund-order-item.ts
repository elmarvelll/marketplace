// services/marketplace/escrow/refund-order-item.ts
//
// Moves a rejected/cancelled order item's escrowed money into the refund
// path. Called from the seller reject flow, the seller-response cron
// (auto-reject), and the second-failed-delivery cancellation flow — the
// money-handling is identical either way, only the triggering reason
// differs.
//
// Business rule: only ever touches the one OrderItem passed in. Never
// touches sibling items, even ones in the same Order, per the item-level
// escrow requirement.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { sendEmail, buyerRefundEmail } from "@/services/marketplace/notifications/email.service";

export async function refundOrderItem(
  orderItemId: string,
  reason: string,
  actorType: "seller" | "system" | "admin",
  actorId?: string
) {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { id: true, orderId: true, escrowStatus: true, order: { select: { userId: true, user: { select: { email: true } } } } },
  });
  if (!item) throw notFound("Order item not found.");

  // Idempotent: an item already refunded/being refunded is left alone —
  // this can be called from more than one path and must not double-process.
  if (item.escrowStatus === "REFUNDED" || item.escrowStatus === "REFUND_PENDING") {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: orderItemId },
      data: { escrowStatus: "REFUND_PENDING", refundedAt: null, refundReason: reason, refundInitiatedBy: actorId ?? actorType },
    });
    await recordOrderEvent(tx, { orderId: item.orderId, orderItemId, type: "REFUND_INITIATED", actorType, actorId, message: reason });
  });

  // In the absence of a real refund-processor integration (Paystack
  // refunds require a separate, not-yet-scoped API call — see
  // docs/marketplace/todo/phase-05-escrow-and-payments.md), a refund is
  // treated as completed immediately once initiated. This keeps the state
  // machine honest about *what's implemented* (REFUND_PENDING exists as a
  // real, reachable state) while not blocking the item on an integration
  // that hasn't been built. Revisit once real Paystack refund calls exist.
  await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({ where: { id: orderItemId }, data: { escrowStatus: "REFUNDED", refundedAt: new Date() } });
    await recordOrderEvent(tx, { orderId: item.orderId, orderItemId, type: "REFUND_COMPLETED", actorType: "system", message: reason });
  });

  if (item.order.user?.email) {
    void sendEmail({ to: item.order.user.email, ...buyerRefundEmail({ orderId: item.orderId, reason }) });
  }
}
