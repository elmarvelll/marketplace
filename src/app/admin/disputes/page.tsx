// src/app/admin/disputes/page.tsx
//
// Admin Disputes tab: disputed orders with buyer/business/items/amount and
// the full historical OrderEvent trail (not just current state) — see
// services/marketplace/admin/list-disputed-orders.ts. Disputes are opened
// by buyers from src/app/orders/page.tsx.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface DisputeEvent {
  id: string;
  type: string;
  actorType: string;
  message: string | null;
  createdAt: string;
}

interface DisputeItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  deliveryStatus: string | null;
}

interface DisputeRow {
  id: string;
  status: string;
  fulfillmentStatus: string | null;
  deliveryOutcome: string;
  paymentStatus: string;
  totalAmount: number;
  businessName: string;
  buyerEmail: string;
  disputeReason: string | null;
  disputeCreatedAt: string | null;
  disputeResolvedAt: string | null;
  disputeResolution: string | null;
  items: DisputeItem[];
  events: DisputeEvent[];
}

interface DisputePage {
  items: DisputeRow[];
  page: number;
  totalPages: number;
  total: number;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default function AdminDisputesPage() {
  const [result, setResult] = useState<DisputePage | null>(null);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (targetPage: number) => {
    setLoadState("loading");
    try {
      const res = await api.get<DisputePage>("/marketplace/admin/disputes", { params: { page: targetPage } });
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

  const resolve = async (orderId: string) => {
    const resolution = window.prompt("How was this dispute resolved?");
    if (!resolution) return;
    // Only relevant for School Vendor orders with a deliverer assigned —
    // "DELIVERER" withholds that handoff's payment (spec §54/§56); left
    // blank for a Business dispute or any resolution that doesn't
    // implicate the deliverer.
    const responsiblePartyRaw = window.prompt(
      "Who is responsible? Leave blank if not applicable, or enter one of: VENDOR, DELIVERER, BUYER, REJECTED"
    );
    const responsibleParty = ["VENDOR", "DELIVERER", "BUYER", "REJECTED"].includes(responsiblePartyRaw ?? "")
      ? (responsiblePartyRaw as "VENDOR" | "DELIVERER" | "BUYER" | "REJECTED")
      : undefined;
    setBusyId(orderId);
    try {
      await api.post(`/marketplace/admin/disputes/${orderId}/resolve`, { resolution, responsibleParty });
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
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load disputes."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Disputes</h1>

      {result && result.items.length === 0 ? (
        <p className="text-sm text-gray-500">No disputed orders.</p>
      ) : (
        result && (
          <>
            <div className="space-y-2">
              {result.items.map((order) => {
                const expanded = expandedId === order.id;
                const resolved = !!order.disputeResolvedAt;
                return (
                  <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : order.id)}
                      className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          Order #{order.id.slice(0, 8)} · {order.businessName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.buyerEmail} · ₦{nairaFormatter.format(order.totalAmount)} ·{" "}
                          {order.disputeCreatedAt && dateTimeFormatter.format(new Date(order.disputeCreatedAt))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                            resolved ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                          }`}
                        >
                          {resolved ? "Resolved" : "Open"}
                        </span>
                        {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-100 p-4 space-y-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Dispute reason</p>
                          <p className="text-sm text-gray-700">{order.disputeReason}</p>
                        </div>

                        {order.disputeResolution && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Resolution</p>
                            <p className="text-sm text-gray-700">{order.disputeResolution}</p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Order state</p>
                          <p className="text-sm text-gray-700">
                            {order.status} · {order.fulfillmentStatus ?? "—"} · {order.deliveryOutcome} · payment {order.paymentStatus}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Items</p>
                          <div className="space-y-1">
                            {order.items.map((item) => (
                              <p key={item.id} className="text-sm text-gray-700">
                                {item.quantity} x {item.productName} — ₦{nairaFormatter.format(item.price * item.quantity)}
                                {item.deliveryStatus && ` (${item.deliveryStatus})`}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Full history</p>
                          <div className="space-y-1">
                            {order.events.map((event) => (
                              <p key={event.id} className="text-xs text-gray-500">
                                {dateTimeFormatter.format(new Date(event.createdAt))} — {event.type} ({event.actorType})
                                {event.message && ` — ${event.message}`}
                              </p>
                            ))}
                          </div>
                        </div>

                        {!resolved && (
                          <button
                            type="button"
                            disabled={busyId === order.id}
                            onClick={() => resolve(order.id)}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition disabled:opacity-50"
                          >
                            Resolve dispute
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <PaginationControls page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage} />
          </>
        )
      )}
    </div>
  );
}
