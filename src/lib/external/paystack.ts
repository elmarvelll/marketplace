// src/lib/external/paystack.ts
//
// Server-only Paystack integration: the bank list for the business
// onboarding form's bank dropdown, account-number → account-holder-name
// resolution, and checkout payment verification. Used by
// src/app/api/marketplace/paystack/{banks,resolve-account}/route.ts and
// services/marketplace/checkout/{get-checkout-summary,create-orders-for-checkout,confirm-payment-by-reference}.ts (checkout initialize/verify + the
// /api/webhooks/paystack route).
//
// Never import this from a client component — the secret keys below must
// stay server-side; only NEXT_PUBLIC_PAYSTACK_KEY (the publishable key,
// used by the checkout page to open the Paystack popup) is safe in the
// browser, and nothing here needs it.

const PAYSTACK_BASE_URL = "https://api.paystack.co";
// Outbound calls are bounded so a slow Paystack can never hold a serverless
// function (and the user's request) open until the platform kills it.
const DEFAULT_TIMEOUT_MS = 10_000;

// Test vs live is ONE explicit setting (PAYSTACK_MODE, default "test") that
// selects BOTH the secret key used here and the publishable key the browser
// opens the popup with (returned by checkout initialize). They can never
// disagree again: before this, production verified with the live secret
// while the browser always used the test publishable key, so Paystack
// answered "Transaction reference not found" and checkout/verify returned
// 502 (see docs/AKADVERSE_IMPLEMENTATION_CHANGELOG.md, section B.2). The
// webhook signature (HMAC with this same secret) follows the same mode.
export type PaystackMode = "test" | "live";

export function getPaystackMode(): PaystackMode {
  return process.env.PAYSTACK_MODE?.trim().toLowerCase() === "live" ? "live" : "test";
}

export function getPaystackSecretKey(): string {
  const key = getPaystackMode() === "live" ? process.env.PAYSTACK_SECRET_KEY : process.env.PAYSTACK_TEST_SECRET_KEY;
  if (!key) {
    throw new PaystackConfigError(`Paystack ${getPaystackMode()} secret key is not configured.`);
  }
  return key;
}

// The publishable key matching getPaystackSecretKey()'s mode — safe to send
// to the browser (it's a NEXT_PUBLIC_ value), and sent from the server so the
// client never has to guess which mode the server verifies in.
export function getPaystackPublicKey(): string | null {
  const key = getPaystackMode() === "live" ? process.env.NEXT_PUBLIC_PAYSTACK_LIVE_KEY : process.env.NEXT_PUBLIC_PAYSTACK_KEY;
  return key?.trim() || null;
}

export class PaystackConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaystackConfigError";
  }
}

// A Paystack call whose outcome is unknown or unusable — the caller must not
// treat it as either success or a definitive failure. `kind` is safe to log.
export type PaystackErrorKind = "timeout" | "network" | "http" | "malformed" | "rejected";

