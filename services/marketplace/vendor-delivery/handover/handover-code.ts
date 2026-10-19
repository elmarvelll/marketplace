// services/marketplace/vendor-delivery/handover/handover-code.ts
//
// Lifecycle of the student's handover code for one Vendor delivery booking
// (src/lib/delivery-code.ts holds the crypto). One code per booking: a
// checkout spanning several vendors is one delivery to one student, so its
// vendor sub-orders share it, and verifying it completes only that booking.
//
//   - issued once the booking is CONFIRMED (after server-side Paystack
//     verification — confirm-payment-by-reference.ts calls this post-commit);
//     never for an unpaid or failed checkout;
//   - the student gets it by email (sent directly, not via the outbox) and in
//     their orders; deliverers and admins only ever see the mask;
//   - an admin may reissue it (audited) — the old code stops working.
//
// ensureHandoverCode is idempotent (unique bookingId), so a retry, a second
// confirmation path, or the lazy fallback in the student's order list can
// never create two codes.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conflict, badRequest, notFound } from "@/lib/service-error";
import { decryptDeliveryCode, issueDeliveryCode } from "@/lib/delivery-code";
import { sendEmail, studentVendorDeliveryCodeEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";

const longDate = new Intl.DateTimeFormat("en-NG", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

async function loadBooking(bookingId: string) {
  return prisma.vendorDeliveryBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true, userId: true, bookedFor: true, user: { select: { email: true } }, slot: { select: { label: true } } },
  });
}

async function sendCodeToStudent(booking: NonNullable<Awaited<ReturnType<typeof loadBooking>>>, code: string, reissued: boolean) {
  if (booking.user.email) {
    await sendEmail({
      to: booking.user.email,
      ...studentVendorDeliveryCodeEmail({ code, deliveryDate: longDate.format(booking.bookedFor), slotLabel: booking.slot.label, reissued }),
    });
  }
  await createNotification({
    recipientId: booking.userId,
    type: "VENDOR_DELIVERY_CODE",
    title: reissued ? "Your delivery code changed" : "Your delivery code is ready",
    // Never the code itself — notifications are stored and pushed in plaintext.
    message: "Open My Orders to see it. Give it to the deliverer only after you've received your order.",
    targetUrl: "/orders",
  });
}

// Issues the booking's code if it has none yet. notify=false is for callers
// that only need the row to exist (the student is notified by whoever first
// created it with notify=true).
export async function ensureHandoverCode(bookingId: string, { notify }: { notify: boolean }): Promise<{ created: boolean }> {
  const booking = await loadBooking(bookingId);
  if (!booking || booking.status !== "CONFIRMED") return { created: false };
  if (await prisma.deliveryHandoverCode.findUnique({ where: { bookingId }, select: { id: true } })) return { created: false };

  const issued = issueDeliveryCode(bookingId);
  try {
    await prisma.deliveryHandoverCode.create({
      data: { bookingId, codeHash: issued.codeHash, codeCipher: issued.codeCipher, maskedCode: issued.maskedCode },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { created: false }; // a concurrent caller won
    throw err;
  }
  if (notify) await sendCodeToStudent(booking, issued.code, false);
  return { created: true };
}

// Post-payment hook: never throws (the payment is already final). A failure
// here is retried lazily when the student opens their orders.
export async function issueHandoverCodesAfterPayment(bookingIds: string[]): Promise<void> {
  for (const bookingId of bookingIds) {
    try {
      await ensureHandoverCode(bookingId, { notify: true });
    } catch (err) {
      console.error(`[handover-code] could not issue a code for booking ${bookingId}:`, err instanceof Error ? err.message : err);
    }
  }
}

// The student's own view: the full code for each of their confirmed
// bookings (issuing any that are missing). Only ever called with the
// signed-in student's id, and filtered by it.
export async function getStudentDeliveryCodes(userId: string, bookingIds: string[]): Promise<Map<string, { code: string | null; delivered: boolean }>> {
  const result = new Map<string, { code: string | null; delivered: boolean }>();
  if (bookingIds.length === 0) return result;
  const bookings = await prisma.vendorDeliveryBooking.findMany({ where: { id: { in: bookingIds }, userId, status: "CONFIRMED" }, select: { id: true } });
  const owned = bookings.map((b) => b.id);
  let rows = await prisma.deliveryHandoverCode.findMany({ where: { bookingId: { in: owned } } });
  const missing = owned.filter((id) => !rows.some((r) => r.bookingId === id));
  if (missing.length > 0) {
    await issueHandoverCodesAfterPayment(missing);
    rows = await prisma.deliveryHandoverCode.findMany({ where: { bookingId: { in: owned } } });
  }
  for (const row of rows) {
    let code: string | null = null;
    try {
      code = decryptDeliveryCode(row.bookingId, row.codeCipher);
    } catch {
      code = null; // key rotated — an admin can reissue
    }
    result.set(row.bookingId, { code: row.verifiedAt ? null : code, delivered: Boolean(row.verifiedAt) });
  }
  return result;
}

// Admin: replace a booking's code (lost email, locked after wrong attempts,
// key rotation). Audited; the student is sent the new code.
export async function reissueHandoverCode(bookingId: string, adminUserId: string, reason: string | undefined) {
  if (!reason?.trim()) throw badRequest("A reason is required.");
  const booking = await loadBooking(bookingId);
  if (!booking) throw notFound("Booking not found.");
  if (booking.status !== "CONFIRMED") throw conflict("Only a confirmed booking has a delivery code.");
  const existing = await prisma.deliveryHandoverCode.findUnique({ where: { bookingId } });
  if (existing?.verifiedAt) throw conflict("This delivery is already confirmed.");

  const issued = issueDeliveryCode(bookingId);
  const data = { codeHash: issued.codeHash, codeCipher: issued.codeCipher, maskedCode: issued.maskedCode, failedAttempts: 0, issuedAt: new Date(), issuedBy: adminUserId };
  await prisma.deliveryHandoverCode.upsert({ where: { bookingId }, update: data, create: { bookingId, ...data } });
  await logAdminAction({ adminId: adminUserId, action: "VENDOR_DELIVERY_CODE_REISSUED", targetType: "VendorDeliveryBooking", targetId: bookingId, message: reason.trim() });
  await sendCodeToStudent(booking, issued.code, true);
  return { maskedCode: issued.maskedCode };
}
