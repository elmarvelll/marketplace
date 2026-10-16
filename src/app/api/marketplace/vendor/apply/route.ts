// src/app/api/marketplace/vendor/apply/route.ts
//
// POST -> submits a School Vendor application. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { applyAsVendor } from "./route.controller";

export async function POST(request: NextRequest) {
  return applyAsVendor(request);
}
