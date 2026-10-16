// src/app/_components/MarketplaceNavbar.tsx
//
// The standalone Marketplace's ONE top navbar, on every signed-in page. (The bar inherited from AkadVerse —
// "AkadVerse Marketplace" + Sign out, previously stacked above this one — is gone; its Admin and Sign out actions
// live in this bar's account menu now. src/app/components/dashboard/student/DashboardNavbar.tsx just renders this.)
//
// Fixed, 4rem tall (pages offset their content with pt-16). Left to right: the signet (home link), search + filter,
// Explore and Your Orders (lg+), My Trade, notifications, the cart, and the account menu. On phones the search box
// collapses to an icon that opens a search row under the bar, so the bar itself never overflows at 320px.
//
// Search: toggling a filter only stages it — submitting the search box (Enter, or the search icon) navigates to
// /explore with the combined query (search-params.ts's buildExploreHref()). Initial state is read once from
// `window.location.search` (not Next's useSearchParams(), which would force a Suspense boundary here).
//
// Cart: storefront pages pass their own cart (`cart` prop) so the badge, drawer and product modal share one cart
// state. Other pages omit it and the navbar runs its own (NavbarOwnCart).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Search, Compass, Package, ShoppingBag, ShoppingCart, ShieldCheck, LogOut, UserRound, X } from "lucide-react";
import FilterDropdown from "./FilterDropdown";
import MyTradeDropdown from "./MyTradeDropdown";
import NotificationDropdown from "./NotificationDropdown";
import MarketplaceCartDrawer from "./MarketplaceCartDrawer";
import { buildExploreHref } from "./search-params";
import { SKILLS_ENABLED } from "./marketplace-features";
import { useDropdown } from "./use-dropdown";
import { useCart } from "./useCart";
import { useVendorCart } from "./useVendorCart";
import type { MarketplaceSide } from "@/services/marketplace/shared/types";

function readInitialParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

interface MarketplaceNavbarProps {
  // Omit to let the navbar manage the cart itself.
  cartCount?: number;
  onCartClick?: () => void;
}

const iconButton =
  "relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 text-gray-700 transition focus-visible:outline-2 focus-visible:outline-blue-600";

function CartButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={count > 0 ? `Open cart, ${count} item${count === 1 ? "" : "s"}` : "Open cart"} className={iconButton}>
      <ShoppingCart size={20} aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  );
}

// For pages that don't render their own cart drawer (checkout, dashboards, forms...).
function NavbarOwnCart() {
  const [open, setOpen] = useState(false);
  const cart = useCart();
  const vendorCart = useVendorCart();
  return (
    <>
      <CartButton count={cart.count + vendorCart.count} onClick={() => setOpen(true)} />
      <MarketplaceCartDrawer
        open={open}
        onClose={() => setOpen(false)}
        business={{ items: cart.items, subtotal: cart.subtotal, onUpdateQuantity: cart.updateQuantity, onRemove: cart.removeItem, status: cart.status }}
        vendor={{ items: vendorCart.items, subtotal: vendorCart.subtotal, onUpdateQuantity: vendorCart.updateQuantity, onRemove: vendorCart.removeItem, status: vendorCart.status }}
      />
    </>
  );
}

