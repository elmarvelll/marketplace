// src/app/api/marketplace/deliverer/deliveries/route.ts
//
// GET -> every DeliveryItem assigned to the signed-in deliverer. Thin
// route — see ./route.controller.ts.

import { listDeliveries } from "./route.controller";

export async function GET() {
  return listDeliveries();
}
