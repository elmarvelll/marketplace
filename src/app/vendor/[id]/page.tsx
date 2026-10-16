// src/app/vendor/[id]/page.tsx
//
// Public vendor storefront — profile (name, category, location,
// availability), products (opens the shared ProductDetailModal, same one
// Business products use, for multi-variant + side selection), and
// standalone Sides (added directly here, since a buyer can order sides
// alone per spec §9). Fetches GET /api/marketplace/vendor/[id] — see
// services/marketplace/vendor/get-vendor-storefront.ts.

"use client";

import { use, useState } from "react";
import { AlertCircle, Clock, MapPin } from "lucide-react";
import MarketplaceNavbar from "../../_components/MarketplaceNavbar";
import ProductCard from "../../_components/ProductCard";
import ProductDetailModal from "../../_components/ProductDetailModal";
import { LoadError, PRODUCT_GRID_CLASS, ProductGridSkeleton } from "../../_components/ProductGrid";
import { useLoad } from "../../_components/use-load";
import MarketplaceCartDrawer from "../../_components/MarketplaceCartDrawer";
import { useCart } from "../../_components/useCart";
import { useVendorCart } from "../../_components/useVendorCart";
import MarketplaceFooter from "../../_components/MarketplaceFooter";
import api from "@/lib/axios";
import { BackLink } from "../../_components/MarketplacePageShell";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

interface VendorStorefront {
  id: string;
  name: string;
  description: string;
  vendorCategory: string | null;
  location: string | null;
  availabilityStart: string | null;
  availabilityEnd: string | null;
  secureUrl: string | null;
  paused: boolean;
  pausedReason: string | null;
  products: { id: string; name: string; category: string; price: number; stock: number; secureUrl: string | null }[];
  sides: { id: string; name: string; price: number; available: boolean; stock: number | null }[];
}

export default function VendorStorefrontPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vendorState = useLoad(`vendor:${id}`, () => api.get<{ vendor: VendorStorefront }>(`/marketplace/vendor/${id}`).then((res) => res.data.vendor));
  const vendor = vendorState.status === "success" ? vendorState.data : null;
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart();
  const vendorCart = useVendorCart();
  const refreshCarts = () => {
    cart.refresh();
    vendorCart.refresh();
  };


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

        {/* Storefront pages had no way back except the browser button. */}
        <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          <BackLink />
        </nav>

        {vendorState.status === "loading" && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10" role="status" aria-label="Loading vendor">
            <div aria-hidden className="flex items-start gap-4 mb-10 motion-safe:animate-skeleton">
              <div className="w-16 h-16 rounded-2xl bg-gray-300 shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-6 w-48 max-w-full rounded bg-gray-400" />
                <div className="h-4 w-32 rounded bg-gray-300" />
              </div>
            </div>
            <ProductGridSkeleton count={8} />
          </div>
        )}

        {vendorState.status === "error" &&
          (vendorState.httpStatus === 404 ? (
            <div className="flex flex-col items-center text-center py-24 px-6">
              <AlertCircle size={28} className="text-gray-500 mb-3" aria-hidden />
              <p className="text-gray-500">This vendor isn&apos;t available.</p>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
              <LoadError message="Couldn't load this vendor. Check your connection and try again." onRetry={vendorState.retry} />
            </div>
          ))}

        {vendorState.status === "success" && vendor && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
            <div className="flex items-start gap-4 mb-2">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-gray-600 text-xs">
                {vendor.secureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={vendor.secureUrl} alt={vendor.name} className="w-full h-full object-cover" />
                ) : (
                  "No image"
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{vendor.name}</h1>
                <p className="text-sm text-gray-500">{vendor.vendorCategory ?? "School Vendor"}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                  {vendor.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {vendor.location}
                    </span>
                  )}
                  {vendor.availabilityStart && vendor.availabilityEnd && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {vendor.availabilityStart} – {vendor.availabilityEnd}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {vendor.paused && (
              <div className="mt-4 text-sm p-3 rounded-lg text-amber-700 bg-amber-50">
                This vendor is temporarily unavailable{vendor.pausedReason ? `: ${vendor.pausedReason}` : "."}
              </div>
            )}

            {vendor.description && <p className="text-sm text-gray-600 mt-4 max-w-2xl leading-relaxed">{vendor.description}</p>}

            <section className="mt-10">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Menu</h2>
              {vendor.products.length === 0 ? (
                <p className="text-sm text-gray-500">No products listed yet.</p>
              ) : (
                <div className={PRODUCT_GRID_CLASS}>
                  {vendor.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={{ id: product.id, name: product.name, sellerName: vendor.name, price: product.price, image: product.secureUrl }}
                      onShowDetails={setDetailProductId}
                    />
                  ))}
                </div>
              )}
            </section>

            {vendor.sides.length > 0 && (
              <section className="mt-10">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Sides</h2>
                <p className="text-xs text-gray-500 mb-3">Order sides on their own, or alongside items from the menu above.</p>
                <div className="flex flex-wrap gap-2">
                  {vendor.sides.map((side) => (
                    <button
                      key={side.id}
                      type="button"
                      onClick={async () => {
                        await api.post("/marketplace/vendor-cart", { sideId: side.id, quantity: 1 });
                        vendorCart.refresh();
                      }}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white hover:border-purple-300 hover:text-purple-700 transition"
                    >
                      + {side.name} — ₦{nairaFormatter.format(side.price)}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <MarketplaceFooter />
      </div>
    </div>
  );
}
