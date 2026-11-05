#!/usr/bin/env node
// LIM-2472 concept A: screenshots of the journey, by real clicks in Chrome against a running Mode L server.
//
//   node design/prototypes/lim-2472/a/shots.mjs <BASE> <OUT_DIR> [seed.json]
//
// BASE is the server (e.g. http://127.0.0.1:3801, started with ALIGN_TEST_IDP=1 and a fresh ALIGN_DATA_DIR). Without
// seed.json the script runs seed.mjs first and keeps its output at <OUT_DIR>/seed.json (mode 600, local throwaway
// test-IdP passwords). Writes <nn>-<screen>-<theme>-<width>.png into OUT_DIR. Nothing it clicks sends a decision, so
// it can run again against the same data. Run from the implementation folder or anywhere: puppeteer-core is resolved
// from the app's node_modules. CHROME_PATH overrides the Chrome binary.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "../../../../components/legacy-project-wrapper/implementation");
const puppeteer = createRequire(path.join(APP, "package.json"))("puppeteer-core");
const BASE = (process.argv[2] || "").replace(/\/$/, "");
const OUT = process.argv[3];
if (!BASE || !OUT) {
  console.error("usage: node shots.mjs <BASE> <OUT_DIR> [seed.json]");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
let seedFile = process.argv[4];
if (!seedFile) {
  seedFile = path.join(OUT, "seed.json");
  if (!existsSync(seedFile)) {
    const r = spawnSync(process.execPath, [path.join(HERE, "../s/seed-agent.mjs"), BASE, seedFile], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
const seed = JSON.parse(readFileSync(seedFile, "utf8"));
// The shared agent seed (../s/seed-agent.mjs) keeps the people under `accounts`; this folder's older seed.mjs kept them at the top.
const who = (k) => seed.accounts?.[k] ?? seed[k];
const WS = seed.ws;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 180_000, args: ["--no-first-run", "--no-default-browser-check"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const written = [];

/** A fresh signed-in page for one person, in one theme and width. */
async function page(person, theme, width) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width, height: width >= 1024 ? 900 : 844, deviceScaleFactor: 1 });
  // Opt-in only (ALIGN_SHOTS_STUB_HMR=1): a dev server with a corrupt .next cache can live-reload every page in a loop
  // (clearing .next fixes it); without the socket some dev setups never hydrate, so the default leaves it alone.
  if (process.env.ALIGN_SHOTS_STUB_HMR === "1")
    await p.evaluateOnNewDocument(() => {
      const Real = window.WebSocket;
      const Stub = function (url, protocols) {
        if (String(url).includes("/_next/hmr")) return { readyState: 0, send() {}, close() {}, addEventListener() {}, removeEventListener() {} };
        return new Real(url, protocols);
      };
      Stub.prototype = Real.prototype;
      Object.assign(Stub, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
      window.WebSocket = Stub;
    });
  await p.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem("align-theme", t);
    } catch {}
  }, theme);
  // Sign in from Node and hand the browser the session cookie.
  const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: who(person).email, password: who(person).password }) });
  if (r.status !== 200) throw new Error(`sign-in ${person}: ${r.status}`);
  const host = new URL(BASE).hostname;
  for (const c of r.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const at = pair.indexOf("=");
    await ctx.setCookie({ name: pair.slice(0, at), value: pair.slice(at + 1), domain: host, path: "/", httpOnly: true, secure: BASE.startsWith("https:") });
  }
  return { p, ctx };
}

/** Wait until `scope` (the page's main region, or the open drawer) shows `text` and nothing in it says "Loading";
 *  throw otherwise, so a set of loading screens can never pass for a finished one. */
async function ready(p, text, scope = "main") {
  try {
    await p.waitForFunction(
      (sel, t) => {
        const el = document.querySelector(sel);
        return !!el && el.innerText.includes(t) && !/Loading/.test(el.innerText);
      },
      { timeout: 90_000, polling: 250 },
      scope,
      text,
    );
  } catch {
    const seen = await p.evaluate((sel) => document.querySelector(sel)?.innerText.slice(0, 300) ?? "(none)", scope).catch(() => "(navigating)");
    throw new Error(`screen not ready at ${p.url()}: wanted "${text}" in ${scope}; it shows: ${seen}`);
  }
  await p.waitForNetworkIdle({ idleTime: 400, timeout: 20000 }).catch(() => undefined);
  await sleep(250);
}

