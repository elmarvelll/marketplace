// src/app/admin/users/page.tsx
//
// Admin Users tab: search, view, and grant/revoke admin access. `isAdmin`
// is independent of `role` — a student, faculty, admin, or super_admin
// account can independently also be an admin (see
// docs/admin/decisions/admin-flag-replaces-role-check.md). The change
// itself is entirely server-side (services/marketplace/admin/{promote-user-to-admin,revoke-admin}.ts)
// — this page only ever sends a target user id, never a role/flag value.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2, Search, ShieldCheck, ShieldOff, UserRound } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  blocked: boolean;
  isAdmin: boolean;
  createdAt: string;
}

interface UserPage {
  items: UserRow[];
  page: number;
  totalPages: number;
  total: number;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

export default function AdminUsersPage() {
  const [result, setResult] = useState<UserPage | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = async (targetPage: number, query: string) => {
    setLoadState("loading");
    try {
      const res = await api.get<UserPage>("/marketplace/admin/users", { params: { page: targetPage, q: query || undefined } });
      setResult(res.data);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load(page, q);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    await load(1, q);
  };

  const grantAdmin = async (user: UserRow) => {
    if (!window.confirm(`Grant admin access to ${user.firstName} ${user.lastName} (${user.email})?`)) return;
    setBusyId(user.id);
    setActionError("");
    try {
      await api.post(`/marketplace/admin/users/${user.id}/promote`);
      await load(page, q);
    } catch (err) {
      setActionError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't grant admin access.");
    } finally {
      setBusyId(null);
    }
  };

  const revokeAdmin = async (user: UserRow) => {
    if (!window.confirm(`Remove admin access from ${user.firstName} ${user.lastName} (${user.email})?`)) return;
    setBusyId(user.id);
    setActionError("");
    try {
      await api.post(`/marketplace/admin/users/${user.id}/revoke-admin`);
      await load(page, q);
    } catch (err) {
      setActionError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't remove admin access.");
    } finally {
      setBusyId(null);
    }
  };

  if (loadState === "forbidden" || loadState === "error") {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load users."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Users</h1>

      <form onSubmit={search} className="flex gap-2 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition">
          Search
        </button>
      </form>

      {actionError && <div className="mb-4 text-sm p-3 rounded-lg text-red-700 bg-red-100">{actionError}</div>}

      {loadState === "loading" && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      )}

      {loadState === "loaded" && result && (
        <>
          {result.items.length === 0 ? (
            <p className="text-sm text-gray-500">No users found.</p>
          ) : (
            <div className="space-y-2">
              {result.items.map((user) => (
                <div key={user.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 break-words">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500 break-words">
                      {user.email} · joined {dateFormatter.format(new Date(user.createdAt))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {user.blocked && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">Blocked</span>}
                    {user.isAdmin && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">Admin</span>}
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition"
                    >
                      <UserRound size={13} />
                      View Profile
                    </Link>
                    {user.isAdmin ? (
                      <button
                        type="button"
                        disabled={busyId === user.id}
                        onClick={() => revokeAdmin(user)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition disabled:opacity-50"
                      >
                        <ShieldOff size={13} />
                        Remove admin
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === user.id}
                        onClick={() => grantAdmin(user)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition disabled:opacity-50"
                      >
                        <ShieldCheck size={13} />
                        Grant admin
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
