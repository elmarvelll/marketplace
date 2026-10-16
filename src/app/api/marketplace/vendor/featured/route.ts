// src/app/api/marketplace/vendor/featured/route.ts
//
// GET -> "School Vendors" for the homepage/Explore page. Thin route — see
// ./route.controller.ts.

import { listFeaturedVendors } from "./route.controller";

export async function GET() {
  return listFeaturedVendors();
}