async function shot(p, name, theme, width, full = true) {
  const file = path.join(OUT, `${name}-${theme}-${width}.png`);
  // No horizontal page scroll is a requirement: say so whenever a screen breaks it.
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 0) console.warn(`WARN ${name} ${theme} ${width}: page scrolls sideways by ${wide}px`);
  await p.screenshot({ path: file, fullPage: full });
  written.push(file);
}

const goto = (p, url) => p.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded" });
const home = async (p, ws = WS) => {
  await goto(p, `/app/w/${ws}`);
  await ready(p, "Work by goal");
};
/** Open the review drawer from a Home card: by default the onboarding request, which waits on the owner. */
async function openCard(p, match = "Ship self-serve onboarding") {
  const ok = await p.evaluate((m) => {
    const card = [...document.querySelectorAll("[data-home-item^='change_request:']")].find((li) => li.textContent?.includes(m));
    const b = card?.querySelector("[data-review-open]");
    b?.click();
    return !!b;
  }, match);
  if (!ok) throw new Error(`no Home card for "${match}"`);
  await ready(p, "Open the full record", "[role=dialog]");
}
/** Click the visible decision `title` in the drawer; on a phone a secondary one sits in "More actions". */
async function pick(p, title) {
  const clicked = await p.evaluate((t) => {
    const vis = (e) => !!e && e.offsetParent !== null;
    const find = () => [...document.querySelectorAll(`[role=dialog] [data-decision="${t}"]`)].find(vis);
    let b = find();
    if (!b) {
      const more = [...document.querySelectorAll("[role=dialog] summary")].find((e) => e.textContent?.trim() === "More actions" && vis(e));
      more?.click();
      b = find();
    }
    b?.click();
    return !!b;
  }, title);
  if (!clicked) throw new Error(`no visible decision "${title}" in the drawer`);
}
/** Whether the drawer shows its choices again (the dominant decision is visible). */
const choicesShown = (p, dominant) =>
  p.evaluate((t) => [...document.querySelectorAll(`[role=dialog] [data-decision="${t}"]`)].some((e) => e.offsetParent !== null), dominant);
/** Press the drawer's visible Cancel (or a confirmation's Back) and assert the choices come back. */
async function cancelToChoices(p, dominant, where) {
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("[role=dialog] button")].find((e) => e.offsetParent !== null && /^(Cancel|Back)$/.test(e.textContent?.trim() ?? ""));
    b?.click();
  });
  await p.waitForFunction((t) => [...document.querySelectorAll(`[role=dialog] [data-decision="${t}"]`)].some((e) => e.offsetParent !== null), { timeout: 10_000 }, dominant).catch(() => undefined);
  if (!(await choicesShown(p, dominant))) throw new Error(`after Cancel (${where}) the drawer shows no choices`);
}
const dialogHref = (p, attr) => p.$eval(`[role=dialog] [${attr}]`, (a) => a.getAttribute("href"));
const goalTitle = "Ship self-serve onboarding";

const W = [1440, 390, 320];
for (const theme of ["dark", "light"]) {
  // 00: the three states together (pending decision, launched plan, an unobserved outcome) at desktop width.
  const { p, ctx } = await page("owner", theme, 1440);
  await home(p);
  await shot(p, "00-three-states", theme, 1440, false);
  await ctx.close();
}

// 09, 10: Home as each role sees it: a member (Theo) and a viewer (Ines), dark, desktop and phone.
for (const [person, n] of [["member", "09-home-member"], ["viewer", "10-home-viewer"]]) {
  if (!who(person)) continue;
  for (const width of [1440, 390]) {
    const { p, ctx } = await page(person, "dark", width);
    await home(p);
    await shot(p, n, "dark", width);
    await ctx.close();
  }
}

