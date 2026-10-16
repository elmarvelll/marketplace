// src/app/api/marketplace/admin/deliverers/route.ts
//
// GET -> every deliverer application. Thin route — see
// ./route.controller.ts.

import { listDeliverers } from "./route.controller";

export async function GET() {
  return listDeliverers();
}
