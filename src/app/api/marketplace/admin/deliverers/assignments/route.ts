// src/app/api/marketplace/admin/deliverers/assignments/route.ts
//
// GET -> every approved deliverer with their pending pickup handoffs
// (including the still-valid pickupOtp) and active delivery items. Thin
// route — see ./route.controller.ts.

import { listDelivererAssignments } from "./route.controller";

export async function GET() {
  return listDelivererAssignments();
}
