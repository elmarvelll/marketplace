// REAL-BROWSER contrast audit of every Marketplace page (headless Chrome via puppeteer-core), against a server that
// uses the LOCAL replica database. Seeds its own buyer / seller / admin accounts through the replica's owner
// connection and refuses non-local servers.
//
// For each page, with the operating system in LIGHT and in DARK mode, it measures the WCAG contrast ratio of:
//   - every visible text element against its effective background (≥ 4.5:1, or ≥ 3:1 for large/bold text);
//   - every visible form field's text (≥ 4.5:1) and border (≥ 2:1 against the page, so the field is findable);
// and opens the product modal to check the quantity stepper the same way. Disabled controls, placeholders,
// decorative (aria-hidden) elements and text on images/gradients are skipped.
//
// Usage: BASE_URL=http://localhost:3100 PP_DIR=<dir with node_modules/puppeteer-core> npx tsx scripts/verify-contrast.ts

import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_URL = "postgresql://akadverse_owner:akadverse_owner_local_only@127.0.0.1:5434/akadverse_replica";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("BASE_URL must be a local server. Refusing.");
  process.exit(1);
}
const PASSWORD = "ui check password 1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Finding {
  kind: "text" | "field-text" | "field-border";
  text: string;
  ratio: number;
  need: number;
  color: string;
  bg: string;
}

// Runs in the page. Returns the low-contrast findings for what is currently visible.
const AUDIT = `(() => {
  // Any CSS colour (Tailwind v4 uses oklch()) -> sRGB, via a 1px canvas.
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const parse = (c) => { if (!c || c === "transparent") return { r: 0, g: 0, b: 0, a: 0 }; cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  // Effective background: blend ancestor backgrounds; null when an image/gradient is involved (can't judge).
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      if (n.tagName === "IMG") return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
    return out;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; if (r.bottom < 0 || r.top > innerHeight * 3) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.95) return false; if (n.getAttribute("aria-hidden") === "true") return false; if (n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true") return false; }
    return true; };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const out = [];
  // Text
  for (const el of document.querySelectorAll("body *")) {
    if (["SCRIPT", "STYLE", "SVG", "PATH", "INPUT", "SELECT", "TEXTAREA", "OPTION"].includes(el.tagName.toUpperCase())) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!own || !visible(el)) continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(blend(fg, bg), bg);
    if (r < need) out.push({ kind: "text", text: own.slice(0, 50), ratio: +r.toFixed(2), need, color: hex(fg), bg: hex(bg) });
  }
  // Fields
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el); const bg = bgOf(el); const pageBg = bgOf(el.parentElement); if (!bg || !pageBg) continue;
    const fg = parse(cs.color); const r = ratio(blend(fg, bg), bg);
    const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || el.type || el.tagName;
    if (r < 4.5) out.push({ kind: "field-text", text: label, ratio: +r.toFixed(2), need: 4.5, color: hex(fg), bg: hex(bg) });
    const bc = parse(cs.borderTopColor); const bw = parseFloat(cs.borderTopWidth);
    if (bw > 0 && bc) { const br = ratio(blend(bc, pageBg), pageBg); if (br < 2) out.push({ kind: "field-border", text: label, ratio: +br.toFixed(2), need: 2, color: hex(bc), bg: hex(pageBg) }); }
  }
  return out;
})()`;

async function seed(db: PrismaClient) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mk = (email: string, firstName: string, isAdmin = false) =>
    db.user.upsert({ where: { email }, update: { password: hash, isAdmin }, create: { email, firstName, lastName: "Check", password: hash, isAdmin } });
  await mk("ui-check@stu.cu.edu.ng", "Ada");
  const seller = await mk("ui-seller@stu.cu.edu.ng", "Sam");
  await mk("ui-admin@stu.cu.edu.ng", "Ade", true);
  const business = await db.business.findFirst({ where: { userId: seller.id, type: "BUSINESS" } });
  const vendor = await db.business.findFirst({ where: { userId: seller.id, type: "SCHOOL_VENDOR" } });
  if (!business || !vendor) throw new Error("Run scripts/verify-ui.ts once first (it seeds the seller's business and vendor).");
  return { businessId: business.id, vendorId: vendor.id };
}

async function main() {
  const db = new PrismaClient({ datasourceUrl: OWNER_URL });
  const { businessId, vendorId } = await seed(db);
  const puppeteer = createRequire(`${process.env.PP_DIR}/`)("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });

  const groups: { who: string | null; pages: string[] }[] = [
    { who: null, pages: ["/login", "/signup"] },
    { who: "ui-check@stu.cu.edu.ng", pages: ["/", "/explore", "/explore?q=charger", `/vendor/${vendorId}`, "/orders", "/checkout", "/vendor-checkout", "/business/create", "/vendor/apply", "/deliverer/apply"] },
    {
      who: "ui-seller@stu.cu.edu.ng",
      pages: [`/business/${businessId}`, `/business/${businessId}/products`, `/business/${businessId}/products/create`, `/business/${businessId}/orders`, `/vendor-dashboard/${vendorId}`, `/vendor-dashboard/${vendorId}/products`, `/vendor-dashboard/${vendorId}/orders`, `/vendor-dashboard/${vendorId}/sides`],
    },
    { who: "ui-admin@stu.cu.edu.ng", pages: ["/admin", "/admin/businesses", "/admin/users", "/admin/products", "/admin/deliveries", "/admin/vendor-delivery", "/admin/dropoffs", "/admin/settings"] },
  ];

  let total = 0;
  try {
    for (const scheme of ["light", "dark"] as const) {
      for (const group of groups) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
        if (group.who) {
          await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 90_000 });
          await page.type("#login-email", group.who);
          await (await page.$$('input[type="password"]'))[0].type(PASSWORD);
          await page.click('button[type="submit"]');
          await page.waitForFunction(`location.pathname === "/"`, { timeout: 30_000 });
        }
        for (const path of group.pages) {
          await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 90_000 });
          await sleep(800);
          const findings = (await page.evaluate(AUDIT)) as Finding[];
          if (path === "/") {
            // The product modal's quantity stepper and options.
            const card = await page.$('button[aria-label$="show details"]');
            if (card) {
              await card.click();
              await page.waitForFunction(`[...document.querySelectorAll('[role="dialog"] button')].some((b) => /Add to (Vendor )?Cart/.test(b.textContent))`, { timeout: 20_000 }).catch(() => {});
              await sleep(700);
              const modal = (await page.evaluate(AUDIT)) as Finding[];
              const qty = (await page.evaluate(`(() => { const s = [...document.querySelectorAll('[role="dialog"] span')].find((x) => /^\\d+$/.test(x.textContent.trim())); return s ? getComputedStyle(s).color : null; })()`)) as string | null;
              findings.push(...modal.map((f) => ({ ...f, text: `[modal] ${f.text}` })));
              console.log(`      modal quantity number colour (${scheme}): ${qty}`);
              await page.keyboard.press("Escape");
            }
          }
          const unique = [...new Map(findings.map((f) => [`${f.kind}|${f.text}|${f.color}|${f.bg}`, f])).values()];
          total += unique.length;
          console.log(`${unique.length === 0 ? "PASS" : "FAIL"}  [${scheme}] ${path}${unique.length ? ` — ${unique.length} low-contrast` : ""}`);
          for (const f of unique.slice(0, 8)) console.log(`        ${f.kind}: "${f.text}" ${f.color} on ${f.bg} = ${f.ratio}:1 (needs ${f.need})`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await db.$disconnect();
  }
  console.log(`\n${total === 0 ? "No" : total} low-contrast elements found.`);
  process.exit(total === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
