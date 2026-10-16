// services/marketplace/deliverer/request-student-email-otp.ts
//
// Step 1 of the deliverer application's student-email verification (spec
// §34-36): the applicant supplies only the local part of their student
// email — the canonical "<local>@stu.cu.edu.ng" address is constructed
// HERE, server-side, and is never trusted from the client. Reuses
// src/lib/otp.ts's generic generate/expiry helpers unchanged (same 30-
// minute TTL the spec asks for). Rate-limited via
// studentEmailOtpLastSentAt — one request per minute, so a buyer can't
// hammer the email provider or brute-force-adjacent-flood a mailbox they
// don't own. Called by
// src/app/api/marketplace/deliverer/student-email/request-otp/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest, tooManyRequests } from "@/lib/service-error";
import { generateOtp, buildOtpExpiry } from "@/lib/otp";
import { sendEmail, studentEmailOtpEmail } from "@/services/marketplace/notifications/email.service";

// Kept as a named constant, not scattered magic numbers — see spec §71's
// "avoid scattering business constants" rule.
export const STUDENT_EMAIL_DOMAIN = "@stu.cu.edu.ng";
const RESEND_COOLDOWN_MS = 60 * 1000;

const LOCAL_PART_PATTERN = /^[a-zA-Z0-9._-]{2,64}$/;

export async function requestStudentEmailOtp(userId: string, localPartInput: string | undefined) {
  const localPart = localPartInput?.trim().toLowerCase();
  if (!localPart || !LOCAL_PART_PATTERN.test(localPart)) {
    throw badRequest("Enter the part of your student email before \"@stu.cu.edu.ng\" (letters, numbers, dots, dashes, underscores only).");
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { studentEmailOtpLastSentAt: true } });
  if (user?.studentEmailOtpLastSentAt && Date.now() - user.studentEmailOtpLastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    throw tooManyRequests("Please wait a moment before requesting another code.");
  }

  const otp = generateOtp();
  const expiry = buildOtpExpiry();
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      studentEmailLocalPart: localPart,
      // A new local-part request invalidates any prior verification —
      // the applicant must re-prove ownership of whichever mailbox is
      // currently entered, not one they verified earlier.
      studentEmailVerifiedAt: null,
      studentEmailOtp: otp,
      studentEmailOtpExpiry: expiry,
      studentEmailOtpAttempts: 0,
      studentEmailOtpLastSentAt: now,
    },
  });

  const studentEmail = `${localPart}${STUDENT_EMAIL_DOMAIN}`;
  await sendEmail({ to: studentEmail, ...studentEmailOtpEmail({ otp, expiresAt: expiry.toLocaleString() }) });

  return { studentEmail, expiresAt: expiry.toISOString() };
}
