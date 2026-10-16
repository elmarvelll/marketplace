// services/marketplace/deliverer/approve-deliverer.ts
//
// Admin approves a pending deliverer application — only after this does
// the user gain Delivery Dashboard access. Called by
// src/app/api/marketplace/admin/deliverers/[delivererId]/approve/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { sendEmail, delivererApplicationApprovedEmail } from "@/services/marketplace/notifications/email.service";

export async function approveDeliverer(delivererId: string, adminUserId: string) {
  const deliverer = await prisma.deliverer.findUnique({ where: { id: delivererId } });
  if (!deliverer) throw notFound("Application not found.");
  if (deliverer.status === "APPROVED") throw conflict("Already approved.");

  await prisma.deliverer.update({
    where: { id: delivererId },
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: adminUserId, rejectedAt: null, rejectionReason: null },
  });

  void sendEmail({ to: deliverer.email, ...delivererApplicationApprovedEmail({ firstName: deliverer.firstName }) });
}
