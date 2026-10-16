// .../deliverer/roster/route.ts
//
// GET -> the signed-in deliverer's own upcoming roster schedule. Thin
// route — see ./route.controller.ts.

import { getMyRoster } from "./route.controller";

export async function GET() {
  return getMyRoster();
}
