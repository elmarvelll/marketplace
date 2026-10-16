// src/app/vendor-dashboard/[id]/products/create/page.tsx
//
// The vendor's "Create Product" form. Submits to
// POST /api/marketplace/vendor/[id]/products (the vendor's own product
// API — see docs/marketplace/decisions/vendor-independent-architecture.md),
// then returns to the vendor Products tab. ProductForm is reused from
// business/_components/ — a generic multi-image/variant form with no
// Business-specific branding.

"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAxiosError } from "axios";
import { ArrowLeft, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import ProductForm from "../../../../business/_components/ProductForm";
import type { ProductFormValues } from "@/types/product";

const initialForm: ProductFormValues = {
  name: "",
  category: "",
  description: "",
  price: "",
  cost: "",
  stock: "0",
  images: [],
  variants: [],
};

export default function CreateVendorProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [form, setForm] = useState<ProductFormValues>(initialForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      await api.post(`/marketplace/vendor/${id}/products`, form);
      router.push(`/vendor-dashboard/${id}/products`);
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) ||
        "Couldn't create this product. Please try again.";
      setError(message);
      setStatus("error");
    }
  };

  return (
    <>
      <Link
        href={`/vendor-dashboard/${id}/products`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition mb-6"
      >
        <ArrowLeft size={16} />
        Back to Products
      </Link>

      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Create Product</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ProductForm value={form} onChange={setForm} disabled={status === "submitting"} />

        {error && <div className="text-sm p-3 rounded-lg text-red-700 bg-red-100">{error}</div>}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {status === "submitting" && <Loader2 size={18} className="animate-spin" />}
          {status === "submitting" ? "Creating…" : "Create Product"}
        </button>
      </form>
    </>
  );
}
