// src/app/_components/useVendorCart.ts
//
// The one place that talks to /api/marketplace/vendor-cart — the Vendor
// cart counterpart of useCart.ts. Kept as its own hook (not a parameter on
// useCart) since the two carts are deliberately separate experiences (see
// docs/marketplace/decisions/vendor-extends-business.md), even though both
// read from the same underlying CartItem table.

"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/axios";
import type { VendorCartLineItem } from "@/types/vendor-cart";

export function useVendorCart() {
  const [items, setItems] = useState<VendorCartLineItem[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get<{ items: VendorCartLineItem[] }>("/marketplace/vendor-cart");
      setItems(res.data.items);
      setStatus("loaded");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get<{ items: VendorCartLineItem[] }>("/marketplace/vendor-cart");
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
    const res = await api.patch<{ item: VendorCartLineItem }>(`/marketplace/vendor-cart/${itemId}`, { quantity });
    setItems((current) => current.map((item) => (item.id === itemId ? res.data.item : item)));
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    await api.delete(`/marketplace/vendor-cart/${itemId}`);
    setItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return { items, status, count: items.length, subtotal, refresh, updateQuantity, removeItem };
}
