// src/app/_components/useCart.ts
//
// The one place that talks to /api/marketplace/cart. Used once per page
// (marketplace/page.tsx, explore/page.tsx, checkout/page.tsx) so the
// navbar's cart-count badge and the CartDrawer/checkout contents always
// agree — CartDrawer takes items/handlers as props rather than fetching
// on its own.

"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/axios";
import type { CartLineItem } from "@/types/cart";

export function useCart() {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get<{ items: CartLineItem[] }>("/marketplace/cart");
      setItems(res.data.items);
      setStatus("loaded");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // Deliberately not just `refresh()` — a locally-defined function
    // invoked from inside the effect (rather than an outside reference
    // pulled in as a dependency) is what this repo's stricter
    // react-hooks/set-state-in-effect rule wants for "kick off a fetch on
    // mount"; `refresh` itself stays around for callers that want to
    // manually re-fetch later (e.g. after adding to cart).
    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get<{ items: CartLineItem[] }>("/marketplace/cart");
        if (cancelled) return;
        setItems(res.data.items);
        setStatus("loaded");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    const res = await api.patch<{ item: CartLineItem }>(`/marketplace/cart/${itemId}`, { quantity });
    setItems((current) => current.map((item) => (item.id === itemId ? res.data.item : item)));
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    await api.delete(`/marketplace/cart/${itemId}`);
    setItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return { items, status, count: items.length, subtotal, refresh, updateQuantity, removeItem };
}
