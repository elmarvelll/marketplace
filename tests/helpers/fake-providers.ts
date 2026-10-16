// tests/helpers/fake-providers.ts
//
// Replaces global fetch with in-memory fakes of the two external providers
// the Marketplace talks to. Any other outbound URL throws, so a test can't
// silently reach the network.
//
//   paystack.set(reference, { status: "success", amount: 150000 })   // kobo
//   paystack.fail("timeout" | "http500" | "html" | "garbage")        // next verify calls
//   resend.sent / resend.failNext(n)

type PaystackTxn = { status: string; amount: number; currency?: string; reference?: string };
type FailureMode = "timeout" | "http500" | "html" | "garbage" | null;

export const paystack = {
  transactions: new Map<string, PaystackTxn>(),
  verifyCalls: [] as string[],
  failure: null as FailureMode,
  set(reference: string, txn: PaystackTxn) {
    this.transactions.set(reference, txn);
  },
  fail(mode: FailureMode) {
    this.failure = mode;
  },
  reset() {
    this.transactions.clear();
    this.verifyCalls = [];
    this.failure = null;
  },
};

export const resend = {
  sent: [] as { to: string; subject: string; html: string }[],
  failures: 0,
  failNext(count: number) {
    this.failures = count;
  },
  reset() {
    this.sent = [];
    this.failures = 0;
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function installFakeProviders() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith("https://api.paystack.co/transaction/verify/")) {
      const reference = decodeURIComponent(url.split("/verify/")[1]);
      paystack.verifyCalls.push(reference);
      if (paystack.failure === "timeout") {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      }
      if (paystack.failure === "http500") return json({ status: false, message: "Internal error" }, 500);
      if (paystack.failure === "html") return new Response("<html>502 Bad Gateway</html>", { status: 502 });
      if (paystack.failure === "garbage") return json({ status: true, data: { unexpected: true } });
      const txn = paystack.transactions.get(reference);
      if (!txn) return json({ status: false, message: "Transaction reference not found" }, 400);
      return json({ status: true, data: { status: txn.status, amount: txn.amount, currency: txn.currency ?? "NGN", reference: txn.reference ?? reference, paid_at: null } });
    }

    if (url.startsWith("https://api.resend.com/emails")) {
      if (resend.failures > 0) {
        resend.failures -= 1;
        return json({ name: "application_error", message: "Simulated provider outage", statusCode: 500 }, 500);
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      resend.sent.push({ to: Array.isArray(body.to) ? body.to[0] : body.to, subject: body.subject, html: body.html });
      return json({ id: `email_${resend.sent.length}` });
    }

    throw new Error(`Unexpected outbound request in tests: ${url}`);
  }) as typeof fetch;
}
