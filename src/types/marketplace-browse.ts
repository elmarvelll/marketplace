// src/types/marketplace-browse.ts
//
// Shapes for the *browsing* side of the marketplace (as opposed to
// src/types/product.ts / business.ts, which are for a business owner
// managing their own listings): the product detail modal and the
// homepage's real "Top Businesses" section.

export interface ProductBrowseDetail {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  secureUrl: string | null;
  // Gallery images beyond the primary — see
  // src/app/_components/ProductDetailModal.tsx's
  // thumbnail strip. Empty when the product only has the single legacy
  // image.
  images: { secureUrl: string; position: number }[];
  businessId: string;
  sellerName: string;
  // Flat, one-price-each variants — see ProductVariantSummary in
  // src/types/product.ts. Empty when the product has no variants (buyer
  // just picks a quantity against the base price/stock above).
  variants: { id: string; name: string; price: number; stock: number }[];
  // See services/marketplace/delivery/estimated-delivery.service.ts — "estimated," never "expected."
  // Empty/placeholder for a School Vendor product — see
  // get-public-product-detail.ts's own comment.
  estimatedDeliveryDate: string;
  deliveryWindow: string;
  // "BUSINESS" | "SCHOOL_VENDOR" — see docs/marketplace/decisions/vendor-extends-business.md.
  // Drives the modal's Sides section and (until the Vendor cart ships in a
  // later phase) whether "Add to Cart" is offered at all.
  businessType: "BUSINESS" | "SCHOOL_VENDOR";
  // Universal, vendor-level add-ons — always empty for a Business product.
  sides: { id: string; name: string; price: number; available: boolean; stock: number | null }[];
}

export interface FeaturedBusiness {
  id: string;
  name: string;
  industry: string;
  secureUrl: string | null;
  productCount: number;
}

// GET /api/marketplace/vendor/featured — the "School Vendors" lists on Home and Explore.
export interface FeaturedVendor {
  id: string;
  name: string;
  vendorCategory: string | null;
  secureUrl: string | null;
  location: string | null;
  itemCount: number;
}
