#!/usr/bin/env node
// LIM-2472: a failed read never reads as an absence on Work, and Home offers "Create a goal" only to someone who can.
//   node design/prototypes/lim-2472/integration/work-delivery.check.mjs <seed-agent out.json>
// Against a seeded Mode L server (ALIGN_TEST_IDP=1). The security goal is launched in the seed. A 500 on its …/value (or on
// its approved change requests) must not say "No app yet", "not sent" or "nothing launched"; a real empty list still does.
// Exits 1 on any failure. Playwright from PLAYWRIGHT_MODULE (default /tmp/pw/node_modules/playwright/index.mjs).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const BASE = seed.base;
const WS = seed.ws;
const GOAL = seed.goals.security;
const H = { "content-type": "application/json", origin: BASE };
const NOT_READ = "Couldn't load this just now"; // r2-review-work: NOT_LOADED in ds/evidence-facts.mts (was "Not read just now")
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true });
let failed = 0;
const rule = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `: ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const BOOM = { status: 500, contentType: "application/json", body: '{"error":"x","message":"Boom."}' };

async function signedIn(a) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const r = await ctx.request.post(`${BASE}/api/v2/auth/sign-in/email`, { data: { email: a.email, password: a.password }, headers: { origin: BASE } });
  if (!r.ok()) throw new Error(`sign-in ${r.status()}`);
  return ctx;
}
async function work(account, route) {
  const ctx = await signedIn(account);
  const page = await ctx.newPage();
  if (route) await route(page);
  await page.goto(`${BASE}/app/w/${WS}/work?goal=${GOAL}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const text = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
  await ctx.close();
  return text;
}
const clip = (t, s) => { const i = t.indexOf(s); return i < 0 ? t.slice(0, 200) : t.slice(Math.max(0, i - 80), i + 200); };

for (const role of ["owner", "member"]) {
  const a = seed.accounts[role];
  const t = await work(a, (p) => p.route(/\/change-requests\/[^/]+\/value$/, (r) => r.fulfill(BOOM)));
  const d = clip(t, "Align sent it to");
  rule(`${role}, …/value fails: no "No app yet"`, !t.includes("No app yet"), d);
  rule(`${role}, …/value fails: no "not sent"`, !/not sent/i.test(t), d);
  rule(`${role}, …/value fails: no "Align sent it v" receipt`, !/Align sent it v\d+ [A-Z]/.test(t), d);
  rule(`${role}, …/value fails: says it was not read`, t.includes(NOT_READ), d);
  const u = await work(a, (p) => p.route(/\/change-requests\?state=approved$/, (r) => r.fulfill(BOOM)));
  const e = clip(u, "Connected apps");
  rule(`${role}, approved read fails: no "Nothing launched"`, !/Nothing (is )?launched/.test(u), e);
  rule(`${role}, approved read fails: says it was not read`, u.includes(NOT_READ), e);
}
{
  const t = await work(seed.accounts.owner);
  rule("owner, reads answer: names the connected app", /Align sent it to \d+ connected app/.test(t) && !t.includes(NOT_READ), clip(t, "Align sent it to"));
  // A viewer's list is their own apps: truly empty in the seed.
  const v = await work(seed.accounts.viewer);
  rule('viewer, a real empty list: still "No app yet"', v.includes("No app yet") && !v.includes(NOT_READ), clip(v, "Align sent it to"));
}

// Home on a workspace with no goals
const acct = async (name) => {
  const a = { name, email: `w-${Date.now()}-${randomBytes(3).toString("hex")}@example.test`, password: `pw-${randomBytes(12).toString("base64url")}` };
  const r = await fetch(`${BASE}/api/v2/auth/sign-up/email`, { method: "POST", headers: H, body: JSON.stringify(a) });
  if (!r.ok) throw new Error(`sign-up ${r.status}`);
  a.cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return a;
};
const call = async (cookie, method, path, body) => (await fetch(BASE + path, { method, headers: { ...H, cookie }, body: body ? JSON.stringify(body) : undefined })).json();
const owner = await acct("Sam Owner");
const ws2 = (await call(owner.cookie, "POST", "/api/v2/workspaces", { name: "Empty" })).id;
const people = { owner };
for (const role of ["member", "viewer"]) {
  const a = await acct(`Ari ${role}`);
  const inv = await call(owner.cookie, "POST", `/api/v2/workspaces/${ws2}/invites`, { email: a.email, role });
  await call(a.cookie, "POST", `/api/v2/invites/${inv.token}/accept`, {});
  people[role] = a;
}
for (const [role, a] of Object.entries(people)) {
  const ctx = await signedIn(a);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/w/${ws2}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const link = page.locator("main a", { hasText: "Create a goal" });
  const n = await link.count();
  if (role === "viewer") rule('viewer, no goals: no "Create a goal"', n === 0, { n });
  else {
    rule(`${role}, no goals: keeps "Create a goal"`, n === 1, { n });
    if (n) {
      await link.first().click();
      await page.getByText("New goal", { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
      rule(`${role}: the link reaches a way to create one`, (await page.getByRole("button", { name: "Create goal" }).count()) === 1, page.url().replace(BASE, ""));
    }
  }
  await ctx.close();
}
await browser.close();
process.exitCode = failed ? 1 : 0;
console.log(failed ? `${failed} failed` : "all passed");
