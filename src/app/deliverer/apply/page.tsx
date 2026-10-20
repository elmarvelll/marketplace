// src/app/deliverer/apply/page.tsx
//
// The "Become a Deliverer" application form, reached from the marketplace
// footer. Submits to POST /api/marketplace/deliverer/apply — does NOT
// grant Delivery Dashboard access; an admin must approve it first. See
// docs/marketplace/systems/deliverer-system.md.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { CheckCircle2, Loader2 } from "lucide-react";
import DashboardNavbar from "@/app/components/dashboard/student/DashboardNavbar";
import api from "@/lib/axios";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";
import BankDetailsFields, { type BankDetailsValue } from "@/app/business/_components/BankDetailsFields";

type SubmitState = "idle" | "submitting" | "success" | "error";
type OtpState = "not_requested" | "sending" | "sent" | "verifying" | "verified" | "error";

interface VendorSlot {
  id: string;
  label: string;
  capacity: number;
  filled: number;
  available: number;
}

export default function ApplyDelivererPage() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", hall: "", room: "" });
  const [status, setStatus] = useState<SubmitState>("idle");
  // Where deliverer payouts are sent. The holder name shown is Paystack's; the server resolves it again.
  const [bank, setBank] = useState<BankDetailsValue>({});
  const bankReady = Boolean(bank.bankCode && bank.accountNumber && bank.accountHolderName);
  const [error, setError] = useState("");

  // Student-email OTP step — must complete before the form below can be
  // submitted (spec §34-36; enforced again server-side in
  // apply-for-deliverer.ts, this is UX only).
  const [localPart, setLocalPart] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("not_requested");
  const [otpError, setOtpError] = useState("");

  const [slots, setSlots] = useState<VendorSlot[]>([]);
  const [preferredSlotIds, setPreferredSlotIds] = useState<string[]>([]);

  useEffect(() => {
    api
      .get<{ slots: VendorSlot[] }>("/marketplace/vendor-delivery/slots")
      .then((res) => setSlots(res.data.slots))
      .catch(() => setSlots([]));
  }, []);

  const sendOtp = async () => {
    setOtpState("sending");
    setOtpError("");
    try {
      await api.post("/marketplace/deliverer/student-email/request-otp", { localPart });
      setOtpState("sent");
    } catch (err) {
      setOtpError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't send the code.");
      setOtpState("error");
    }
  };

  const verifyOtp = async () => {
    setOtpState("verifying");
    setOtpError("");
    try {
      await api.post("/marketplace/deliverer/student-email/verify-otp", { code: otpCode });
      setOtpState("verified");
    } catch (err) {
      setOtpError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't verify that code.");
      setOtpState("sent");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      await api.post("/marketplace/deliverer/apply", {
        ...form,
        preferredAvailability: preferredSlotIds,
        bankName: bank.bankName,
        bankCode: bank.bankCode,
        accountNumber: bank.accountNumber,
      });
      setStatus("success");
    } catch (err) {
      const message = (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't submit your application.";
      setError(message);
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />
        <div className="pt-16 min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="w-14 h-14 rounded-full bg-green-50 text-green-700 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Application submitted</h1>
            <p className="text-sm text-gray-500 mb-8">
              An admin will review your application. You&apos;ll get access to the Delivery Dashboard once it&apos;s approved.
            </p>
            <Link href="/" className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition">
              Back to Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MarketplacePageShell width="lg">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Become a Deliverer</h1>
        <p className="text-gray-500 mb-8">Submit your details below. An admin will review and approve your application.</p>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-1">Verify your student email</h2>
          <p className="text-xs text-gray-500 mb-3">
            Enter the part before &quot;@stu.cu.edu.ng&quot;. This proves you control that mailbox — it&apos;s a separate
            step from admin approval.
          </p>
          <div className="flex gap-2 mb-2">
            <div className="flex-1 flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                disabled={otpState === "verified" || otpState === "sending"}
                placeholder="marvelousifezue15"
                className="flex-1 px-4 py-3 text-sm text-gray-900 focus:outline-none disabled:opacity-60"
              />
              <span className="px-3 text-xs text-gray-500 whitespace-nowrap">@stu.cu.edu.ng</span>
            </div>
            <button
              type="button"
              onClick={sendOtp}
              disabled={!localPart.trim() || otpState === "sending" || otpState === "verified"}
              className="px-4 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold transition disabled:opacity-50 whitespace-nowrap"
            >
              {otpState === "sending" ? <Loader2 size={16} className="animate-spin" /> : "Send code"}
            </button>
          </div>

          {(otpState === "sent" || otpState === "verifying") && (
            <div className="flex gap-2 mt-2">
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                disabled={otpState === "verifying"}
                placeholder="6-digit code"
                className="flex-1 px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={verifyOtp}
                disabled={!otpCode.trim() || otpState === "verifying"}
                className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50 whitespace-nowrap"
              >
                {otpState === "verifying" ? <Loader2 size={16} className="animate-spin" /> : "Verify"}
              </button>
            </div>
          )}

          {otpState === "verified" && (
            <p className="mt-2 text-xs text-green-700 flex items-center gap-1">
              <CheckCircle2 size={13} /> Student email verified
            </p>
          )}
          {otpError && <p className="mt-2 text-xs text-red-600">{otpError}</p>}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="firstName">First name</label>
              <input
                id="firstName"
                required
                disabled={status === "submitting"}
                value={form.firstName}
                onChange={(e) => setForm((c) => ({ ...c, firstName: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                required
                disabled={status === "submitting"}
                value={form.lastName}
                onChange={(e) => setForm((c) => ({ ...c, lastName: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              disabled={status === "submitting"}
              value={form.email}
              onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="phone">
              Phone <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              disabled={status === "submitting"}
              value={form.phone}
              onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="hall">Hall</label>
              <input
                id="hall"
                disabled={status === "submitting"}
                value={form.hall}
                onChange={(e) => setForm((c) => ({ ...c, hall: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="room">Room</label>
              <input
                id="room"
                disabled={status === "submitting"}
                value={form.room}
                onChange={(e) => setForm((c) => ({ ...c, room: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>
          </div>

          {slots.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Rank your preferred delivery timeframes</label>
              <p className="text-xs text-gray-500 mb-3">
                Click timeframes in order of preference — the order matters. Preferences are <strong>not guaranteed</strong>: an
                admin makes the final assignment, and a timeframe with many applicants or few remaining positions may have a
                lower chance of being assigned. Picking a timeframe with more available positions may improve your odds.
              </p>
              <div className="space-y-2">
                {slots.map((slot) => {
                  const rank = preferredSlotIds.indexOf(slot.id);
                  const selected = rank !== -1;
                  const full = slot.available === 0;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={status === "submitting"}
                      onClick={() =>
                        setPreferredSlotIds((current) => (selected ? current.filter((id) => id !== slot.id) : [...current, slot.id]))
                      }
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm transition disabled:opacity-50 ${
                        selected ? "bg-blue-50 border-blue-500 text-blue-900" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        {selected && (
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                            {rank + 1}
                          </span>
                        )}
                        {slot.label}
                      </span>
                      <span className={`text-xs ${full ? "text-red-600" : "text-gray-500"}`}>
                        {slot.available} of {slot.capacity} positions available
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">Payout account</p>
            <p className="text-xs text-gray-500 mb-3">Your delivery earnings are paid into this account. You can change it later from your Delivery Dashboard.</p>
            <BankDetailsFields value={bank} onChange={setBank} disabled={status === "submitting"} />
          </div>

          {error && <div className="text-sm p-3 rounded-lg text-red-700 bg-red-100">{error}</div>}

          <button
            type="submit"
            disabled={status === "submitting" || otpState !== "verified" || !bankReady}
            title={otpState !== "verified" ? "Verify your student email first" : !bankReady ? "Add your payout account" : undefined}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {status === "submitting" && <Loader2 size={18} className="animate-spin" />}
            {status === "submitting" ? "Submitting…" : otpState !== "verified" ? "Verify your student email first" : !bankReady ? "Add your payout account" : "Submit application"}
          </button>
        </form>
    </MarketplacePageShell>
  );
}
