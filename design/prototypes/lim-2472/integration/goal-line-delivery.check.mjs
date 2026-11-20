#!/usr/bin/env node
// LIM-2472: a launched goal's line never shows a delivery fact before the delivery read answers.
//   node design/prototypes/lim-2472/integration/goal-line-delivery.check.mjs <seed-agent out.json> [screenshot dir]
// Against a seeded Mode L dev server (ALIGN_TEST_IDP=1). …/value is held for 2s (or refused) in the browser; the security
// goal's line, launched in the seed with one receipt, is read during the hold. A cold load and a soft return to Home.
// A cold load shows no delivery fact until the read answers; a soft return may keep the earlier true answer, never a false one.
// Exits 1 on any failure. Playwright from PLAYWRIGHT_MODULE (default /tmp/pw/node_modules/playwright/index.mjs).
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const OUT = process.argv[3];
const BASE = seed.base;
const WS = seed.ws;
const LINE = `[data-goal-line="${seed.goals.security}"]`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true });
let failed = 0;
const rule = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(detail)}`);
  if (!ok) failed++;
};
const read = (page) => page.evaluate((L) => {
  const li = document.querySelector(L);
  if (!li) return null;
  return { text: li.innerText.replace(/\s+/g, " ").slice(0, 110), kinds: [...li.querySelectorAll("[data-evidence]")].map((e) => e.getAttribute("data-evidence")), summary: !!li.querySelector("[data-evidence-summary]"), deliveryWords: /received|not sent|no session|no bound|reached/i.test(li.innerText) };
}, LINE);
const delivery = (s) => !!s && (s.deliveryWords || s.kinds.includes("receipt") || s.kinds.includes("unobserved"));

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = seed.accounts.owner;
  await ctx.request.post(`${BASE}/api/v2/auth/sign-in/email`, { data: { email: a.email, password: a.password }, headers: { origin: BASE } });
  return { ctx, page: await ctx.newPage() };
}
const hold = (page, ms) => page.route(/\/change-requests\/[^/]+\/value$/, async (r) => { await new Promise((x) => setTimeout(x, ms)); await r.continue().catch(() => {}); });
// Samples the line every 150ms until `ms` has passed; returns every distinct reading.
async function sample(page, ms) {
  const seen = [];
  for (const end = Date.now() + ms; Date.now() < end; ) {
    const s = await read(page).catch(() => null);
    if (s && JSON.stringify(s) !== JSON.stringify(seen.at(-1))) seen.push(s);
    await page.waitForTimeout(150);
  }
  return seen;
}

// 1. Cold load, the read held
{
  const { ctx, page } = await open();
  await hold(page, 2000);
  let answered = false;
  page.on("response", (r) => { if (/\/value$/.test(r.url())) answered = true; });
  await page.goto(`${BASE}/app/w/${WS}`, { waitUntil: "commit" });
  const during = [];
  while (!answered) {
    const s = await read(page).catch(() => null);
    if (s && JSON.stringify(s) !== JSON.stringify(during.at(-1))) during.push(s);
    await page.waitForTimeout(100);
  }
  if (OUT) await page.screenshot({ path: `${OUT}/goal-line-during-hold-cold.png` });
  await page.waitForTimeout(1500);
  const after = await read(page);
  rule("cold load: no delivery fact while the read is out", during.length > 0 && !during.some(delivery), during);
  rule("cold load: the receipt lands after", after?.kinds.includes("receipt"), after);
  // 2. Soft return: away by the rail, past the shared cache's 15s, then back while the read is held
  await page.locator('a[href$="/work"], nav a', { hasText: /^Goals$/ }).first().click();
  await page.waitForURL(/\/goals$/);
  await page.waitForTimeout(16000);
  answered = false;
  await page.locator("nav a", { hasText: /^Home$/ }).first().click();
  await page.waitForURL(new RegExp(`/app/w/${WS}$`));
  const back = [];
  while (!answered) {
    const s = await read(page).catch(() => null);
    if (s && JSON.stringify(s) !== JSON.stringify(back.at(-1))) back.push(s);
    await page.waitForTimeout(100);
  }
  if (OUT) await page.screenshot({ path: `${OUT}/goal-line-during-hold-soft.png` });
  // The earlier answer may still be on screen (true, and the read replaces it); what must never show is an absence.
  rule("soft return: no Not observed while the read is out", back.length > 0 && !back.some((x) => x.kinds.includes("unobserved")), back);
  await ctx.close();
}

// 3. The read fails: nothing false, no delivery fact
{
  const { ctx, page } = await open();
  await page.route(/\/change-requests\/[^/]+\/value$/, (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"x","message":"Boom."}' }));
  await page.goto(`${BASE}/app/w/${WS}`, { waitUntil: "networkidle", timeout: 60000 });
  const seen = await sample(page, 2500);
  rule("failed read: no delivery fact", seen.length > 0 && !seen.some(delivery), seen);
  await ctx.close();
}
await browser.close();
process.exitCode = failed ? 1 : 0;
console.log(failed ? `${failed} failed` : "all passed");
