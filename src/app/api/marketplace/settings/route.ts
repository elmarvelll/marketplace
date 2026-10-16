// src/app/api/marketplace/settings/route.ts
//
// GET -> the current MarketplaceSettings DTO (drop-off/handoff windows +
// drop-off location). Session-required only, not admin-gated — this is
// operational info a seller or deliverer needs to see, not an admin
// secret. Thin route — see ./route.controller.ts.

import { getSettings } from "./route.controller";

export async function GET() {
  return getSettings();
}
