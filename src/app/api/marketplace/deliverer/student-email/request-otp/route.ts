// .../deliverer/student-email/request-otp/route.ts
//
// POST -> sends a student-email OTP. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { requestOtp } from "./route.controller";

export async function POST(request: NextRequest) {
  return requestOtp(request);
}
