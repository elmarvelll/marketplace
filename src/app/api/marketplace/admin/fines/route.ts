// src/app/api/marketplace/admin/fines/route.ts
//
// GET ?status=&page=&pageSize= -> every late-delivery fine. Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listAllFines } from "./route.controller";

export async function GET(request: NextRequest) {
  return listAllFines(request);
}
