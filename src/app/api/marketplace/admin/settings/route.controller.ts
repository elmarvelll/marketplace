// src/app/api/marketplace/admin/settings/route.controller.ts
//
// Controller for GET/PUT /api/marketplace/admin/settings. See
// services/marketplace/admin/shared/marketplace-settings.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { getMarketplaceSettings, updateMarketplaceSettings } from "@/services/marketplace/admin/shared/marketplace-settings";

interface UpdateSettingsBody {
  dropoffWindowStart?: string;
  dropoffWindowEnd?: string;
  handoffWindowStart?: string;
  handoffWindowEnd?: string;
  dropoffLocation?: string | null;
  // School Vendor fields — see services/marketplace/admin/shared/marketplace-settings.ts.
  dropoffLocationName?: string | null;
  dropoffLocationInstructions?: string | null;
  dropoffLocationActive?: boolean;
  vendorDeliveryFee?: number;
  vendorServiceFeeAmount?: number;
  delivererPayoutAmount?: number;
}

export async function getAdminSettings(): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const settings = await getMarketplaceSettings();
    return NextResponse.json(settings);
  });
}

export async function updateAdminSettings(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<UpdateSettingsBody>(request);
    const settings = await updateMarketplaceSettings(body, admin.user.id);
    return NextResponse.json(settings);
  });
}
