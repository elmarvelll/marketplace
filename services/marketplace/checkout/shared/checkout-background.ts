// services/marketplace/checkout/shared/checkout-background.ts
//
// Work run once a checkout response has been sent (scheduled by
// src/lib/schedule-checkout-background.ts, which owns the next/server
// dependency so this service stays framework-agnostic): deliver the owner emails a finalize just queued, then do a small
// slice of the two sweeps (expired reservations, failed emails). This is what
// keeps reservations and the email outbox self-healing without a frequent
// cron — the project's vercel.json only carries daily jobs. The dedicated
// cron routes (/api/cron/checkout-reconcile, /api/cron/email-retry) do the
// same work on a schedule where one is available.
//
// Never throws — it runs after the response and has nobody to report to.

import { deliverEmails, runEmailRetrySweep } from "@/services/marketplace/notifications/email-outbox";
import { runCheckoutReconcileSweep } from "@/services/marketplace/checkout/run-checkout-reconcile-sweep";

export async function runCheckoutBackgroundWork({ emailIds = [], sweep = false }: { emailIds?: string[]; sweep?: boolean } = {}): Promise<void> {
  try {
    await deliverEmails(emailIds);
    if (sweep) {
      const reconciled = await runCheckoutReconcileSweep({ limit: 5 });
      await deliverEmails(reconciled.emailIds);
      await runEmailRetrySweep({ limit: 5 });
    }
  } catch (err) {
    console.error("[checkout] background work failed", err);
  }
}
