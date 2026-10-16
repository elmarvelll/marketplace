// src/app/admin/users/[userId]/page.tsx
//
// Admin "View Profile" for one user — safe fields only (never
// password/tokens, see services/marketplace/admin/get-user-detail.ts's own
// comment), plus the businesses they own, each linking to the admin
// Business Profile page. Backed by GET /marketplace/admin/users/[userId],
// which already existed but was unused before this.

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, ArrowLeft, Ban, Loader2, Store } from "lucide-react";
import api from "@/lib/axios";

interface AdminUserDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
  blocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  accountSource: "akadverse" | "marketplace";
  location: string | null;
  createdAt: string;
  businesses: { id: string; name: string; approvalStatus: string }[];
  businessCount: number;
  orderCount: number;
  delivererStatus: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

export default function AdminUserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "not-found" | "error">("loading");

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");

  // Block / unblock this account. A block signs the user out everywhere immediately (the server re-checks every
  // request) and emails them the reason; see services/marketplace/admin/block-user.ts.
  const setBlocked = async (block: boolean) => {
    if (acting || !user) return;
    let reason = "";
    if (block) {
      reason = window.prompt("Reason for blocking this account (the user will be emailed this reason):")?.trim() ?? "";
      if (!reason) return;
    } else if (!window.confirm("Unblock this account? The user will be able to sign in again.")) {
      return;
    }
    setActing(true);
    setActionError("");
    try {
      await api.post(`/marketplace/admin/users/${userId}/${block ? "block" : "unblock"}`, block ? { reason } : {});
      const res = await api.get<{ user: AdminUserDetail }>(`/marketplace/admin/users/${userId}`);
      setUser(res.data.user);
    } catch (err) {
      setActionError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "That action failed.");
    } finally {
      setActing(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<{ user: AdminUserDetail }>(`/marketplace/admin/users/${userId}`);
        setUser(res.data.user);
        setLoadState("loaded");
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 403) setLoadState("forbidden");
        else if (isAxiosError(err) && err.response?.status === 404) setLoadState("not-found");
        else setLoadState("error");
      }
    };
    run();
  }, [userId]);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState !== "loaded" || !user) {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">
          {loadState === "forbidden"
            ? "Admin access required."
            : loadState === "not-found"
              ? "This user doesn't exist."
              : "Couldn't load this user."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition mb-6"
      >
        <ArrowLeft size={16} />
        Back to Users
      </Link>

      <div className="flex flex-wrap items-start gap-4 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
          {user.firstName.slice(0, 1).toUpperCase()}
          {user.lastName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-sm text-gray-500 break-words">{user.email}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
              {user.accountSource === "akadverse" ? "AkadVerse account" : "Marketplace account"}
            </span>
            {user.blocked && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">Blocked</span>}
            {user.isAdmin && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">Admin</span>}
            {user.delivererStatus && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-600">
                Deliverer: {user.delivererStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">Account access</h2>
            <p className="text-sm text-gray-600 break-words">
              {user.blocked
                ? `Blocked${user.blockedAt ? ` on ${dateFormatter.format(new Date(user.blockedAt))}` : ""}${user.blockedReason ? ` — ${user.blockedReason}` : ""}`
                : "This account can sign in and use the Marketplace."}
            </p>
          </div>
          <button
            type="button"
            disabled={acting}
            onClick={() => setBlocked(!user.blocked)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              user.blocked ? "border border-gray-300 text-gray-700 hover:bg-gray-50" : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {acting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Ban size={14} aria-hidden />}
            {user.blocked ? "Unblock account" : "Block account"}
          </button>
        </div>
        {actionError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{actionError}</p>}
      </section>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Businesses</p>
          <p className="text-xl font-bold text-gray-900">{user.businessCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Orders placed</p>
          <p className="text-xl font-bold text-gray-900">{user.orderCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Joined</p>
          <p className="text-xl font-bold text-gray-900">{dateFormatter.format(new Date(user.createdAt))}</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Profile</h2>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 mb-1">Location</dt>
            <dd className="text-gray-900">{user.location || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-1">Deliverer status</dt>
            <dd className="text-gray-900">{user.delivererStatus || "Hasn't applied"}</dd>
          </div>
        </dl>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Store size={16} className="text-gray-500" />
          Businesses
        </h2>
        {user.businesses.length === 0 ? (
          <p className="text-sm text-gray-500">This user hasn&apos;t registered a business.</p>
        ) : (
          <div className="space-y-2">
            {user.businesses.map((business) => (
              <Link
                key={business.id}
                href={`/admin/businesses/${business.id}`}
                className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-blue-200 transition"
              >
                <p className="text-sm font-medium text-gray-900">{business.name}</p>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    business.approvalStatus === "APPROVED"
                      ? "bg-green-50 text-green-700"
                      : business.approvalStatus === "REJECTED"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {business.approvalStatus.replace("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
