// .../admin/vendor-delivery/roster/[assignmentId]/route.controller.ts
//
// Controller for DELETE .../roster/[assignmentId] — cancels a roster
// assignment. See services/marketplace/admin/roster/manage-roster.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { cancelRosterAssignment } from "@/services/marketplace/admin/roster/manage-roster";

export async function deleteAssignment(assignmentId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    await cancelRosterAssignment(assignmentId, admin.user.id);
    return NextResponse.json({ message: "Roster assignment cancelled." });
  });
}
