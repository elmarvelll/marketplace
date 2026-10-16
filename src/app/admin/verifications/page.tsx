// src/app/admin/verifications/page.tsx
//
// Businesses awaiting verification — reuses
// services/marketplace/admin/list-businesses-for-admin.ts with
// filter=pending_verification, and the same verify action the Businesses
// tab uses. See docs/marketplace/systems/admin-system.md.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface BusinessRow {
  id: string;
  name: string;
  industry: string;
  ownerEmail: string;
  verified: boolean;
  blocked: boolean;
  createdAt: string;
}

interface BusinessPage {
  items: BusinessRow[];
  page: number;
  totalPages: number;
  total: number;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

export default function AdminVerificationsPage() {
  const [result, setResult] = useState<BusinessPage | null>(null);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (targetPage: number) => {
    setLoadState("loading");
    try {
      const res = await api.get<BusinessPage>("/marketplace/admin/businesses", { params: { page: targetPage, filter: "pending_verification" } });
      setResult(res.data);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load(page);
    };
    run();
  }, [page]);

  const verify = async (businessId: string) => {
    setBusyId(businessId);
    try {
      await api.post(`/marketplace/admin/businesses/${businessId}/verify`);
      await load(page);
    } finally {
      setBusyId(null);
    }
  };

  const rejectVerification = async (business: BusinessRow) => {
    const reason = window.prompt(`Reason for rejecting ${business.name}'s verification request:`);
    if (!reason) return;
    setBusyId(business.id);
    try {
      await api.post(`/marketplace/admin/businesses/${business.id}/reject-verification`, { reason });
      await load(page);
    } finally {
      setBusyId(null);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState === "forbidden" || loadState === "error") {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load businesses."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Verifications</h1>
      <p className="text-sm text-gray-500 mb-6">Businesses awaiting admin verification.</p>

      {result && result.items.length === 0 ? (
        <p className="text-sm text-gray-500">No businesses awaiting verification.</p>
      ) : (
        result && (
          <>
            <div className="space-y-2">
              {result.items.map((business) => (
                <div key={business.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{business.name}</p>
                    <p className="text-xs text-gray-500">
                      {business.industry} · {business.ownerEmail} · created {dateFormatter.format(new Date(business.createdAt))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === business.id}
                      onClick={() => verify(business.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition disabled:opacity-50"
                    >
                      <CheckCircle2 size={13} />
                      Verify
                    </button>
                    <button
                      type="button"
                      disabled={busyId === business.id}
                      onClick={() => rejectVerification(business)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition disabled:opacity-50"
                    >
                      <XCircle size={13} />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <PaginationControls page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage} />
          </>
        )
      )}
    </div>
  );
}
