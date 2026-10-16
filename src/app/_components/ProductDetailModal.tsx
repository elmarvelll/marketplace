// src/app/_components/ProductDetailModal.tsx
//
// Opened from a ProductCard's "Show Details" button. Centered modal with
// an image gallery (main image + thumbnail strip when there's more than
// one), full description, a flat variant picker (if the product has any —
// see src/types/product.ts's ProductVariantRow, one name/price/stock
// each — not attribute combinations), a quantity stepper bounded to the
// selected variant's stock, and "Add to Cart" (POST /api/marketplace/cart).
// A variant must be selected before adding to cart whenever the product
// has any.
//
// Adding to either cart: the button shows a spinner and can't be pressed again while the request runs; only after
// the server confirms does the cart refresh, a confirmation alert appear (the app's existing window.alert pattern —
// there is no toast system) and the modal close. There is no lingering "Added to cart" state. On failure the
// server's message is shown and the modal stays open to retry.
//
// Phones: a bottom sheet (full width, up to 92% of the screen height, scrolls inside; the close button stays
// pinned). Escape or a click on the backdrop closes it.

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Loader2, Minus, Plus, RotateCw, X } from "lucide-react";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import type { ProductBrowseDetail } from "@/types/marketplace-browse";
import type { CartLineItem } from "@/types/cart";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

// "base" stands in for "the product itself" when it has no variants — a
// vendor product's per-line quantity map is keyed by variantId when the
// product has variants, else this sentinel, so a no-variant vendor product
// still gets a single qty stepper through the same code path.
const BASE_VARIANT_KEY = "base";

interface ProductDetailModalProps {
  productId: string | null;
  onClose: () => void;
  onAdded: () => void;
}

