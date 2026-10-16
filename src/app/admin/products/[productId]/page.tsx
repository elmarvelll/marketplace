// src/app/admin/products/[productId]/page.tsx
//
// Admin product detail — full description, every image, every variant
// with its own price/stock, and the owning business (linking back to the
// admin Business Profile page). Backed by
// GET /marketplace/admin/products/[productId] — see
// services/marketplace/admin/get-product-detail-for-admin.ts.

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, ArrowLeft, Loader2, Store } from "lucide-react";
import api from "@/lib/axios";

interface AdminProductDetail {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  publicId: string | null;
  secureUrl: string | null;
  createdAt: string;
  images: { id?: string; secureUrl: string; position: number }[];
  variants: { id: string; name: string; price: number; stock: number }[];
  business: { id: string; name: string; approvalStatus: string };
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

export default function AdminProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params);
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "not-found" | "error">("loading");
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const run = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<{ product: AdminProductDetail }>(`/marketplace/admin/products/${productId}`);
        setProduct(res.data.product);
        setActiveImage(0);
        setLoadState("loaded");
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 403) setLoadState("forbidden");
        else if (isAxiosError(err) && err.response?.status === 404) setLoadState("not-found");
        else setLoadState("error");
      }
    };
    run();
  }, [productId]);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState !== "loaded" || !product) {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">
          {loadState === "forbidden"
            ? "Admin access required."
            : loadState === "not-found"
              ? "This product doesn't exist."
              : "Couldn't load this product."}
        </p>
      </div>
    );
  }

  const gallery = [product.secureUrl, ...product.images.map((i) => i.secureUrl)].filter((u): u is string => Boolean(u));

  return (
    <div>
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition mb-6"
      >
        <ArrowLeft size={16} />
        Back to Products
      </Link>

      <div className="grid sm:grid-cols-2 gap-6 mb-6">
        <div>
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-100">
            {gallery[activeImage] ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL
              <img src={gallery[activeImage]} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">No image</div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {gallery.map((url, index) => (
                <button
                  key={url + index}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition ${
                    index === activeImage ? "border-blue-600" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{product.category}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words mt-1">{product.name}</h1>
          <Link
            href={`/admin/businesses/${product.business.id}`}
            className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition mt-1"
          >
            <Store size={14} className="shrink-0" />
            <span className="truncate max-w-[16rem]">{product.business.name}</span>
            {product.business.approvalStatus !== "APPROVED" && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                {product.business.approvalStatus.replace("_", " ")}
              </span>
            )}
          </Link>

          <p className="text-2xl font-bold text-blue-600 mt-4">₦{nairaFormatter.format(product.price)}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                product.stock > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}
            >
              {product.stock > 0 ? `In stock — ${product.stock}` : "Out of stock"}
            </span>
            <span className="text-xs text-gray-500">Listed {dateFormatter.format(new Date(product.createdAt))}</span>
          </div>

          <p className="text-sm text-gray-600 mt-4 leading-relaxed">{product.description}</p>
        </div>
      </div>

      {product.variants.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Variants ({product.variants.length})</h2>
          <div className="space-y-2">
            {product.variants.map((variant) => (
              <div key={variant.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100">
                <p className="text-sm font-medium text-gray-900">{variant.name}</p>
                <p className="text-sm text-gray-500">
                  ₦{nairaFormatter.format(variant.price)} ·{" "}
                  <span className={variant.stock > 0 ? "text-green-700" : "text-red-600"}>
                    {variant.stock > 0 ? `${variant.stock} in stock` : "Out of stock"}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
