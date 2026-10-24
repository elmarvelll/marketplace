// tests/helpers/fake-providers.ts
//
// Replaces global fetch with in-memory fakes of the two external providers
// the Marketplace talks to. Any other outbound URL throws, so a test can't
// silently reach the network.
//
//   paystack.set(reference, { status: "success", amount: 150000 })   // kobo
//   paystack.fail("timeout" | "http500" | "html" | "garbage")        // next verify calls
//   paystack.accounts.set("058:0123456789", "ADA OBI")                 // bank/resolve
//   paystack.transfers / paystack.recipients / paystack.transferMode   // payouts
//   resend.sent / resend.failNext(n)

type PaystackTxn = { status: string; amount: number; currency?: string; reference?: string };
type FailureMode = "timeout" | "http500" | "html" | "garbage" | null;

export const paystack = {
  transactions: new Map<string, PaystackTxn>(),
  // Bank accounts Paystack can resolve: `${bankCode}:${accountNumber}` -> account holder name.
  accounts: new Map<string, string>(),
  // Transfers API (payouts): every recipient created and transfer sent, in order.
  recipients: [] as { code: string; name: string; accountNumber: string; bankCode: string }[],
  transfers: [] as { reference: string; amount: number; recipient: string; reason: string }[],
  // What /transfer answers: "success", "pending" (Paystack still settling), or "fail" (HTTP error).
  transferMode: "success" as "success" | "pending" | "fail",
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
    this.accounts.clear();
    this.recipients = [];
    this.transfers = [];
    this.transferMode = "success";
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

    if (url === "https://api.paystack.co/transferrecipient") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const code = `RCP_${paystack.recipients.length + 1}`;
      paystack.recipients.push({ code, name: body.name, accountNumber: body.account_number, bankCode: body.bank_code });
      return json({ status: true, data: { recipient_code: code } });
    }
    if (url === "https://api.paystack.co/transfer") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (paystack.transferMode === "fail") return json({ status: false, message: "Your balance is not enough to fulfil this request" }, 400);
      paystack.transfers.push({ reference: body.reference, amount: body.amount, recipient: body.recipient, reason: body.reason });
      return json({ status: true, data: { transfer_code: `TRF_${paystack.transfers.length}`, status: paystack.transferMode, reference: body.reference } });
    }

    if (url.startsWith("https://api.paystack.co/bank/resolve")) {
      const params = new URL(url).searchParams;
      const name = paystack.accounts.get(`${params.get("bank_code")}:${params.get("account_number")}`);
      if (!name) return json({ status: false, message: "Could not resolve account name" }, 422);
      return json({ status: true, data: { account_number: params.get("account_number"), account_name: name } });
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
