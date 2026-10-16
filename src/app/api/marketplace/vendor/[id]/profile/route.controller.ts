// .../vendor/[id]/profile/route.controller.ts
//
// Controller for GET/PATCH .../vendor/[id]/profile — the vendor owner's
// OWN profile view/edit, separate from the public storefront
// (GET .../vendor/[id]) and from Business's own profile route. See
// services/marketplace/vendor/{get-vendor-profile,update-vendor-profile}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { getVendorProfile } from "@/services/marketplace/vendor/get-vendor-profile";
import { updateVendorProfile, type VendorProfileUpdateInput } from "@/services/marketplace/vendor/update-vendor-profile";

export async function getProfile(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const vendor = await getVendorProfile(businessId, userId);
    return NextResponse.json({ vendor });
  });
}

export async function patchProfile(request: NextRequest, businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<VendorProfileUpdateInput>(request);
    const vendor = await updateVendorProfile(businessId, userId, body);
    return NextResponse.json({ message: "Profile updated.", vendor });
  });
}
