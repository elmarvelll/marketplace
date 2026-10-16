// src/app/admin/reports/page.tsx
//
// Admin Reports tab: which business was reported, why, by whom, when, and
// whether it's been reviewed. Reports are created by buyers from the
// product detail modal's "Report business" action. See
// services/marketplace/admin/list-reports.ts.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface ReportRow {
  id: string;
  businessId: string;
  businessName: string;
  reporterEmail: string;
  reason: string;
  status: string;
  reviewedAt: string | null;
  createdAt: string;
}

interface ReportPage {
  items: ReportRow[];
  page: number;
  totalPages: number;
  total: number;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default function AdminReportsPage() {
  const [result, setResult] = useState<ReportPage | null>(null);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (targetPage: number) => {
    setLoadState("loading");
    try {
      const res = await api.get<ReportPage>("/marketplace/admin/reports", { params: { page: targetPage } });
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

  const review = async (reportId: string) => {
    setBusyId(reportId);
    try {
      await api.post(`/marketplace/admin/reports/${reportId}/review`);
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
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load reports."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports</h1>

      {result && result.items.length === 0 ? (
        <p className="text-sm text-gray-500">No reported businesses.</p>
      ) : (
        result && (
          <>
            <div className="space-y-2">
              {result.items.map((report) => (
                <div key={report.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{report.businessName}</p>
                    <p className="text-sm text-gray-700 mt-1">{report.reason}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Reported by {report.reporterEmail} · {dateTimeFormatter.format(new Date(report.createdAt))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {report.status === "REVIEWED" ? (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700">Reviewed</span>
                    ) : (
                      <>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Pending</span>
                        <button
                          type="button"
                          disabled={busyId === report.id}
                          onClick={() => review(report.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} />
                          Mark reviewed
                        </button>
                      </>
                    )}
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
