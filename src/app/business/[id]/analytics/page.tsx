// src/app/business/[id]/analytics/page.tsx
//
// The business dashboard's Analytics tab — revenue, profit, orders,
// products, all computed server-side in GET /api/marketplace/businesses/[id]
// from real Order/Product rows (see that route). Zero until a checkout flow
// exists, which is accurate rather than faked.

"use client";

import { use } from "react";
import { AlertCircle, Loader2, Package, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { useBusinessDetail } from "../../_components/useBusinessDetail";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

function StatCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_8px_rgba(16,24,40,0.06)]">
      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
        <Icon size={18} />
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

export default function BusinessAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { business, loadState } = useBusinessDetail(id);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState !== "loaded" || !business) {
    return (
      <div className="flex flex-col items-center text-center py-24">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">Couldn&apos;t load analytics for this business.</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Analytics</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Wallet} label="Overall revenue" value={`₦${nairaFormatter.format(business.stats.revenue)}`} />
        <StatCard icon={TrendingUp} label="Overall profit" value={`₦${nairaFormatter.format(business.stats.profit)}`} />
        <StatCard icon={ShoppingBag} label="Orders" value={String(business.stats.orderCount)} />
        <StatCard icon={Package} label="Products" value={String(business.stats.productCount)} />
      </div>

      <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5">
        <p className="text-xs text-gray-500 mb-1">Delivery days</p>
        <p className="text-sm font-medium text-gray-900">
          {business.deliveryDays && business.deliveryDays.length > 0
            ? business.deliveryDays.join(", ")
            : "Not set up yet — see the Business Profile tab."}
        </p>
      </div>
    </>
  );
}
