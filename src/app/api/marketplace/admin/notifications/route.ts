// src/app/api/marketplace/admin/notifications/route.ts
//
// GET -> the signed-in admin's recent ADMIN-scope notifications + unread
// count. Thin route — see ./route.controller.ts.

import { listAdminNotifications } from "./route.controller";

export async function GET() {
  return listAdminNotifications();
}
