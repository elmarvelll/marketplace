// src/app/api/marketplace/admin/overview/route.ts
//
// GET -> Admin Dashboard overview stats. Thin route — see
// ./route.controller.ts.

import { getOverview } from "./route.controller";

export async function GET() {
  return getOverview();
}
