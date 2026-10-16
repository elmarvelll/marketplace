// .../deliverer/student-email/verify-otp/route.ts
//
// POST -> verifies a student-email OTP. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { verifyOtpHandler } from "./route.controller";

export async function POST(request: NextRequest) {
  return verifyOtpHandler(request);
}
