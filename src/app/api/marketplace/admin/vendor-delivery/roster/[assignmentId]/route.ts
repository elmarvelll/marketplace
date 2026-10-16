// .../admin/vendor-delivery/roster/[assignmentId]/route.ts
//
// DELETE -> cancels a roster assignment. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { deleteAssignment } from "./route.controller";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return deleteAssignment(assignmentId);
}
