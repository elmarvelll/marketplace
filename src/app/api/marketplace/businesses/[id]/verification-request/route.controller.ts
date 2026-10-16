// .../businesses/[id]/verification-request/route.controller.ts
//
// Controller for POST .../verification-request. See
// services/marketplace/business/request-verification.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { requestVerification } from "@/services/marketplace/business/request-verification";

export async function submitVerificationRequest(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    const result = await requestVerification(owned.businessId, owned.session.user.id);
    return NextResponse.json({ message: "Verification request submitted.", ...result }, { status: 201 });
  });
}
