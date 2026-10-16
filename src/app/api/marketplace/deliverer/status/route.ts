// src/app/api/marketplace/deliverer/status/route.ts
//
// GET -> the signed-in user's deliverer application state. Thin route —
// see ./route.controller.ts.

import { getStatus } from "./route.controller";

export async function GET() {
  return getStatus();
}
