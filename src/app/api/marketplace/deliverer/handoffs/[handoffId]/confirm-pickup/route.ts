// .../deliverer/handoffs/[handoffId]/confirm-pickup/route.ts
//
// POST { otp } -> the seller<->deliverer OTP handoff. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { confirmPickup } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ handoffId: string }> }) {
  const { handoffId } = await params;
  return confirmPickup(handoffId, request);
}
