// src/app/business/[id]/products/create/page.tsx
//
// The "Create Product" form, reached from the Products tab. Submits to
// POST /api/marketplace/businesses/[id]/products, then returns to the
// Products tab.

"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAxiosError } from "axios";
import { ArrowLeft, Loader2 } from "lucide-react";
import api from "@/lib/axios";
import ProductForm from "../../../_components/ProductForm";
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

export default function CreateProductPage({ params }: { params: Promise<{ id: string }> }) {
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
      await api.post(`/marketplace/businesses/${id}/products`, form);
      router.push(`/business/${id}/products`);
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
        href={`/business/${id}/products`}
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
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {status === "submitting" && <Loader2 size={18} className="animate-spin" />}
          {status === "submitting" ? "Creating…" : "Create Product"}
        </button>
      </form>
    </>
  );
}
