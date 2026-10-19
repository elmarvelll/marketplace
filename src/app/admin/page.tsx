// src/app/admin/page.tsx
//
// Admin Dashboard home — the Overview stat cards. Chrome (navbar + admin
// tab menu) comes from ./layout.tsx; every admin API call is still gated
// server-side by requireAdmin() regardless of how this URL is reached.
// See docs/marketplace/systems/admin-system.md.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2, Users, Building2, Sparkles, Truck, PackageSearch, PackageCheck, Settings, ClipboardList, CalendarDays } from "lucide-react";
import api from "@/lib/axios";
import { SKILLS_ENABLED } from "@/app/_components/marketplace-features";

interface OverviewStats {
  userCount: number;
  businessCount: number;
  skillOwnersComingSoon: boolean;
}

const numberFormatter = new Intl.NumberFormat("en-NG");

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");

  useEffect(() => {
    const run = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<OverviewStats>("/marketplace/admin/overview");
        setStats(res.data);
        setLoadState("loaded");
      } catch (err) {
        setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
      }
    };
    run();
  }, []);

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
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load overview."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      <div className={`grid grid-cols-1 ${SKILLS_ENABLED ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4 mb-10`}>
        <StatCard icon={Users} label="Users" value={numberFormatter.format(stats!.userCount)} />
        <StatCard icon={Building2} label="Businesses" value={numberFormatter.format(stats!.businessCount)} />
        {/* Skills is hidden in the standalone Marketplace (src/app/_components/marketplace-features.ts). */}
        {SKILLS_ENABLED && <StatCard icon={Sparkles} label="Skill Owners" value="Coming Soon" muted />}
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Related tools</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/admin/deliverers"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-200 transition"
        >
          <Truck size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Deliverer applications</p>
            <p className="text-xs text-gray-500">Approve, reject, or suspend deliverers.</p>
          </div>
        </Link>
        <Link
          href="/admin/delivery-roster"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-200 transition"
        >
          <CalendarDays size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Delivery roster</p>
            <p className="text-xs text-gray-500">Weekly deliverer schedule and delivery limits per slot.</p>
          </div>
        </Link>
        <Link
          href="/admin/deliveries"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-200 transition"
        >
          <PackageSearch size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Assign deliveries</p>
            <p className="text-xs text-gray-500">Delivery coordinator assignment.</p>
          </div>
        </Link>
        <Link
          href="/admin/dropoffs"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-200 transition"
        >
          <PackageCheck size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Drop-offs</p>
            <p className="text-xs text-gray-500">Receive sellers waiting at the drop-off point.</p>
          </div>
        </Link>
        <Link
          href="/admin/settings"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-200 transition"
        >
          <Settings size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Settings</p>
            <p className="text-xs text-gray-500">Drop-off/handoff windows and drop-off location.</p>
          </div>
        </Link>
        <Link
          href="/admin/deliverers/assignments"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-200 transition"
        >
          <ClipboardList size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Deliverer assignments</p>
            <p className="text-xs text-gray-500">See what&apos;s assigned to each deliverer, re-read pickup codes.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, muted }: { icon: typeof Users; label: string; value: string; muted?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 text-gray-500 mb-2">
        <Icon size={16} />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${muted ? "text-gray-500" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
