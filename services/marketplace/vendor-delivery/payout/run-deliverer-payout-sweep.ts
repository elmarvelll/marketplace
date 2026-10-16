// services/marketplace/vendor-delivery/payout/run-deliverer-payout-sweep.ts
//
// Direct structural mirror of
// services/marketplace/payout/run-payout-sweep.ts — processes every
// deliverer handoff eligible for payout, plus a bounded retry pass for
// previously failed ones. Called by
// src/app/api/cron/vendor-dispute-window-sweep/route.ts, after the
// dispute-window sweep has had a chance to release newly-eligible
// handoffs in the same run.

import { prisma } from "@/lib/prisma";
import { processDelivererPayout } from "./process-deliverer-payout";

const MAX_PAYOUT_ATTEMPTS = 5;

export async function runDelivererPayoutSweep(): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const pendingHandoffs = await prisma.delivery_x_businesses.findMany({
    where: { delivererPayoutStatus: "PAYOUT_PENDING" },
    select: { id: true },
  });

  const retryableFailed = await prisma.delivery_x_businesses.findMany({
    where: { delivererPayoutStatus: "PAYOUT_FAILED", delivererPayoutAttempts: { lt: MAX_PAYOUT_ATTEMPTS } },
    select: { id: true },
  });

  if (retryableFailed.length > 0) {
    await prisma.delivery_x_businesses.updateMany({
      where: { id: { in: retryableFailed.map((h) => h.id) } },
      data: { delivererPayoutStatus: "PAYOUT_PENDING" },
    });
  }

  const allHandoffIds = [...pendingHandoffs.map((h) => h.id), ...retryableFailed.map((h) => h.id)];

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const handoffId of allHandoffIds) {
    const result = await processDelivererPayout(handoffId);
    if (result === "success") succeeded++;
    else if (result === "failed") failed++;
    else skipped++;
  }

  return { processed: allHandoffIds.length, succeeded, failed, skipped };
}
