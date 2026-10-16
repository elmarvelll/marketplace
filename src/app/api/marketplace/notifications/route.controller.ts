// src/app/api/marketplace/notifications/route.controller.ts
//
// Controller for GET /api/marketplace/notifications. See
// services/marketplace/notifications/notification.service.ts.

import { NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { listNotifications } from "@/services/marketplace/notifications/notification.service";

export async function listMarketplaceNotifications(): Promise<NextResponse> {
  return runController(async () => {
    const session = await requireSession();
    const result = await listNotifications(session.user.id, "MARKETPLACE");
    return NextResponse.json(result);
  });
}
