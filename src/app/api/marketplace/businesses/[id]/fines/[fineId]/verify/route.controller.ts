// .../fines/[fineId]/verify/route.controller.ts
//
// Controller for POST .../fines/[fineId]/verify. See
// services/marketplace/fines/verify-fine-payment.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest, notFound, paymentRequired, conflict } from "@/lib/service-error";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { verifyFinePaymentByReference } from "@/services/marketplace/fines/verify-fine-payment";

export async function verifyFinePayment(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireOwnedBusiness(businessId);
    const body = await readJsonBody<{ reference?: string }>(request);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    if (!reference) throw badRequest("reference is required.");

    // Scoped to this business: a seller can only verify their own fine.
    const result = await verifyFinePaymentByReference(reference, businessId);
    switch (result.state) {
      case "paid":
        return NextResponse.json({ status: "success", confirmedFineId: result.confirmedFineId });
      case "no_such_fine":
        throw notFound("Fine payment not found.");
      case "not_paid":
        throw paymentRequired(`Payment ${result.providerStatus}.`);
      case "mismatch":
        throw conflict("The amount paid doesn't match this fine. Please contact support.");
      case "unknown":
        return NextResponse.json(
          { status: "unknown", retryable: true, error: "We couldn't reach the payment provider. Please try again in a moment." },
          { status: 503, headers: { "Retry-After": "5" } }
        );
    }
  });
}
