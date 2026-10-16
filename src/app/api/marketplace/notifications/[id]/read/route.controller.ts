// src/app/api/marketplace/notifications/[id]/read/route.controller.ts
//
// Controller for POST .../notifications/[id]/read. See
// services/marketplace/notifications/notification.service.ts.

import { NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { markNotificationRead } from "@/services/marketplace/notifications/notification.service";

export async function markNotificationAsRead(notificationId: string): Promise<NextResponse> {
  return runController(async () => {
    const session = await requireSession();
    await markNotificationRead(session.user.id, notificationId);
    return NextResponse.json({ message: "Marked as read." });
  });
}
