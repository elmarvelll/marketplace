// src/app/_components/MarketplaceCartDrawer.tsx
//
// The single cart drawer every marketplace page renders — replaces the
// old per-page split of CartDrawer.tsx (Business) / VendorCartDrawer.tsx
// (Vendor only reachable from a vendor's own storefront). Spec §16: "the
// top-level cart experience should clearly distinguish Business | Vendors"
// — this is that switcher: an animated underline tab bar on top of the
// drawer, one shared drawer body beneath it. Both carts still read from
// their own hooks (useCart.ts / useVendorCart.ts) — this component is
// purely presentational, it owns only which tab is active.
//
// Defaults to whichever cart actually has items (Vendor if only the
// Vendor cart is non-empty, etc) so a buyer isn't dropped on an empty tab
// when they open the drawer after adding something — falls back to
// Business when both are empty or both have items.

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X, Minus, Plus, ShoppingCart, ShoppingBag, Trash2 } from "lucide-react";
import type { CartLineItem } from "@/types/cart";
import type { VendorCartLineItem } from "@/types/vendor-cart";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

type CartTab = "business" | "vendor";

interface CartSide<T> {
  items: T[];
  subtotal: number;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  // Optional so existing callers that don't yet pass it keep working —
  // defaults to "loaded" (never blocks rendering existing items). While
  // "loading", the cart body shows a spinner instead of an empty-cart
  // message that would otherwise flash before the real items arrive.
  status?: "loading" | "loaded" | "error";
}

interface MarketplaceCartDrawerProps {
  open: boolean;
  onClose: () => void;
  business: CartSide<CartLineItem>;
  vendor: CartSide<VendorCartLineItem>;
}

export default function MarketplaceCartDrawer({ open, onClose, business, vendor }: MarketplaceCartDrawerProps) {
  return (
    <AnimatePresence>
      {open && <CartPanel onClose={onClose} business={business} vendor={vendor} />}
    </AnimatePresence>
  );
}

// Only ever mounted while the drawer is open (see above) — its `tab` state
// therefore starts fresh, from a sensibly-computed default, every single
// time the drawer opens, purely through normal mount/unmount semantics
// (no ref/effect trickery needed, which this project's stricter
// react-hooks/refs rule disallows anyway). Defaults to whichever cart
// actually has items so a buyer who just added a vendor item and clicks
// the cart icon lands on the Vendor tab, not an empty Business one.
function CartPanel({
  onClose,
  business,
  vendor,
}: {
  onClose: () => void;
  business: CartSide<CartLineItem>;
  vendor: CartSide<VendorCartLineItem>;
}) {
  const [tab, setTab] = useState<CartTab>(() => (vendor.items.length > 0 && business.items.length === 0 ? "vendor" : "business"));

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-40"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 pt-5 border-b border-gray-100">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setTab("business")}
              className={`relative pb-4 text-sm font-semibold transition flex items-center gap-1.5 ${
                tab === "business" ? "text-gray-900" : "text-gray-500 hover:text-gray-600"
              }`}
            >
              <ShoppingCart size={15} />
              Business
              {business.items.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {business.items.length}
                </span>
              )}
              {tab === "business" && (
                <motion.div layoutId="cart-tab-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("vendor")}
              className={`relative pb-4 text-sm font-semibold transition flex items-center gap-1.5 ${
                tab === "vendor" ? "text-gray-900" : "text-gray-500 hover:text-gray-600"
              }`}
            >
              <ShoppingBag size={15} />
              Vendors
              {vendor.items.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  {vendor.items.length}
                </span>
              )}
              {tab === "vendor" && (
                <motion.div layoutId="cart-tab-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-purple-600" />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition mb-1"
          >
            <X size={18} />
          </button>
        </div>

        {tab === "business" ? <BusinessCartBody {...business} /> : <VendorCartBody {...vendor} />}
      </motion.div>
    </>
  );
}

function BusinessCartBody({
  items,
  subtotal,
  onUpdateQuantity,
  onRemove,
  status = "loaded",
}: CartSide<CartLineItem>) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {status === "loading" ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center mt-10">Your Business cart is empty.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                {item.image ? (
                  <Image src={item.image} alt={item.productName} fill sizes="64px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">No image</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-gray-900 text-sm truncate">{item.productName}</h3>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label="Remove item"
                    className="text-gray-500 hover:text-red-500 transition shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 truncate">by {item.sellerName}</p>
                {item.variantName && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.variantName}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 border border-gray-400 bg-white rounded-lg px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="text-xs font-semibold text-gray-900 w-6 text-center tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="font-semibold text-sm text-gray-900">₦{nairaFormatter.format(item.price * item.quantity)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-100 px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-500">Subtotal</span>
          <span className="font-bold text-gray-900">₦{nairaFormatter.format(subtotal)}</span>
        </div>
        {items.length === 0 ? (
          <button type="button" disabled className="w-full py-3 bg-blue-600 text-white font-semibold rounded-full opacity-50 cursor-not-allowed">
            Checkout
          </button>
        ) : (
          <Link
            href="/checkout"
            className="block w-full text-center py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition"
          >
            Checkout
          </Link>
        )}
      </div>
    </>
  );
}

function VendorCartBody({ items, subtotal, onUpdateQuantity, onRemove, status = "loaded" }: CartSide<VendorCartLineItem>) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {status === "loading" ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center mt-10">Your Vendor cart is empty.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                {item.image ? (
                  <Image src={item.image} alt={item.name} fill sizes="64px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-[10px]">
                    {item.kind === "side" ? "Side" : "No image"}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-gray-900 text-sm truncate">{item.name}</h3>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label="Remove item"
                    className="text-gray-500 hover:text-red-500 transition shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 truncate">by {item.vendorName}</p>
                {item.variantName && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.variantName}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 border border-gray-400 bg-white rounded-lg px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="text-xs font-semibold text-gray-900 w-6 text-center tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      disabled={item.stock !== null && item.quantity >= item.stock}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="font-semibold text-sm text-gray-900">₦{nairaFormatter.format(item.price * item.quantity)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-100 px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-500">Subtotal</span>
          <span className="font-bold text-gray-900">₦{nairaFormatter.format(subtotal)}</span>
        </div>
        {items.length === 0 ? (
          <button type="button" disabled className="w-full py-3 bg-purple-600 text-white font-semibold rounded-full opacity-50 cursor-not-allowed">
            Book an Order
          </button>
        ) : (
          <Link
            href="/vendor-checkout"
            className="block w-full text-center py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-full transition"
          >
            Book an Order
          </Link>
        )}
      </div>
    </>
  );
}
