// src/app/api/marketplace/admin/delivery-roster/route.ts
//
// GET ?operation=MARKETPLACE|VENDOR -> the recurring weekly roster grid.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getWeek } from "./route.controller";

export async function GET(request: NextRequest) {
  return getWeek(request);
}
