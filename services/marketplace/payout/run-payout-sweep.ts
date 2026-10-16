// services/marketplace/payout/run-payout-sweep.ts
//
// Runs from the seller-payout cron (every 5 hours — see
// docs/marketplace/systems/cron-system.md). Processes every item eligible
// for payout, plus a bounded retry pass for previously failed items.
// Called by src/app/api/cron/seller-payout/route.ts.

import { prisma } from "@/lib/prisma";
import { processItemPayout } from "./process-item-payout";

// A failed payout is only retried a bounded number of times — an item
// stuck failing forever (e.g. permanently bad bank details) should
// surface for manual attention rather than retry indefinitely every 5
// hours.
const MAX_PAYOUT_ATTEMPTS = 5;

export async function runPayoutSweep(): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const pendingItems = await prisma.orderItem.findMany({
    where: { escrowStatus: "PAYOUT_PENDING", payoutStatus: "PAYOUT_PENDING" },
    select: { id: true },
  });

  const retryableFailedItems = await prisma.orderItem.findMany({
    where: { payoutStatus: "PAYOUT_FAILED", payoutAttempts: { lt: MAX_PAYOUT_ATTEMPTS } },
    select: { id: true },
  });

  // Reset retryable failures back to PAYOUT_PENDING first — processItemPayout
  // only ever acts on an item currently PAYOUT_PENDING (its idempotency
  // guard), so a retry has to explicitly re-enter that state rather than
  // being silently reprocessed from PAYOUT_FAILED.
  if (retryableFailedItems.length > 0) {
    await prisma.orderItem.updateMany({
      where: { id: { in: retryableFailedItems.map((i) => i.id) } },
      data: { payoutStatus: "PAYOUT_PENDING", escrowStatus: "PAYOUT_PENDING" },
    });
  }

  const allItemIds = [...pendingItems.map((i) => i.id), ...retryableFailedItems.map((i) => i.id)];

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const orderItemId of allItemIds) {
    const result = await processItemPayout(orderItemId);
    if (result === "success") succeeded++;
    else if (result === "failed") failed++;
    else skipped++;
  }

  return { processed: allItemIds.length, succeeded, failed, skipped };
}
