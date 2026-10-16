// src/app/business/_components/ProductImagesField.tsx
//
// The product form's multi-image control — up to a handful of gallery
// images, reusing the same POST /api/marketplace/uploads (Cloudinary)
// endpoint as ImageUploadField.tsx, one upload per file. The first image
// is always the primary/main image (mirrored onto
// Product.image/public_id/secure_url server-side — see
// services/marketplace/product/shared/product-images.ts); sellers can
// remove any image or promote another to primary by dragging it to the
// front... kept simple here as a "Make primary" button instead, since drag
// reordering isn't needed for a handful of images.

"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Star, Upload, X } from "lucide-react";
import api from "@/lib/axios";
import type { ProductImageRow } from "@/types/product";

const MAX_IMAGES = 8;

interface ProductImagesFieldProps {
  value: ProductImageRow[];
  onChange: (value: ProductImageRow[]) => void;
  disabled?: boolean;
}

export default function ProductImagesField({ value, onChange, disabled }: ProductImagesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const room = MAX_IMAGES - value.length;
    const toUpload = files.slice(0, Math.max(0, room));
    if (toUpload.length === 0) {
      setError(`You can add up to ${MAX_IMAGES} images.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError("");
    try {
      const uploaded: ProductImageRow[] = [];
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.post<{ public_id: string; secure_url: string }>("/marketplace/uploads", formData);
        uploaded.push({ publicId: res.data.public_id, secureUrl: res.data.secure_url, position: value.length + uploaded.length });
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      console.error("[ProductImagesField] upload failed", {
        fileNames: toUpload.map((file) => file.name),
        error: err,
      });
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    onChange(value.filter((_, i) => i !== index).map((image, i) => ({ ...image, position: i })));
  };

  const makePrimary = (index: number) => {
    if (index === 0) return;
    const reordered = [value[index], ...value.filter((_, i) => i !== index)];
    onChange(reordered.map((image, i) => ({ ...image, position: i })));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Product images <span className="text-gray-500 font-normal">(optional — first image is the main one)</span>
      </label>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3">
          {value.map((image, index) => (
            <div key={image.id ?? image.publicId} className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100 group">
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs, not worth a remotePatterns entry for a small thumbnail */}
              <img src={image.secureUrl} alt="" className="w-full h-full object-cover" />
              {index === 0 && (
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-semibold uppercase tracking-wide text-center py-0.5">
                  Main
                </span>
              )}
              <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                {index !== 0 && (
                  <button
                    type="button"
                    onClick={() => makePrimary(index)}
                    disabled={disabled}
                    aria-label="Make main image"
                    className="w-5 h-5 flex items-center justify-center rounded-full bg-white/90 text-gray-700 hover:bg-white transition"
                  >
                    <Star size={11} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  disabled={disabled}
                  aria-label="Remove image"
                  className="w-5 h-5 flex items-center justify-center rounded-full bg-white/90 text-gray-700 hover:bg-white transition"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {value.length < MAX_IMAGES ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : value.length === 0 ? <ImageIcon size={14} /> : <Upload size={14} />}
          {uploading ? "Uploading…" : value.length === 0 ? "Add images" : "Add more images"}
        </button>
      ) : (
        <p className="text-xs text-gray-500">Maximum of {MAX_IMAGES} images.</p>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
