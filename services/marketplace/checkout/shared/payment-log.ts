// services/marketplace/checkout/shared/payment-log.ts
//
// One structured log line per payment lifecycle step, so a production
// incident (e.g. a burst of failed verifies) can be traced by reference in
// the Vercel logs. Never logs keys, card data, or email addresses — only the
// reference, our own ids, statuses, and error classifications.

type PaymentLogLevel = "info" | "warn" | "error";

export function logPayment(level: PaymentLogLevel, event: string, fields: Record<string, string | number | boolean | null | undefined>) {
  const line = JSON.stringify({ scope: "payment", event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
