// .../vendor/[id]/schedule/route.ts
//
// GET -> the vendor's delivery schedule (weekly rule, upcoming dates,
// overrides). PUT { weekdays: DayOfWeek[] } -> replace the recurring
// delivery weekdays ([] = every day). Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getSchedule, putWeekdays } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getSchedule(id);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return putWeekdays(request, id);
}
