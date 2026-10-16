// src/app/api/marketplace/businesses/route.ts
//
// GET  -> the current user's businesses.
// POST -> creates a business from the onboarding form.
//
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listBusinesses, createBusiness } from "./route.controller";

export async function GET() {
  return listBusinesses();
}

export async function POST(request: NextRequest) {
  return createBusiness(request);
}
