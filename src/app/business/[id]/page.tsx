// src/app/business/[id]/page.tsx
//
// The business dashboard's "Business Profile" tab (default route) — all
// the business's profile data, editable in place via
// PATCH /api/marketplace/businesses/[id]. Stats moved to ./analytics/;
// products/orders have their own tabs too (see ../_components/BusinessSidebar.tsx).

"use client";

import { use, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, AlertTriangle, Loader2, Pencil, Wallet, X } from "lucide-react";
import api from "@/lib/axios";
import { productCategories } from "@/services/marketplace/shared/categories";
import ImageUploadField from "../_components/ImageUploadField";
import BankDetailsFields from "../_components/BankDetailsFields";
import DeliveryDaysField from "../_components/DeliveryDaysField";
import { useBusinessDetail } from "../_components/useBusinessDetail";
import GetVerifiedSection from "../_components/GetVerifiedSection";
import type { BusinessDetail, BusinessFormValues } from "@/types/business";

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

const emptyForm: BusinessFormValues = {
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

function formFromBusiness(business: BusinessDetail): BusinessFormValues {
  return {
    name: business.name,
    industry: business.industry,
    description: business.description,
    contactInfo: business.contactInfo ?? "",
    website: business.website ?? "",
    instagram: business.instagram ?? "",
    linkedin: business.linkedin ?? "",
    location: business.location ?? "",
    publicId: business.publicId ?? undefined,
    secureUrl: business.secureUrl ?? undefined,
    bankName: business.bankName ?? undefined,
    bankCode: business.bankCode ?? undefined,
    accountNumber: business.accountNumber ?? undefined,
    accountHolderName: business.accountHolderName ?? undefined,
    deliveryDays: business.deliveryDays ?? [],
  };
}

export default function BusinessProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { business, setBusiness, loadState } = useBusinessDetail(id);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BusinessFormValues>(emptyForm);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  const startEditing = () => {
    if (business) setForm(formFromBusiness(business));
    setEditing(true);
  };

  const updateField = (key: keyof BusinessFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((current) => ({ ...current, [key]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveError("");

    try {
      const res = await api.patch<{ business: BusinessDetail }>(`/marketplace/businesses/${id}`, form);
      setBusiness((current) => (current ? { ...current, ...res.data.business } : current));
      setSaveStatus("idle");
      setEditing(false);
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't save your changes.";
      setSaveError(message);
      setSaveStatus("error");
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="flex flex-col items-center text-center py-24">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">This business doesn&apos;t exist, or isn&apos;t yours.</p>
      </div>
    );
  }

  if (loadState === "error" || !business) {
    return (
      <div className="flex flex-col items-center text-center py-24">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">Couldn&apos;t load this business. Please try again.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden">
            {business.secureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, not worth a remotePatterns entry for a small avatar
              <img src={business.secureUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              business.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{business.name}</h1>
            <p className="text-sm text-gray-500">{business.industry}</p>
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition shrink-0"
          >
            <Pencil size={14} />
            Edit profile
          </button>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        {!editing ? (
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-gray-500 mb-1">Description</dt>
              <dd className="text-gray-900">{business.description}</dd>
            </div>
            <div>
              <dt className="text-gray-500 mb-1">Location</dt>
              <dd className="text-gray-900">{business.location || "Not provided yet."}</dd>
            </div>
            <div>
              <dt className="text-gray-500 mb-1">Contact information</dt>
              <dd className="text-gray-900">{business.contactInfo || "Not provided yet."}</dd>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <dt className="text-gray-500 mb-1">Website</dt>
                <dd className="text-gray-900 truncate">{business.website || "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">Instagram</dt>
                <dd className="text-gray-900 truncate">{business.instagram || "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">LinkedIn</dt>
                <dd className="text-gray-900 truncate">{business.linkedin || "—"}</dd>
              </div>
            </div>
            <div>
              <dt className="text-gray-500 mb-1">Payout bank</dt>
              <dd className="text-gray-900">
                {business.bankName && business.accountNumber
                  ? `${business.bankName} · ${business.accountNumber} (${business.accountHolderName})`
                  : "Not set up yet."}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 mb-1">Delivery days</dt>
              <dd className="text-gray-900">
                {business.deliveryDays && business.deliveryDays.length > 0
                  ? business.deliveryDays.map((day) => DAY_LABELS[day] ?? day).join(", ")
                  : "Not set up yet."}
              </dd>
            </div>
            {business.deliveryRestricted && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  This business is currently restricted from delivery due to an unpaid late-delivery fine. See the
                  Orders tab for details.
                </span>
              </div>
            )}
          </dl>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Edit profile</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Cancel editing"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-name">
                Business name
              </label>
              <input
                id="edit-name"
                type="text"
                value={form.name}
                onChange={updateField("name")}
                required
                disabled={saveStatus === "saving"}
                className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-industry">
                Category
              </label>
              <select
                id="edit-industry"
                value={form.industry}
                onChange={updateField("industry")}
                required
                disabled={saveStatus === "saving"}
                className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              >
                {productCategories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-description">
                Description
              </label>
              <textarea
                id="edit-description"
                value={form.description}
                onChange={updateField("description")}
                required
                disabled={saveStatus === "saving"}
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none disabled:opacity-60"
              />
            </div>

            <ImageUploadField
              secureUrl={form.secureUrl}
              disabled={saveStatus === "saving"}
              onUploaded={({ publicId, secureUrl }) => setForm((current) => ({ ...current, publicId, secureUrl }))}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-location">
                Location
              </label>
              <input
                id="edit-location"
                type="text"
                value={form.location}
                onChange={updateField("location")}
                disabled={saveStatus === "saving"}
                className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-contactInfo">
                Contact information
              </label>
              <input
                id="edit-contactInfo"
                type="text"
                value={form.contactInfo}
                onChange={updateField("contactInfo")}
                disabled={saveStatus === "saving"}
                className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-website">
                  Website
                </label>
                <input
                  id="edit-website"
                  type="url"
                  value={form.website}
                  onChange={updateField("website")}
                  disabled={saveStatus === "saving"}
                  className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-instagram">
                  Instagram
                </label>
                <input
                  id="edit-instagram"
                  type="text"
                  value={form.instagram}
                  onChange={updateField("instagram")}
                  disabled={saveStatus === "saving"}
                  className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="edit-linkedin">
                  LinkedIn
                </label>
                <input
                  id="edit-linkedin"
                  type="text"
                  value={form.linkedin}
                  onChange={updateField("linkedin")}
                  disabled={saveStatus === "saving"}
                  className="w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <DeliveryDaysField
                value={form.deliveryDays ?? []}
                disabled={saveStatus === "saving"}
                onChange={(deliveryDays) => setForm((current) => ({ ...current, deliveryDays }))}
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Wallet size={16} className="text-gray-500" />
                Payout bank details
              </h3>
              <BankDetailsFields
                value={form}
                disabled={saveStatus === "saving"}
                onChange={(bankDetails) => setForm((current) => ({ ...current, ...bankDetails }))}
              />
            </div>

            {saveError && <div className="text-sm p-3 rounded-lg text-red-700 bg-red-100">{saveError}</div>}

            <button
              type="submit"
              disabled={saveStatus === "saving"}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saveStatus === "saving" && <Loader2 size={16} className="animate-spin" />}
              {saveStatus === "saving" ? "Saving…" : "Save changes"}
            </button>
          </form>
        )}
      </section>

      <div className="mt-6">
        <GetVerifiedSection
          business={business}
          onRequested={async () => {
            const res = await api.get<{ business: BusinessDetail }>(`/marketplace/businesses/${id}`);
            setBusiness(res.data.business);
          }}
        />
      </div>
    </>
  );
}
