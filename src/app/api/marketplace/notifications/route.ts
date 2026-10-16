// src/app/api/marketplace/notifications/route.ts
//
// GET -> the signed-in user's recent MARKETPLACE-scope notifications +
// unread count, to hydrate NotificationProvider on load (the SSE stream
// only carries NEW events from the moment it connects). Thin route — see
// ./route.controller.ts.

import { listMarketplaceNotifications } from "./route.controller";

export async function GET() {
  return listMarketplaceNotifications();
}
