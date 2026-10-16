// services/marketplace/order/initiate-order-dropoff.ts
//
// Step 1 of the Seller -> Delivery Coordinator handoff (the first of the
// three chain-of-custody handoffs — see
// docs/marketplace/systems/delivery-coordinator-system.md). The seller
// arrives at the central drop-off point with a READY_FOR_PICKUP order and
// requests the handoff; this issues a one-time OTP that only the seller
// sees. The seller reads/shows that code to the coordinator, who enters it
// server-side via confirm-seller-dropoff.ts — that second step, not this
// one, is what actually records the order as dropped off/received.
//
// Deliberately NOT a self-attested "I dropped it off" action: the package
// isn't considered to have changed hands until the coordinator verifies
// the OTP, which is why sellerDroppedOffAt is untouched here.
//
// Called by
// src/app/api/marketplace/businesses/[id]/orders/[orderId]/drop-off/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { generateOtp, buildOtpExpiry } from "@/lib/otp";
import { sendEmail, sellerDropoffOtpEmail } from "@/services/marketplace/notifications/email.service";
import { notifyAdmins } from "@/services/marketplace/notifications/notification.service";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function initiateOrderDropoff(businessId: string, orderId: string, actorUserId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, ...PAID_ORDER },
    select: {
      id: true,
      status: true,
      fulfillmentStatus: true,
      sellerDroppedOffAt: true,
      business: { select: { name: true, user: { select: { email: true } } } },
    },
  });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "ACCEPTED" || order.fulfillmentStatus !== "READY_FOR_PICKUP") {
    throw conflict("Only a ready-for-pickup order can be dropped off.");
  }
  if (order.sellerDroppedOffAt) throw conflict("This order has already been dropped off.");

  // Re-issuing is allowed any number of times before the coordinator
  // confirms (e.g. the code expired while the seller was queued) — each
  // call simply overwrites the previous code/expiry/attempt count, so only
  // the most recently issued code is ever valid.
  const otp = generateOtp();
  const otpExpiry = buildOtpExpiry();

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { dropoffOtp: otp, dropoffOtpExpiry: otpExpiry, dropoffOtpAttempts: 0 },
    });
    await recordOrderEvent(tx, { orderId, type: "SELLER_DROPOFF_OTP_ISSUED", actorType: "seller", actorId: actorUserId });
  });

  // The seller already sees this code in-app (it's shown right on the
  // Orders tab), but the 30-minute window is short enough that emailing it
  // immediately — rather than via a reminder cron, which can't reliably
  // beat 30 minutes against typical cron granularity — is the only
  // reliable way to make sure they're told the deadline.
  const ownerEmail = order.business.user?.email;
  if (ownerEmail) {
    void sendEmail({
      to: ownerEmail,
      ...sellerDropoffOtpEmail({ businessName: order.business.name, orderId, otp, expiresAt: otpExpiry.toLocaleTimeString() }),
    });
  }

  // Heads-up for the delivery coordinator — a seller is en route/waiting
  // with a drop-off code. In-app only (no email — the coordinator already
  // sees this order on the Drop-offs admin screen; an email per drop-off
  // request would be too noisy).
  await notifyAdmins({
    type: "SELLER_DROPOFF_WAITING",
    title: "Seller waiting at drop-off",
    message: `${order.business.name} has a drop-off code ready to be verified.`,
    targetUrl: "/admin/dropoffs",
    orderId,
    businessId,
  });

  return { dropoffOtp: otp, dropoffOtpExpiry: otpExpiry.toISOString() };
}
