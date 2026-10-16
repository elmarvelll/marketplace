// src/app/api/marketplace/checkout/summary/route.ts
//
// GET -> the checkout page's order preview. Thin route — see
// ./route.controller.ts.

import { getSummary } from "./route.controller";

export async function GET() {
  return getSummary();
}
