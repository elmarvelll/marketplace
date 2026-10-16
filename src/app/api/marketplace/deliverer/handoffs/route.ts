// src/app/api/marketplace/deliverer/handoffs/route.ts
//
// GET -> the signed-in deliverer's pending pickup handoffs. Thin route —
// see ./route.controller.ts.

import { listHandoffs } from "./route.controller";

export async function GET() {
  return listHandoffs();
}
