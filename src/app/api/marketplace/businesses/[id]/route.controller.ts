// src/app/api/marketplace/businesses/[id]/route.controller.ts
//
// Controller for GET/PATCH /api/marketplace/businesses/[id]. See
// services/marketplace/business/{get-business-detail,update-business}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { getBusinessDetail } from "@/services/marketplace/business/get-business-detail";
import { updateBusiness as updateBusinessAction } from "@/services/marketplace/business/update-business";
import type { BusinessFormValues } from "@/types/business";

export async function getBusiness(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const business = await getBusinessDetail(businessId, userId);
    return NextResponse.json({ business });
  });
}

export async function updateBusiness(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<Partial<BusinessFormValues>>(request);
    const business = await updateBusinessAction(businessId, userId, body);
    return NextResponse.json({ message: "Business updated.", business });
  });
}
