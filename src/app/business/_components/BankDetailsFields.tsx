// src/app/business/_components/BankDetailsFields.tsx
//
// Bank name dropdown (populated from Paystack's bank list) + account
// number input + auto-resolved account holder name, for the business
// onboarding/edit form. Nigerian NUBAN account numbers are 10 digits — once
// the field reaches that length (and a bank is selected), it resolves the
// account name via GET /api/marketplace/paystack/resolve-account
// (lib/external/paystack.ts).

"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import api from "@/lib/axios";

const NUBAN_LENGTH = 10;

// bankCode IS persisted (Business.bankCode) — the seller-payout system
// needs it to create a Paystack transfer recipient, which only accepts a
// bank code, not a display name. Still derived here from the fetched bank
// list by matching the stored bank name (rather than trusting a client-sent
// code directly) whenever a code isn't already present in `value`.
export interface BankDetailsValue {
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountHolderName?: string;
}

interface BankDetailsFieldsProps {
  value: BankDetailsValue;
  onChange: (value: BankDetailsValue) => void;
  disabled?: boolean;
}

interface Bank {
  name: string;
  code: string;
}

export default function BankDetailsFields({ value, onChange, disabled }: BankDetailsFieldsProps) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksStatus, setBanksStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(false);

  // Purely derived from the current field values — not effect-driven
  // state, so there's nothing to reset when the account number/bank
  // combination stops being a full, resolvable pair. Prefers the code
  // already stored on `value` (an existing business being edited); falls
  // back to matching the stored bank *name* against the fetched bank list
  // (a fresh selection, or an older row saved before bankCode existed).
  const accountNumber = value.accountNumber ?? "";
  const selectedBankCode = useMemo(
    () => value.bankCode || banks.find((bank) => bank.name === value.bankName)?.code || "",
    [banks, value.bankName, value.bankCode]
  );
  const eligibleToResolve = accountNumber.length === NUBAN_LENGTH && !!selectedBankCode;

  useEffect(() => {
    api
      .get<{ banks: Bank[] }>("/marketplace/paystack/banks")
      .then((res) => {
        setBanks(res.data.banks);
        setBanksStatus("loaded");
      })
      .catch(() => setBanksStatus("error"));
  }, []);

  // Re-resolve whenever a full account number is paired with a selected
  // bank. Re-runs if either changes (e.g. picking a different bank after
  // already typing the number).
  useEffect(() => {
    if (!eligibleToResolve) return;

    let cancelled = false;

    // Wrapped in a named async function (rather than setResolving(true)
    // etc. as direct statements in the effect body) so the "mark as
    // resolving" state updates read as reacting to the fetch's lifecycle,
    // not as synchronous effect-body writes.
    const resolve = async () => {
      setResolving(true);
      setResolveError(false);
      try {
        const res = await api.get<{ accountName: string }>("/marketplace/paystack/resolve-account", {
          params: { accountNumber, bankCode: selectedBankCode },
        });
        if (cancelled) return;
        onChange({ ...value, accountHolderName: res.data.accountName });
      } catch {
        if (cancelled) return;
        onChange({ ...value, accountHolderName: undefined });
        setResolveError(true);
      } finally {
        if (!cancelled) setResolving(false);
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
    // Only re-run when the account number or bank actually change — not on
    // every `value`/`onChange` identity change, since onChange sets
    // accountHolderName on `value` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNumber, selectedBankCode, eligibleToResolve]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bankName">
          Bank name
        </label>
        <select
          id="bankName"
          value={selectedBankCode}
          disabled={disabled || banksStatus === "loading"}
          onChange={(e) => {
            const bank = banks.find((b) => b.code === e.target.value);
            onChange({ ...value, bankName: bank?.name, bankCode: bank?.code, accountHolderName: undefined });
          }}
          className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
        >
          <option value="">{banksStatus === "loading" ? "Loading banks…" : "Select a bank"}</option>
          {banks.map((bank) => (
            <option key={`${bank.name}-${bank.code}`} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>
        {banksStatus === "error" && <p className="mt-1.5 text-xs text-red-600">Couldn&apos;t load the bank list.</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="accountNumber">
          Account number
        </label>
        <input
          id="accountNumber"
          type="text"
          inputMode="numeric"
          maxLength={NUBAN_LENGTH}
          value={value.accountNumber ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, NUBAN_LENGTH);
            onChange({ ...value, accountNumber: digits, accountHolderName: undefined });
          }}
          placeholder="10-digit account number"
          className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
        />
      </div>

      {eligibleToResolve && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Account holder name</label>
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
              resolveError ? "border-red-200 bg-red-50 text-red-600" : "border-gray-200 bg-gray-50 text-gray-900"
            }`}
          >
            {resolving && <Loader2 size={14} className="animate-spin text-gray-500" />}
            {!resolving && !resolveError && <CheckCircle2 size={14} className="text-green-700" />}
            <span>
              {resolving && "Verifying account…"}
              {!resolving && !resolveError && value.accountHolderName}
              {!resolving && resolveError && "Couldn't verify that account number."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
