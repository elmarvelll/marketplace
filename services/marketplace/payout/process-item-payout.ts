// services/marketplace/payout/process-item-payout.ts
//
// Processes one delivered order item's payout to its seller's bank
// account, via Paystack Transfers. Called only from
// run-payout-sweep.ts — see docs/marketplace/systems/seller-payout-system.md.
//
// Flow: PAYOUT_PENDING -> PAYOUT_PROCESSING -> (Paystack transfer call) ->
// PAYOUT_SUCCESS or PAYOUT_FAILED. PAYOUT_SUCCESS is only ever set after
// Paystack's transfer call itself reports success — never optimistically.
// Idempotent per item: only ever acts on an item currently PAYOUT_PENDING,
// same pattern as
// services/marketplace/checkout/confirm-payment-by-reference.ts, so a
// cron run overlapping a previous one (or a retried FAILED item that
// re-enters PAYOUT_PENDING) can never double-pay.

import { prisma } from "@/lib/prisma";
import { calculateItemPayout } from "@/services/marketplace/escrow/calculate-item-payout";
import { createTransferRecipient, initiateTransfer } from "@/lib/external/paystack";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { sendEmail, sellerPayoutSuccessEmail, sellerPayoutFailedEmail } from "@/services/marketplace/notifications/email.service";

export async function processItemPayout(orderItemId: string): Promise<"success" | "failed" | "skipped"> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true,
      orderId: true,
      price: true,
      quantity: true,
      payoutStatus: true,
      escrowStatus: true,
      payoutAttempts: true,
      order: {
        select: {
          businessId: true,
          business: {
            select: { id: true, name: true, bankName: true, bankCode: true, accountNumber: true, accountHolderName: true, paystackRecipientCode: true, user: { select: { email: true } } },
          },
        },
      },
    },
  });
  if (!item) return "skipped";

  // Only ever act on an item still PAYOUT_PENDING — this is the
  // idempotency guard. A PAYOUT_FAILED item is retried by a separate
  // explicit step that first resets it back to PAYOUT_PENDING (see
  // run-payout-sweep.ts), not by this function silently reprocessing it.
  if (item.payoutStatus !== "PAYOUT_PENDING" || item.escrowStatus !== "PAYOUT_PENDING") {
    return "skipped";
  }

  const business = item.order.business;
  const { net } = calculateItemPayout(item.price, item.quantity);

  await prisma.orderItem.update({
    where: { id: orderItemId },
    data: { payoutStatus: "PAYOUT_PROCESSING", escrowStatus: "PAYOUT_PROCESSING", payoutProcessingAt: new Date(), payoutAttempts: { increment: 1 } },
  });
  await recordOrderEvent(prisma, { orderId: item.orderId, orderItemId, type: "PAYOUT_PROCESSING", actorType: "system" });

  try {
    if (!business.bankCode || !business.accountNumber || !business.accountHolderName) {
      throw new Error("Business bank details are incomplete.");
    }

    let recipientCode = business.paystackRecipientCode;
    if (!recipientCode) {
      recipientCode = await createTransferRecipient({
        accountName: business.accountHolderName,
        accountNumber: business.accountNumber,
        bankCode: business.bankCode,
      });
      await prisma.business.update({ where: { id: business.id }, data: { paystackRecipientCode: recipientCode } });
    }

    const transfer = await initiateTransfer({
      recipientCode,
      amountKobo: Math.round(net * 100),
      reference: `AKD-PAYOUT-${orderItemId}-${item.payoutAttempts + 1}`,
      reason: `AkadVerse Marketplace payout — order ${item.orderId}`,
    });

    if (transfer.status !== "success") {
      // Paystack accepted the transfer request but it's still settling
      // (e.g. status "pending"/"otp") — left PAYOUT_PROCESSING rather than
      // marked either success or failure; a future webhook handler for
      // transfer.success/transfer.failed events would resolve this
      // properly. See docs/marketplace/todo/phase-05-escrow-and-payments.md.
      return "skipped";
    }

    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { payoutStatus: "PAYOUT_SUCCESS", escrowStatus: "PAID_OUT", payoutSucceededAt: new Date(), payoutReference: transfer.reference },
    });
    await recordOrderEvent(prisma, { orderId: item.orderId, orderItemId, type: "PAYOUT_SUCCESS", actorType: "system" });

    if (business.user?.email) {
      void sendEmail({ to: business.user.email, ...sellerPayoutSuccessEmail({ businessName: business.name, amount: net, orderId: item.orderId }) });
    }
    return "success";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { payoutStatus: "PAYOUT_FAILED", escrowStatus: "PAYOUT_PENDING", payoutFailedAt: new Date(), payoutFailureReason: message },
    });
    await recordOrderEvent(prisma, { orderId: item.orderId, orderItemId, type: "PAYOUT_FAILED", actorType: "system", message });

    if (business.user?.email) {
      void sendEmail({ to: business.user.email, ...sellerPayoutFailedEmail({ businessName: business.name, orderId: item.orderId }) });
    }
    return "failed";
  }
}
