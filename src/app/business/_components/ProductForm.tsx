// src/app/business/_components/ProductForm.tsx
//
// The product name/category/description/price/cost/stock/image/variants
// fields, shared by the "Create Product" page and the "Update Inventory"
// edit page — fully controlled (value/onChange), same pattern as
// BankDetailsFields, so each page just owns its own form state and submit
// handling around this.

"use client";

import { productCategories } from "@/services/marketplace/shared/categories";
import ProductImagesField from "./ProductImagesField";
import VariantOptionsEditor from "./VariantOptionsEditor";
import type { ProductFormValues } from "@/types/product";

interface ProductFormProps {
  value: ProductFormValues;
  onChange: (value: ProductFormValues) => void;
  disabled?: boolean;
}

export default function ProductForm({ value, onChange, disabled }: ProductFormProps) {
  const updateField = (key: keyof ProductFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    onChange({ ...value, [key]: e.target.value });
  };

  return (
    <div className="space-y-8">
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Product details</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="product-name">
            Product name
          </label>
          <input
            id="product-name"
            type="text"
            value={value.name}
            onChange={updateField("name")}
            required
            disabled={disabled}
            placeholder="e.g. Floral Phone Case"
            className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="product-category">
            Category
          </label>
          <select
            id="product-category"
            value={value.category}
            onChange={updateField("category")}
            required
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
          >
            <option value="" disabled>
              Select a category
            </option>
            {productCategories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="product-description">
            Description
          </label>
          <textarea
            id="product-description"
            value={value.description}
            onChange={updateField("description")}
            required
            disabled={disabled}
            rows={4}
            placeholder="What is this product?"
            className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="product-price">
              Price (₦)
            </label>
            <input
              id="product-price"
              type="number"
              min="0"
              step="0.01"
              value={value.price}
              onChange={updateField("price")}
              required
              disabled={disabled}
              className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="product-cost">
              Cost (₦) <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              id="product-cost"
              type="number"
              min="0"
              step="0.01"
              value={value.cost}
              onChange={updateField("cost")}
              disabled={disabled}
              placeholder="0"
              className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="product-stock">
              Stock
            </label>
            <input
              id="product-stock"
              type="number"
              min="0"
              step="1"
              value={value.stock}
              onChange={updateField("stock")}
              required
              disabled={disabled}
              className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
            />
          </div>
        </div>

        <ProductImagesField
          value={value.images}
          disabled={disabled}
          onChange={(images) => onChange({ ...value, images })}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <VariantOptionsEditor
          value={value.variants}
          disabled={disabled}
          onChange={(variants) => onChange({ ...value, variants })}
        />
      </section>
    </div>
  );
}
