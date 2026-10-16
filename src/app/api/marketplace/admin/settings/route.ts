// src/app/api/marketplace/admin/settings/route.ts
//
// GET -> current MarketplaceSettings DTO (admin view — same data as
// /api/marketplace/settings, but admin-gated). PUT -> update the
// drop-off/handoff windows and/or the drop-off location. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { getAdminSettings, updateAdminSettings } from "./route.controller";

export async function GET() {
  return getAdminSettings();
}

export async function PUT(request: NextRequest) {
  return updateAdminSettings(request);
}
