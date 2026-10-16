// src/app/explore/page.tsx
//
// Reachable from the marketplace navbar's "Explore" link — and also where
// a search (text query submitted, and/or FilterDropdown category filters
// staged at the time of submitting) lands. With no active search this
// renders the original category browse view (a heading + grid per
// category) — products are real (fetched once from
// GET /api/marketplace/search/products and grouped client-side by
// category, same endpoint SearchResultsView already uses); skills show a
// single "Coming Soon" block instead of the old per-category mock loop,
// since there's no Skill API/service/listing flow anywhere in the app —
// see MarketplaceComingSoon.tsx. With an active search, products still hit
// the real API; skills show the same "Coming Soon" treatment instead of
// the old mock searchSkills().
//
// Standalone Marketplace: Skills is hidden (../_components/marketplace-features.ts) — no Skills section, no skills
// search side (a stale ?side=skills link shows product results). Every list has distinct loading (pulsing
// skeletons) / empty / error-with-retry states (../_components/use-load.ts).

"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchX, Sparkles, X } from "lucide-react";
import api from "@/lib/axios";
import MarketplaceNavbar from "../_components/MarketplaceNavbar";
import MarketplaceCartDrawer from "../_components/MarketplaceCartDrawer";
import ProductCard from "../_components/ProductCard";
import ProductDetailModal from "../_components/ProductDetailModal";
import MarketplaceComingSoon from "../_components/MarketplaceComingSoon";
import SpotlightCard from "../_components/SpotlightCard";
import { LoadError, PRODUCT_GRID_CLASS, ProductGrid, ProductGridSkeleton, SpotlightList, toCardProduct } from "../_components/ProductGrid";
import { SKILLS_ENABLED } from "../_components/marketplace-features";
import { useLoad } from "../_components/use-load";
import { buildExploreHref } from "../_components/search-params";
import { useCart } from "../_components/useCart";
import { useVendorCart } from "../_components/useVendorCart";
import { productCategories, skillCategories } from "@/services/marketplace/shared/categories";
import type { MarketplaceSide } from "@/services/marketplace/shared/types";
import type { ProductSearchResult } from "@/types/search";
import type { FeaturedVendor } from "@/types/marketplace-browse";
import { BackLink } from "../_components/MarketplacePageShell";

const allCategories = SKILLS_ENABLED ? [...productCategories, ...skillCategories] : productCategories;

