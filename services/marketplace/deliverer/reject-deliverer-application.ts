// services/marketplace/deliverer/reject-deliverer-application.ts
//
// Admin rejects a pending deliverer application. Called by
// src/app/api/marketplace/admin/deliverers/[delivererId]/reject/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest } from "@/lib/service-error";

export async function rejectDelivererApplication(delivererId: string, reason: string) {
  if (!reason.trim()) throw badRequest("A reason is required.");

  const deliverer = await prisma.deliverer.findUnique({ where: { id: delivererId } });
  if (!deliverer) throw notFound("Application not found.");

  await prisma.deliverer.update({ where: { id: delivererId }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason } });
}