function AccountMenu() {
  const { data: session } = useSession();
  const { open, setOpen, containerProps, buttonProps } = useDropdown();
  const item = "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm text-gray-700 hover:bg-gray-50 transition";
  return (
    <div className="relative" {...containerProps}>
      <button type="button" aria-label="Account menu" {...buttonProps} className={iconButton}>
        <UserRound size={20} aria-hidden />
      </button>
      {open && (
        <div className="fixed left-4 right-4 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 bg-white border border-gray-200 rounded-2xl shadow-xl p-2 z-40">
          {session?.user && (
            <div className="px-3 py-2 mb-1 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900 truncate">{session.user.name}</p>
              <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
            </div>
          )}
          {/* Shown inline in the bar from lg up. */}
          <Link href="/explore" onClick={() => setOpen(false)} className={`${item} lg:hidden`}>
            <Compass size={16} aria-hidden /> Explore
          </Link>
          <Link href="/orders" onClick={() => setOpen(false)} className={`${item} lg:hidden`}>
            <Package size={16} aria-hidden /> Your Orders
          </Link>
          {session?.user?.isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)} className={item}>
              <ShieldCheck size={16} aria-hidden /> Admin
            </Link>
          )}
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={item}>
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function MarketplaceNavbar({ cartCount, onCartClick }: MarketplaceNavbarProps = {}) {
  const router = useRouter();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [query, setQuery] = useState(() => readInitialParam("q"));
  const [side, setSide] = useState<MarketplaceSide>(() => (SKILLS_ENABLED && readInitialParam("side") === "skills" ? "skills" : "products"));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() => {
    const raw = readInitialParam("categories");
    return raw ? raw.split(",").filter(Boolean) : [];
  });

  const handleSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMobileSearchOpen(false);
    router.push(buildExploreHref(query, side, selectedCategoryIds));
  };

  const handleToggleCategory = (categorySide: MarketplaceSide, categoryId: string) => {
    // Selecting a category under the *other* side switches the search to
    // that side and starts a fresh selection — see FilterDropdown.tsx. This
    // only stages the filter; it doesn't navigate (see the file header).
    const base = categorySide === side ? selectedCategoryIds : [];
    const isSelected = base.includes(categoryId);
    if (!isSelected && base.length >= 4) return;

    const next = isSelected ? base.filter((id) => id !== categoryId) : [...base, categoryId];
    setSide(categorySide);
    setSelectedCategoryIds(next);
  };

  const searchForm = (
    <div className="flex items-center gap-2 min-w-0 w-full">
      <form onSubmit={handleSubmitSearch} role="search" className="relative flex-1 min-w-0">
        <button type="submit" aria-label="Search" className="absolute left-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <Search size={18} aria-hidden />
        </button>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={SKILLS_ENABLED ? "Search products, skills…" : "Search products…"}
          aria-label="Search products"
          className="w-full min-h-10 pl-10 pr-3 py-2 rounded-xl border border-gray-400 text-base sm:text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
        />
      </form>
      <FilterDropdown selectedSide={side} selectedCategoryIds={selectedCategoryIds} onToggleCategory={handleToggleCategory} />
    </div>
  );

  return (
    <header className="fixed top-0 inset-x-0 z-30 bg-white border-b border-gray-100">
      <nav aria-label="Marketplace" className="max-w-screen-2xl mx-auto px-3 sm:px-6 h-16 flex items-center gap-1.5 sm:gap-4">
        <Link
          href="/"
          aria-label="Student Marketplace — home"
          className="flex items-center gap-2.5 shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <ShoppingBag size={19} aria-hidden />
          </span>
          <span className="font-bold text-gray-900 hidden xl:inline">Student Marketplace</span>
        </Link>

        <div className="hidden sm:flex flex-1 min-w-0 max-w-2xl">{searchForm}</div>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-3 lg:gap-5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label={mobileSearchOpen ? "Close search" : "Open search"}
            aria-expanded={mobileSearchOpen}
            className={`${iconButton} sm:hidden`}
          >
            {mobileSearchOpen ? <X size={20} aria-hidden /> : <Search size={20} aria-hidden />}
          </button>
          <Link href="/explore" className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition">
            <Compass size={16} aria-hidden />
            Explore
          </Link>
          <Link href="/orders" className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition">
            <Package size={16} aria-hidden />
            Your Orders
          </Link>
          <MyTradeDropdown />
          <NotificationDropdown />
          {onCartClick ? <CartButton count={cartCount ?? 0} onClick={onCartClick} /> : <NavbarOwnCart />}
          <AccountMenu />
        </div>
      </nav>

      {/* Phones: the search row opens under the bar (overlaying the page, so the bar's height never changes). */}
      {mobileSearchOpen && <div className="sm:hidden absolute inset-x-0 top-full bg-white border-b border-gray-100 shadow-sm px-3 py-3">{searchForm}</div>}
    </header>
  );
}
