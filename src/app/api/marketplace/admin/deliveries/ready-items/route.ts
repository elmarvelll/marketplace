// .../admin/deliveries/ready-items/route.ts
//
// GET -> order items dropped off and waiting for delivery-coordinator
// assignment. Thin route — see ./route.controller.ts.

import { listReadyItems } from "./route.controller";

export async function GET() {
  return listReadyItems();
}
