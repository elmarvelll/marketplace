// services/marketplace/payment/resolve-account.ts
//
// Resolves an account holder's name via Paystack, for the business
// onboarding/edit form's auto-fill. Called by
// src/app/api/marketplace/paystack/resolve-account/route.controller.ts.

import { resolveAccountNumber, type ResolvedAccount } from "@/lib/external/paystack";
import { badRequest, unprocessable } from "@/lib/service-error";

export async function resolveAccount(accountNumber: string | undefined, bankCode: string | undefined): Promise<ResolvedAccount> {
  const number = accountNumber?.trim();
  const code = bankCode?.trim();
  if (!number || !code) throw badRequest("accountNumber and bankCode are required.");

  try {
    return await resolveAccountNumber(number, code);
  } catch(error) {
    console.error("Error resolving account number via Paystack:", error);
    // 422 — the input is well-formed but Paystack couldn't resolve it.
    throw unprocessable("Couldn't verify that account number.");
  }
}
