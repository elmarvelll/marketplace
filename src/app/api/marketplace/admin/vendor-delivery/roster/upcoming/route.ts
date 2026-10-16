// .../admin/vendor-delivery/roster/upcoming/route.ts
//
// GET -> which upcoming delivery dates/slots still need deliverer
// assignments (spec §16). Thin route — see ./route.controller.ts.

import { getUpcomingRosterNeeds } from "./route.controller";

export async function GET() {
  return getUpcomingRosterNeeds();
}
