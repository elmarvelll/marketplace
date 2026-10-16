// .../deliverer/student-email/request-otp/route.controller.ts
//
// Controller for POST .../student-email/request-otp. See
// services/marketplace/deliverer/request-student-email-otp.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { requestStudentEmailOtp } from "@/services/marketplace/deliverer/request-student-email-otp";

export async function requestOtp(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ localPart?: string }>(request);
    const result = await requestStudentEmailOtp(userId, body.localPart);
    return NextResponse.json({ message: "Verification code sent.", ...result });
  });
}
