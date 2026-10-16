// src/app/api/marketplace/admin/reports/route.ts
//
// GET ?status=&page=&pageSize= -> every business report. Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listAllReports } from "./route.controller";

export async function GET(request: NextRequest) {
  return listAllReports(request);
}
