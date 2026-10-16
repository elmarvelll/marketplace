// .../vendor/[id]/schedule/dates/route.ts
//
// PUT { date, available, note? } -> set one date's availability override.
// DELETE ?date=YYYY-MM-DD -> remove it (the date follows the weekly rule
// again). Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { deleteDateOverride, putDateOverride } from "./route.controller";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return putDateOverride(request, id);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteDateOverride(request, id);
}
