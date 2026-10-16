// src/app/vendor-dashboard/[id]/products/[productId]/edit/page.tsx
//
// The vendor's product edit form. Fetches/saves via
// GET/PATCH /api/marketplace/vendor/[id]/products/[productId] (the
// vendor's own product API). ProductForm reused from
// business/_components/ — generic, no Business-specific branding.

"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import ProductForm from "../../../../../business/_components/ProductForm";
import type { ProductDetail, ProductFormValues } from "@/types/product";

type LoadState = "loading" | "loaded" | "not-found" | "error";

function formFromProduct(product: ProductDetail): ProductFormValues {
  return {
    name: product.name,
    category: product.category,
    description: product.description,
    price: String(product.price),
    cost: String(product.cost),
    stock: String(product.stock),
    publicId: product.publicId ?? undefined,
    secureUrl: product.secureUrl ?? undefined,
    images: product.images,
    variants: product.variants.map((v) => ({ id: v.id, name: v.name, price: String(v.price), stock: String(v.stock) })),
  };
}

export default function EditVendorProductPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = use(params);
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [form, setForm] = useState<ProductFormValues | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<{ product: ProductDetail }>(`/marketplace/vendor/${id}/products/${productId}`);
        if (cancelled) return;
        setForm(formFromProduct(res.data.product));
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
  }, [id, productId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form) return;

    setSaveStatus("saving");
    setSaveError("");

    try {
      await api.patch(`/marketplace/vendor/${id}/products/${productId}`, form);
      router.push(`/vendor-dashboard/${id}/products`);
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't save your changes.";
      setSaveError(message);
      setSaveStatus("error");
    }
  };

  const backLink = (
    <Link
      href={`/vendor-dashboard/${id}/products`}
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition mb-6"
    >
      <ArrowLeft size={16} />
      Back to Products
    </Link>
  );

  if (loadState === "loading") {
    return (
      <>
        {backLink}
        <div className="flex justify-center py-24">
          <Loader2 size={28} className="animate-spin text-gray-500" />
        </div>
      </>
    );
  }

  if (loadState !== "loaded" || !form) {
    return (
      <>
        {backLink}
        <div className="flex flex-col items-center text-center py-24">
          <AlertCircle size={28} className="text-gray-500 mb-3" />
          <p className="text-gray-500">
            {loadState === "not-found" ? "This product doesn't exist." : "Couldn't load this product. Please try again."}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {backLink}
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Update Inventory</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ProductForm value={form} onChange={setForm} disabled={saveStatus === "saving"} />

        {saveError && <div className="text-sm p-3 rounded-lg text-red-700 bg-red-100">{saveError}</div>}

        <button
          type="submit"
          disabled={saveStatus === "saving"}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saveStatus === "saving" && <Loader2 size={18} className="animate-spin" />}
          {saveStatus === "saving" ? "Saving…" : "Save changes"}
        </button>
      </form>
    </>
  );
}
