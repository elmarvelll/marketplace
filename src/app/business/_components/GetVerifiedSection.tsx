// src/app/business/_components/GetVerifiedSection.tsx
//
// The business dashboard's verification panel — shown on the Profile tab
// (business/[id]/page.tsx). Distinct from the business-approval gate
// (BusinessApprovalGate.tsx): this is entirely about the "Get Verified"
// badge, gated on >=20 completed orders — see
// services/marketplace/business/request-verification.ts.

"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { BadgeCheck, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import type { BusinessDetail } from "@/types/business";

interface GetVerifiedSectionProps {
  business: BusinessDetail;
  onRequested: () => void;
}

export default function GetVerifiedSection({ business, onRequested }: GetVerifiedSectionProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  const eligible = business.completedOrderCount >= business.verificationOrderThreshold;

  const submit = async () => {
    setStatus("submitting");
    setError("");
    try {
      await api.post(`/marketplace/businesses/${business.id}/verification-request`);
      onRequested();
      setStatus("idle");
    } catch (err) {
      setError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't submit your request.");
      setStatus("error");
    }
  };

  if (business.verified) {
    return (
      <section className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <BadgeCheck size={20} />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Verified business</p>
          <p className="text-sm text-gray-500">This business has been verified by an admin.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1.5">
        <BadgeCheck size={17} className="text-gray-500" />
        Verification
      </h2>

      {business.verificationRequestStatus === "PENDING" && (
        <p className="text-sm text-amber-700">Your verification request is pending admin review.</p>
      )}

      {business.verificationRequestStatus === "REJECTED" && (
        <div className="mb-3">
          <p className="text-sm text-red-600">
            Your last verification request wasn&apos;t approved
            {business.verificationRejectionReason ? `: ${business.verificationRejectionReason}` : "."}
          </p>
        </div>
      )}

      {business.verificationRequestStatus !== "PENDING" && (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {eligible
              ? "This business qualifies for verification."
              : `You need at least ${business.verificationOrderThreshold} completed orders to request verification (${business.completedOrderCount}/${business.verificationOrderThreshold} so far).`}
          </p>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={!eligible || status === "submitting"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "submitting" && <Loader2 size={14} className="animate-spin" />}
            {business.verificationRequestStatus === "REJECTED" ? "Request again" : "Get Verified"}
          </button>
        </>
      )}
    </section>
  );
}
