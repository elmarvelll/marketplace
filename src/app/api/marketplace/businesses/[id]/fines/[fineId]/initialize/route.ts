// .../fines/[fineId]/initialize/route.ts
//
// POST -> starts a Paystack payment for one outstanding late-delivery
// fine. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { initializeFinePayment } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; fineId: string }> }) {
  const { id, fineId } = await params;
  return initializeFinePayment(id, fineId);
}
