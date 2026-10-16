// src/app/business/_components/useBusinessDetail.ts
//
// Shared fetch for a business's profile + stats
// (GET /api/marketplace/businesses/[id]), used by both the Profile tab
// (business/[id]/page.tsx) and the Analytics tab
// (business/[id]/analytics/page.tsx) so they don't each independently
// re-implement the same load/error handling.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import type { BusinessDetail } from "@/types/business";

export type BusinessLoadState = "loading" | "loaded" | "not-found" | "error";

export function useBusinessDetail(id: string) {
  const [loadState, setLoadState] = useState<BusinessLoadState>("loading");
  const [business, setBusiness] = useState<BusinessDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<{ business: BusinessDetail }>(`/marketplace/businesses/${id}`);
        if (cancelled) return;
        setBusiness(res.data.business);
        setLoadState("loaded");
      } catch (err) {
        if (cancelled) return;
        setLoadState(isAxiosError(err) && err.response?.status === 404 ? "not-found" : "error");
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { business, setBusiness, loadState };
}