for (const width of W) {
  for (const theme of ["dark", "light"]) {
    if (theme === "light" && width === 320) continue;
    const { p, ctx } = await page("owner", theme, width);
    // 01 Home.
    await home(p);
    await shot(p, "01-home", theme, width);
    // 02 A decision in the review drawer, over the Home.
    await openCard(p);
    if (theme === "dark" || width === 1440) await shot(p, "02-decision-drawer", theme, width, false);
    if (theme === "dark") {
      // Asserted at 390, no screenshot: Add evidence (an https example.test link and a label) adds a Self-reported item.
      if (width === 390) {
        const count = () => p.evaluate(() => [...document.querySelectorAll("[role=dialog] span")].filter((e) => e.textContent?.trim() === "Self-reported").length);
        const before = await count();
        await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.offsetParent !== null && b.textContent?.trim() === "Add evidence")?.click());
        await p.waitForSelector("[role=dialog] [data-add-evidence] input[type=url]", { visible: true, timeout: 10_000 });
        const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
        await p.type("[role=dialog] [data-add-evidence] input[type=url]", `https://docs.example.test/shots-${stamp}`);
        const inputs = await p.$$("[role=dialog] [data-add-evidence] input");
        await inputs[inputs.length - 1].type(`Shots check ${stamp} (fictional)`);
        await p.$eval("[role=dialog] [data-add-evidence] button[type=submit]", (b) => b.click());
        await p.waitForFunction((n) => [...document.querySelectorAll("[role=dialog] span")].filter((e) => e.textContent?.trim() === "Self-reported").length > n, { timeout: 20_000 }, before).catch(() => {
          throw new Error("Add evidence: no new Self-reported item in the drawer");
        });
      }
      // Asserted, no screenshot: Approve and launch -> Cancel -> choices back -> Decline -> reason field -> Cancel ->
      // choices back (a Cancel once left the drawer with neither choices nor a confirmation).
      await pick(p, "Approve and launch");
      await cancelToChoices(p, "Approve and launch", "Approve and launch");
      await pick(p, "Decline");
      await p.waitForSelector("[role=dialog] textarea", { visible: true, timeout: 10_000 }).catch(() => {
        throw new Error("Decline shows no reason field");
      });
      await cancelToChoices(p, "Approve and launch", "Decline");
      // 03 Pick "Approve and launch": its confirmation, not sent. On a phone it goes straight to a one-row confirm.
      await pick(p, "Approve and launch");
      await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.offsetParent !== null && b.textContent?.trim() === "Review this decision")?.click());
      await ready(p, "Confirm", "[role=dialog]");
      await shot(p, "03-approve-and-launch-confirm", theme, width, false);
      // 05 The full record and 06 the goal's work and evidence: the drawer's own links.
      const record = await dialogHref(p, "data-review-record");
      const work = await dialogHref(p, "data-review-work");
      await goto(p, record);
      await ready(p, goalTitle);
      await shot(p, "05-record", theme, width);
      await goto(p, work);
      await ready(p, goalTitle);
      await shot(p, "06-work-evidence", theme, width);
      // 08 Connect an agent from the Home.
      await home(p);
      await p.$eval("[data-connect-open]", (b) => b.click());
      await ready(p, "Claude Code", "[role=dialog]");
      await shot(p, "08-connect-agent", theme, width, false);
    }
    await ctx.close();

    if (theme === "dark") {
      // 04 The truthful "not yours": the viewer opens a request that waits on the owner.
      const v = await page("viewer", theme, width);
      // A viewer has no Home card for it (nothing waits on them): the drawer's own link opens it, as a shared link would.
      const pendingGoal = seed.goals?.onboarding;
      const pendingCr = seed.change_requests?.pending;
      if (pendingGoal && pendingCr) await goto(v.p, `/app/w/${WS}?review=${pendingGoal}.${pendingCr}`);
      else await home(v.p), await openCard(v.p);
      await ready(v.p, "Not yours", "[role=dialog]");
      await shot(v.p, "04-not-yours", theme, width, false);
      await v.ctx.close();
      const m = await page("member", theme, width);
      // 07 First run: the member's own new, empty workspace.
      await goto(m.p, "/app");
      const fresh = await m.p.evaluate(async () => {
        const list = await (await fetch("/api/v2/workspaces")).json();
        const have = list.workspaces.find((w) => w.name === "Theo's first workspace");
        if (have) return have.id;
        const r = await fetch("/api/v2/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Theo's first workspace" }) });
        const j = await r.json();
        return j.workspace?.id ?? j.id;
      });
      await goto(m.p, `/app/w/${fresh}`);
      await ready(m.p, "No agent is sharing work here yet");
      await shot(m.p, "07-first-run", theme, width);
      await m.ctx.close();
    }
  }
}
await browser.close();
console.log(`wrote ${written.length} screenshots to ${OUT}`);
