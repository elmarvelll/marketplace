// src/lib/schedule-checkout-background.ts
//
// Schedules services/marketplace/checkout/shared/checkout-background.ts to run
// AFTER the current response has been sent (next/server's after()), so
// delivering queued emails and sweeping expired reservations never slows a
// checkout request down. Lives here, not in services/, because services stay
// free of next/server imports (see src/lib/service-error.ts's header).
//
// If after() isn't available (called outside a request scope — a test or a
// script), the work simply runs detached instead; scheduling must never be
// able to fail the request that triggered it.

import { after } from "next/server";
import { runCheckoutBackgroundWork } from "@/services/marketplace/checkout/shared/checkout-background";

export function scheduleCheckoutBackgroundWork(options: { emailIds?: string[]; sweep?: boolean } = {}): void {
  if (!options.sweep && (options.emailIds?.length ?? 0) === 0) return;
  try {
    after(() => runCheckoutBackgroundWork(options));
  } catch {
    void runCheckoutBackgroundWork(options);
  }
}
