// src/app/api/marketplace/businesses/featured/route.ts
//
// GET -> "Top Businesses" for the marketplace homepage. Thin route — see
// ./route.controller.ts.

import { getFeaturedBusinesses } from "./route.controller";

export async function GET() {
  return getFeaturedBusinesses();
}
