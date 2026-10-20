// src/app/deliverer/_components/PayoutAccountSection.tsx
//
// The deliverer's payout account on their Delivery Dashboard: shows where
// earnings go (bank, holder name, last 4 digits) and lets them change it.
// The holder name comes from Paystack (BankDetailsFields resolves it as they
// type; the server resolves it again). Without a complete account their
// payouts wait — they are never sent anywhere else. See
// services/marketplace/deliverer/payout-account.ts.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertTriangle, CheckCircle2, Landmark, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import BankDetailsFields, { type BankDetailsValue } from "@/app/business/_components/BankDetailsFields";

interface PayoutAccount {
  complete: boolean;
  bankName: string | null;
  accountNumberLast4: string | null;
  accountHolderName: string | null;
}

export default function PayoutAccountSection() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BankDetailsValue>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.get<{ account: PayoutAccount }>("/marketplace/deliverer/payout-account");
        setAccount(res.data.account);
        setEditing(!res.data.account.complete);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    };
    run();
  }, []);

  const ready = Boolean(draft.bankCode && draft.accountNumber && draft.accountHolderName);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put<{ account: PayoutAccount }>("/marketplace/deliverer/payout-account", {
        bankName: draft.bankName,
        bankCode: draft.bankCode,
        accountNumber: draft.accountNumber,
      });
      setAccount(res.data.account);
      setEditing(false);
      setDraft({});
      setMessage({ tone: "ok", text: "Payout account saved. Future payouts go to this account." });
    } catch (err) {
      setMessage({ tone: "bad", text: (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't save your payout account." });
    } finally {
      setSaving(false);
    }
  };

  if (loadState === "loading") return <Loader2 size={20} className="animate-spin text-gray-500" />;
  if (loadState === "error" || !account) return <p className="text-sm text-gray-500">Couldn&apos;t load your payout account.</p>;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      {account.complete ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Landmark size={18} className="mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">{account.accountHolderName}</p>
              <p className="text-xs text-gray-500">
                {account.bankName} · •••• {account.accountNumberLast4}
              </p>
            </div>
          </div>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              Change
            </button>
          )}
        </div>
      ) : (
        <p role="status" className="flex items-start gap-2 text-sm p-3 rounded-xl bg-amber-50 text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Add your bank account to get paid. Your earnings are held until you do.
        </p>
      )}

      {editing && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <BankDetailsFields value={draft} onChange={setDraft} disabled={saving} />
          <div className="flex gap-2">
            <button type="submit" disabled={!ready || saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Save payout account
            </button>
            {account.complete && (
              <button type="button" disabled={saving} onClick={() => { setEditing(false); setDraft({}); }} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {message && (
        <p role="status" className={`flex items-center gap-1.5 text-sm ${message.tone === "ok" ? "text-green-700" : "text-red-700"}`}>
          {message.tone === "ok" && <CheckCircle2 size={14} />} {message.text}
        </p>
      )}
    </div>
  );
}
