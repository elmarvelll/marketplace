// src/app/api/marketplace/admin/notifications/route.controller.ts
//
// Controller for GET /api/marketplace/admin/notifications. See
// services/marketplace/notifications/notification.service.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listNotifications } from "@/services/marketplace/notifications/notification.service";

export async function listAdminNotifications(): Promise<NextResponse> {
  return runController(async () => {
    const session = await requireAdmin();
    const result = await listNotifications(session.user.id, "ADMIN");
    return NextResponse.json(result);
  });
}
