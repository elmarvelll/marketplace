// services/marketplace/deliverer/payout-account.ts
//
// The bank account a deliverer is paid into (vendor-delivery/payout/). Asked
// for when applying (apply-for-deliverer.ts) and editable afterwards from the
// Delivery Dashboard's "Payout account" section. Same rule as the vendor
// application: the account holder name is never taken from the client — it's
// resolved through Paystack from the bank + account number, and that is what
// is stored.
//
// Changing the account clears the cached Paystack transfer recipient, so the
// next payout creates one for the new account (process-deliverer-payout.ts).
// A deliverer without a complete account is simply skipped by the payout
// sweep — their payouts wait, they don't fail.

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/service-error";
import { resolveAccount } from "@/services/marketplace/payment/resolve-account";

export interface PayoutAccountInput {
  bankName?: unknown;
  bankCode?: unknown;
  accountNumber?: unknown;
}

export interface PayoutAccountView {
  complete: boolean;
  bankName: string | null;
  bankCode: string | null;
  accountNumberLast4: string | null;
  accountHolderName: string | null;
}

// Validates and Paystack-resolves bank details; returns exactly what to store.
export async function resolvePayoutAccount(input: PayoutAccountInput) {
  const bankName = typeof input.bankName === "string" ? input.bankName.trim() : "";
  const bankCode = typeof input.bankCode === "string" ? input.bankCode.trim() : "";
  const accountNumber = typeof input.accountNumber === "string" ? input.accountNumber.replace(/\s+/g, "") : "";
  if (!bankName || !bankCode || !accountNumber) throw badRequest("Choose your bank and enter your account number.");
  if (!/^\d{10}$/.test(accountNumber)) throw badRequest("Account number must be 10 digits.");
  const resolved = await resolveAccount(accountNumber, bankCode);
  return { bankName, bankCode, accountNumber, accountHolderName: resolved.accountName };
}

export function toPayoutAccountView(d: { bankName: string | null; bankCode: string | null; accountNumber: string | null; accountHolderName: string | null }): PayoutAccountView {
  return {
    complete: Boolean(d.bankCode && d.accountNumber && d.accountHolderName),
    bankName: d.bankName,
    bankCode: d.bankCode,
    // Never the full number in a response — the deliverer typed it, and only payouts need it.
    accountNumberLast4: d.accountNumber ? d.accountNumber.slice(-4) : null,
    accountHolderName: d.accountHolderName,
  };
}

export async function getPayoutAccount(delivererId: string): Promise<PayoutAccountView> {
  const d = await prisma.deliverer.findUniqueOrThrow({
    where: { id: delivererId },
    select: { bankName: true, bankCode: true, accountNumber: true, accountHolderName: true },
  });
  return toPayoutAccountView(d);
}

export async function setPayoutAccount(delivererId: string, input: PayoutAccountInput): Promise<PayoutAccountView> {
  const account = await resolvePayoutAccount(input);
  const d = await prisma.deliverer.update({
    where: { id: delivererId },
    data: { ...account, paystackRecipientCode: null },
    select: { bankName: true, bankCode: true, accountNumber: true, accountHolderName: true },
  });
  return toPayoutAccountView(d);
}
