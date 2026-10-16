// src/app/business/_components/DashboardProductCard.tsx
//
// One product row on the Products tab's list — distinct from the
// marketplace-facing ProductCard (../../_components/ProductCard.tsx),
// which has no owner controls. "Update Inventory" links to the edit page;
// Delete asks for confirmation, then calls the parent's onDeleted.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { ProductSummary } from "@/types/product";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

interface DashboardProductCardProps {
  product: ProductSummary;
  editHref: string;
  onDelete: () => Promise<void>;
}

export default function DashboardProductCard({ product, editHref, onDelete }: DashboardProductCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-[0_2px_8px_rgba(16,24,40,0.06)]">
      <div className="relative w-full aspect-square bg-gray-100">
        {product.secureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, not worth a remotePatterns entry here
          <img src={product.secureUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No image</div>
        )}
      </div>
      <div className="p-4 space-y-1">
        <h3 className="font-semibold text-gray-900 text-sm truncate">{product.name}</h3>
        <p className="text-xs text-gray-500">{product.category}</p>
        <p className="font-bold text-blue-600">₦{nairaFormatter.format(product.price)}</p>
        <p className="text-xs text-gray-500">
          {product.stock} in stock
          {product.variants.length > 0 && ` · ${product.variants.length} variant option${product.variants.length > 1 ? "s" : ""}`}
        </p>

        <div className="flex items-center gap-2 pt-3">
          <Link
            href={editHref}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Pencil size={13} />
            Update Inventory
          </Link>

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Delete product"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-2.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition disabled:opacity-60"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="px-2.5 py-2 rounded-lg border border-gray-300 text-xs text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
