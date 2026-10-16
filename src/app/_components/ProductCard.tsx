// src/app/_components/ProductCard.tsx
//
// Product listing card — image / name / seller / price. The WHOLE card is one button that opens
// ProductDetailModal.tsx (rendered by whichever page uses this card): click or tap anywhere on it, or focus it and
// press Enter/Space. The "Show Details" pill still appears on hover (and on keyboard focus) on desktop, but it is a
// label inside the button, not a second button — so there are no nested interactive elements and a click on it
// opens the modal exactly once. Touch devices don't depend on hover: tapping the card is enough.
//
// Deliberately its own minimal prop shape so it can render results from different endpoints (search, vendor
// popular items, vendor storefront menus).
//
// ProductCardSkeleton is the same card's loading placeholder: the ash/grey placeholder look (darkened so it reads
// clearly on the light page), a gentle pulse (animate-skeleton in globals.css; motion-safe only — no animation with
// prefers-reduced-motion) and the same proportions, so the grid doesn't jump when the real cards arrive.

import Image from "next/image";

export interface ProductCardProduct {
  id: string;
  name: string;
  sellerName: string;
  price: number;
  image: string | null;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

export default function ProductCard({ product, onShowDetails }: { product: ProductCardProduct; onShowDetails: (id: string) => void }) {
  const price = `₦${nairaFormatter.format(product.price)}`;
  return (
    <button
      type="button"
      onClick={() => onShowDetails(product.id)}
      aria-label={`${product.name} by ${product.sellerName}, ${price} — show details`}
      className="group block w-full min-w-0 text-left rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(16,24,40,0.06)] hover:shadow-[0_6px_16px_rgba(16,24,40,0.10)] transition overflow-hidden cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <span className="relative block w-full aspect-square bg-gray-100">
        {product.image ? (
          <Image src={product.image} alt="" fill sizes="(min-width: 1024px) 240px, (min-width: 640px) 30vw, 45vw" className="object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No image</span>
        )}
        {/* Hover/focus affordance only — the whole card is the control. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-black/0 group-hover:bg-black/30 group-focus-visible:bg-black/30 transition flex items-center justify-center"
        >
          <span className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0 transition px-4 py-2 rounded-full bg-white text-gray-900 text-xs font-semibold shadow-lg">
            Show Details
          </span>
        </span>
      </span>
      <span className="block p-3 sm:p-4">
        <span className="block font-semibold text-gray-900 text-sm line-clamp-2 break-words">{product.name}</span>
        <span className="block text-xs text-gray-500 mt-0.5 truncate">by {product.sellerName}</span>
        <span className="block mt-2 font-bold text-blue-600 break-words">{price}</span>
      </span>
    </button>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden className="rounded-2xl border border-gray-200 bg-white shadow-[0_2px_8px_rgba(16,24,40,0.06)] overflow-hidden motion-safe:animate-skeleton">
      <div className="w-full aspect-square bg-gray-300" />
      <div className="p-3 sm:p-4 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-400" />
        <div className="h-3 w-1/2 rounded bg-gray-300" />
        <div className="h-4 w-1/3 rounded bg-gray-400 mt-3" />
      </div>
    </div>
  );
}
