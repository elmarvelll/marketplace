// src/app/api/marketplace/notifications/[id]/read/route.ts
//
// POST -> mark one of the signed-in user's own notifications as read.
// Works for both MARKETPLACE and ADMIN scope notifications — ownership is
// what's checked, not scope. Thin route — see ./route.controller.ts.

import { markNotificationAsRead } from "./route.controller";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return markNotificationAsRead(id);
}
