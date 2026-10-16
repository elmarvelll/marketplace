// src/app/_components/ProductGrid.tsx
//
// Renders a product list from a LoadState (./use-load.ts) — the four cases are always distinct:
//   loading            -> pulsing skeleton cards in the same grid (no layout jump when products arrive)
//   success, products  -> ProductCards
//   success, none      -> `emptyMessage` (only ever after the backend confirmed zero results)
//   error              -> an error message with a Retry button — never "no products"
// Also exports the same treatment for the "spotlight" lists (vendors, businesses) and the shared error block.

import { AlertCircle, RotateCw } from "lucide-react";
import ProductCard, { ProductCardSkeleton, type ProductCardProduct } from "./ProductCard";
import type { LoadState } from "./use-load";
import type { ProductSearchResult } from "@/types/search";

// GET /api/marketplace/search/products and /vendor/popular-items rows -> card shape.
export const toCardProduct = (p: ProductSearchResult): ProductCardProduct => ({ id: p.id, name: p.name, sellerName: p.sellerName, price: p.price, image: p.secureUrl });

export const PRODUCT_GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6";

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={PRODUCT_GRID_CLASS} role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry, compact = false }: { message: string; onRetry: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={`flex flex-col items-center text-center ${compact ? "py-8" : "py-16"} px-4 bg-white rounded-2xl border border-gray-100`}>
      <AlertCircle size={26} className="text-gray-500 mb-3" aria-hidden />
      <p className="text-sm text-gray-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <RotateCw size={14} aria-hidden /> Try again
      </button>
    </div>
  );
}

export function ProductGrid({
  state,
  onRetry,
  onShowDetails,
  emptyMessage,
  errorMessage = "Couldn't load products. Check your connection and try again.",
  skeletonCount = 8,
}: {
  state: LoadState<ProductCardProduct[]>;
  onRetry: () => void;
  onShowDetails: (id: string) => void;
  emptyMessage: string;
  errorMessage?: string;
  skeletonCount?: number;
}) {
  if (state.status === "loading") return <ProductGridSkeleton count={skeletonCount} />;
  if (state.status === "error") return <LoadError message={errorMessage} onRetry={onRetry} />;
  if (state.data.length === 0) return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  return (
    <div className={PRODUCT_GRID_CLASS}>
      {state.data.map((product) => (
        <ProductCard key={product.id} product={product} onShowDetails={onShowDetails} />
      ))}
    </div>
  );
}

export function SpotlightSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_2px_8px_rgba(16,24,40,0.06)] motion-safe:animate-skeleton">
      <div className="w-14 h-14 rounded-xl bg-gray-300 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded bg-gray-400" />
        <div className="h-3 w-1/2 rounded bg-gray-300" />
      </div>
    </div>
  );
}

// Loading / error / empty / items for a spotlight list; `children` renders the loaded, non-empty items.
export function SpotlightList<T>({
  state,
  onRetry,
  emptyMessage,
  errorMessage,
  className,
  skeletonCount = 3,
  children,
}: {
  state: LoadState<T[]>;
  onRetry: () => void;
  emptyMessage: string;
  errorMessage: string;
  className: string;
  skeletonCount?: number;
  children: (items: T[]) => React.ReactNode;
}) {
  if (state.status === "loading") {
    return (
      <div className={className} role="status" aria-label="Loading">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <SpotlightSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (state.status === "error") return <LoadError message={errorMessage} onRetry={onRetry} compact />;
  if (state.data.length === 0) return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  return <div className={className}>{children(state.data)}</div>;
}
