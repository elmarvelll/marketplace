// services/marketplace/deliverer/get-deliverer-state.ts
//
// Resolves a user's deliverer application state, driving the footer link
// (not_applied/pending/approved/rejected/suspended). Deliberately reads
// the Deliverer relation rather than a duplicated status column on User —
// see prisma/schema.prisma's comment on User.deliverer. Called by
// src/app/api/marketplace/deliverer/status/route.controller.ts.

import { prisma } from "@/lib/prisma";
import type { DelivererStatus } from "@prisma/client";

export type DelivererFooterState =
  | { kind: "not_applied" }
  | { kind: "pending" }
  | { kind: "approved"; delivererId: string }
  | { kind: "rejected" }
  | { kind: "suspended" };

export async function getDelivererState(userId: string): Promise<DelivererFooterState> {
  const deliverer = await prisma.deliverer.findUnique({ where: { userId }, select: { id: true, status: true } });
  if (!deliverer) return { kind: "not_applied" };
  return mapStatus(deliverer.status, deliverer.id);
}

function mapStatus(status: DelivererStatus, delivererId: string): DelivererFooterState {
  switch (status) {
    case "PENDING":
      return { kind: "pending" };
    case "APPROVED":
      return { kind: "approved", delivererId };
    case "REJECTED":
      return { kind: "rejected" };
    case "SUSPENDED":
      return { kind: "suspended" };
  }
}
