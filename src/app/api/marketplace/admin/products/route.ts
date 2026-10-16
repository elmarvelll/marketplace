// src/app/api/marketplace/admin/products/route.ts
//
// GET ?q=&businessId=&page=&pageSize= -> every product on the
// marketplace, paginated at the business level and grouped by business.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listProducts } from "./route.controller";

export async function GET(request: NextRequest) {
  return listProducts(request);
}
