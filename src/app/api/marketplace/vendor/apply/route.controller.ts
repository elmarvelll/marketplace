// src/app/api/marketplace/vendor/apply/route.controller.ts
//
// Controller for POST /api/marketplace/vendor/apply — the footer "Become
// a Vendor" application form. See
// services/marketplace/vendor/create-vendor-application.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { createVendorApplication } from "@/services/marketplace/vendor/create-vendor-application";
import type { VendorApplicationFormValues } from "@/types/vendor";

export async function applyAsVendor(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<Partial<VendorApplicationFormValues>>(request);
    const vendor = await createVendorApplication(userId, body);
    return NextResponse.json({ message: "Vendor application submitted successfully.", vendor }, { status: 201 });
  });
}
