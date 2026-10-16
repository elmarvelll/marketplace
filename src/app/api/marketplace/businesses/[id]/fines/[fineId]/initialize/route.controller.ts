// .../fines/[fineId]/initialize/route.controller.ts
//
// Controller for POST .../fines/[fineId]/initialize. See
// services/marketplace/fines/initialize-fine-payment.ts.

import { NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { runController } from "@/lib/controller-helpers";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { initializeFinePayment as initializeFinePaymentAction } from "@/services/marketplace/fines/initialize-fine-payment";

export async function initializeFinePayment(businessId: string, fineId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    const session = await getActiveSession();
    const result = await initializeFinePaymentAction(owned.businessId, fineId, session?.user?.email ?? undefined);
    return NextResponse.json(result);
  });
}
