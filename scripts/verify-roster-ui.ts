// REAL-BROWSER check of Admin -> Delivery Roster (headless Chrome via puppeteer-core) against a running server that
// uses the LOCAL replica database (npm run db:local:setup). Seeds its own admin, deliverers and slot through the
// replica's owner connection, reads the Marketplace-owned roster tables back through the local superuser, and refuses
// to run against anything but 127.0.0.1.
//
// What it proves:
//   A. The weekly grid: days as columns, slots as rows; clicking a cell opens THAT cell's editor.
//   B. Saving a cell (deliverer + max deliveries) persists it to the database and the grid updates.
//   C. Date view: adding an exception (close the slot for a date) shows Closed/Exception; restoring removes it; the
//      weekly template is unchanged throughout.
//   D. Marketplace roster: adding a central slot under Settings & slots makes it a grid row.
//   E. Layout: no page-level horizontal overflow at 375/768/1024/1440; phones get the day picker and a bottom-sheet
//      editor that fits the viewport; tablets+ get the table.
//
// Usage: start the app against the local replica, then
//   BASE_URL=http://localhost:3100 PP_DIR=<dir with node_modules/puppeteer-core> npx tsx scripts/verify-roster-ui.ts

import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import pg from "pg";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_URL = "postgresql://akadverse_owner:akadverse_owner_local_only@127.0.0.1:5434/akadverse_replica";
const SUPERUSER_URL = "postgresql://marketplace:marketplace_local_only@127.0.0.1:5434/akadverse_replica";
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
const PASSWORD = "roster check password 1";
const SLOT_LABEL = "Roster check 7-8 PM";

async function seed(db: PrismaClient) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await db.user.upsert({ where: { email: "roster-admin@stu.cu.edu.ng" }, update: { password: hash, isAdmin: true }, create: { email: "roster-admin@stu.cu.edu.ng", firstName: "Rae", lastName: "Admin", password: hash, isAdmin: true } });
  const deliverers = [];
  for (const [first, email] of [["David", "roster-david@stu.cu.edu.ng"], ["Sarah", "roster-sarah@stu.cu.edu.ng"]]) {
    const user = await db.user.upsert({ where: { email }, update: {}, create: { email, firstName: first, lastName: "Rostercheck", password: hash } });
    deliverers.push(await db.deliverer.upsert({ where: { userId: user.id }, update: { status: "APPROVED" }, create: { userId: user.id, firstName: first, lastName: "Rostercheck", email, status: "APPROVED" } }));
  }
  const slot =
    (await db.vendorDeliverySlot.findFirst({ where: { label: SLOT_LABEL } })) ??
    (await db.vendorDeliverySlot.create({ data: { label: SLOT_LABEL, windowStart: "19:00", windowEnd: "20:00", delivererCapacity: 2 } }));
  await db.vendorDeliverySlot.update({ where: { id: slot.id }, data: { active: true, delivererCapacity: 2 } });
  return { slot, deliverers };
}

