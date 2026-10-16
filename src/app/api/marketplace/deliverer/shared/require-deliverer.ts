// src/app/api/marketplace/deliverer/shared/require-deliverer.ts
//
// "Get the signed-in, approved deliverer's id, or throw" — used by every
// controller under deliverer/** (handoffs, deliveries actions). Not in
// src/lib/controller-helpers.ts because it's specific to this one
// resource tree, unlike requireSessionUserId which every folder needs.

import { requireSessionUserId } from "@/lib/controller-helpers";
import { requireApprovedDeliverer } from "@/services/marketplace/deliverer/require-approved-deliverer";

export async function requireDelivererId(): Promise<string> {
  const userId = await requireSessionUserId();
  return requireApprovedDeliverer(userId);
}
