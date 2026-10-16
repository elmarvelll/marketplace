// src/app/api/marketplace/businesses/featured/route.controller.ts
//
// Controller for GET /api/marketplace/businesses/featured. See
// services/marketplace/business/get-featured-businesses.ts.

import { NextResponse } from "next/server";
import { runController, requireSessionUserId } from "@/lib/controller-helpers";
import { getFeaturedBusinesses as getFeaturedBusinessesAction } from "@/services/marketplace/business/get-featured-businesses";

export async function getFeaturedBusinesses(): Promise<NextResponse> {
  return runController(async () => {
    await requireSessionUserId();
    const businesses = await getFeaturedBusinessesAction();
    return NextResponse.json({ businesses });
  });
}
