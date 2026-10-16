// src/app/api/marketplace/businesses/route.controller.ts
//
// Controller for GET/POST /api/marketplace/businesses. See
// services/marketplace/business/{list-user-businesses,create-business}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { listUserBusinesses } from "@/services/marketplace/business/list-user-businesses";
import { createBusiness as createBusinessAction } from "@/services/marketplace/business/create-business";
import type { BusinessFormValues } from "@/types/business";

export async function listBusinesses(): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const businesses = await listUserBusinesses(userId);
    return NextResponse.json({ businesses });
  });
}

export async function createBusiness(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<Partial<BusinessFormValues>>(request);
    const business = await createBusinessAction(userId, body);
    return NextResponse.json({ message: "Business created successfully.", business }, { status: 201 });
  });
}
