// services/marketplace/deliverer/suspend-deliverer.ts
//
// Admin suspends a previously-approved deliverer, immediately revoking
// Delivery Dashboard access. Called by
// src/app/api/marketplace/admin/deliverers/[delivererId]/suspend/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";

export async function suspendDeliverer(delivererId: string, reason: string) {
  if (!reason.trim()) throw badRequest("A reason is required.");

  const deliverer = await prisma.deliverer.findUnique({ where: { id: delivererId } });
  if (!deliverer) throw notFound("Deliverer not found.");
  if (deliverer.status !== "APPROVED") throw conflict("Only an approved deliverer can be suspended.");

  await prisma.deliverer.update({ where: { id: delivererId }, data: { status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: reason } });
}
