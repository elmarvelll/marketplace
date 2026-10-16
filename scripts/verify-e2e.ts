// REAL-BROWSER end-to-end check of the standalone Marketplace (headless Chrome via puppeteer-core) against a running
// server connected to the LOCAL REPLICA of AkadVerse's database (npm run db:local:setup). Never a hosted database:
// it refuses unless AKADVERSE_DATABASE_URL is a loopback host and MARKETPLACE_ENV=local.
//
// "AkadVerse" is played by the replica's owner connection (akadverse_owner), which creates the accounts — exactly
// what AkadVerse's own sign-up does. Everything the Marketplace does goes through the running app as marketplace_app.
//
// What it proves:
//   A. Independent sessions — an existing AkadVerse student signs in with their AkadVerse password; the cookie is this
//      app's own (mkt.session-token: HttpOnly, SameSite=Lax); sign-out; protected pages bounce to /login; no account
//      is created and nothing about the AkadVerse login changes; sign-up sends people to AkadVerse.
//   B. Eligibility — a non-student AkadVerse account isn't admitted; a wrong password is refused generically.
//   C. Shared records through the real API — create a business (pending) → AkadVerse sees that exact row → an admin
//      (AkadVerse's isAdmin flag) approves it → owner adds a product → buyer finds it, carts it, reaches checkout;
//      ownership and admin boundaries hold.
//   D. Blocking — an admin blocks a signed-in buyer: their open session is refused immediately; sign-in is refused;
//      the AkadVerse account itself is unchanged.
//   E. Layout — on every page under the fixed navbar the back control is visible and nothing overflows, at three widths.
//
// Usage: README "Browser check".

import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_URL = "postgresql://akadverse_owner:akadverse_owner_local_only@127.0.0.1:5434/akadverse_replica";

