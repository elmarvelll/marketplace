// src/app/api/marketplace/settings/route.controller.ts
//
// Controller for GET /api/marketplace/settings. See
// services/marketplace/admin/shared/marketplace-settings.ts.

import { NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { getMarketplaceSettings } from "@/services/marketplace/admin/shared/marketplace-settings";

export async function getSettings(): Promise<NextResponse> {
  return runController(async () => {
    await requireSession();
    const settings = await getMarketplaceSettings();
    return NextResponse.json(settings);
  });
}
