// .../admin/vendor-delivery/bookings/route.ts
//
// GET -> paginated/filterable vendor booking list. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { listBookings } from "./route.controller";

export async function GET(request: NextRequest) {
  return listBookings(request);
}
