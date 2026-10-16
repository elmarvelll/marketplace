// src/app/api/marketplace/businesses/[id]/fines/route.controller.ts
//
// Controller for GET .../businesses/[id]/fines. See
// services/marketplace/fines/list-business-fines.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { listBusinessFines } from "@/services/marketplace/fines/list-business-fines";

export async function listFines(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusiness(businessId);
    const result = await listBusinessFines(owned.businessId);
    return NextResponse.json(result);
  });
}