export class PaystackError extends Error {
  kind: PaystackErrorKind;
  httpStatus: number | null;
  constructor(kind: PaystackErrorKind, message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "PaystackError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

async function paystackFetch<T>(
  path: string,
  {
    cacheSeconds = 0,
    method = "GET",
    body: requestBody,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { cacheSeconds?: number; method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
        ...(requestBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
      // Payment verification/transfers must never be cached; bank
      // codes/names barely ever change, so listBanks() opts into a day of
      // caching below.
      ...(cacheSeconds > 0 ? { next: { revalidate: cacheSeconds } } : { cache: "no-store" as const }),
    });
  } catch (err) {
    if (err instanceof PaystackConfigError) throw err;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new PaystackError(timedOut ? "timeout" : "network", timedOut ? "Paystack did not respond in time." : "Couldn't reach Paystack.");
  }

  // A gateway/HTML error page (e.g. a 502/503 from Paystack's edge) is not
  // JSON — reading it with res.json() used to throw an unclassified error.
  let body: { status?: boolean; message?: string; data?: unknown };
  try {
    body = await res.json();
  } catch {
    throw new PaystackError(res.ok ? "malformed" : "http", `Paystack returned an unreadable response (${res.status}).`, res.status);
  }

  if (!res.ok || body.status === false) {
    // 4xx with a body = Paystack understood and refused (bad reference, bad
    // account number, …); 5xx = Paystack-side trouble, outcome unknown.
    throw new PaystackError(res.status >= 500 ? "http" : "rejected", body.message || `Paystack request failed (${res.status}).`, res.status);
  }

  return body.data as T;
}

export interface PaystackBank {
  name: string;
  code: string;
}

export async function listBanks(): Promise<PaystackBank[]> {
  const banks = await paystackFetch<Array<{ name: string; code: string }>>("/bank?currency=NGN", { cacheSeconds: 60 * 60 * 24 });
  return banks.map(({ name, code }) => ({ name, code }));
}

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
}

export async function resolveAccountNumber(accountNumber: string, bankCode: string): Promise<ResolvedAccount> {
  const data = await paystackFetch<{ account_number: string; account_name: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`
  );

  return { accountNumber: data.account_number, accountName: data.account_name };
}

// What a Paystack verify call can definitively tell us about a reference.
//   success    — paid; still check amount/currency/reference before trusting it.
//   failed     — the charge was declined/failed, or later reversed.
//   abandoned  — a transaction exists but was never completed (popup closed).
//   pending    — still in progress (e.g. bank transfer/USSD not settled yet).
//   not_found  — Paystack has no transaction with this reference at all
//                (popup never got far enough to create one, or a key/mode mismatch).
// Anything Paystack can't answer (timeout, 5xx, garbage body) is thrown as a
// PaystackError instead — the outcome is UNKNOWN and nothing may be finalized
// or released on it.
export type VerifyOutcome = "success" | "failed" | "abandoned" | "pending" | "not_found";

export interface VerifiedTransaction {
  outcome: VerifyOutcome;
  // Paystack's own status string, kept for logging/reconciliation.
  status: string;
  reference: string;
  amountKobo: number;
  currency: string;
  paidAt: string | null;
}

const OUTCOME_BY_STATUS: Record<string, VerifyOutcome> = {
  success: "success",
  failed: "failed",
  reversed: "failed",
  abandoned: "abandoned",
  ongoing: "pending",
  pending: "pending",
  processing: "pending",
  queued: "pending",
};

// Called from both the checkout page's post-payment "verify" call and the
// webhook — never trust the Paystack popup's own client-side success
// callback alone, since that's just the browser's word for it.
export async function verifyTransaction(reference: string, { timeoutMs }: { timeoutMs?: number } = {}): Promise<VerifiedTransaction> {
  let data: { status?: unknown; reference?: unknown; amount?: unknown; currency?: unknown; paid_at?: unknown };
  try {
    data = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`, { timeoutMs });
  } catch (err) {
    if (err instanceof PaystackError && err.kind === "rejected" && /not found/i.test(err.message)) {
      return { outcome: "not_found", status: "not_found", reference, amountKobo: 0, currency: "", paidAt: null };
    }
    throw err;
  }

  if (!data || typeof data.status !== "string" || typeof data.amount !== "number") {
    throw new PaystackError("malformed", "Paystack's verify response was missing status/amount.");
  }
  const outcome = OUTCOME_BY_STATUS[data.status];
  if (!outcome) throw new PaystackError("malformed", `Unrecognised Paystack transaction status "${data.status}".`);

  return {
    outcome,
    status: data.status,
    reference: typeof data.reference === "string" ? data.reference : reference,
    amountKobo: data.amount,
    currency: typeof data.currency === "string" ? data.currency : "",
    paidAt: typeof data.paid_at === "string" ? data.paid_at : null,
  };
}

// ---------------------------------------------------------------------------
// Seller payouts — services/marketplace/payout/seller-payout.service.ts (called from the seller-payout
// cron, src/app/api/cron/seller-payout/route.ts). Two-step, matching
// Paystack's own Transfers API: create a "recipient" once per business
// (cached as Business.paystackRecipientCode so it's only ever created
// once), then initiate a transfer to that recipient per payout.
// ---------------------------------------------------------------------------

// Creates (once) the Paystack transfer recipient for a business's bank
// account. The resulting recipient_code is cached on
// Business.paystackRecipientCode by the caller so this is never repeated
// for the same business.
export async function createTransferRecipient(params: { accountName: string; accountNumber: string; bankCode: string }): Promise<string> {
  const data = await paystackFetch<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: {
      type: "nuban",
      name: params.accountName,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    },
  });
  return data.recipient_code;
}

export interface InitiatedTransfer {
  transferCode: string;
  status: string;
  reference: string;
}

// Initiates the actual bank transfer. Paystack's own `reference` param
// makes this idempotent on Paystack's side too if the same reference is
// ever retried — services/marketplace/payout/seller-payout.service.ts always passes the OrderItem's id
// (plus a payout-attempt counter) as that reference.
export async function initiateTransfer(params: {
  recipientCode: string;
  amountKobo: number;
  reference: string;
  reason: string;
}): Promise<InitiatedTransfer> {
  const data = await paystackFetch<{ transfer_code: string; status: string; reference: string }>("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: params.amountKobo,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    },
  });
  return { transferCode: data.transfer_code, status: data.status, reference: data.reference };
}