export default function ProductDetailModal({ productId, onClose, onAdded }: ProductDetailModalProps) {
  const [product, setProduct] = useState<ProductBrowseDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addStatus, setAddStatus] = useState<"idle" | "adding" | "error">("idle");
  const [addError, setAddError] = useState("");
  const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "sent">("idle");
  // Vendor mode: every variant (or BASE_VARIANT_KEY if none) and every
  // side gets its own independent quantity — spec §8's "Small x2, Large
  // x1" requirement, not a single radio-style pick.
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});
  const [sideQuantities, setSideQuantities] = useState<Record<string, number>>({});
  const [vendorAddStatus, setVendorAddStatus] = useState<"idle" | "adding" | "error">("idle");
  const [vendorAddError, setVendorAddError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Synchronous guard against a double tap firing two add requests before React re-renders the disabled button.
  const submitting = useRef(false);

  // Escape closes the modal.
  useEffect(() => {
    if (!productId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [productId, onClose]);

  useEffect(() => {
    if (!productId) return;

    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      setSelectedVariantId(null);
      setActiveImage(0);
      setQuantity(1);
      setAddStatus("idle");
      setAddError("");
      setVariantQuantities({});
      setSideQuantities({});
      setVendorAddStatus("idle");
      setVendorAddError("");
      try {
        const res = await api.get<{ product: ProductBrowseDetail }>(`/marketplace/products/${productId}`);
        if (cancelled) return;
        setProduct(res.data.product);
        setStatus("loaded");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [productId, loadAttempt]);

  const selectedVariant = product?.variants.find((v) => v.id === selectedVariantId) ?? null;
  const hasVariants = (product?.variants.length ?? 0) > 0;
  const variantRequired = hasVariants && !selectedVariant;
  const displayPrice = selectedVariant ? selectedVariant.price : product?.price ?? 0;
  const availableStock = selectedVariant ? selectedVariant.stock : product?.stock ?? 0;

  const gallery = product ? [product.secureUrl, ...product.images.map((i) => i.secureUrl)].filter((u): u is string => Boolean(u)) : [];

  const handleReportBusiness = async () => {
    if (!product) return;
    const reason = window.prompt(`Report ${product.sellerName} — what's the issue?`);
    if (!reason) return;
    setReportStatus("sending");
    try {
      await api.post(`/marketplace/businesses/${product.businessId}/report`, { reason });
      setReportStatus("sent");
    } catch {
      setReportStatus("idle");
      window.alert("Couldn't submit the report. Please try again.");
    }
  };

  // Runs after the server confirmed the add: refresh the carts, confirm, close.
  const finishAdded = (message: string) => {
    onAdded();
    window.alert(message);
    onClose();
  };

  const handleAddToCart = async () => {
    if (!product || submitting.current) return;
    submitting.current = true;
    setAddStatus("adding");
    setAddError("");

    try {
      await api.post<{ item: CartLineItem }>("/marketplace/cart", {
        productId: product.id,
        variantId: selectedVariant?.id,
        quantity,
      });
      setAddStatus("idle");
      finishAdded(`${product.name}${selectedVariant ? ` (${selectedVariant.name})` : ""} was added to your cart.`);
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't add this to your cart.";
      setAddError(message);
      setAddStatus("error");
    } finally {
      submitting.current = false;
    }
  };

  const setVariantQty = (key: string, qty: number, max: number) => {
    setVariantQuantities((current) => ({ ...current, [key]: Math.max(0, Math.min(qty, max)) }));
  };
  const setSideQty = (sideId: string, qty: number, max: number | null) => {
    setSideQuantities((current) => ({ ...current, [sideId]: Math.max(0, max === null ? qty : Math.min(qty, max)) }));
  };

  const handleAddToVendorCart = async () => {
    if (!product || submitting.current) return;
    submitting.current = true;
    setVendorAddStatus("adding");
    setVendorAddError("");

    try {
      const variantLines = product.variants.length > 0
        ? product.variants.filter((v) => (variantQuantities[v.id] ?? 0) > 0).map((v) => ({ variantId: v.id, quantity: variantQuantities[v.id] }))
        : (variantQuantities[BASE_VARIANT_KEY] ?? 0) > 0
          ? [{ variantId: undefined, quantity: variantQuantities[BASE_VARIANT_KEY] }]
          : [];
      const sideLines = product.sides.filter((s) => (sideQuantities[s.id] ?? 0) > 0).map((s) => ({ sideId: s.id, quantity: sideQuantities[s.id] }));

      if (variantLines.length === 0 && sideLines.length === 0) {
        setVendorAddStatus("error");
        setVendorAddError("Select at least one item or side.");
        return; // `finally` releases the guard
      }

      for (const line of variantLines) {
        await api.post("/marketplace/vendor-cart", { productId: product.id, variantId: line.variantId, quantity: line.quantity });
      }
      for (const line of sideLines) {
        await api.post("/marketplace/vendor-cart", { sideId: line.sideId, quantity: line.quantity });
      }

      setVendorAddStatus("idle");
      finishAdded(`${product.name} was added to your Vendor cart.`);
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't add this to your Vendor cart.";
      setVendorAddError(message);
      setVendorAddStatus("error");
    } finally {
      submitting.current = false;
    }
  };

  return (
    <AnimatePresence>
      {productId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={product?.name ?? "Product details"}
              initial={{ opacity: 0, scale: 0.97, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 24 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain"
            >
              <div className="sticky top-0 z-10 flex items-center justify-end p-3 sm:p-4 sm:pb-0 bg-white/90 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              {status === "loading" && (
                <div className="flex justify-center py-24">
                  <Loader2 size={28} className="animate-spin text-gray-500" />
                </div>
              )}

              {status === "error" && (
                <div role="alert" className="flex flex-col items-center text-center py-20 px-6">
                  <AlertCircle size={28} className="text-gray-500 mb-3" aria-hidden />
                  <p className="text-gray-500">Couldn&apos;t load this product.</p>
                  <button
                    type="button"
                    onClick={() => setLoadAttempt((n) => n + 1)}
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    <RotateCw size={14} aria-hidden /> Try again
                  </button>
                </div>
              )}

              {status === "loaded" && product && (
                <div className="px-4 sm:px-6 pb-6 grid sm:grid-cols-2 gap-5 sm:gap-6">
                  <div>
                    <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-100">
                      {gallery[activeImage] ? (
                        <Image
                          src={gallery[activeImage]}
                          alt={product.name}
                          fill
                          sizes="(min-width: 640px) 320px, 90vw"
                          className="object-cover"
                        />
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
                            className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition shrink-0 ${
                              index === activeImage ? "border-blue-600" : "border-transparent"
                            }`}
                          >
                            <Image src={url} alt="" fill sizes="56px" className="object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{product.category}</p>
                    <h2 className="text-xl font-bold text-gray-900 mt-1 break-words">{product.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                      <p className="text-sm text-gray-500">by {product.sellerName}</p>
                      {reportStatus === "sent" ? (
                        <span className="text-xs text-gray-500">· Reported</span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleReportBusiness}
                          disabled={reportStatus === "sending"}
                          className="text-xs text-gray-500 hover:text-red-500 underline transition disabled:opacity-50"
                        >
                          · Report business
                        </button>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-blue-600 mt-3">
                      {product.businessType === "SCHOOL_VENDOR" ? `From ₦${nairaFormatter.format(product.price)}` : `₦${nairaFormatter.format(displayPrice)}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {product.businessType === "SCHOOL_VENDOR"
                        ? product.deliveryWindow
                        : `Estimated delivery: ${product.estimatedDeliveryDate} · ${product.deliveryWindow}`}
                    </p>
                    <p className="text-sm text-gray-600 mt-4 leading-relaxed break-words whitespace-pre-line">{product.description}</p>

                    {product.businessType === "SCHOOL_VENDOR" ? (
                      <>
                        <div className="mt-5">
                          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                            {hasVariants ? "Options" : "Quantity"}
                          </p>
                          <div className="space-y-2">
                            {(hasVariants ? product.variants : [{ id: BASE_VARIANT_KEY, name: "", price: product.price, stock: product.stock }]).map(
                              (variant) => {
                                const key = variant.id;
                                const qty = variantQuantities[key] ?? 0;
                                const outOfStock = variant.stock === 0;
                                return (
                                  <div key={key} className="flex items-center justify-between gap-3 border border-gray-300 rounded-xl px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {variant.name || product.name} — ₦{nairaFormatter.format(variant.price)}
                                      </p>
                                      <p className="text-xs text-gray-500">{outOfStock ? "Out of stock" : `${variant.stock} in stock`}</p>
                                    </div>
                                    <div className="flex items-center gap-2 border border-gray-400 bg-white rounded-lg px-1.5 py-0.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setVariantQty(key, qty - 1, variant.stock)}
                                        disabled={qty <= 0}
                                        className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                                        aria-label={`Decrease ${variant.name || product.name} quantity`}
                                      >
                                        <Minus size={13} />
                                      </button>
                                      <span className="text-xs font-semibold text-gray-900 w-6 text-center tabular-nums">{qty}</span>
                                      <button
                                        type="button"
                                        onClick={() => setVariantQty(key, qty + 1, variant.stock)}
                                        disabled={outOfStock || qty >= variant.stock}
                                        className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                                        aria-label={`Increase ${variant.name || product.name} quantity`}
                                      >
                                        <Plus size={13} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>

                        {product.sides.length > 0 && (
                          <div className="mt-5">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                              Sides available from this vendor
                            </p>
                            <div className="space-y-2">
                              {product.sides.map((side) => {
                                const qty = sideQuantities[side.id] ?? 0;
                                const outOfStock = side.stock === 0;
                                return (
                                  <div key={side.id} className="flex items-center justify-between gap-3 border border-gray-300 rounded-xl px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {side.name} — ₦{nairaFormatter.format(side.price)}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {outOfStock ? "Out of stock" : side.stock === null ? "Available" : `${side.stock} in stock`}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 border border-gray-400 bg-white rounded-lg px-1.5 py-0.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setSideQty(side.id, qty - 1, side.stock)}
                                        disabled={qty <= 0}
                                        className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                                        aria-label={`Decrease ${side.name} quantity`}
                                      >
                                        <Minus size={13} />
                                      </button>
                                      <span className="text-xs font-semibold text-gray-900 w-6 text-center tabular-nums">{qty}</span>
                                      <button
                                        type="button"
                                        onClick={() => setSideQty(side.id, qty + 1, side.stock)}
                                        disabled={outOfStock || (side.stock !== null && qty >= side.stock)}
                                        className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                                        aria-label={`Increase ${side.name} quantity`}
                                      >
                                        <Plus size={13} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {vendorAddError && <p role="alert" className="mt-3 text-sm text-red-600">{vendorAddError}</p>}

                        <button
                          type="button"
                          onClick={handleAddToVendorCart}
                          disabled={vendorAddStatus === "adding"}
                          className="mt-5 w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {vendorAddStatus === "adding" && <Loader2 size={16} className="animate-spin" />}
                          {vendorAddStatus === "adding" ? "Adding…" : "Add to Vendor Cart"}
                        </button>
                      </>
                    ) : (
                      <>
                        {hasVariants && (
                          <div className="mt-5">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Options</p>
                            <div className="flex flex-wrap gap-2">
                              {product.variants.map((variant) => {
                                const selected = selectedVariantId === variant.id;
                                const outOfStock = variant.stock === 0;
                                return (
                                  <button
                                    key={variant.id}
                                    type="button"
                                    disabled={outOfStock}
                                    onClick={() => {
                                      setSelectedVariantId(variant.id);
                                      setQuantity(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                                      selected ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-800 hover:bg-gray-50"
                                    }`}
                                  >
                                    {selected && <Check size={12} />}
                                    {variant.name} — ₦{nairaFormatter.format(variant.price)}
                                    {outOfStock && " (out of stock)"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="mt-5 flex items-center gap-3">
                          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Qty</span>
                          <div className="flex items-center gap-3 border border-gray-400 bg-white rounded-lg px-2 py-1">
                            <button
                              type="button"
                              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                              disabled={quantity <= 1}
                              className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                              aria-label="Decrease quantity"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-semibold text-gray-900 w-6 text-center tabular-nums">{quantity}</span>
                            <button
                              type="button"
                              onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                              disabled={quantity >= availableStock || (hasVariants && !selectedVariant)}
                              className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-gray-800 hover:text-gray-950 hover:bg-gray-100 transition disabled:opacity-40"
                              aria-label="Increase quantity"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="text-xs text-gray-500">
                            {hasVariants && !selectedVariant ? "Select an option" : `${availableStock} in stock`}
                          </span>
                        </div>

                        {addError && <p role="alert" className="mt-3 text-sm text-red-600">{addError}</p>}

                        <button
                          type="button"
                          onClick={handleAddToCart}
                          disabled={variantRequired || availableStock === 0 || addStatus === "adding"}
                          className="mt-5 w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {addStatus === "adding" && <Loader2 size={16} className="animate-spin" />}
                          {variantRequired
                            ? "Select options"
                            : availableStock === 0
                              ? "Out of stock"
                              : addStatus === "adding"
                                ? "Adding…"
                                : "Add to Cart"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
