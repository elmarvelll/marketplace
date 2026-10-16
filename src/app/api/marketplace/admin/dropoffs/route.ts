// src/app/api/marketplace/admin/dropoffs/route.ts
//
// GET -> orders whose seller has requested the Seller -> Coordinator
// handoff and is waiting for the coordinator to verify their OTP. Thin
// route — see ./route.controller.ts.

import { listPendingDropoffs } from "./route.controller";

export async function GET() {
  return listPendingDropoffs();
}
