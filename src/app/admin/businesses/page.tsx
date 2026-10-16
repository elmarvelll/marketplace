// src/app/admin/businesses/page.tsx
//
// Admin Businesses tab: search, approval/verification/block state,
// approve/reject/block/unblock actions. Blocking is a flag, never a delete
// — see services/marketplace/admin/block-business.ts. Approve/reject is
// the gate a business must clear before it's visible anywhere in the
// marketplace — see services/marketplace/admin/{approve,reject}-business.ts.
// See docs/marketplace/systems/admin-system.md.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, Loader2, Search, ShieldOff, ShieldCheck, Store, XCircle } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface BusinessRow {
  id: string;
  name: string;
  industry: string;
  ownerEmail: string;
  approvalStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rejectionReason: string | null;
  verified: boolean;
  blocked: boolean;
  deliveryRestricted: boolean;
  createdAt: string;
  // School Vendor fields — see docs/marketplace/decisions/vendor-extends-business.md.
  type: "BUSINESS" | "SCHOOL_VENDOR";
  vendorCategory: string | null;
  paused: boolean;
}

interface BusinessPage {
  items: BusinessRow[];
  page: number;
  totalPages: number;
  total: number;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

const FILTERS: { key: "all" | "pending_approval" | "verified" | "blocked"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending_approval", label: "Pending approval" },
  { key: "verified", label: "Verified" },
  { key: "blocked", label: "Blocked" },
];

// Business.type filter, independent of the status filter above (see
// services/marketplace/admin/list-businesses-for-admin.ts's
// BusinessAdminTypeFilter — both narrow the same list together).
const TYPE_FILTERS: { key: "all" | "BUSINESS" | "SCHOOL_VENDOR"; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "BUSINESS", label: "Business" },
  { key: "SCHOOL_VENDOR", label: "School Vendor" },
];

export default function AdminBusinessesPage() {
  const [result, setResult] = useState<BusinessPage | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["key"]>("all");
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = async (targetPage: number, query: string, targetFilter: string, targetType: string) => {
    setLoadState("loading");
    try {
      const res = await api.get<BusinessPage>("/marketplace/admin/businesses", {
        params: {
          page: targetPage,
          q: query || undefined,
          filter: targetFilter === "all" ? undefined : targetFilter,
          type: targetType === "all" ? undefined : targetType,
        },
      });
      setResult(res.data);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load(page, q, filter, typeFilter);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, typeFilter]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    await load(1, q, filter, typeFilter);
  };

  const approve = async (business: BusinessRow) => {
    setBusyId(business.id);
    setActionError("");
    try {
      await api.post(`/marketplace/admin/businesses/${business.id}/approve`);
      await load(page, q, filter, typeFilter);
    } catch (err) {
      setActionError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Approve failed.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (business: BusinessRow) => {
    const reason = window.prompt(`Reason for rejecting ${business.name}:`);
    if (!reason) return;
    setBusyId(business.id);
    setActionError("");
    try {
      await api.post(`/marketplace/admin/businesses/${business.id}/reject`, { reason });
      await load(page, q, filter, typeFilter);
    } catch (err) {
      setActionError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Reject failed.");
    } finally {
      setBusyId(null);
    }
  };

  const block = async (business: BusinessRow) => {
    const reason = window.prompt(`Reason for blocking ${business.name}:`);
    if (!reason) return;
    setBusyId(business.id);
    setActionError("");
    try {
      await api.post(`/marketplace/admin/businesses/${business.id}/block`, { reason });
      await load(page, q, filter, typeFilter);
    } catch (err) {
      setActionError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Block failed.");
    } finally {
      setBusyId(null);
    }
  };

  const unblock = async (business: BusinessRow) => {
    setBusyId(business.id);
    setActionError("");
    try {
      await api.post(`/marketplace/admin/businesses/${business.id}/unblock`);
      await load(page, q, filter, typeFilter);
    } finally {
      setBusyId(null);
    }
  };

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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Businesses</h1>

      <form onSubmit={search} className="flex gap-2 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or industry…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition">
          Search
        </button>
      </form>

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
              filter === f.key ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setTypeFilter(f.key);
              setPage(1);
            }}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-medium transition ${
              typeFilter === f.key ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {actionError && <div className="mb-4 text-sm p-3 rounded-lg text-red-700 bg-red-100">{actionError}</div>}

      {loadState === "loading" && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      )}

      {loadState === "loaded" && result && (
        <>
          {result.items.length === 0 ? (
            <p className="text-sm text-gray-500">No businesses found.</p>
          ) : (
            <div className="space-y-2">
              {result.items.map((business) => (
                <div key={business.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 break-words flex items-center gap-2">
                      {business.name}
                      {business.type === "SCHOOL_VENDOR" && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">School Vendor</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 break-words">
                      {business.vendorCategory ?? business.industry} · {business.ownerEmail} · created {dateFormatter.format(new Date(business.createdAt))}
                    </p>
                    {business.approvalStatus === "REJECTED" && business.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">Rejected: {business.rejectionReason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {business.paused && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Paused</span>}
                    <Link
                      href={`/admin/businesses/${business.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition"
                    >
                      <Store size={13} />
                      View Profile
                    </Link>
                    {business.approvalStatus === "PENDING_APPROVAL" && (
                      <>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Pending approval</span>
                        <button
                          type="button"
                          disabled={busyId === business.id}
                          onClick={() => approve(business)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === business.id}
                          onClick={() => reject(business)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition disabled:opacity-50"
                        >
                          <XCircle size={13} />
                          Reject
                        </button>
                      </>
                    )}
                    {business.approvalStatus === "REJECTED" && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">Rejected</span>
                    )}
                    {business.verified && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">Verified</span>}
                    {business.deliveryRestricted && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Delivery restricted</span>
                    )}
                    {business.blocked ? (
                      <>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">Blocked</span>
                        <button
                          type="button"
                          disabled={busyId === business.id}
                          onClick={() => unblock(business)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition disabled:opacity-50"
                        >
                          <ShieldCheck size={13} />
                          Unblock
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === business.id}
                        onClick={() => block(business)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition disabled:opacity-50"
                      >
                        <ShieldOff size={13} />
                        Block
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <PaginationControls page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
