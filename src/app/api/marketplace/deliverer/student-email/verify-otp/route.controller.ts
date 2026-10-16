// .../deliverer/student-email/verify-otp/route.controller.ts
//
// Controller for POST .../student-email/verify-otp. See
// services/marketplace/deliverer/verify-student-email-otp.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { verifyStudentEmailOtp } from "@/services/marketplace/deliverer/verify-student-email-otp";

export async function verifyOtpHandler(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ code?: string }>(request);
    const result = await verifyStudentEmailOtp(userId, body.code);
    return NextResponse.json(result);
  });
}