async function main() {
  const db = new PrismaClient({ datasourceUrl: OWNER_URL });
  const su = new pg.Client({ connectionString: SUPERUSER_URL });
  await su.connect();
  const { slot, deliverers } = await seed(db);
  // Start from a clean template for this slot (local replica only).
  await su.query(`DELETE FROM marketplace."RosterAssignment" WHERE "slotId" = $1`, [slot.id]);
  await su.query(`DELETE FROM marketplace."RosterSlotDay" WHERE "slotId" = $1`, [slot.id]);
  await su.query(`DELETE FROM marketplace."RosterException" WHERE "slotId" = $1`, [slot.id]);

  const puppeteer = createRequire(`${process.env.PP_DIR}/`)("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
  type Page = Awaited<ReturnType<typeof browser.newPage>>;
  const page: Page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const goto = async (path: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 90_000 });
    await sleep(300);
  };
  const waitFor = (fn: string, timeout = 20_000) => page.waitForFunction(fn, { timeout }).then(() => true, () => false);
  const clickText = (selector: string, label: string) =>
    page.evaluate(
      (sel: string, l: string) => {
        const el = [...document.querySelectorAll(sel)].find((e) => (e as HTMLElement).innerText.trim() === l) as HTMLElement | undefined;
        el?.click();
        return Boolean(el);
      },
      selector,
      label
    ) as Promise<boolean>;
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) as Promise<number>;
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));

  try {
    await goto("/login");
    await page.type("#login-email", "roster-admin@stu.cu.edu.ng");
    await (await page.$$('input[type="password"]'))[0].type(PASSWORD);
    await page.click('button[type="submit"]');
    await waitFor(`location.pathname !== "/login"`, 30_000);
    await sleep(1000);

    // ---- A. grid ---------------------------------------------------------------------------------------------------
    await goto("/admin/delivery-roster");
    ok("Delivery Roster tab is in the admin menu", await page.evaluate(() => Boolean(document.querySelector('a[href="/admin/delivery-roster"]'))));
    await clickText('[role="radio"]', "Vendor Market Delivery Roster");
    ok("Vendor roster grid loads", await waitFor(`document.body.innerText.includes(${JSON.stringify(SLOT_LABEL)})`));
    const headers = await page.evaluate(() => [...document.querySelectorAll('table thead th[scope="col"]')].map((th) => (th.querySelector("span") ?? th).textContent?.trim()));
    ok("days are columns Monday..Sunday", JSON.stringify(headers) === JSON.stringify(["Time slot", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]), JSON.stringify(headers));
    const rowLabels = await page.evaluate(() => [...document.querySelectorAll('table tbody th[scope="row"] span:first-child')].map((s) => s.textContent?.trim()));
    ok("time slots are rows", rowLabels.includes(SLOT_LABEL), JSON.stringify(rowLabels));

    const cellSel = `table button[data-cell="${slot.id}:1"]`;
    ok("an unassigned cell says so", /Unassigned/.test(await page.$eval(cellSel, (b: Element) => (b as HTMLElement).innerText)));
    await page.click(cellSel);
    ok("clicking the cell opens that cell's editor", await waitFor(`document.querySelector('[role="dialog"] h2')?.textContent.includes("Every Monday · ${SLOT_LABEL}")`));

    // ---- B. save --------------------------------------------------------------------------------------------------
    await clickText('[role="dialog"] label span', "David Rostercheck");
    await page.evaluate(() => (document.querySelectorAll('[role="dialog"] input[name="limit-mode"]')[1] as HTMLInputElement).click());
    const limit = await page.$('[role="dialog"] input[aria-label="Maximum deliveries"]');
    await limit!.click({ clickCount: 3 });
    await limit!.type("2");
    await clickText('[role="dialog"] button', "Save");
    ok("save shows a success message and closes the editor", await waitFor(`document.querySelector('[role="status"]')?.innerText.includes("Roster saved") && !document.querySelector('[role="dialog"]')`));
    await waitFor(`document.querySelector('${cellSel}')?.innerText.includes("Max 2")`);
    const cellText = await page.$eval(cellSel, (b: Element) => (b as HTMLElement).innerText);
    ok("the cell now shows the deliverer and the limit", /David Rostercheck/.test(cellText) && /Max 2/.test(cellText), cellText.replace(/\n/g, " | "));
    const persisted = await su.query(`SELECT "delivererId" FROM marketplace."RosterAssignment" WHERE "slotId" = $1 AND weekday = 1 AND operation = 'VENDOR'`, [slot.id]);
    const max = await su.query(`SELECT "maxDeliveries" FROM marketplace."RosterSlotDay" WHERE "slotId" = $1 AND weekday = 1`, [slot.id]);
    ok("saved to the database", persisted.rows.length === 1 && persisted.rows[0].delivererId === deliverers[0].id && max.rows[0]?.maxDeliveries === 2);
    await page.reload({ waitUntil: "networkidle2" });
    await clickText('[role="radio"]', "Vendor Market Delivery Roster");
    ok("still there after a reload", await waitFor(`document.querySelector('${cellSel}')?.innerText.includes("David Rostercheck")`));

    // ---- C. date view & exception ---------------------------------------------------------------------------------
    await clickText('[role="tab"]', "Date view & exceptions");
    const tomorrow = await page.evaluate(() => {
      const d = new Date(Date.now() + 86_400_000);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
    });
    await waitFor(`document.querySelector('input[aria-label="Date"]')`);
    await page.$eval('input[aria-label="Date"]', (el: Element, v: unknown) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v as string);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, tomorrow);
    ok("date view loads the chosen date", await waitFor(`document.body.innerText.includes(${JSON.stringify(SLOT_LABEL)}) && !document.querySelector('.animate-spin')`));
    const openEditor = await page.evaluate((label: string) => {
      const card = [...document.querySelectorAll("div.bg-white.rounded-2xl")].find((c) => (c as HTMLElement).innerText.startsWith(label)) as HTMLElement | undefined;
      const btn = [...(card?.querySelectorAll("button") ?? [])].find((b) => /Add exception|Edit exception/.test(b.textContent ?? "")) as HTMLElement | undefined;
      btn?.click();
      return Boolean(btn);
    }, SLOT_LABEL);
    ok("exception editor opens for the slot", openEditor && (await waitFor(`document.body.innerText.includes("Close this slot on this date")`)));
    await clickText("label", "Close this slot on this date (no deliveries)");
    // The Save button only enables once React has re-rendered with the box ticked.
    await waitFor(`[...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "Save exception" && !b.disabled)`);
    await clickText("button", "Save exception");
    const closedShown = await waitFor(`(() => { const c = [...document.querySelectorAll("div.bg-white.rounded-2xl")].find((c) => c.innerText.startsWith(${JSON.stringify(SLOT_LABEL)})); return c && /Closed/.test(c.innerText) && /Exception/.test(c.innerText); })()`);
    const cardText = await page.evaluate((label: string) => ([...document.querySelectorAll("div.bg-white.rounded-2xl")].find((c) => (c as HTMLElement).innerText.startsWith(label)) as HTMLElement | undefined)?.innerText ?? "", SLOT_LABEL);
    ok("the date shows Closed and Exception", closedShown, closedShown ? "" : cardText.replace(/\n/g, " | ").slice(0, 400));
    const exRows = await su.query(`SELECT closed FROM marketplace."RosterException" WHERE "slotId" = $1 AND date = $2::date`, [slot.id, tomorrow]);
    ok("exception saved for that date only", exRows.rows.length === 1 && exRows.rows[0].closed === true);
    const templateAfter = await su.query(`SELECT count(*)::int AS n FROM marketplace."RosterAssignment" WHERE "slotId" = $1`, [slot.id]);
    ok("the weekly template is untouched", templateAfter.rows[0].n === 1);
    await clickText("button", "Restore weekly roster");
    ok("restoring removes the exception", await waitFor(`(() => { const c = [...document.querySelectorAll("div.bg-white.rounded-2xl")].find((c) => c.innerText.startsWith(${JSON.stringify(SLOT_LABEL)})); return c && !/Exception/.test(c.innerText); })()`));
    ok("…in the database too", (await su.query(`SELECT 1 FROM marketplace."RosterException" WHERE "slotId" = $1 AND date = $2::date`, [slot.id, tomorrow])).rows.length === 0);

    // ---- D. Marketplace roster: add a central slot ----------------------------------------------------------------
    await clickText('[role="radio"]', "Marketplace Delivery Roster");
    await clickText('[role="tab"]', "Settings & slots");
    await waitFor(`document.body.innerText.includes("Add a slot")`);
    const centralLabel = `Central check ${Date.now() % 100000}`;
    await page.type('input[placeholder="5:00 PM - 6:00 PM"]', centralLabel);
    await clickText("button", "Add slot");
    ok("central slot added", await waitFor(`document.querySelector('[role="status"]')?.innerText.includes("Slot added")`));
    await clickText('[role="tab"]', "Weekly roster");
    ok("…and it is a row of the Marketplace grid", await waitFor(`document.body.innerText.includes(${JSON.stringify(centralLabel)})`));

    // ---- E. layout -------------------------------------------------------------------------------------------------
    await clickText('[role="radio"]', "Vendor Market Delivery Roster");
    await waitFor(`document.body.innerText.includes(${JSON.stringify(SLOT_LABEL)})`);
    for (const width of [1440, 1024, 768, 375]) {
      await page.setViewport({ width, height: 900 });
      await sleep(400);
      const o = await overflow();
      const tableShown = await page.evaluate(() => {
        const t = document.querySelector("table");
        return Boolean(t && (t.closest(".hidden") ? getComputedStyle(t.closest(".hidden")!).display !== "none" : true));
      });
      ok(`${width}px: no page-level horizontal overflow`, o <= 0, `overflow=${o}`);
      ok(`${width}px: ${width >= 768 ? "grid table shown" : "table hidden, day picker shown"}`, width >= 768 ? tableShown : !tableShown && (await page.evaluate(() => Boolean(document.querySelector('[role="tablist"][aria-label="Day of the week"]')))));
    }
    // Phone: pick Monday, tap the slot card, the editor is a bottom sheet inside the viewport.
    await clickText('[role="tablist"][aria-label="Day of the week"] button', "Mon");
    await page.evaluate((label: string) => {
      const b = [...document.querySelectorAll(".md\\:hidden button")].find((x) => (x as HTMLElement).innerText.startsWith(label)) as HTMLElement | undefined;
      b?.click();
    }, SLOT_LABEL);
    ok("phone: tapping a slot card opens its editor", await waitFor(`document.querySelector('[role="dialog"] h2')?.textContent.includes("Every Monday")`));
    const sheet = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"] > div') as HTMLElement;
      const r = panel.getBoundingClientRect();
      return { left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight };
    });
    ok("phone: the editor fits the viewport", sheet.left >= 0 && sheet.right <= sheet.w + 0.5 && sheet.bottom <= sheet.h + 0.5, JSON.stringify(sheet));
    await page.keyboard.press("Escape");
    ok("Escape closes the editor", await waitFor(`!document.querySelector('[role="dialog"]')`));
    ok("no uncaught page errors", errors.length === 0, errors.join(" | "));

    // Leave the local replica as found: retire the central slot this run added.
    await su.query(`UPDATE marketplace."CentralDeliverySlot" SET active = false WHERE label = $1`, [centralLabel]);
  } finally {
    await browser.close();
    await db.$disconnect();
    await su.end();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
