// src/app/api/marketplace/admin/delivery-roster/date/route.ts
//
// GET ?operation=&date=YYYY-MM-DD -> one date resolved with its exceptions and booked deliveries.

import { NextRequest } from "next/server";
import { getDate } from "../route.controller";

export async function GET(request: NextRequest) {
  return getDate(request);
}
