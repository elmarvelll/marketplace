// src/app/admin/fines/page.tsx
//
// Admin Fines tab: who was fined, why (late delivery), how much, and the
// real, server-verified Paystack payment status/reference. See
// services/marketplace/admin/list-fines.ts.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface FineRow {
  id: string;
  orderId: string | null;
  businessName: string;
  ownerEmail: string;
  amount: number;
  status: string;
  paystackReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface FinePage {
  items: FineRow[];
  page: number;
  totalPages: number;
  total: number;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default function AdminFinesPage() {
  const [result, setResult] = useState<FinePage | null>(null);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");

  useEffect(() => {
    const run = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<FinePage>("/marketplace/admin/fines", { params: { page } });
        setResult(res.data);
        setLoadState("loaded");
      } catch (err) {
        setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
      }
    };
    run();
  }, [page]);

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
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load fines."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Fines</h1>

      {result && result.items.length === 0 ? (
        <p className="text-sm text-gray-500">No fines found.</p>
      ) : (
        result && (
          <>
            <div className="space-y-2">
              {result.items.map((fine) => (
                <div key={fine.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{fine.businessName}</p>
                    <p className="text-xs text-gray-500">
                      {fine.ownerEmail}
                      {fine.orderId && ` · Order #${fine.orderId.slice(0, 8)}`} · issued {dateTimeFormatter.format(new Date(fine.createdAt))}
                    </p>
                    {fine.status === "PAID" && fine.paidAt && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Paid {dateTimeFormatter.format(new Date(fine.paidAt))}
                        {fine.paystackReference && ` · ref ${fine.paystackReference}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">₦{nairaFormatter.format(fine.amount)}</span>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        fine.status === "PAID" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {fine.status}
                    </span>
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
