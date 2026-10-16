// src/app/business/_components/ImageUploadField.tsx
//
// The onboarding/edit form's "profile image" control. Picking a file
// immediately uploads it to POST /api/marketplace/uploads (Cloudinary —
// see lib/external/cloudinary.ts) and hands the resulting
// { publicId, secureUrl } back to the parent form; nothing is stored
// locally as a data URL, so what you see previewed is the real uploaded
// asset.

"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import api from "@/lib/axios";

interface ImageUploadFieldProps {
  secureUrl?: string;
  onUploaded: (result: { publicId: string; secureUrl: string }) => void;
  disabled?: boolean;
}

export default function ImageUploadField({ secureUrl, onUploaded, disabled }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ public_id: string; secure_url: string }>("/marketplace/uploads", formData);
      onUploaded({ publicId: res.data.public_id, secureUrl: res.data.secure_url });
    } catch (err) {
      console.error("[ImageUploadField] upload failed", { fileName: file.name, error: err });
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Profile image <span className="text-gray-500 font-normal">(optional)</span>
      </label>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
          {secureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs, not worth a remotePatterns entry for a small thumbnail
            <img src={secureUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={20} className="text-gray-500" />
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : secureUrl ? "Replace image" : "Upload image"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
