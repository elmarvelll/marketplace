// REAL-BROWSER check of the storefront UI (headless Chrome via puppeteer-core) against a running server that uses
// the LOCAL replica database (npm run db:local:setup). It seeds its own test accounts/products through the replica's
// owner connection and refuses to run against anything but 127.0.0.1.
//
// What it proves:
//   A. One navbar: the inherited "AkadVerse Marketplace" bar is gone; the Marketplace bar has the signet icon (home
//      link) and the account menu holds Sign out.
//   B. Skills is nowhere: home, Explore, a stale ?side=skills link, the Filter panel and My Trade.
//   C. Loading / empty / error are distinct: pulsing skeletons while a request is in flight (no "No products" text),
//      cards on success, the empty message only for a confirmed empty answer, an error + working "Try again" on
//      failure; skeletons stop pulsing under prefers-reduced-motion.
//   D. Product cards: a click anywhere, the Show Details label, and keyboard Enter each open the modal exactly once.
//   E. Add to cart: success -> confirmation alert, modal closes, cart badge updates, never "Added to cart";
//      failure -> error shown, modal stays open, no alert; a double click sends one request.
//   F. Touch: dropdowns open on tap and close on an outside tap; tapping a card opens the modal.
//   G. Layout: no horizontal overflow at 320/375/430/768/1024/1440 on the main pages; the modal fits the viewport.
//
// Usage: start the app against the local replica, then
//   BASE_URL=http://localhost:3100 PP_DIR=<dir with node_modules/puppeteer-core> npx tsx scripts/verify-ui.ts

import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_URL = "postgresql://akadverse_owner:akadverse_owner_local_only@127.0.0.1:5434/akadverse_replica";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("BASE_URL must be a local server. Refusing.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const ok = (name: string, condition: boolean, detail = "") => {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = "ui check password 1";

async function seed(db: PrismaClient) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const buyer = await db.user.upsert({ where: { email: "ui-check@stu.cu.edu.ng" }, update: { password: hash }, create: { email: "ui-check@stu.cu.edu.ng", firstName: "Ada", lastName: "Check", password: hash } });
  const seller = await db.user.upsert({ where: { email: "ui-seller@stu.cu.edu.ng" }, update: {}, create: { email: "ui-seller@stu.cu.edu.ng", firstName: "Sam", lastName: "Seller", password: hash } });
  let business = await db.business.findFirst({ where: { userId: seller.id, type: "BUSINESS" } });
  if (!business) {
    business = await db.business.create({ data: { name: "Campus Gadgets & Accessories Emporium", industry: "Electronics", description: "Chargers", userId: seller.id, approvalStatus: "APPROVED" } });
    for (const [i, name] of ["Fast charger 20W", "Wireless earbuds with a very long product name that should wrap nicely", "Power bank 10,000 mAh", "USB-C cable 2m"].entries()) {
      await db.product.create({ data: { name, category: "Electronics", description: "UI check product.", price: 1500 + i * 2750, stock: 50, businessId: business.id } });
    }
  }
  let vendor = await db.business.findFirst({ where: { userId: seller.id, type: "SCHOOL_VENDOR" } });
  if (!vendor) {
    vendor = await db.business.create({ data: { name: "Mama Put Kitchen", industry: "Food", description: "Hot meals", userId: seller.id, approvalStatus: "APPROVED", type: "SCHOOL_VENDOR", vendorCategory: "Food" } });
    for (const name of ["Jollof rice", "Fried plantain"]) await db.product.create({ data: { name, category: "Food", description: "Vendor item", price: 1200, stock: 20, businessId: vendor.id } });
  }
  await db.product.updateMany({ where: { businessId: business.id }, data: { stock: 50 } });
  await db.cartItem.deleteMany({ where: { userId: buyer.id } });
  return { buyer, vendorId: vendor.id };
}