// Same real database-backed queries the homepage uses (see
// src/app/page.tsx) — kept as one shared block so
// Explore and Homepage never drift into two different implementations of
// the same two sections (spec §5).
function VendorSections({ onShowDetails }: { onShowDetails: (id: string) => void }) {
  const popularVendorItems = useLoad("explore-vendor-items", () =>
    api.get<{ products: ProductSearchResult[] }>("/marketplace/vendor/popular-items", { params: { limit: 8 } }).then((res) => res.data.products.map(toCardProduct)),
  );
  const schoolVendors = useLoad("explore-vendors", () => api.get<{ vendors: FeaturedVendor[] }>("/marketplace/vendor/featured").then((res) => res.data.vendors));

  return (
    <>
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-5">Popular Vendor Items</h2>
        <ProductGrid
          state={popularVendorItems}
          onRetry={popularVendorItems.retry}
          onShowDetails={onShowDetails}
          emptyMessage="No vendor items are currently available."
          errorMessage="Couldn't load vendor items."
        />
      </section>

      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-5">School Vendors</h2>
        <SpotlightList
          state={schoolVendors}
          onRetry={schoolVendors.retry}
          emptyMessage="No vendors are currently available."
          errorMessage="Couldn't load vendors."
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {(vendors) =>
            vendors.map((vendor) => (
              <Link key={vendor.id} href={`/vendor/${vendor.id}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                <SpotlightCard
                  image={vendor.secureUrl}
                  name={vendor.name}
                  subtitle={[vendor.vendorCategory, vendor.location].filter(Boolean).join(" · ") || "School Vendor"}
                  ordersFulfilled={vendor.itemCount}
                  countLabel="items"
                />
              </Link>
            ))
          }
        </SpotlightList>
      </section>
    </>
  );
}

function CategoryBrowseView({ onShowDetails }: { onShowDetails: (id: string) => void }) {
  const products = useLoad("explore-all-products", () =>
    api.get<{ products: ProductSearchResult[] }>("/marketplace/search/products", { params: { limit: 40 } }).then((res) => res.data.products),
  );

  return (
    <div className="space-y-12 sm:space-y-14">
      <VendorSections onShowDetails={onShowDetails} />

      {products.status === "loading" && (
        <section>
          <div aria-hidden className="h-6 w-40 rounded bg-gray-400 mb-5 motion-safe:animate-skeleton" />
          <ProductGridSkeleton count={8} />
        </section>
      )}

      {products.status === "error" && <LoadError message="Couldn't load products. Check your connection and try again." onRetry={products.retry} />}

      {products.status === "success" &&
        productCategories.map((category) => {
          const items = products.data.filter((product) => product.category === category.name);
          return (
            <section key={category.id}>
              <h2 className="text-xl font-bold text-gray-900 mb-5">{category.name}</h2>
              {items.length === 0 ? (
                <p className="text-sm text-gray-500">No listings yet.</p>
              ) : (
                <div className={PRODUCT_GRID_CLASS}>
                  {items.map((product) => (
                    <ProductCard key={product.id} product={toCardProduct(product)} onShowDetails={onShowDetails} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

      {SKILLS_ENABLED && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-5">Skills</h2>
          <MarketplaceComingSoon label="Skills" icon={Sparkles} />
        </section>
      )}
    </div>
  );
}

function SearchResultsView({
  query,
  side,
  categoryIds,
  onShowDetails,
}: {
  query: string;
  side: MarketplaceSide;
  categoryIds: string[];
  onShowDetails: (id: string) => void;
}) {
  // A new query or filter set is a new request: state returns to loading until that request answers.
  const results = useLoad(`search:${side}:${query}:${categoryIds.join(",")}`, () =>
    side === "skills"
      ? Promise.resolve([])
      : api
          .get<{ products: ProductSearchResult[] }>("/marketplace/search/products", {
            params: { q: query || undefined, categories: categoryIds.length > 0 ? categoryIds.join(",") : undefined },
          })
          .then((res) => res.data.products.map(toCardProduct)),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {query && (
          <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
            <span className="truncate">&ldquo;{query}&rdquo;</span>
            <Link href={buildExploreHref("", side, categoryIds)} aria-label="Clear search text" className="-m-1 p-1">
              <X size={12} aria-hidden />
            </Link>
          </span>
        )}
        {categoryIds.map((id) => {
          const category = allCategories.find((c) => c.id === id);
          if (!category) return null;
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
              {category.name}
              <Link href={buildExploreHref(query, side, categoryIds.filter((c) => c !== id))} aria-label={`Remove ${category.name} filter`} className="-m-1 p-1">
                <X size={12} aria-hidden />
              </Link>
            </span>
          );
        })}
      </div>

      {side === "skills" ? (
        <MarketplaceComingSoon label="Skills" icon={Sparkles} />
      ) : results.status === "success" && results.data.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20">
          <SearchX size={28} className="text-gray-400 mb-3" aria-hidden />
          <p className="text-gray-500">No products match your search.</p>
        </div>
      ) : (
        <ProductGrid
          state={results}
          onRetry={results.retry}
          onShowDetails={onShowDetails}
          emptyMessage="No products match your search."
          errorMessage="Couldn't load results. Check your connection and try again."
        />
      )}
    </div>
  );
}

function ExplorePageInner() {
  const searchParams = useSearchParams();
  const [cartOpen, setCartOpen] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const cart = useCart();
  const vendorCart = useVendorCart();
  const refreshCarts = () => {
    cart.refresh();
    vendorCart.refresh();
  };

  const query = searchParams.get("q") ?? "";
  const side: MarketplaceSide = SKILLS_ENABLED && searchParams.get("side") === "skills" ? "skills" : "products";
  const categoriesParam = searchParams.get("categories") ?? "";
  // Memoized on the raw string (a stable primitive) rather than recomputed
  // as a fresh array every render.
  const categoryIds = useMemo(() => categoriesParam.split(",").filter((id) => id && allCategories.some((c) => c.id === id)), [categoriesParam]);
  const hasActiveSearch = Boolean(query.trim()) || categoryIds.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-clip">
      <MarketplaceNavbar cartCount={cart.count + vendorCart.count} onCartClick={() => setCartOpen(true)} />
      <div className="pt-16">
        <MarketplaceCartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          business={{ items: cart.items, subtotal: cart.subtotal, onUpdateQuantity: cart.updateQuantity, onRemove: cart.removeItem, status: cart.status }}
          vendor={{ items: vendorCart.items, subtotal: vendorCart.subtotal, onUpdateQuantity: vendorCart.updateQuantity, onRemove: vendorCart.removeItem, status: vendorCart.status }}
        />
        <ProductDetailModal productId={detailProductId} onClose={() => setDetailProductId(null)} onAdded={refreshCarts} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          <nav aria-label="Breadcrumb" className="mb-6">
            <BackLink />
          </nav>

          {hasActiveSearch ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Search results</h1>
              <p className="text-gray-500 mb-8">Showing matching {side}.</p>
              <SearchResultsView query={query} side={side} categoryIds={categoryIds} onShowDetails={setDetailProductId} />
            </>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Explore</h1>
              <p className="text-gray-500 mb-10 sm:mb-12">Browse every category the marketplace has to offer.</p>
              <CategoryBrowseView onShowDetails={setDetailProductId} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExplorePageInner />
    </Suspense>
  );
}
