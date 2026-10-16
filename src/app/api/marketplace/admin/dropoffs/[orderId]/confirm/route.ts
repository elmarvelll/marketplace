// .../admin/dropoffs/[orderId]/confirm/route.ts
//
// POST { otp } -> the delivery coordinator verifies the seller's drop-off
// OTP, completing the Seller -> Coordinator handoff. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { confirmSellerDropoff } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return confirmSellerDropoff(request, orderId);
}