async function main() {
  const db = new PrismaClient({ datasourceUrl: OWNER_URL });
  const { vendorId } = await seed(db);
  const puppeteer = createRequire(`${process.env.PP_DIR}/`)("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });

  type Page = Awaited<ReturnType<typeof browser.newPage>>;
  const text = (page: Page) => page.evaluate(() => document.body.innerText) as Promise<string>;
  const goto = async (page: Page, path: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 90_000 });
    await sleep(300);
  };
  const waitFor = (page: Page, fn: string, timeout = 20_000) => page.waitForFunction(fn, { timeout }).then(() => true, () => false);
  const dialogOpen = (page: Page) => page.evaluate(() => document.querySelectorAll('[role="dialog"]').length) as Promise<number>;
  const cartBadge = (page: Page) => page.evaluate(() => document.querySelector('button[aria-label^="Open cart"]')?.getAttribute("aria-label") ?? "") as Promise<string>;

  const context = await browser.createBrowserContext();
  const page: Page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Request control for the loading/empty/error scenarios.
  let productsMode: "pass" | "delay" | "empty" | "error" = "pass";
  let cartMode: "pass" | "fail" | "slow" = "pass";
  let cartPosts = 0;
  await page.setRequestInterception(true);
  page.on("request", async (req: { url: () => string; method: () => string; respond: (r: object) => void; continue: () => void }) => {
    const url = req.url();
    if (url.includes("/api/marketplace/search/products") && productsMode !== "pass") {
      if (productsMode === "delay") {
        await sleep(2500);
        return req.continue();
      }
      if (productsMode === "empty") return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [] }) });
      return req.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
    }
    if (url.endsWith("/api/marketplace/cart") && req.method() === "POST") {
      cartPosts++;
      if (cartMode === "fail") return req.respond({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Only 0 left in stock." }) });
      if (cartMode === "slow") {
        await sleep(1500);
        return req.continue();
      }
    }
    return req.continue();
  });
  const alerts: string[] = [];
  page.on("dialog", async (d: { message: () => string; accept: () => Promise<void> }) => {
    alerts.push(d.message());
    await d.accept();
  });

  try {
    // Sign in.
    await goto(page, "/login");
    await page.type("#login-email", "ui-check@stu.cu.edu.ng");
    await (await page.$$('input[type="password"]'))[0].type(PASSWORD);
    await page.click('button[type="submit"]');
    await waitFor(page, `location.pathname === "/"`, 30_000);
    await sleep(1500);

    // ---- A. navbar ------------------------------------------------------------------------------------------------
    const nav = await page.evaluate(() => ({
      headers: document.querySelectorAll("header").length,
      navs: document.querySelectorAll("nav[aria-label='Marketplace']").length,
      inherited: [...document.querySelectorAll("nav, header")].some((el) => /AkadVerse\s+Marketplace/i.test((el as HTMLElement).innerText)),
      signet: Boolean(document.querySelector('a[aria-label="Student Marketplace — home"] svg')),
      signetText: (document.querySelector('a[aria-label="Student Marketplace — home"] span')?.textContent ?? "").trim(),
    }));
    ok("A. exactly one top navbar", nav.headers === 1 && nav.navs === 1, JSON.stringify(nav));
    ok("A. the inherited 'AkadVerse Marketplace' bar is gone", !nav.inherited);
    ok("A. the signet is an icon home link (no 'M' letter)", nav.signet && nav.signetText !== "M");
    await page.click('button[aria-label="Account menu"]');
    ok("A. the account menu holds Sign out", await waitFor(page, `document.body.innerText.includes("Sign out")`, 5000));
    await page.keyboard.press("Escape");

    // ---- B. Skills --------------------------------------------------------------------------------------------------
    const skillWord = /\bskills?\b/i;
    ok("B. no Skills on the home page", !skillWord.test(await text(page)));
    await page.hover('button[aria-label="Filter by category"]');
    await sleep(400);
    ok("B. the Filter panel offers categories, no Skills side", /categories/i.test(await text(page)) && (await text(page)).includes("Electronics") && !skillWord.test(await text(page)));
    await page.mouse.move(5, 500);
    await page.hover('button[aria-label="My Trade"]');
    await waitFor(page, `document.body.innerText.includes("Create Business")`, 8000);
    ok("B. My Trade has businesses only, no Skills tab", (await text(page)).includes("Create Business") && !skillWord.test(await text(page)));
    await page.mouse.move(5, 500);
    await goto(page, "/explore");
    ok("B. no Skills on Explore", !skillWord.test(await text(page)));
    await goto(page, "/explore?side=skills&q=charger");
    ok("B. a stale ?side=skills link shows product results, no Skills", !skillWord.test(await text(page)) && (await text(page)).includes("Fast charger"));

    // ---- C. loading / empty / error ----------------------------------------------------------------------------------
    productsMode = "delay";
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitFor(page, `document.querySelector('[aria-label="Loading products"]') !== null`, 10_000);
    const loading = await page.evaluate(() => ({
      skeleton: document.querySelectorAll('[aria-label="Loading products"]').length > 0,
      anim: getComputedStyle(document.querySelector('[aria-label="Loading products"] > div')!).animationName,
      emptyText: document.body.innerText.includes("No products listed yet."),
    }));
    ok("C. while loading: skeleton grid, pulsing, and no 'No products' text", loading.skeleton && loading.anim === "skeleton-pulse" && !loading.emptyText, JSON.stringify(loading));
    ok("C. after loading: cards replace the skeletons", await waitFor(page, `!document.querySelector('[aria-label="Loading products"]') && document.body.innerText.includes("Fast charger")`, 15_000));

    productsMode = "empty";
    await goto(page, "/");
    ok("C. a confirmed empty answer shows the empty message", (await text(page)).includes("No products listed yet."));

    productsMode = "error";
    await goto(page, "/");
    const errText = await text(page);
    ok("C. a failed request shows an error and Try again — not 'No products'", errText.includes("Couldn't load products") && errText.includes("Try again") && !errText.includes("No products listed yet."));
    productsMode = "pass";
    await page.evaluate(() => (([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Try again")) as HTMLButtonElement) ?? null)?.click());
    ok("C. Try again recovers", await waitFor(page, `document.body.innerText.includes("Fast charger")`, 15_000));

    productsMode = "error";
    await goto(page, "/explore?q=charger");
    ok("C. search failure is an error, not 'No products match'", (await text(page)).includes("Couldn't load results") && !(await text(page)).includes("No products match"));
    productsMode = "empty";
    await goto(page, "/explore?q=zzzz-nothing");
    ok("C. search with a confirmed empty answer says so", (await text(page)).includes("No products match your search."));
    productsMode = "pass";

    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    productsMode = "delay";
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitFor(page, `document.querySelector('[aria-label="Loading products"]') !== null`, 10_000);
    const reduced = await page.evaluate(() => getComputedStyle(document.querySelector('[aria-label="Loading products"] > div')!).animationName);
    ok("C. prefers-reduced-motion: skeletons don't animate", reduced === "none", reduced);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
    productsMode = "pass";
    await sleep(3000);

    // ---- D. card click ----------------------------------------------------------------------------------------------
    await goto(page, "/");
    const card = 'button[aria-label^="Fast charger 20W"]';
    await page.waitForSelector(card);
    await page.evaluate((sel: string) => document.querySelector(sel)!.scrollIntoView({ block: "center" }), card);
    await sleep(300);
    const box = await (await page.$(card))!.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 15); // the price area
    ok("D. clicking the price area opens the modal", (await waitFor(page, `document.querySelector('[role="dialog"]') !== null`, 10_000)) && (await dialogOpen(page)) === 1);
    await page.keyboard.press("Escape");
    await sleep(500);
    ok("D. Escape closes the modal", (await dialogOpen(page)) === 0);
    await page.hover(card);
    await sleep(300);
    const pill = await page.evaluate((sel: string) => {
      const el = [...document.querySelector(sel)!.querySelectorAll("span")].find((s) => s.textContent === "Show Details") as HTMLElement;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: getComputedStyle(el).opacity !== "0" };
    }, card);
    ok("D. 'Show Details' appears on hover", pill.visible);
    await page.mouse.click(pill.x, pill.y);
    await waitFor(page, `document.querySelector('[role="dialog"]') !== null`, 10_000);
    ok("D. clicking 'Show Details' opens exactly one modal", (await dialogOpen(page)) === 1);
    await page.click('[role="dialog"] button[aria-label="Close"]');
    await sleep(500);
    await page.focus(card);
    await page.keyboard.press("Enter");
    ok("D. keyboard Enter on a focused card opens the modal", await waitFor(page, `document.querySelector('[role="dialog"]') !== null`, 10_000));
    const nested = await page.evaluate(() => [...document.querySelectorAll('button[aria-label$="show details"]')].some((b) => b.querySelector("button, a, input")));
    ok("D. no nested interactive elements inside cards", !nested);
    await page.keyboard.press("Escape");
    await sleep(500);

    // ---- E. add to cart ---------------------------------------------------------------------------------------------
    const badgeBefore = await cartBadge(page);
    await page.click(card);
    await waitFor(page, `[...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.trim() === "Add to Cart")`, 15_000);
    alerts.length = 0;
    await page.evaluate(() => ([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.trim() === "Add to Cart") as HTMLButtonElement).click());
    await waitFor(page, `document.querySelectorAll('[role="dialog"]').length === 0`, 15_000);
    await sleep(1500);
    const badgeAfter = await cartBadge(page);
    ok("E. success: a confirmation alert appeared", alerts.length === 1 && /added to your cart/.test(alerts[0]), alerts.join(" | "));
    ok("E. success: the modal closed", (await dialogOpen(page)) === 0);
    ok("E. success: the cart badge updated", badgeAfter !== badgeBefore && /1 item/.test(badgeAfter), `${badgeBefore} -> ${badgeAfter}`);
    await page.click(card);
    await waitFor(page, `[...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.trim() === "Add to Cart")`, 15_000);
    ok("E. reopening shows 'Add to Cart', never 'Added to cart'", !/Added to cart/i.test(await text(page)));

    cartMode = "fail";
    alerts.length = 0;
    await page.evaluate(() => ([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.trim() === "Add to Cart") as HTMLButtonElement).click());
    await waitFor(page, `document.body.innerText.includes("Only 0 left in stock.")`, 10_000);
    ok("E. failure: the error is shown, modal stays open, no success alert", (await dialogOpen(page)) === 1 && alerts.length === 0);

    cartMode = "slow";
    cartPosts = 0;
    alerts.length = 0;
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim() === "Add to Cart") as HTMLButtonElement;
      b.click();
      b.click();
      b.click();
    });
    await waitFor(page, `document.querySelectorAll('[role="dialog"]').length === 0`, 15_000);
    ok("E. a triple click while adding sends one request", cartPosts === 1, `${cartPosts} POSTs`);
    cartMode = "pass";
    await sleep(800);

    // ---- F. touch ---------------------------------------------------------------------------------------------------
    const touch: Page = await context.newPage();
    await touch.emulate({ viewport: { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
    await goto(touch, "/");
    await touch.tap('button[aria-label="My Trade"]');
    ok("F. touch: My Trade opens on tap", await waitFor(touch, `document.body.innerText.includes("Create Business")`, 8000));
    await touch.tap("h2");
    await sleep(500);
    ok("F. touch: an outside tap closes it", !(await text(touch)).includes("Create Business"));
    await touch.tap('button[aria-label="Open search"]');
    await sleep(300);
    // Two copies exist (desktop row, phone row); tap the one that is on screen.
    for (const handle of await touch.$$('button[aria-label="Filter by category"]')) {
      if (await handle.boundingBox()) {
        await handle.tap();
        break;
      }
    }
    ok("F. touch: search row and Filter open on tap", await waitFor(touch, `/categories/i.test(document.body.innerText) && document.body.innerText.includes("Electronics")`, 5000));
    await touch.tap('button[aria-label="Close search"]');
    await sleep(300);
    await touch.waitForSelector(card);
    await touch.tap(card);
    ok("F. touch: tapping a card opens the modal", await waitFor(touch, `document.querySelector('[role="dialog"]') !== null`, 10_000));
    await sleep(700); // let the 200ms open animation (scale + slide) settle before measuring
    const sheet = await touch.evaluate(() => {
      const r = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight };
    });
    ok("F. phone: the modal is a sheet that fits the screen", sheet.left >= 0 && sheet.right <= sheet.w + 1 && sheet.top >= 0 && sheet.bottom <= sheet.h + 1, JSON.stringify(sheet));
    await touch.close();

    // ---- G. layout ----------------------------------------------------------------------------------------------------
    const pages = ["/", "/explore", "/explore?q=charger", `/vendor/${vendorId}`, "/orders", "/checkout", "/vendor-checkout", "/business/create", "/vendor/apply", "/deliverer/apply"];
    for (const width of [320, 375, 430, 768, 1024, 1440]) {
      await page.setViewport({ width, height: 900 });
      const over: string[] = [];
      for (const path of pages) {
        await goto(page, path);
        const overflow = (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) as number;
        if (overflow > 1) over.push(`${path} (+${overflow}px)`);
        const navOk = (await page.evaluate(() => {
          const n = document.querySelector("nav[aria-label='Marketplace']")!.getBoundingClientRect();
          return n.right <= innerWidth + 1 && n.height <= 65;
        })) as boolean;
        if (!navOk) over.push(`${path} (navbar)`);
      }
      ok(`G. ${width}px: no horizontal overflow and the navbar fits, on ${pages.length} pages`, over.length === 0, over.join(", "));
      await goto(page, "/");
      await page.click(card);
      await waitFor(page, `document.querySelector('[role="dialog"]') !== null`, 10_000);
      await waitFor(page, `[...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.trim() === "Add to Cart")`, 15_000);
      await sleep(700); // open animation settles
      const fit = (await page.evaluate(() => {
        const r = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
        return r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.top >= -1;
      })) as boolean;
      ok(`G. ${width}px: the product modal fits the viewport`, fit);
      if (process.env.SHOTS_DIR && (width === 375 || width === 1440)) await page.screenshot({ path: `${process.env.SHOTS_DIR}/modal-${width}.png` });
      await page.keyboard.press("Escape");
      if (process.env.SHOTS_DIR && (width === 320 || width === 375 || width === 1440)) {
        await page.mouse.move(1, 1);
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(800);
        await page.screenshot({ path: `${process.env.SHOTS_DIR}/home-${width}.png` });
      }
    }
  } finally {
    await db.cartItem.deleteMany({ where: { user: { email: "ui-check@stu.cu.edu.ng" } } });
    await browser.close();
    await db.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
