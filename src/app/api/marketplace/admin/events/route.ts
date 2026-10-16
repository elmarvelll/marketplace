// src/app/api/marketplace/admin/events/route.ts
//
// GET ?orderId=&page=&pageSize= -> cross-order event feed, most recent
// first. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listEvents } from "./route.controller";

export async function GET(request: NextRequest) {
  return listEvents(request);
}
