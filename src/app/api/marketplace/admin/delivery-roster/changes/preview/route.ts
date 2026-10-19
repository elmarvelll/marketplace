// src/app/api/marketplace/admin/delivery-roster/changes/preview/route.ts
//
// POST { operation, change } -> what the change would do to deliveries already booked (writes nothing).

import { NextRequest } from "next/server";
import { previewChange } from "../../route.controller";

export async function POST(request: NextRequest) {
  return previewChange(request);
}
