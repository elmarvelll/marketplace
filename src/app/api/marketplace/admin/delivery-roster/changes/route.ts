// src/app/api/marketplace/admin/delivery-roster/changes/route.ts
//
// POST { operation, change: { kind: "cell" | "exception" | "clear-exception" | "default", ... },
//        planResolution?: "replan" | "keep", acknowledgeOverCapacity?: boolean } -> applies one roster change.
// 409 when the change affects existing deliveries and the required decision is missing (preview first).

import { NextRequest } from "next/server";
import { postChange } from "../route.controller";

export async function POST(request: NextRequest) {
  return postChange(request);
}
