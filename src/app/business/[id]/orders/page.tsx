// src/app/business/[id]/orders/page.tsx
//
// The business dashboard's Orders tab — the seller order system's five
// sections (Pending / Accepted-Processing / Ready for Pickup / Completed /
// Rejected), with the accept/reject/ready/drop-off actions and the
// drop-off deadline + late-delivery fine banner. See
// docs/marketplace/systems/seller-order-system.md and
// docs/marketplace/systems/seller-response-system.md.

"use client";

import { use, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, AlertTriangle, Loader2, ShoppingBag } from "lucide-react";
import api from "@/lib/axios";
import type { BusinessOrderSummary } from "@/types/order";
import DropoffActionPanel, { type DropoffPoint } from "../../_components/DropoffActionPanel";
import type { SellerOrderSection } from "@/services/marketplace/order/seller-order-sections.service";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

type LoadState = "loading" | "loaded" | "error";

interface Fine {
  id: string;
  orderId: string | null;
  amount: number;
  status: string;
}

type MarketplaceSettingsDto = DropoffPoint;

const SECTIONS: { key: SellerOrderSection; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "accepted_processing", label: "Accepted / Processing" },
  { key: "ready_for_pickup", label: "Ready for Pickup" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
];

export default function BusinessOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [orders, setOrders] = useState<BusinessOrderSummary[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [deliveryRestricted, setDeliveryRestricted] = useState(false);
  const [settings, setSettings] = useState<MarketplaceSettingsDto | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [activeSection, setActiveSection] = useState<SellerOrderSection>("pending");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = async () => {
    setLoadState("loading");
    try {
      const [ordersRes, finesRes, settingsRes] = await Promise.all([
        api.get<{ orders: BusinessOrderSummary[] }>(`/marketplace/businesses/${id}/orders`),
        api.get<{ fines: Fine[]; deliveryRestricted: boolean }>(`/marketplace/businesses/${id}/fines`),
        api.get<MarketplaceSettingsDto>("/marketplace/settings"),
      ]);
      setOrders(ordersRes.data.orders);
      setFines(finesRes.data.fines.filter((f) => f.status === "PENDING"));
      setDeliveryRestricted(finesRes.data.deliveryRestricted);
      setSettings(settingsRes.data);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  };

  useEffect(() => {
    // Locally-defined wrapper — same convention as
    // src/app/_components/useCart.ts.
    const run = async () => {
      await load();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const runAction = async (orderId: string, action: () => Promise<unknown>) => {
    setBusyOrderId(orderId);
    setActionError("");
    try {
      await action();
      await load();
    } catch (err) {
      const message = (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "That action failed.";
      setActionError(message);
    } finally {
      setBusyOrderId(null);
    }
  };

  const accept = (orderId: string) => runAction(orderId, () => api.post(`/marketplace/businesses/${id}/orders/${orderId}/accept`));
  const reject = (orderId: string) => {
    const reason = window.prompt("Reason for rejecting this order:");
    if (!reason) return;
    return runAction(orderId, () => api.post(`/marketplace/businesses/${id}/orders/${orderId}/reject`, { reason }));
  };
  const markReady = (orderId: string) => runAction(orderId, () => api.post(`/marketplace/businesses/${id}/orders/${orderId}/ready`));
  const confirmDropoff = (orderId: string) => runAction(orderId, () => api.post(`/marketplace/businesses/${id}/orders/${orderId}/drop-off`));

  const payFine = async (fineId: string) => {
    // A full Paystack popup flow lives in the checkout page
    // (src/app/checkout/page.tsx) — this reuses
    // the same initialize/verify pattern at a smaller scale. Kept inline
    // rather than factored into a shared hook given it's the only other
    // Paystack payment flow in the app right now.
    const res = await api.post<{ reference: string; amountKobo: number; publicKey?: string | null }>(`/marketplace/businesses/${id}/fines/${fineId}/initialize`);
    const PaystackPop = (window as unknown as { PaystackPop?: { setup: (opts: Record<string, unknown>) => { openIframe: () => void } } }).PaystackPop;
    if (!PaystackPop) {
      window.alert("Payment couldn't start — please refresh and try again.");
      return;
    }
    PaystackPop.setup({
      // Server-chosen key (same test/live mode it verifies in).
      key: res.data.publicKey || process.env.NEXT_PUBLIC_PAYSTACK_KEY,
      email: undefined,
      amount: res.data.amountKobo,
      ref: res.data.reference,
      callback: () => {
        api.post(`/marketplace/businesses/${id}/fines/${fineId}/verify`, { reference: res.data.reference }).then(load);
      },
    }).openIframe();
  };

  const sectionOrders = orders.filter((order) => order.section === activeSection);

  return (
    <>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Orders</h1>

      {deliveryRestricted && fines.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>
              Delivery is restricted for this business due to {fines.length} unpaid late-delivery fine
              {fines.length > 1 ? "s" : ""} (₦{nairaFormatter.format(fines.reduce((sum, f) => sum + f.amount, 0))} total).
            </span>
          </div>
          <button
            type="button"
            onClick={() => payFine(fines[0].id)}
            className="shrink-0 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition"
          >
            Pay fine
          </button>
        </div>
      )}

      {loadState !== "error" && <DropoffActionPanel orders={orders} point={settings} busyOrderId={busyOrderId} onRequestCode={confirmDropoff} />}

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5">
        {SECTIONS.map((section) => {
          const count = orders.filter((o) => o.section === section.key).length;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
                activeSection === section.key ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {section.label} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {actionError && <div className="mb-4 text-sm p-3 rounded-lg text-red-700 bg-red-100">{actionError}</div>}

      {loadState === "loading" && (
        <div className="flex justify-center py-24">
          <Loader2 size={28} className="animate-spin text-gray-500" />
        </div>
      )}

      {loadState === "error" && (
        <div className="flex flex-col items-center text-center py-24">
          <AlertCircle size={28} className="text-gray-500 mb-3" />
          <p className="text-gray-500">Couldn&apos;t load orders. Please try again.</p>
        </div>
      )}

      {loadState === "loaded" && sectionOrders.length === 0 && (
        <div className="flex flex-col items-center text-center py-24 bg-white rounded-2xl border border-gray-100">
          <ShoppingBag size={28} className="text-gray-400 mb-3" />
          <p className="text-gray-500">Nothing here yet.</p>
        </div>
      )}

      {loadState === "loaded" && sectionOrders.length > 0 && (
        <div className="space-y-3">
          {sectionOrders.map((order) => (
            <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-gray-900">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">{dateFormatter.format(new Date(order.createdAt))} · {order.itemCount} item(s)</p>
                </div>
                <p className="font-semibold text-gray-900">₦{nairaFormatter.format(order.totalAmount)}</p>
              </div>

              {order.rejectionReason && (
                <p className="text-sm text-red-600 mb-3">Reason: {order.rejectionReason}</p>
              )}

              {order.estimatedDeliveryAt && activeSection !== "pending" && activeSection !== "rejected" && (
                <div className="text-xs text-gray-500 mb-3 space-y-0.5">
                  <p>
                    Estimated delivery:{" "}
                    {new Date(order.estimatedDeliveryAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    {order.deliveryWindowStart && order.deliveryWindowEnd && (
                      <>
                        {" · "}
                        {new Date(order.deliveryWindowStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        {" – "}
                        {new Date(order.deliveryWindowEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </>
                    )}
                  </p>
                  {activeSection === "accepted_processing" && order.dropoffDeadline && (
                    <p className={order.missedDropoffDeadline ? "text-red-600 font-medium" : ""}>
                      Drop-off deadline: {dateFormatter.format(new Date(order.dropoffDeadline))}
                      {order.missedDropoffDeadline && " — missed"}
                    </p>
                  )}
                </div>
              )}

              <ul className="text-sm text-gray-600 space-y-1 mb-3">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {item.quantity} x {item.productName}
                    </span>
                    <span className="text-gray-500 shrink-0">{item.deliveryStatus ?? (item.rejectedAt ? "Rejected" : "—")}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                {activeSection === "pending" && (
                  <>
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => accept(order.id)}
                      className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => reject(order.id)}
                      className="px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {activeSection === "accepted_processing" && order.fulfillmentStatus === "PROCESSING" && (
                  <button
                    type="button"
                    disabled={busyOrderId === order.id}
                    onClick={() => markReady(order.id)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50"
                  >
                    Mark ready
                  </button>
                )}
                {activeSection === "ready_for_pickup" && (
                  <span className="text-xs text-gray-500 py-2">
                    {order.coordinatorReceivedAt ? "Received by Delivery Coordinator." : "Drop-off steps for this order are in the panel at the top of this page."}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
