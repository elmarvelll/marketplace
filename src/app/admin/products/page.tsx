// src/app/admin/products/page.tsx
//
// Admin "all products" view — grouped by business, literally: each page
// of results is a page of businesses (only ones with products), with that
// business's full product list rendered underneath its name. Search
// matches either a business name or a product name. Backed by
// GET /marketplace/admin/products — see
// services/marketplace/admin/list-products-for-admin.ts. Deliberately no
// approvalStatus gate — admins need to see products from pending/rejected
// businesses too, unlike the buyer-facing search.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2, Search, Store } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";
import type { ProductSummary } from "@/types/product";

interface AdminProductGroup {
  businessId: string;
  businessName: string;
  businessApprovalStatus: string;
  products: ProductSummary[];
}

interface ProductGroupPage {
  items: AdminProductGroup[];
  page: number;
  totalPages: number;
  total: number;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

export default function AdminProductsPage() {
  const [result, setResult] = useState<ProductGroupPage | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");

  const load = async (targetPage: number, query: string) => {
    setLoadState("loading");
    try {
      const res = await api.get<ProductGroupPage>("/marketplace/admin/products", { params: { page: targetPage, q: query || undefined } });
      setResult(res.data);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load(page, q);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    await load(1, q);
  };

  if (loadState === "forbidden" || loadState === "error") {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load products."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Products</h1>

      <form onSubmit={search} className="flex gap-2 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product or business…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition">
          Search
        </button>
      </form>

      {loadState === "loading" && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      )}

      {loadState === "loaded" && result && (
        <>
          {result.items.length === 0 ? (
            <p className="text-sm text-gray-500">No products found.</p>
          ) : (
            <div className="space-y-6">
              {result.items.map((group) => (
                <div key={group.businessId}>
                  <div className="flex flex-wrap items-center gap-2 mb-2.5">
                    <Store size={14} className="text-gray-500 shrink-0" />
                    <Link
                      href={`/admin/businesses/${group.businessId}`}
                      className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition truncate max-w-[16rem]"
                    >
                      {group.businessName}
                    </Link>
                    {group.businessApprovalStatus !== "APPROVED" && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        {group.businessApprovalStatus.replace("_", " ")}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">· {group.products.length} product(s)</span>
                  </div>

                  <div className="space-y-2">
                    {group.products.map((product) => (
                      <Link
                        key={product.id}
                        href={`/admin/products/${product.id}`}
                        className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 hover:border-blue-200 transition"
                      >
                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                          {product.secureUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL
                            <img src={product.secureUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500">
                            {product.category} · ₦{nairaFormatter.format(product.price)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              product.stock > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                            }`}
                          >
                            {product.stock > 0 ? "In stock" : "Out of stock"}
                          </span>
                          {product.variants.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">{product.variants.length} variant(s)</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <PaginationControls page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
