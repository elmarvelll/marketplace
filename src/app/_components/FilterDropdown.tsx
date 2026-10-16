// src/app/_components/FilterDropdown.tsx
//
// The navbar's "Filter" control. Clicking a category selects it as a real filter (up to `MAX_FILTERS`), which is
// what actually drives the search — selection state is owned by the parent (see MarketplaceNavbar.tsx) since it also
// has to combine with the search box's text query. Opens on hover with a mouse, on tap on touch screens
// (./use-dropdown.ts).
//
// With Skills enabled (./marketplace-features.ts) there is a level 1 (Products/Skills) whose hover only previews
// which category list is showing; selecting a category under a different side switches the search side. With Skills
// hidden — the standalone Marketplace's setting — only product categories are offered and there is no side toggle.

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { productCategories, skillCategories } from "@/services/marketplace/shared/categories";
import type { MarketplaceSide } from "@/services/marketplace/shared/types";
import { SKILLS_ENABLED } from "./marketplace-features";
import { useDropdown } from "./use-dropdown";

export const MAX_FILTERS = 4;

const SIDES: MarketplaceSide[] = SKILLS_ENABLED ? ["products", "skills"] : ["products"];

interface FilterDropdownProps {
  selectedSide: MarketplaceSide;
  selectedCategoryIds: string[];
  onToggleCategory: (side: MarketplaceSide, categoryId: string) => void;
}

export default function FilterDropdown({ selectedSide, selectedCategoryIds, onToggleCategory }: FilterDropdownProps) {
  const [previewSide, setPreviewSide] = useState<MarketplaceSide>(selectedSide);
  const { open, containerProps, buttonProps } = useDropdown(() => setPreviewSide(selectedSide));

  const categories = previewSide === "skills" && SKILLS_ENABLED ? skillCategories : productCategories;
  // Selections only ever belong to one side at a time, so the "which
  // categories are checked" list only applies while previewing that side.
  const activeSelection = previewSide === selectedSide ? selectedCategoryIds : [];
  const atMax = activeSelection.length >= MAX_FILTERS;

  return (
    <div className="relative" {...containerProps}>
      <button
        type="button"
        aria-label="Filter by category"
        {...buttonProps}
        className={`flex min-h-10 items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl border text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-blue-600 ${
          selectedCategoryIds.length > 0
            ? "border-blue-500 bg-blue-50 text-blue-600"
            : "border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <SlidersHorizontal size={16} className="sm:hidden" aria-hidden />
        <span className="hidden sm:inline">Filter</span>
        {selectedCategoryIds.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
            {selectedCategoryIds.length}
          </span>
        )}
        <ChevronDown size={14} aria-hidden className={`hidden sm:block transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed left-4 right-4 top-[8.5rem] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 flex flex-col sm:flex-row bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden z-40 max-h-[70vh] sm:max-h-none"
          >
            {SIDES.length > 1 && (
              <div className="flex sm:block sm:w-40 border-b sm:border-b-0 sm:border-r border-gray-100 py-2">
                {SIDES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPreviewSide(option)}
                    onMouseEnter={() => setPreviewSide(option)}
                    className={`flex-1 sm:w-full text-center sm:text-left px-4 py-2.5 text-sm font-medium capitalize transition ${
                      previewSide === option ? "bg-blue-50 text-blue-600" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {option}
                    {option === selectedSide && selectedCategoryIds.length > 0 && (
                      <span className="ml-1.5 text-xs text-blue-600">({selectedCategoryIds.length})</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={previewSide}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.12 }}
                className="w-full sm:w-64 py-2 max-h-[60vh] sm:max-h-80 overflow-y-auto"
              >
                {SIDES.length === 1 && <p className="px-4 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Categories</p>}
                {atMax && (
                  <p className="px-4 pb-2 text-xs text-amber-700">Up to {MAX_FILTERS} filters — remove one to add another.</p>
                )}
                {categories.map((category) => {
                  const Icon = category.icon;
                  const selected = activeSelection.includes(category.id);
                  const disabled = !selected && atMax;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => onToggleCategory(previewSide, category.id)}
                      className={`w-full flex min-h-10 items-center gap-2.5 text-left px-4 py-2 text-sm transition ${
                        selected
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : disabled
                            ? "text-gray-400 cursor-not-allowed"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <Icon size={16} aria-hidden className={`shrink-0 ${selected ? "text-blue-600" : "text-gray-500"}`} />
                      <span className="flex-1">{category.name}</span>
                      {selected && <Check size={14} className="text-blue-600 shrink-0" aria-hidden />}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