const runtimeHost = new URL(process.env.AKADVERSE_DATABASE_URL ?? "http://missing").hostname;
if ((runtimeHost !== "127.0.0.1" && runtimeHost !== "localhost") || process.env.MARKETPLACE_ENV !== "local") {
  console.error("This check only runs against the local replica (AKADVERSE_DATABASE_URL on 127.0.0.1, MARKETPLACE_ENV=local). Refusing.");
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

async function main() {
  const akadverse = new PrismaClient({ datasourceUrl: OWNER_URL });
  const puppeteer = createRequire(`${process.env.PP_DIR}/`)("puppeteer-core");
  const tag = randomUUID().slice(0, 8);
  const password = "e2e correct horse 9";
  const hash = await bcrypt.hash(password, 10);
  // AkadVerse's sign-up, played by the owner connection.
  const makeAccount = (prefix: string, extra: { role?: "student" | "faculty"; isAdmin?: boolean } = {}) =>
    akadverse.user.create({ data: { email: `${prefix}${tag}@stu.cu.edu.ng`, firstName: prefix, lastName: "Tester", password: hash, role: extra.role ?? "student", isAdmin: extra.isAdmin ?? false } });
  const [buyer, seller, admin, staff] = [await makeAccount("e2ebuyer"), await makeAccount("e2eseller"), await makeAccount("e2eadmin", { isAdmin: true }), await makeAccount("e2estaff", { role: "faculty" })];
  const usersBefore = await akadverse.user.count();

  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
  const newPage = async () => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    return page;
  };
  type Page = Awaited<ReturnType<typeof newPage>>;
  const text = (page: Page) => page.evaluate(() => document.body.innerText);
  const goto = async (page: Page, path: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(200);
  };
  const waitForText = (page: Page, needle: string) => page.waitForFunction((t: string) => document.body.innerText.includes(t), { timeout: 30_000 }, needle).then(() => true, () => false);
  const api = (page: Page, method: string, path: string, body?: unknown) =>
    page.evaluate(
      async (m: string, p: string, b: unknown) => {
        const res = await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      method,
      `/api${path}`,
      body,
    ) as Promise<{ status: number; body: Record<string, unknown> | null }>;
  const type = async (page: Page, selector: string, value: string) => {
    await page.waitForSelector(selector, { timeout: 15_000 });
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value);
  };
  const signIn = async (page: Page, email: string, pass: string) => {
    await goto(page, "/login");
    await type(page, "#login-email", email);
    await (await page.$$('input[type="password"]'))[0].type(pass);
    await page.click('button[type="submit"]');
    await sleep(2500);
  };

  try {
    // ---- A. independent sessions with an existing AkadVerse account -------------------------------------------------
    const buyerPage = await newPage();
    await goto(buyerPage, "/orders");
    ok("A. a signed-out visitor is sent to sign in, keeping where they were going", buyerPage.url() === `${BASE}/login?callbackUrl=%2Forders`, buyerPage.url());
    await goto(buyerPage, "/signup");
    ok("A. /signup sends people to AkadVerse to create their account (no Marketplace sign-up form)", (await text(buyerPage)).includes("Create your account on AkadVerse") && (await buyerPage.$$('input[type="password"]')).length === 0);
    await signIn(buyerPage, buyer.email, password);
    ok("A. an existing AkadVerse student signs in with their AkadVerse password", (await text(buyerPage)).includes("Sign out") && new URL(buyerPage.url()).pathname === "/", buyerPage.url());
    const cookies = await buyerPage.cookies();
    const sessionCookie = cookies.find((c: { name: string }) => c.name.endsWith("mkt.session-token"));
    ok("A. the session cookie is this app's own, HttpOnly and SameSite=Lax", Boolean(sessionCookie?.httpOnly) && sessionCookie?.sameSite === "Lax", sessionCookie ? `${sessionCookie.name}; httpOnly=${sessionCookie.httpOnly}; sameSite=${sessionCookie.sameSite}` : "missing");
    ok("A. no AkadVerse-named auth cookie is set", !cookies.some((c: { name: string }) => c.name.includes("next-auth")), cookies.map((c: { name: string }) => c.name).join(", "));
    const buyerAfter = await akadverse.user.findUniqueOrThrow({ where: { id: buyer.id } });
    ok("A. signing in created no account and changed nothing on the AkadVerse login", (await akadverse.user.count()) === usersBefore && buyerAfter.password === hash && buyerAfter.updatedAt.getTime() === buyer.updatedAt.getTime());

    await buyerPage.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Sign out"))?.click());
    await buyerPage.waitForFunction(() => location.pathname === "/login", { timeout: 20_000 }).catch(() => {});
    await goto(buyerPage, "/orders");
    ok("A. after signing out, protected pages need sign-in again", new URL(buyerPage.url()).pathname === "/login");
    ok("A. …and the API refuses", (await api(buyerPage, "GET", "/marketplace/cart")).status === 401);
    await signIn(buyerPage, buyer.email, password);
    ok("A. signing in again works", (await text(buyerPage)).includes("Sign out"));

    // ---- B. eligibility ----------------------------------------------------------------------------------------------
    const otherPage = await newPage();
    await signIn(otherPage, buyer.email, "not their password");
    ok("B. a wrong password is refused without saying which part was wrong", (await text(otherPage)).includes("That email or password isn't right."));
    await signIn(otherPage, staff.email, password);
    ok("B. a non-student AkadVerse account is not admitted", (await text(otherPage)).includes("isn't a student account"));

    // ---- C. shared records -------------------------------------------------------------------------------------------
    const sellerPage = await newPage();
    await signIn(sellerPage, seller.email, password);
    const created = await api(sellerPage, "POST", "/marketplace/businesses", { name: `E2E Store ${tag}`, industry: "Food", description: "End-to-end test store", deliveryDays: ["MONDAY", "WEDNESDAY"] });
    const businessId = (created.body?.business as { id?: string } | undefined)?.id ?? "";
    ok("C. a seller creates a business, which starts pending approval", created.status === 201 && (created.body?.business as { approvalStatus?: string })?.approvalStatus === "PENDING_APPROVAL", JSON.stringify(created.body).slice(0, 120));
    const row = await akadverse.business.findUnique({ where: { id: businessId } });
    ok("C. AkadVerse sees that exact business row, owned by the seller's AkadVerse account", row?.userId === seller.id && row?.name === `E2E Store ${tag}`);
    await goto(sellerPage, `/business/${businessId}`);
    ok("C. the owner sees the pending-review state", (await text(sellerPage)).includes("pending review"));
    ok("C. a seller cannot approve their own business (admin only)", (await api(sellerPage, "POST", `/marketplace/admin/businesses/${businessId}/approve`)).status === 403);
    ok("C. another user cannot read or edit the seller's business", (await api(buyerPage, "GET", `/marketplace/businesses/${businessId}`)).status === 404 && (await api(buyerPage, "POST", `/marketplace/businesses/${businessId}/products`, { name: "Hijack", category: "Food", description: "x", price: 1, stock: 1 })).status === 404);

    const adminPage = await newPage();
    await signIn(adminPage, admin.email, password);
    await goto(adminPage, "/admin/businesses");
    ok("C. an AkadVerse admin (User.isAdmin) reaches the admin dashboard and sees the business", new URL(adminPage.url()).pathname === "/admin/businesses" && (await waitForText(adminPage, `E2E Store ${tag}`)));
    await goto(sellerPage, "/admin");
    ok("C. a non-admin is kept out of the admin pages", new URL(sellerPage.url()).pathname === "/");
    ok("C. the admin approves the business", (await api(adminPage, "POST", `/marketplace/admin/businesses/${businessId}/approve`)).status === 200);
    ok("C. …and AkadVerse's row is APPROVED (same record)", (await akadverse.business.findUniqueOrThrow({ where: { id: businessId } })).approvalStatus === "APPROVED");
    ok("C. approving a seller does not make them an admin", (await akadverse.user.findUniqueOrThrow({ where: { id: seller.id } })).isAdmin === false);
    const bell = await akadverse.notification.findFirst({ where: { businessId, type: "BUSINESS_APPROVED" } });
    ok("C. the approval notification links to this app's own route", bell?.link === `/business/${businessId}`, String(bell?.link));

    await goto(sellerPage, `/business/${businessId}`);
    ok("C. the owner now gets the business dashboard", (await waitForText(sellerPage, "Back to Marketplace")) && !(await text(sellerPage)).includes("pending review"));
    const product = await api(sellerPage, "POST", `/marketplace/businesses/${businessId}/products`, { name: `E2E Widget ${tag}`, category: "Food", description: "A test product", price: 1500, stock: 3 });
    const productId = (product.body?.product as { id?: string } | undefined)?.id ?? "";
    ok("C. the owner adds a product, stored as AkadVerse's product row", product.status === 201 && (await akadverse.product.findUnique({ where: { id: productId } }))?.businessId === businessId);
    const found = await api(buyerPage, "GET", `/marketplace/search/products?q=${encodeURIComponent("E2E Widget " + tag)}`);
    ok("C. a buyer can find the product once the business is approved", JSON.stringify(found.body).includes(productId));
    ok("C. the buyer adds it to their cart", (await api(buyerPage, "POST", "/marketplace/cart", { productId, quantity: 2 })).status < 300);
    await goto(buyerPage, "/checkout");
    const checkoutText = await text(buyerPage);
    ok("C. checkout shows the order with server-computed totals", checkoutText.includes(`E2E Widget ${tag}`) && checkoutText.includes("3,000"));
    ok("C. the buyer cannot manage the seller's orders", (await api(buyerPage, "GET", `/marketplace/businesses/${businessId}/orders`)).status === 404);

    // ---- D. blocking ---------------------------------------------------------------------------------------------------
    ok("D. before the block, the buyer's session works", (await api(buyerPage, "GET", "/marketplace/cart")).status === 200);
    ok("D. the admin blocks the buyer's account", (await api(adminPage, "POST", `/marketplace/admin/users/${buyer.id}/block`, { reason: "End-to-end test block" })).status === 200);
    const after = await api(buyerPage, "GET", "/marketplace/cart");
    ok("D. the buyer's already-open session is refused on its very next request", after.status === 403, `${after.status}`);
    ok("D. …including for writes", (await api(buyerPage, "POST", "/marketplace/cart", { productId, quantity: 1 })).status === 403);
    const blockedLogin = await newPage();
    await signIn(blockedLogin, buyer.email, password);
    ok("D. a blocked account cannot sign in to the Marketplace", (await text(blockedLogin)).includes("has been blocked"));
    const buyerRow = await akadverse.user.findUniqueOrThrow({ where: { id: buyer.id } });
    ok("D. the AkadVerse account itself is unchanged by a Marketplace block", buyerRow.password === hash && buyerRow.role === "student");
    ok("D. an admin cannot block themselves", (await api(adminPage, "POST", `/marketplace/admin/users/${admin.id}/block`, { reason: "x" })).status === 400);
    ok("D. a non-admin cannot unblock anyone", (await api(sellerPage, "POST", `/marketplace/admin/users/${buyer.id}/unblock`)).status === 403);
    await api(adminPage, "POST", `/marketplace/admin/users/${buyer.id}/unblock`);

    // ---- E. layout -----------------------------------------------------------------------------------------------------
    const layoutPage = sellerPage;
    const pages = ["/checkout", "/vendor-checkout", "/orders", "/business/create", "/vendor/apply", "/deliverer/apply", `/business/${businessId}`, `/business/${businessId}/orders`, "/explore"];
    for (const viewport of [{ name: "phone", w: 375, h: 812 }, { name: "tablet", w: 768, h: 1024 }, { name: "desktop", w: 1280, h: 800 }]) {
      await layoutPage.setViewport({ width: viewport.w, height: viewport.h });
      for (const path of pages) {
        await goto(layoutPage, path);
        await waitForText(layoutPage, "Back to Marketplace");
        const m = await layoutPage.evaluate(() => {
          const link = [...document.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Back to Marketplace");
          const bars = [...document.querySelectorAll("nav, div")].filter((el) => ["fixed", "sticky"].includes(getComputedStyle(el).position) && el.getBoundingClientRect().top <= 70 && el.getBoundingClientRect().height > 30 && el.getBoundingClientRect().width > 300);
          const barBottom = Math.max(0, ...bars.map((el) => el.getBoundingClientRect().bottom));
          if (!link) return { found: false, top: 0, barBottom, covered: true, overflow: 0 };
          const r = link.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { found: true, top: r.top, barBottom, covered: !(at && (at === link || link.contains(at))), overflow: document.documentElement.scrollWidth - window.innerWidth };
        });
        ok(`E. ${viewport.name} ${path.replace(businessId, ":id")}: back control visible below the navbar, no overflow`, m.found && m.top >= m.barBottom && !m.covered && m.overflow <= 1, m.found ? `top ${Math.round(m.top)}px vs bar ${Math.round(m.barBottom)}px, overflow ${m.overflow}px` : "back control not found");
      }
    }
  } finally {
    await browser.close();
    await akadverse.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
