// src/app/api/marketplace/deliverer/apply/route.ts
//
// POST -> submits a deliverer application. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { apply } from "./route.controller";

export async function POST(request: NextRequest) {
  return apply(request);
}
