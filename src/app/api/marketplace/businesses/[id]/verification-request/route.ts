// .../businesses/[id]/verification-request/route.ts
//
// POST -> the business owner requests verification. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { submitVerificationRequest } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return submitVerificationRequest(id);
}
