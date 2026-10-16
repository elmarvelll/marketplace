// .../vendor/[id]/route.ts
//
// GET -> public vendor storefront. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getStorefront } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getStorefront(id);
}
