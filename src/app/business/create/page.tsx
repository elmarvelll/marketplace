// src/app/business/create/page.tsx
//
// The "create a business" onboarding page, reachable from the marketplace
// navbar's My Businesses dropdown ("+ Add Business"). Submits to
// POST /api/marketplace/businesses (real Prisma persistence — see that
// route for details) and, once created, offers a "Go to Dashboard" link
// into the new business's dashboard
// (src/app/business/[id]/page.tsx).

"use client";

import { useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import DashboardNavbar from "@/app/components/dashboard/student/DashboardNavbar";
import api from "@/lib/axios";
import { productCategories } from "@/services/marketplace/shared/categories";
import ImageUploadField from "../_components/ImageUploadField";
import BankDetailsFields from "../_components/BankDetailsFields";
import DeliveryDaysField from "../_components/DeliveryDaysField";
import type { BusinessFormValues, BusinessSummary } from "@/types/business";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";

type SubmitState = "idle" | "submitting" | "success" | "error";

const initialForm: BusinessFormValues = {
  name: "",
  industry: "",
  description: "",
  contactInfo: "",
  website: "",
  instagram: "",
  linkedin: "",
  location: "",
  deliveryDays: [],
};

export default function CreateBusinessPage() {
  const [form, setForm] = useState<BusinessFormValues>(initialForm);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [createdBusiness, setCreatedBusiness] = useState<BusinessSummary | null>(null);

  const updateField = (key: keyof BusinessFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((current) => ({ ...current, [key]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const res = await api.post<{ business: BusinessSummary }>("/marketplace/businesses", form);
      setCreatedBusiness(res.data.business);
      setStatus("success");
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) ||
        "Couldn't create your business. Please try again.";
      setError(message);
      setStatus("error");
    }
  };

  if (status === "success" && createdBusiness) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />
        <div className="pt-16 min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="w-14 h-14 rounded-full bg-green-50 text-green-700 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{createdBusiness.name} submitted for review</h1>
            <p className="text-sm text-gray-500 mb-8">
              An admin will review your business shortly. You&apos;ll be notified once it&apos;s approved and live on the
              marketplace — you can check its status from the dashboard any time.
            </p>
            <Link
              href={`/business/${createdBusiness.id}`}
              className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/"
              className="block mt-4 text-sm text-gray-500 hover:text-gray-900 transition"
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
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Create your business</h1>
        <p className="text-gray-500 mb-8">Set up a storefront to sell products on the marketplace.</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Business details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="name">
                Business name
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={updateField("name")}
                required
                disabled={status === "submitting"}
                placeholder="e.g. MunchBox"
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="industry">
                Category
              </label>
              <select
                id="industry"
                value={form.industry}
                onChange={updateField("industry")}
                required
                disabled={status === "submitting"}
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              >
                <option value="" disabled>
                  Select a category
                </option>
                {productCategories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={updateField("description")}
                required
                disabled={status === "submitting"}
                rows={4}
                placeholder="What does your business sell?"
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none disabled:opacity-60"
              />
            </div>

            <ImageUploadField
              secureUrl={form.secureUrl}
              disabled={status === "submitting"}
              onUploaded={({ publicId, secureUrl }) => setForm((current) => ({ ...current, publicId, secureUrl }))}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="location">
                Location <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={updateField("location")}
                disabled={status === "submitting"}
                placeholder="e.g. Block C, Female Hostel"
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Contact & online presence</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="contactInfo">
                How should buyers reach you? <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="contactInfo"
                type="text"
                value={form.contactInfo}
                onChange={updateField("contactInfo")}
                disabled={status === "submitting"}
                placeholder="Phone, email, or WhatsApp"
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="website">
                  Website
                </label>
                <input
                  id="website"
                  type="url"
                  value={form.website}
                  onChange={updateField("website")}
                  disabled={status === "submitting"}
                  placeholder="https://…"
                  className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="instagram">
                  Instagram
                </label>
                <input
                  id="instagram"
                  type="text"
                  value={form.instagram}
                  onChange={updateField("instagram")}
                  disabled={status === "submitting"}
                  placeholder="@handle"
                  className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="linkedin">
                  LinkedIn
                </label>
                <input
                  id="linkedin"
                  type="text"
                  value={form.linkedin}
                  onChange={updateField("linkedin")}
                  disabled={status === "submitting"}
                  placeholder="Profile URL"
                  className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Delivery</h2>
            <DeliveryDaysField
              value={form.deliveryDays ?? []}
              disabled={status === "submitting"}
              onChange={(deliveryDays) => setForm((current) => ({ ...current, deliveryDays }))}
            />
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Wallet size={17} className="text-gray-500" />
              Payout bank details
            </h2>
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
            {status === "submitting" ? "Creating…" : "Create"}
          </button>
        </form>
    </MarketplacePageShell>
  );
}
