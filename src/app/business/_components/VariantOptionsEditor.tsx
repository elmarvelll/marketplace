// src/app/business/_components/VariantOptionsEditor.tsx
//
// The product form's "variants (optional)" control — a flat list of
// selectable options, each with its own name/price/stock (Small ₦2,000
// x10, Medium ₦2,500 x7, ...). No multi-attribute matrix (no Size x Color
// combinations) — see src/types/product.ts's ProductVariantRow.

"use client";

import { Plus, X } from "lucide-react";
import type { ProductVariantRow } from "@/types/product";

interface VariantOptionsEditorProps {
  value: ProductVariantRow[];
  onChange: (value: ProductVariantRow[]) => void;
  disabled?: boolean;
}

export default function VariantOptionsEditor({ value, onChange, disabled }: VariantOptionsEditorProps) {
  const addRow = () => {
    onChange([...value, { name: "", price: "", stock: "" }]);
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<ProductVariantRow>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Variants <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-gray-500 mt-0.5">
          Each variant is one selectable option with its own price and stock — e.g. Small ₦2,000, Medium ₦2,500. Leave empty
          if this product doesn&apos;t have options.
        </p>
      </div>

      {value.map((row, index) => (
        <div key={index} className="flex items-start gap-2 border border-gray-200 rounded-xl p-3">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={row.name}
              onChange={(e) => updateRow(index, { name: e.target.value })}
              disabled={disabled}
              placeholder="Name, e.g. Small"
              className="px-3 py-2 border border-gray-400 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={row.price}
              onChange={(e) => updateRow(index, { price: e.target.value })}
              disabled={disabled}
              placeholder="Price (₦)"
              className="px-3 py-2 border border-gray-400 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
            <input
              type="number"
              min="0"
              step="1"
              value={row.stock}
              onChange={(e) => updateRow(index, { stock: e.target.value })}
              disabled={disabled}
              placeholder="Stock"
              className="px-3 py-2 border border-gray-400 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(index)}
            disabled={disabled}
            aria-label="Remove variant"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition disabled:opacity-60 shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-60"
      >
        <Plus size={14} />
        Add variant
      </button>
    </div>
  );
}
