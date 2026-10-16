// src/app/api/marketplace/orders/route.ts
//
// GET -> the signed-in buyer's own orders. Thin route — see
// ./route.controller.ts.

import { listOrders } from "./route.controller";

export async function GET() {
  return listOrders();
}
