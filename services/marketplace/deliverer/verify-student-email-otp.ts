// services/marketplace/deliverer/verify-student-email-otp.ts
//
// Step 2 of the deliverer application's student-email verification — see
// request-student-email-otp.ts. Reuses src/lib/otp.ts's pure verifyOtp
// logic unchanged (single-use, brute-force-limited, expiry-checked).
// Verifying proves mailbox access ONLY — it is not proof of university
// enrollment and is deliberately independent of Deliverer.status (admin
// approval is a separate, later gate — spec §36). Called by
// src/app/api/marketplace/deliverer/student-email/verify-otp/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/service-error";
import { verifyOtp } from "@/lib/otp";

export async function verifyStudentEmailOtp(userId: string, suppliedCode: string | undefined) {
  const code = suppliedCode?.trim();
  if (!code) throw badRequest("Enter the code sent to your student email.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { studentEmailOtp: true, studentEmailOtpExpiry: true, studentEmailOtpAttempts: true, studentEmailLocalPart: true },
  });
  if (!user?.studentEmailLocalPart) throw badRequest("Request a code first.");

  const result = verifyOtp({
    suppliedCode: code,
    storedCode: user.studentEmailOtp,
    storedExpiry: user.studentEmailOtpExpiry,
    attempts: user.studentEmailOtpAttempts,
  });

  if (!result.ok) {
    await prisma.user.update({ where: { id: userId }, data: { studentEmailOtpAttempts: { increment: 1 } } });
    const messages: Record<typeof result.reason, string> = {
      no_otp_issued: "Request a code first.",
      expired: "This code has expired — request a new one.",
      too_many_attempts: "Too many incorrect attempts — request a new code.",
      mismatch: "That code isn't correct.",
    };
    throw badRequest(messages[result.reason]);
  }

  // Single-use: clear the OTP itself once verified, same convention as
  // every other OTP flow in this codebase (see docs/marketplace/security/otp-security.md).
  await prisma.user.update({
    where: { id: userId },
    data: { studentEmailVerifiedAt: new Date(), studentEmailOtp: null, studentEmailOtpExpiry: null, studentEmailOtpAttempts: 0 },
  });

  return { verified: true };
}
