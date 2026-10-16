// src/app/api/marketplace/vendor/popular-items/route.ts
//
// GET ?limit= -> "Popular Vendor Items" for the homepage/Explore page.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listPopularVendorItems } from "./route.controller";

export async function GET(request: NextRequest) {
  return listPopularVendorItems(request);
}
