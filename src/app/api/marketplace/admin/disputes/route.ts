// src/app/api/marketplace/admin/disputes/route.ts
//
// GET ?resolved=&page=&pageSize= -> disputed orders with full history.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listDisputes } from "./route.controller";

export async function GET(request: NextRequest) {
  return listDisputes(request);
}
