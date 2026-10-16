// .../vendor/[id]/profile/route.ts
//
// GET   -> the vendor owner's own profile (including bank/approval
//          detail — never exposed by the public storefront route).
// PATCH -> edits the vendor's own profile.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getProfile, patchProfile } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getProfile(id);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return patchProfile(request, id);
}
