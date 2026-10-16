// .../vendor-delivery/slots/route.ts
//
// GET -> active delivery slots (public). Thin route — see
// ./route.controller.ts.

import { listActiveSlots } from "./route.controller";

export async function GET() {
  return listActiveSlots();
}
