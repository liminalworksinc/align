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
  // A dev server's live-reload socket can reload the page in a loop while Turbopack rebuilds (seen on the mini with
  // several dev servers running): the screenshots don't need it, so the page never opens it.
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
  // Sign in from Node and hand the browser the session cookie: a dev server can reload a page mid-call.
  const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: who(person).email, password: who(person).password }) });
  const ok = r.status;
  const host = new URL(BASE).hostname;
  for (const c of r.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const at = pair.indexOf("=");
    await ctx.setCookie({ name: pair.slice(0, at), value: pair.slice(at + 1), domain: host, path: "/", httpOnly: true, secure: BASE.startsWith("https:") });
  }
  if (ok !== 200) throw new Error(`sign-in ${person}: ${ok}`);
  await p.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  return { p, ctx };
}
async function settle(p) {
  await p.waitForNetworkIdle({ idleTime: 400, timeout: 20000 }).catch(() => undefined);
  await sleep(250);
}
async function shot(p, name, theme, width, full = true) {
  const file = path.join(OUT, `${name}-${theme}-${width}.png`);
  // No horizontal page scroll is a requirement: say so whenever a screen breaks it.
  // A link click may still be navigating: wait for the new document before measuring it.
  let wide = 0;
  for (let i = 0; i < 20; i++) {
    try {
      wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      break;
    } catch {
      await sleep(250);
    }
  }
  if (wide > 0) console.warn(`WARN ${name} ${theme} ${width}: page scrolls sideways by ${wide}px`);
  await p.screenshot({ path: file, fullPage: full });
  written.push(file);
}
const home = (p) => p.goto(`${BASE}/app/w/${WS}`, { waitUntil: "domcontentloaded" }).then(() => settle(p));
const clickText = async (p, sel, text) => {
  const ok = await p.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.trim().startsWith(t));
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    },
    sel,
    text,
  );
  if (!ok) throw new Error(`no ${sel} starting "${text}"`);
  if (sel.endsWith(" a")) await p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
  await settle(p);
};
/** Open the review drawer on the onboarding request (the one waiting on the owner), by its card's button. */
const openPending = async (p) => {
  await p.evaluate(() => {
    const card = [...document.querySelectorAll("[data-home-item^='change_request:']")].find((li) => li.textContent?.includes("Ship self-serve onboarding"));
    card?.querySelector("button")?.click();
  });
  await settle(p);
};

const W = [1440, 390, 320];
for (const theme of ["dark", "light"]) {
  // 00: the three states together (pending decision, launched plan, an unobserved outcome) at desktop width.
  const { p, ctx } = await page("owner", theme, 1440);
  await home(p);
  await shot(p, "00-three-states", theme, 1440, false);
  await ctx.close();
}

// 09 Home as each role sees it: a member (Theo) and a viewer (Ines), dark, desktop and phone.
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
    const lightHere = theme === "light" && (width === 1440 || width === 390);
    if (theme === "light" && !lightHere) continue;
    const { p, ctx } = await page("owner", theme, width);
    // 01 Home.
    await home(p);
    await shot(p, "01-home", theme, width);
    // 02 A decision in the review drawer, over the Home.
    await openPending(p);
    if (theme === "dark" || width === 1440) await shot(p, "02-decision-drawer", theme, width, false);
    if (theme === "dark") {
      // 03 Choose "Approve and launch": the confirmation, not sent.
      await clickText(p, "[role=dialog] button", "Approve and launch").catch(() => undefined);
      await shot(p, "03-approve-and-launch-confirm", theme, width, false);
      // 05 The full record, then 06 the goal's Work and evidence, by the drawer's links.
      await clickText(p, "[role=dialog] a", "Open the full record");
      await shot(p, "05-record", theme, width);
      await home(p);
      await openPending(p);
      await clickText(p, "[role=dialog] a", "Work and evidence");
      await shot(p, "06-work-evidence", theme, width);
      // 08 Connect an agent from the Home.
      await home(p);
      await clickText(p, "button", "Connect an agent");
      await shot(p, "08-connect-agent", theme, width, false);
    }
    await ctx.close();

    if (theme === "dark") {
      // 04 The truthful "not yours": the member opens their own request, which waits on the owner.
      const m = await page("member", theme, width);
      await home(m.p);
      await m.p.evaluate(() => document.querySelector("[data-review-open]")?.click());
      await settle(m.p);
      await shot(m.p, "04-not-yours", theme, width, false);
      // 07 First run: the member's own new, empty workspace.
      const fresh = await m.p.evaluate(async () => {
        const list = await (await fetch("/api/v2/workspaces")).json();
        const have = list.workspaces.find((w) => w.name === "Theo's first workspace");
        if (have) return have.id;
        const r = await fetch("/api/v2/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Theo's first workspace" }) });
        const j = await r.json();
        return j.workspace?.id ?? j.id;
      });
      await m.p.goto(`${BASE}/app/w/${fresh}`, { waitUntil: "domcontentloaded" });
      await settle(m.p);
      await shot(m.p, "07-first-run", theme, width);
      await m.ctx.close();
    }
  }
}
await browser.close();
console.log(`wrote ${written.length} screenshots to ${OUT}`);
