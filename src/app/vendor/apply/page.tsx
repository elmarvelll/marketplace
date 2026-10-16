// src/app/vendor/apply/page.tsx
//
// The "Become a Vendor" application page, reachable from the marketplace
// footer. Submits to POST /api/marketplace/vendor/apply (real Prisma
// persistence — creates a Business row with type = SCHOOL_VENDOR, see
// services/marketplace/vendor/create-vendor-application.ts). Reuses the
// existing Business onboarding form's bank-details component
// (../../business/_components/BankDetailsFields.tsx) since bank
// verification is identical for both — see
// docs/marketplace/decisions/vendor-extends-business.md.

"use client";

import { useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import DashboardNavbar from "@/app/components/dashboard/student/DashboardNavbar";
import api from "@/lib/axios";
import BankDetailsFields from "../../business/_components/BankDetailsFields";
import { VENDOR_CATEGORIES, type VendorApplicationFormValues } from "@/types/vendor";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";

type SubmitState = "idle" | "submitting" | "success" | "error";

const initialForm: VendorApplicationFormValues = {
  applicantName: "",
  name: "",
  location: "",
  vendorCategory: "Food",
  availabilityStart: "17:00",
  availabilityEnd: "20:00",
};

export default function VendorApplyPage() {
  const [form, setForm] = useState<VendorApplicationFormValues>(initialForm);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [createdName, setCreatedName] = useState("");

  const updateField = (key: keyof VendorApplicationFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((current) => ({ ...current, [key]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const res = await api.post<{ vendor: { name: string } }>("/marketplace/vendor/apply", form);
      setCreatedName(res.data.vendor.name);
      setStatus("success");
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) ||
        "Couldn't submit your application. Please try again.";
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
            <h1 className="text-xl font-bold text-gray-900 mb-2">{createdName} submitted for review</h1>
            <p className="text-sm text-gray-500 mb-8">
              An admin will review your School Vendor application shortly. You&apos;ll be notified once it&apos;s
              approved and live on the marketplace.
            </p>
            <Link
              href="/"
              className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition"
            >
              Back to Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MarketplacePageShell width="2xl">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Become a School Vendor</h1>
        <p className="text-gray-500 mb-8">
          Sell food, drinks, or snacks to students. Once approved, AkadVerse&apos;s delivery operation handles pickup
          and delivery for you.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Vendor details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="applicantName">
                Your name
              </label>
              <input
                id="applicantName"
                type="text"
                value={form.applicantName}
                onChange={updateField("applicantName")}
                required
                disabled={status === "submitting"}
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="name">
                Vendor/business name
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={updateField("name")}
                required
                disabled={status === "submitting"}
                placeholder="e.g. Mama T's Kitchen"
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="vendorCategory">
                Category
              </label>
              <select
                id="vendorCategory"
                value={form.vendorCategory}
                onChange={updateField("vendorCategory")}
                required
                disabled={status === "submitting"}
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              >
                {VENDOR_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="location">
                Location
              </label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={updateField("location")}
                required
                disabled={status === "submitting"}
                placeholder="e.g. Block C, Female Hostel"
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="availabilityStart">
                  Available from
                </label>
                <input
                  id="availabilityStart"
                  type="time"
                  value={form.availabilityStart}
                  onChange={updateField("availabilityStart")}
                  disabled={status === "submitting"}
                  className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="availabilityEnd">
                  Available until
                </label>
                <input
                  id="availabilityEnd"
                  type="time"
                  value={form.availabilityEnd}
                  onChange={updateField("availabilityEnd")}
                  disabled={status === "submitting"}
                  className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Wallet size={17} className="text-gray-500" />
              Payout bank details
            </h2>
            <p className="text-xs text-gray-500">
              The account holder name is verified automatically once you select a bank and enter your account
              number — it can&apos;t be typed manually.
            </p>
            <BankDetailsFields
              value={form}
              disabled={status === "submitting"}
              onChange={(bankDetails) => setForm((current) => ({ ...current, ...bankDetails }))}
            />
          </section>

          {error && <div className="text-sm p-3 rounded-lg text-red-700 bg-red-100">{error}</div>}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === "submitting" && <Loader2 size={18} className="animate-spin" />}
            {status === "submitting" ? "Submitting…" : "Submit application"}
          </button>
        </form>
    </MarketplacePageShell>
  );
}
