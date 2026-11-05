#!/usr/bin/env node
// LIM-2472 concept B screenshots: seeds a fresh fictional workspace through the real API (seed.mjs), then drives the
// decision-desk journey with real clicks and writes PNGs named <nn>-<screen>-<theme>-<width>.png.
//
//   node design/prototypes/lim-2472/b/shots.mjs <BASE> <OUT>
//   e.g. node design/prototypes/lim-2472/b/shots.mjs http://127.0.0.1:3802 /tmp/b-shots
//
// BASE must be a Mode L server started with ALIGN_TEST_IDP=1 (see LIM-2472-REPORT-B.md, "Boot it"). Uses
// puppeteer-core from the implementation's node_modules and Chrome at CHROME_PATH (default: the macOS Google Chrome).
// Dark: every journey screen at 1440, 390 and 320. Light: Home and the decision at 1440, Home at 390. Plus
// 00-three-states-<theme>-1440.png. Each shot also reports any horizontal page scroll.

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seed } from "./seed.mjs";

const [BASE_ARG, OUT] = process.argv.slice(2);
if (!BASE_ARG || !OUT) {
  console.error("usage: node shots.mjs <BASE url> <OUT dir>");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../../../components/legacy-project-wrapper/implementation/package.json"));
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

async function signIn(person) {
  const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: person.email, password: person.password }) });
  if (!r.ok) throw new Error(`sign-in ${person.email}: ${r.status}`);
  const host = new URL(BASE).hostname;
  return r.headers.getSetCookie().map((c) => {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: host, path: "/", httpOnly: true };
  });
}

async function newPage(browser, cookies, theme) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem("align-theme", t);
    } catch {}
  }, theme);
  await page.setCookie(...cookies);
  return page;
}

async function settle(page) {
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => undefined);
  await sleep(250);
}

async function shoot(page, nn, screen, theme, widths) {
  for (const w of widths) {
    await page.setViewport({ width: w, height: w >= 1000 ? 900 : 844 });
    await settle(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) problems.push(`${nn}-${screen}-${theme}-${w}: page scrolls sideways by ${over}px`);
    const file = path.join(OUT, `${nn}-${screen}-${theme}-${w}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`wrote ${file}${over > 0 ? `  (sideways scroll ${over}px)` : ""}`);
  }
}

async function go(page, url) {
  await page.goto(BASE + url, { waitUntil: "networkidle0" });
  await settle(page);
}

/** Click the first element matching `sel` whose text includes `text`. */
async function clickText(page, sel, text) {
  const ok = await page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t));
      if (!el) return false;
      el.click();
      return true;
    },
    sel,
    text,
  );
  if (!ok) throw new Error(`no ${sel} with "${text}" on ${page.url()}`);
  await settle(page);
}

const s = await seed(BASE);
console.log(`seeded ${s.ws} (dana ${s.people.dana.email})`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
try {
  const dana = await signIn(s.people.dana);
  const eli = await signIn(s.people.eli);
  const ALL = [1440, 390, 320];
  const desk = `/app/w/${s.ws}`;

  // Request ids, read as Dana, to open the decision pages directly.
  const feed = await (await fetch(`${BASE}/api/v2/workspaces/${s.ws}/change-requests`, { headers: { cookie: dana.map((c) => `${c.name}=${c.value}`).join("; ") } })).json();
  const rows = [...feed.waiting_on_me, ...feed.mine, ...feed.others];
  const rafis = rows.find((r) => r.state === "pending" && r.requester.name === "Rafi Haddad");
  const notMine = rows.find((r) => r.state === "pending" && r.requester.name === "Theo Lindqvist");
  const dec = (r) => `/app/w/${s.ws}/decisions/${r.goal.id}/${r.id}`;

  for (const theme of ["dark", "light"]) {
    const page = await newPage(browser, dana, theme);
    // 00: a pending approval, a launched plan and an unobserved agent outcome on one screen (All view).
    await page.setViewport({ width: 1440, height: 900 });
    await go(page, desk);
    await clickText(page, '[role="radio"]', "All");
    await shoot(page, "00", "three-states", theme, [1440]);

    await go(page, desk);
    await shoot(page, "01", "desk", theme, theme === "dark" ? ALL : [1440, 390]);

    await go(page, dec(rafis));
    await shoot(page, "03", "decision", theme, theme === "dark" ? ALL : [1440]);
    await page.close();
  }

  const page = await newPage(browser, dana, "dark");
  await page.setViewport({ width: 1440, height: 900 });
  // 02: inspect a row without leaving the desk.
  await go(page, desk);
  await page.evaluate((id) => document.querySelector(`[data-row="${id}"]`)?.closest("button")?.click(), rafis.id);
  await settle(page);
  await shoot(page, "02", "drawer", "dark", ALL);

  // 04: the live connector opens the confirmation; 05: it is sent, and the map lights Launched.
  await page.setViewport({ width: 1440, height: 900 });
  await go(page, dec(rafis));
  await clickText(page, "[data-edge-from] , button[data-edge-from]", "Approve and launch");
  await shoot(page, "04", "confirm", "dark", ALL);
  await page.setViewport({ width: 1440, height: 900 });
  await settle(page);
  await clickText(page, "[data-confirm] button[type=submit]", "Approve and launch");
  await sleep(600);
  await settle(page);
  await shoot(page, "05", "launched", "dark", ALL);

  // 06: a request that isn't Dana's to decide: inert connectors say who can.
  await go(page, dec(notMine));
  await shoot(page, "06", "not-yours", "dark", ALL);

  // 07: the decision record (shared record page, in the desk shell); 08: Work.
  await go(page, `/app/w/${s.ws}/record?cr=${rafis.id}`);
  await shoot(page, "07", "record", "dark", ALL);
  await go(page, `/app/w/${s.ws}/sessions`);
  await shoot(page, "08", "work", "dark", ALL);
  await page.close();

  // 09: first run for a clean person (empty workspace); 10: connect an agent.
  const fresh = await newPage(browser, eli, "dark");
  await fresh.setViewport({ width: 1440, height: 900 });
  await go(fresh, `/app/w/${s.empty}`);
  await shoot(fresh, "09", "first-run", "dark", ALL);
  await go(fresh, `/app/w/${s.empty}/apps`);
  await shoot(fresh, "10", "connect", "dark", ALL);
  await fresh.close();
} finally {
  await browser.close();
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exitCode = 1;
} else console.log("\nno sideways page scroll in any shot");
