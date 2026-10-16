// src/app/api/marketplace/admin/businesses/route.ts
//
// GET ?q=&filter=&page=&pageSize= -> paginated/searchable/filterable
// business list. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listBusinesses } from "./route.controller";

export async function GET(request: NextRequest) {
  return listBusinesses(request);
}
