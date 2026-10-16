// src/app/admin/events/page.tsx
//
// Admin Events tab: the cross-order OrderEvent feed, most recent first —
// business name and seller name shown directly (not just IDs), per spec.
// Historical by construction, since OrderEvent rows are append-only. See
// services/marketplace/admin/list-order-events.ts.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface EventRow {
  id: string;
  orderId: string;
  type: string;
  actorType: string;
  message: string | null;
  createdAt: string;
  businessName: string;
  sellerName: string;
  buyerEmail: string;
}

interface EventPage {
  items: EventRow[];
  page: number;
  totalPages: number;
  total: number;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default function AdminEventsPage() {
  const [result, setResult] = useState<EventPage | null>(null);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");

  useEffect(() => {
    const run = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<EventPage>("/marketplace/admin/events", { params: { page } });
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
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load events."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Events</h1>

      {result && result.items.length === 0 ? (
        <p className="text-sm text-gray-500">No events found.</p>
      ) : (
        result && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Seller</th>
                      <th className="px-4 py-3">Buyer</th>
                      <th className="px-4 py-3">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((event) => (
                      <tr key={event.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 text-gray-500">#{event.orderId.slice(0, 8)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{event.type}</td>
                        <td className="px-4 py-3 text-gray-500">{event.actorType}</td>
                        <td className="px-4 py-3 text-gray-700">{event.businessName}</td>
                        <td className="px-4 py-3 text-gray-700">{event.sellerName}</td>
                        <td className="px-4 py-3 text-gray-500">{event.buyerEmail}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{dateTimeFormatter.format(new Date(event.createdAt))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <PaginationControls page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage} />
          </>
        )
      )}
    </div>
  );
}
