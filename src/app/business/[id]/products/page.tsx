// src/app/business/[id]/products/page.tsx
//
// The business dashboard's Products tab — every product for this business
// (GET .../products), a "Create Product" button, and per-product
// "Update Inventory"/delete controls (see ../../_components/DashboardProductCard.tsx).
// Business-only — School Vendor product/side management has its own,
// separate dashboard tree (see
// src/app/vendor-dashboard/[id]/) and its own
// API routes, per
// docs/marketplace/decisions/vendor-independent-architecture.md.

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Package, Plus } from "lucide-react";
import { ProductGridSkeleton } from "@/app/_components/ProductGrid";
import api from "@/lib/axios";
import DashboardProductCard from "../../_components/DashboardProductCard";
import type { ProductSummary } from "@/types/product";

type LoadState = "loading" | "loaded" | "error";

export default function BusinessProductsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<{ products: ProductSummary[] }>(`/marketplace/businesses/${id}/products`);
        if (cancelled) return;
        setProducts(res.data.products);
        setLoadState("loaded");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async (productId: string) => {
    await api.delete(`/marketplace/businesses/${id}/products/${productId}`);
    setProducts((current) => current.filter((p) => p.id !== productId));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Products</h1>
        <Link
          href={`/business/${id}/products/create`}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
        >
          <Plus size={16} />
          Create Product
        </Link>
      </div>

      {loadState === "loading" && <ProductGridSkeleton count={8} />}

      {loadState === "error" && (
        <div className="flex flex-col items-center text-center py-24">
          <AlertCircle size={28} className="text-gray-500 mb-3" />
          <p className="text-gray-500">Couldn&apos;t load your products. Please try again.</p>
        </div>
      )}

      {loadState === "loaded" && products.length === 0 && (
        <div className="flex flex-col items-center text-center py-24 bg-white rounded-2xl border border-gray-100">
          <Package size={28} className="text-gray-400 mb-3" />
          <p className="text-gray-500 mb-4">You haven&apos;t added any products yet.</p>
          <Link
            href={`/business/${id}/products/create`}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
          >
            Create your first product
          </Link>
        </div>
      )}

      {loadState === "loaded" && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((product) => (
            <DashboardProductCard
              key={product.id}
              product={product}
              editHref={`/business/${id}/products/${product.id}/edit`}
              onDelete={() => handleDelete(product.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
