// src/app/api/marketplace/businesses/[id]/route.ts
//
// GET   -> one business's profile + stats.
// PATCH -> edits the business's profile fields, including delivery days.
//
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getBusiness, updateBusiness } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getBusiness(id);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return updateBusiness(id, request);
}
