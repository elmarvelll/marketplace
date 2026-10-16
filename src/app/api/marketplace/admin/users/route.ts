// src/app/api/marketplace/admin/users/route.ts
//
// GET ?q=&page=&pageSize= -> paginated/searchable user list. Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listUsers } from "./route.controller";

export async function GET(request: NextRequest) {
  return listUsers(request);
}
