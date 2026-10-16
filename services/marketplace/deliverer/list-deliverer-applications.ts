// services/marketplace/deliverer/list-deliverer-applications.ts
//
// Every deliverer application, for the admin approval queue. Called by
// src/app/api/marketplace/admin/deliverers/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function listDelivererApplications() {
  return prisma.deliverer.findMany({
    orderBy: { appliedAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      hall: true,
      room: true,
      preferredAvailability: true,
      status: true,
      appliedAt: true,
      approvedAt: true,
      rejectedAt: true,
      rejectionReason: true,
      suspendedAt: true,
    },
  });
}
