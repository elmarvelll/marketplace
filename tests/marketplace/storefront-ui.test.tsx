// Storefront UI states (rendered to static markup, no browser): product grids never show "no products" unless the
// backend confirmed it, skeletons pulse (motion-safe only), product cards are a single control, Skills stays hidden.
// The interactive behaviour (clicks, alerts, touch, layout widths) is covered by scripts/verify-ui.ts in a real browser.
import "../helpers/env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductGrid, SpotlightList, toCardProduct } from "@/app/_components/ProductGrid";
import ProductCard from "@/app/_components/ProductCard";
import { SKILLS_ENABLED } from "@/app/_components/marketplace-features";
import { buildExploreHref } from "@/app/_components/search-params";

const product = { id: "p1", name: "Fast charger", sellerName: "Gadgets", price: 4250, image: null };
const noop = () => {};
const grid = (state: Parameters<typeof ProductGrid>[0]["state"]) =>
  renderToStaticMarkup(<ProductGrid state={state} onRetry={noop} onShowDetails={noop} emptyMessage="No products listed yet." errorMessage="Couldn't load products." />);

describe("product grid states", () => {
  it("loading: a pulsing skeleton grid, and never the empty message", () => {
    const html = grid({ status: "loading" });
    assert.match(html, /aria-label="Loading products"/);
    assert.equal((html.match(/motion-safe:animate-skeleton/g) ?? []).length, 8, "8 skeleton cards, pulsing only when motion is allowed");
    assert.doesNotMatch(html, /(?<!motion-safe:)animate-(skeleton|pulse)/, "no unconditional animation");
    assert.doesNotMatch(html, /No products listed yet/);
  });

  it("error: an error message with Try again — not the empty message", () => {
    const html = grid({ status: "error" });
    assert.match(html, /role="alert"/);
    assert.match(html, /Couldn&#x27;t load products\./);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /No products listed yet/);
  });

  it("success with zero products: the empty message, and only then", () => {
    const html = grid({ status: "success", data: [] });
    assert.match(html, /No products listed yet\./);
    assert.doesNotMatch(html, /Loading products|Try again/);
  });

  it("success with products: the cards", () => {
    const html = grid({ status: "success", data: [product] });
    assert.match(html, /Fast charger/);
    assert.doesNotMatch(html, /No products listed yet|Loading products|Try again/);
  });

  it("spotlight lists follow the same rules", () => {
    const render = (state: Parameters<typeof SpotlightList<{ id: string }>>[0]["state"]) =>
      renderToStaticMarkup(
        <SpotlightList state={state} onRetry={noop} emptyMessage="No vendors are currently available." errorMessage="Couldn't load vendors." className="grid">
          {(items) => items.map((i) => <p key={i.id}>{i.id}</p>)}
        </SpotlightList>,
      );
    assert.doesNotMatch(render({ status: "loading" }), /No vendors/);
    assert.doesNotMatch(render({ status: "error" }), /No vendors/);
    assert.match(render({ status: "error" }), /Try again/);
    assert.match(render({ status: "success", data: [] }), /No vendors are currently available/);
  });

  it("search rows map to the card shape", () => {
    assert.deepEqual(toCardProduct({ id: "p", name: "N", category: "C", price: 1, secureUrl: "u", sellerName: "S" }), { id: "p", name: "N", sellerName: "S", price: 1, image: "u" });
  });
});

describe("product card", () => {
  it("is one button for the whole card, with an accessible label and no nested controls", () => {
    const html = renderToStaticMarkup(<ProductCard product={product} onShowDetails={noop} />);
    assert.equal((html.match(/<button/g) ?? []).length, 1, "exactly one interactive element");
    assert.doesNotMatch(html, /<a |<input/);
    assert.match(html, /^<button type="button"/);
    assert.match(html, /aria-label="Fast charger by Gadgets, ₦4,250 — show details"/);
    assert.match(html, /Show Details/, "the hover label is still there");
    assert.match(html, /focus-visible:outline/, "visible keyboard focus");
  });
});

describe("Skills hidden in the standalone Marketplace", () => {
  it("is switched off, and search links never carry side=skills", () => {
    assert.equal(SKILLS_ENABLED, false);
    assert.equal(buildExploreHref("cake", "skills", ["c1"]), "/explore?q=cake&categories=c1");
  });

  it("every Skills surface is behind the flag", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), "src/app", f), "utf8");
    for (const file of ["page.tsx", "explore/page.tsx", "_components/FilterDropdown.tsx", "_components/MyTradeDropdown.tsx", "_components/MarketplaceNavbar.tsx", "admin/page.tsx"]) {
      assert.match(read(file), /SKILLS_ENABLED/, file);
    }
    // The home page's Popular Skills section is rendered only inside the flag.
    assert.match(read("page.tsx"), /\{SKILLS_ENABLED && \(\s*<section>\s*<SectionHeading>Popular Skills/);
  });
});

describe("single navbar", () => {
  it("the inherited AkadVerse bar now renders the Marketplace navbar, and storefront pages don't stack two", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), "src/app", f), "utf8");
    assert.match(read("components/dashboard/student/DashboardNavbar.tsx"), /return <MarketplaceNavbar \/>/);
    for (const file of ["page.tsx", "explore/page.tsx", "vendor/[id]/page.tsx"]) assert.doesNotMatch(read(file), /DashboardNavbar/, file);
    assert.doesNotMatch(read("_components/MarketplaceNavbar.tsx"), />M<\/div>/, "signet letter replaced by an icon");
  });
});
