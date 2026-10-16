// .../fines/[fineId]/verify/route.ts
//
// POST { reference } -> client-triggered confirmation for a fine payment.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { verifyFinePayment } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; fineId: string }> }) {
  const { id } = await params;
  return verifyFinePayment(id, request);
}
