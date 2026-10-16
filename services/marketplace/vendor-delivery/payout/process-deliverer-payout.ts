// services/marketplace/vendor-delivery/payout/process-deliverer-payout.ts
//
// Processes one (deliverer, vendor) handoff's payout to the deliverer's
// bank account via Paystack Transfers — direct structural mirror of
// services/marketplace/payout/process-item-payout.ts (see
// docs/marketplace/decisions/vendor-extends-business.md: reuse the shape,
// not a parallel payment system). Only ever acts on a handoff currently
// PAYOUT_PENDING — same idempotency guard, so a cron run overlapping a
// previous one (or a retried FAILED handoff re-entering PAYOUT_PENDING)
// can never double-pay. Called only from run-deliverer-payout-sweep.ts.

import { prisma } from "@/lib/prisma";
import { createTransferRecipient, initiateTransfer } from "@/lib/external/paystack";
import { sendEmail, sellerPayoutSuccessEmail, sellerPayoutFailedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";

export async function processDelivererPayout(handoffId: string): Promise<"success" | "failed" | "skipped"> {
  const handoff = await prisma.delivery_x_businesses.findUnique({
    where: { id: handoffId },
    select: {
      id: true,
      delivererPayoutStatus: true,
      delivererPayoutAmount: true,
      delivererPayoutAttempts: true,
      businessId: true,
      business: { select: { name: true } },
      deliveryman: {
        select: {
          id: true,
          firstName: true,
          bankCode: true,
          accountNumber: true,
          accountHolderName: true,
          paystackRecipientCode: true,
          userId: true,
          user: { select: { email: true } },
        },
      },
    },
  });
  if (!handoff) return "skipped";
  if (handoff.delivererPayoutStatus !== "PAYOUT_PENDING" || !handoff.delivererPayoutAmount) return "skipped";

  const deliverer = handoff.deliveryman;

  await prisma.delivery_x_businesses.update({
    where: { id: handoffId },
    data: { delivererPayoutStatus: "PAYOUT_PROCESSING", delivererPayoutProcessingAt: new Date(), delivererPayoutAttempts: { increment: 1 } },
  });

  try {
    if (!deliverer.bankCode || !deliverer.accountNumber || !deliverer.accountHolderName) {
      throw new Error("Deliverer bank details are incomplete.");
    }

    let recipientCode = deliverer.paystackRecipientCode;
    if (!recipientCode) {
      recipientCode = await createTransferRecipient({
        accountName: deliverer.accountHolderName,
        accountNumber: deliverer.accountNumber,
        bankCode: deliverer.bankCode,
      });
      await prisma.deliverer.update({ where: { id: deliverer.id }, data: { paystackRecipientCode: recipientCode } });
    }

    const transfer = await initiateTransfer({
      recipientCode,
      amountKobo: Math.round(handoff.delivererPayoutAmount * 100),
      reference: `AKD-DLV-PAYOUT-${handoffId}`,
      reason: `AkadVerse Vendor Delivery payout — ${handoff.business.name}`,
    });

    if (transfer.status !== "success") {
      // Same posture as process-item-payout.ts — left PAYOUT_PROCESSING,
      // a future transfer webhook would resolve this properly.
      return "skipped";
    }

    await prisma.delivery_x_businesses.update({
      where: { id: handoffId },
      data: { delivererPayoutStatus: "PAYOUT_SUCCESS", delivererPayoutSucceededAt: new Date(), delivererPayoutReference: transfer.reference },
    });

    if (deliverer.user?.email) {
      void sendEmail({
        to: deliverer.user.email,
        ...sellerPayoutSuccessEmail({ businessName: handoff.business.name, amount: handoff.delivererPayoutAmount, orderId: handoffId }),
      });
    }
    await createNotification({
      recipientId: deliverer.userId,
      type: "DELIVERER_PAYOUT_SUCCESS",
      title: "Delivery payment sent",
      message: `You've been paid for your delivery run from ${handoff.business.name}.`,
      targetUrl: "/deliverer",
    });
    return "success";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    await prisma.delivery_x_businesses.update({
      where: { id: handoffId },
      data: { delivererPayoutStatus: "PAYOUT_FAILED", delivererPayoutFailedAt: new Date(), delivererPayoutFailureReason: message },
    });

    if (deliverer.user?.email) {
      void sendEmail({ to: deliverer.user.email, ...sellerPayoutFailedEmail({ businessName: handoff.business.name, orderId: handoffId }) });
    }
    return "failed";
  }
}
