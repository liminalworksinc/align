#!/usr/bin/env node
// LIM-2472: first run must not refresh Home on an ordinary load.
//   node design/prototypes/lim-2472/integration/first-run-load.check.mjs <seed-agent out.json>
// Against a seeded Mode L dev server (ALIGN_TEST_IDP=1). Two assertions, by real page loads:
//  1. A person with an app they connected that has made a request (the seed's owner): Home loads once. NeedsList's section
//     mounts once, and /home is read only by Home and NeedsList (4 on a dev server, where StrictMode doubles mount effects;
//     a second cycle from first run's onSeen makes it more).
//  2. A new member with no app connects one while Home is open (real OAuth grant, one tool call):
//     first run's next check refreshes Home exactly once, and the panel goes.
// Exits 1 on any failure. Playwright from PLAYWRIGHT_MODULE (default /tmp/pw/node_modules/playwright/index.mjs).
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const BASE = seed.base;
const WS = seed.ws;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true });
let failed = 0;
const rule = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(detail)}`);
  if (!ok) failed++;
};

async function open(account) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.request.post(`${BASE}/api/v2/auth/sign-in/email`, { data: { email: account.email, password: account.password }, headers: { origin: BASE } });
  // Counts distinct NeedsList sections (streamed HTML moves a node, so an element is counted once), and each time the
  // loading line comes back after rows were on screen, from before the page's own scripts.
  await ctx.addInitScript(() => {
    const seen = new WeakSet();
    window.__needs = { mounts: 0, flashes: 0 };
    let rows = false;
    let loading = false;
    new MutationObserver(() => {
      for (const el of document.querySelectorAll("section[data-needs]")) {
        if (!seen.has(el)) {
          seen.add(el);
          window.__needs.mounts++;
        }
      }
      if (document.querySelector("section[data-needs] ol > li")) rows = true;
      const now = !!document.querySelector("[data-needs-loading]");
      if (now && !loading && rows) window.__needs.flashes++;
      loading = now;
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const reads = [];
  page.on("request", (q) => {
    if (q.url().endsWith(`/api/v2/workspaces/${WS}/home`)) reads.push(q.url());
  });
  await page.goto(`${BASE}/app/w/${WS}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('main h1:not([data-home-count="reading"])').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  return { ctx, page, reads };
}
const needs = (page) => page.evaluate(() => window.__needs);
const panel = (page) => page.locator('section[aria-label="Get started"], [data-first-run]').count();

// 1. An ordinary load, for someone whose app has made a request
{
  const { ctx, page, reads } = await open(seed.accounts.owner);
  const n = await needs(page);
  rule("connected person: /home read by Home and NeedsList only (4 in dev)", reads.length <= 4, { homeReads: reads.length });
  rule("connected person: NeedsList mounts once", n.mounts === 1, n);
  rule("connected person: no flash back to loading", n.flashes === 0, n);
  rule("connected person: no panel", (await panel(page)) === 0, {});
  await ctx.close();
}

// 2. A new member, who has no app, connects one with Home open
{
  const a = { name: "First Run Check", email: `first-run-${Date.now()}@example.test`, password: `pw-${randomBytes(12).toString("base64url")}` };
  const su = await fetch(`${BASE}/api/v2/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(a) });
  const joined = await (await browser.newContext()).request;
  await joined.post(`${BASE}/api/v2/auth/sign-in/email`, { data: { email: seed.accounts.owner.email, password: seed.accounts.owner.password }, headers: { origin: BASE } });
  const inv = await (await joined.post(`${BASE}/api/v2/workspaces/${WS}/invites`, { data: { email: a.email, role: "member" }, headers: { origin: BASE } })).json();
  await fetch(`${BASE}/api/v2/invites/${inv.token}/accept`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie: su.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") }, body: "{}" });
  const { ctx, page, reads } = await open(a);
  const before = { ...(await needs(page)), homeReads: reads.length, panel: await panel(page) };
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const R = "http://127.0.0.1:33418/callback";
  const reg = await (await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "First-run check", redirect_uris: [R], token_endpoint_auth_method: "none", scope: "goals:read changes:evidence" }) })).json();
  const verifier = randomBytes(32).toString("base64url");
  const params = { response_type: "code", client_id: reg.client_id, redirect_uri: R, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "c", resource: `${BASE}/api/mcp`, scope: "goals:read changes:evidence" };
  const ap = await (await fetch(`${BASE}/api/oauth/approve`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie }, body: JSON.stringify({ params, decision: "approve", workspace_id: WS }) })).json();
  const code = new URL(ap.redirect).searchParams.get("code");
  const t = await (await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: R, client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/api/mcp` }).toString() })).json();
  const mcp = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "align_list_goals", arguments: {} } }) });
  await page.waitForTimeout(8000); // first run checks every 5s
  const after = { ...(await needs(page)), homeReads: reads.length, panel: await panel(page) };
  rule("first connect: the panel was there, then goes", before.panel === 1 && after.panel === 0, { before: before.panel, after: after.panel, mcp: mcp.status });
  rule("first connect: Home refreshes exactly once", after.mounts === before.mounts + 1, { before: before.mounts, after: after.mounts, homeReads: [before.homeReads, after.homeReads] });
  await ctx.close();
}
await browser.close();
process.exitCode = failed ? 1 : 0;
console.log(failed ? `${failed} failed` : "all passed");
