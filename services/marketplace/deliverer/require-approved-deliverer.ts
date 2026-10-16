// services/marketplace/deliverer/require-approved-deliverer.ts
//
// Throws-if-not-approved guard for every deliverer-only action — mirrors
// services/marketplace/business/business-ownership.service.ts's
// throw-on-failure convention. Used by every deliverer-domain controller
// (deliverer/shared/require-deliverer.ts wraps this with the session
// lookup those controllers need).

import { prisma } from "@/lib/prisma";
import { unauthorized, forbidden } from "@/lib/service-error";

export async function requireApprovedDeliverer(userId: string | undefined): Promise<string> {
  if (!userId) throw unauthorized();

  const deliverer = await prisma.deliverer.findUnique({ where: { userId }, select: { id: true, status: true } });
  if (!deliverer || deliverer.status !== "APPROVED") {
    throw forbidden("Deliverer access required.");
  }
  return deliverer.id;
}
