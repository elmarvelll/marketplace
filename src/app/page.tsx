// src/app/page.tsx
//
// The student marketplace homepage — reachable at
// / via the "Marketplace" workspace card on
// src/app/studashboard/page.tsx (a sibling of "Main Menu", not nested
// under it).
//
// Every section has distinct loading / empty / error states (./_components/use-load.ts): pulsing skeletons while a
// request is in flight, "no …" only after the backend returned zero rows, and an error with "Try again" otherwise.
// Popular Skills is hidden in the standalone Marketplace (./_components/marketplace-features.ts).
//
// "Popular Products" and "Top Businesses" are real data (fetched from
// GET /api/marketplace/search/products?limit=8 and
// GET /api/marketplace/businesses/featured — see those routes). "Popular
// Skills" and "Best Services" show a "Coming Soon" placeholder instead of
// data — there's no Skill/service-provider API, service, or listing flow
// anywhere in the app (the Skill/SkillOffer models exist in the schema,
// but nothing is wired to them), so there's genuinely nothing real to
// show, and services/marketplace/skills-market/data.ts's mock arrays are
// no longer used here.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Wrench } from "lucide-react";
import MarketplaceNavbar from "./_components/MarketplaceNavbar";
import Hero from "./_components/Hero";
import SpotlightCard from "./_components/SpotlightCard";
import MarketplaceComingSoon from "./_components/MarketplaceComingSoon";
import MarketplaceCartDrawer from "./_components/MarketplaceCartDrawer";
import ProductDetailModal from "./_components/ProductDetailModal";
import MarketplaceFooter from "./_components/MarketplaceFooter";
import { ProductGrid, SpotlightList, toCardProduct } from "./_components/ProductGrid";
import { SKILLS_ENABLED } from "./_components/marketplace-features";
import { useLoad } from "./_components/use-load";
import { useCart } from "./_components/useCart";
import { useVendorCart } from "./_components/useVendorCart";
import api from "@/lib/axios";
import type { ProductSearchResult } from "@/types/search";
import type { FeaturedBusiness, FeaturedVendor } from "@/types/marketplace-browse";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-5">{children}</h2>;
}

export default function MarketplacePage() {
  const [cartOpen, setCartOpen] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const cart = useCart();
  const vendorCart = useVendorCart();
  const refreshCarts = () => {
    cart.refresh();
    vendorCart.refresh();
  };

  const popularProducts = useLoad("popular-products", () =>
    api.get<{ products: ProductSearchResult[] }>("/marketplace/search/products", { params: { limit: 8 } }).then((res) => res.data.products.map(toCardProduct)),
  );
  const popularVendorItems = useLoad("popular-vendor-items", () =>
    api.get<{ products: ProductSearchResult[] }>("/marketplace/vendor/popular-items", { params: { limit: 8 } }).then((res) => res.data.products.map(toCardProduct)),
  );
  const topBusinesses = useLoad("top-businesses", () => api.get<{ businesses: FeaturedBusiness[] }>("/marketplace/businesses/featured").then((res) => res.data.businesses));
  const schoolVendors = useLoad("school-vendors", () => api.get<{ vendors: FeaturedVendor[] }>("/marketplace/vendor/featured").then((res) => res.data.vendors));

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

        <Hero />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 space-y-12 sm:space-y-16">
          <section>
            <SectionHeading>Popular Vendor Items</SectionHeading>
            <ProductGrid
              state={popularVendorItems}
              onRetry={popularVendorItems.retry}
              onShowDetails={setDetailProductId}
              emptyMessage="No vendor items are currently available."
              errorMessage="Couldn't load vendor items."
            />
          </section>

          <section>
            <SectionHeading>School Vendors</SectionHeading>
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

          <section>
            <SectionHeading>Popular Products</SectionHeading>
            <ProductGrid state={popularProducts} onRetry={popularProducts.retry} onShowDetails={setDetailProductId} emptyMessage="No products listed yet." />
          </section>

          {SKILLS_ENABLED && (
            <section>
              <SectionHeading>Popular Skills</SectionHeading>
              <MarketplaceComingSoon label="Skills" icon={Sparkles} />
            </section>
          )}

          <section className="grid md:grid-cols-2 gap-10">
            <div className="min-w-0">
              <SectionHeading>Top Businesses</SectionHeading>
              <SpotlightList
                state={topBusinesses}
                onRetry={topBusinesses.retry}
                emptyMessage="No businesses yet."
                errorMessage="Couldn't load businesses."
                className="space-y-3"
              >
                {(businesses) =>
                  businesses.map((business) => (
                    <SpotlightCard
                      key={business.id}
                      image={business.secureUrl}
                      name={business.name}
                      subtitle={business.industry}
                      ordersFulfilled={business.productCount}
                    />
                  ))
                }
              </SpotlightList>
            </div>
            <div className="min-w-0">
              <SectionHeading>Best Services</SectionHeading>
              <MarketplaceComingSoon label="Services" icon={Wrench} />
            </div>
          </section>
        </div>

        <MarketplaceFooter />
      </div>
    </div>
  );
}
