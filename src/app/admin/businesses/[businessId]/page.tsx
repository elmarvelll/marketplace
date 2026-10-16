// src/app/admin/businesses/[businessId]/page.tsx
//
// Admin "View Profile" — the full submitted registration info for one
// business (every BusinessFormValues field, plus admin-only status), and
// the products it owns (linking each one to the admin Product Detail
// page). Backed by GET /marketplace/admin/businesses/[businessId], which
// already existed but was unused before this — see
// services/marketplace/admin/get-business-detail-for-admin.ts.

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, ArrowLeft, Loader2, Package } from "lucide-react";
import api from "@/lib/axios";
import type { ProductSummary } from "@/types/product";

interface AdminBusinessDetail {
  id: string;
  name: string;
  industry: string;
  description: string;
  publicId: string | null;
  secureUrl: string | null;
  contactInfo: string | null;
  website: string | null;
  instagram: string | null;
  linkedin: string | null;
  location: string | null;
  paymentMethod: string | null;
  serviceDays: string | null;
  serviceTimes: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  paystackRecipientCode: string | null;
  visitors: number;
  approvalStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUSPENDED";
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  verified: boolean;
  verifiedAt: string | null;
  blocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  deliveryRestricted: boolean;
  lateDeliveryCount: number;
  createdAt: string;
  deliveryDays: string[];
  owner: { id: string; firstName: string; lastName: string; email: string };
  productCount: number;
  orderCount: number;
  reportCount: number;
  products: ProductSummary[];
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <dt className="text-gray-500 mb-1">{label}</dt>
      <dd className="text-gray-900 break-words">{value ?? "—"}</dd>
    </div>
  );
}

export default function AdminBusinessProfilePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = use(params);
  const [business, setBusiness] = useState<AdminBusinessDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "not-found" | "error">("loading");

  useEffect(() => {
    const run = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<{ business: AdminBusinessDetail }>(`/marketplace/admin/businesses/${businessId}`);
        setBusiness(res.data.business);
        setLoadState("loaded");
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 403) setLoadState("forbidden");
        else if (isAxiosError(err) && err.response?.status === 404) setLoadState("not-found");
        else setLoadState("error");
      }
    };
    run();
  }, [businessId]);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState !== "loaded" || !business) {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">
          {loadState === "forbidden"
            ? "Admin access required."
            : loadState === "not-found"
              ? "This business doesn't exist."
              : "Couldn't load this business."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/admin/businesses"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition mb-6"
      >
        <ArrowLeft size={16} />
        Back to Businesses
      </Link>

      <div className="flex flex-wrap items-start gap-4 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden">
          {business.secureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, not worth a remotePatterns entry
            <img src={business.secureUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            business.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{business.name}</h1>
          <p className="text-sm text-gray-500">{business.industry}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                business.approvalStatus === "APPROVED"
                  ? "bg-green-50 text-green-700"
                  : business.approvalStatus === "REJECTED"
                    ? "bg-red-50 text-red-600"
                    : business.approvalStatus === "SUSPENDED"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-amber-50 text-amber-700"
              }`}
            >
              {business.approvalStatus.replace("_", " ")}
            </span>
            {business.verified && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">Verified</span>}
            {business.blocked && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">Blocked</span>}
            {business.deliveryRestricted && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Delivery restricted</span>
            )}
          </div>
        </div>
      </div>

      {business.rejectionReason && (
        <div className="mb-6 p-3 rounded-xl bg-red-50 text-red-700 text-sm">Rejection reason: {business.rejectionReason}</div>
      )}
      {business.blockedReason && (
        <div className="mb-6 p-3 rounded-xl bg-red-50 text-red-700 text-sm">Block reason: {business.blockedReason}</div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Products</p>
          <p className="text-xl font-bold text-gray-900">{business.productCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Orders</p>
          <p className="text-xl font-bold text-gray-900">{business.orderCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Reports</p>
          <p className="text-xl font-bold text-gray-900">{business.reportCount}</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Submitted information</h2>
        <dl className="space-y-4 text-sm">
          <Field label="Description" value={business.description} />
          <Field label="Location" value={business.location} />
          <Field label="Contact information" value={business.contactInfo} />
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Website" value={business.website} />
            <Field label="Instagram" value={business.instagram} />
            <Field label="LinkedIn" value={business.linkedin} />
          </div>
          <Field label="Delivery days" value={business.deliveryDays.length > 0 ? business.deliveryDays.join(", ") : null} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Owner" value={`${business.owner.firstName} ${business.owner.lastName} (${business.owner.email})`} />
            <Field label="Registered" value={dateFormatter.format(new Date(business.createdAt))} />
          </div>
        </dl>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Payout bank details</h2>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <Field label="Bank" value={business.bankName} />
          <Field label="Account number" value={business.accountNumber} />
          <Field label="Account holder" value={business.accountHolderName} />
          <Field label="Paystack recipient code" value={business.paystackRecipientCode} />
        </dl>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Package size={16} className="text-gray-500" />
          Products ({business.products.length})
        </h2>
        {business.products.length === 0 ? (
          <p className="text-sm text-gray-500">This business hasn&apos;t listed any products yet.</p>
        ) : (
          <div className="space-y-2">
            {business.products.map((product) => (
              <Link
                key={product.id}
                href={`/admin/products/${product.id}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 transition"
              >
                <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {product.secureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL
                    <img src={product.secureUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                  <p className="text-xs text-gray-500">
                    ₦{nairaFormatter.format(product.price)} · {product.stock} in stock
                    {product.variants.length > 0 && ` · ${product.variants.length} variant(s)`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
