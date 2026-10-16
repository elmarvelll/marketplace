// src/app/vendor-dashboard/[id]/sides/page.tsx
//
// The vendor dashboard's Sides tab (spec §9: sides are universal,
// vendor-level add-ons, never tied to one product, so they get their own
// management surface rather than living inside product create/edit).
// Moved here (not duplicated) from business/[id]/sides — it was always
// vendor-only, it just lived in the wrong dashboard tree; see
// docs/marketplace/decisions/vendor-independent-architecture.md.
// GET/POST /marketplace/vendor/[id]/sides, PATCH/DELETE
// .../sides/[sideId] — see services/marketplace/vendor/side/side.service.ts.

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, ArrowLeft, Loader2, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import api from "@/lib/axios";

interface Side {
  id: string;
  name: string;
  price: number;
  available: boolean;
  stock: number | null;
}

type LoadState = "loading" | "loaded" | "error";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

export default function VendorSidesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [sides, setSides] = useState<Side[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoadState("loading");
    try {
      const res = await api.get<{ sides: Side[] }>(`/marketplace/vendor/${id}/sides`);
      setSides(res.data.sides);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim() || !price.trim()) {
      setFormError("Name and price are required.");
      return;
    }
    setCreating(true);
    try {
      await api.post(`/marketplace/vendor/${id}/sides`, {
        name: name.trim(),
        price: Number(price),
        stock: stock.trim() ? Number(stock) : null,
      });
      setName("");
      setPrice("");
      setStock("");
      await load();
    } catch (err) {
      setFormError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't create this side.");
    } finally {
      setCreating(false);
    }
  };

  const toggleAvailable = async (side: Side) => {
    setBusyId(side.id);
    try {
      await api.patch(`/marketplace/vendor/${id}/sides/${side.id}`, { available: !side.available });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (sideId: string) => {
    setBusyId(sideId);
    try {
      await api.delete(`/marketplace/vendor/${id}/sides/${sideId}`);
      setSides((current) => current.filter((s) => s.id !== sideId));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Link
        href={`/vendor-dashboard/${id}/products`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition mb-6"
      >
        <ArrowLeft size={16} />
        Back to Products
      </Link>

      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <UtensilsCrossed size={22} className="text-purple-600" />
        Sides
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Universal add-ons buyers can order alongside any product, or on their own — not tied to a specific item.
      </p>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Add a side</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1.5" htmlFor="sideName">
              Name
            </label>
            <input
              id="sideName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creating}
              placeholder="e.g. Fries"
              className="w-full px-3 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5" htmlFor="sidePrice">
              Price (₦)
            </label>
            <input
              id="sidePrice"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={creating}
              placeholder="500"
              className="w-full px-3 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5" htmlFor="sideStock">
              Stock <span className="text-gray-500 font-normal">(optional — blank = unlimited)</span>
            </label>
            <input
              id="sideStock"
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              disabled={creating}
              placeholder="Unlimited"
              className="w-full px-3 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition disabled:opacity-60"
            />
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button
          type="submit"
          disabled={creating}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition disabled:opacity-50"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? "Adding…" : "Add side"}
        </button>
      </form>

      {loadState === "loading" && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      )}

      {loadState === "error" && (
        <div className="flex flex-col items-center text-center py-16">
          <AlertCircle size={24} className="text-gray-500 mb-3" />
          <p className="text-gray-500">Couldn&apos;t load your sides.</p>
        </div>
      )}

      {loadState === "loaded" && sides.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">No sides yet — add one above.</p>
      )}

      {loadState === "loaded" && sides.length > 0 && (
        <div className="space-y-2">
          {sides.map((side) => (
            <div key={side.id} className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 p-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{side.name}</p>
                <p className="text-xs text-gray-500">
                  ₦{nairaFormatter.format(side.price)} · {side.stock === null ? "Unlimited stock" : `${side.stock} in stock`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === side.id}
                  onClick={() => toggleAvailable(side)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition disabled:opacity-50 ${
                    side.available ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {side.available ? "Available" : "Unavailable"}
                </button>
                <button
                  type="button"
                  disabled={busyId === side.id}
                  onClick={() => handleDelete(side.id)}
                  aria-label={`Delete ${side.name}`}
                  className="text-gray-500 hover:text-red-500 transition disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
