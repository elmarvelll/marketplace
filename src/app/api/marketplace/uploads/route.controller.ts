// src/app/api/marketplace/uploads/route.controller.ts
//
// Controller for POST /api/marketplace/uploads. See
// services/marketplace/uploads/upload.service.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { uploadMarketplaceImage } from "@/services/marketplace/uploads/upload.service";

export async function upload(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    // Checked here as well as by the route gate: only this re-reads the account, so a blocked or signed-out-everywhere
    // session is refused (the gate can only see that a token exists).
    await requireSession();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw badRequest("No file provided.");

    const result = await uploadMarketplaceImage(file);
    return NextResponse.json(result, { status: 201 });
  });
}
