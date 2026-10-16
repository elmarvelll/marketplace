// .../admin/vendor-delivery/roster/route.ts
//
// GET  -> the roster for a given date.
// POST -> assigns a deliverer to a slot/date.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getRoster, postRosterAssignment } from "./route.controller";

export async function GET(request: NextRequest) {
  return getRoster(request);
}

export async function POST(request: NextRequest) {
  return postRosterAssignment(request);
}
