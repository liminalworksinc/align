#!/usr/bin/env node
// LIM-2472 round 2, Mini S1's parts on the integrated candidate's pages (Home, Requests, the review drawer): the two
// orders, the declined request returning, "See who decides", the Desk's "Approve only", the cap line and a failed
// delivery read. Seeds through the real API only (s/seed-agent.mjs, then b/seed.mjs on top) and drives real clicks.
//
//   node design/prototypes/lim-2472/b/r2-checks.mjs <BASE> <OUT>
//
// BASE: a Mode L server with ALIGN_TEST_IDP=1 and a fresh ALIGN_DATA_DIR. Writes r2-*.png to OUT. Exit 1 on a failure.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seed } from "./seed.mjs";

const [BASE_ARG, OUT] = process.argv.slice(2);
if (!BASE_ARG || !OUT) {
  console.error("usage: node r2-checks.mjs <BASE url> <OUT dir>");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../../../components/legacy-project-wrapper/implementation/package.json"));
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  ok ? pass++ : fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "lim2472-r2-"));
const sa = spawnSync(process.execPath, [path.join(here, "../s/seed-agent.mjs"), BASE, path.join(tmp, "agent.json")], { encoding: "utf8" });
if (sa.status !== 0) {
  console.error(sa.stderr || sa.stdout);
  process.exit(1);
}
const agent = JSON.parse(readFileSync(path.join(tmp, "agent.json"), "utf8"));
rmSync(tmp, { recursive: true, force: true });
const s = await seed(BASE, agent);
const W = `/api/v2/workspaces/${s.ws}`;
const HOME = `/app/w/${s.ws}`;
const REQS = `/app/w/${s.ws}/requests`;

async function login(acct) {
  const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: acct.email, password: acct.password }) });
  if (!r.ok) throw new Error(`sign-in ${acct.email}: ${r.status}`);
  return r.headers.getSetCookie().map((c) => {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: new URL(BASE).hostname, path: "/", httpOnly: true };
  });
}
async function apiAs(cookies, method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { origin: BASE, cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
async function open(cookies, url, { theme = "dark", width = 1440, intercept } = {}) {
  const p = await browser.newPage();
  await p.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem("align-theme", t);
    } catch {}
  }, theme);
  await p.setCookie(...cookies);
  await p.setViewport({ width, height: width >= 1000 ? 900 : 844 });
  if (intercept) {
    await p.setRequestInterception(true);
    p.on("request", (req) => (intercept(req) ? req.respond({ status: 500, contentType: "application/json", body: '{"error":"forced"}' }) : req.continue()));
  }
  await p.goto(BASE + url, { waitUntil: "networkidle0" });
  await p.waitForFunction(() => document.querySelector("h1")?.getAttribute("data-home-count") !== "reading", { timeout: 20000 }).catch(() => undefined);
  await sleep(400);
  return p;
}
const over = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

try {
  const owner = await login(agent.accounts.owner);
  const member = await login(agent.accounts.member);
  const viewer = await login(agent.accounts.viewer);
  const jun = await login(s.people.theo);
  const rafi = await login(s.people.rafi);

  // ---- 1. Home: the two orders, the count, the declined request returning ----
  for (const [who, c, want] of [
    ["owner", owner, "Ranked for someone who approves: launches and decisions first."],
    ["member", member, null],
    ["viewer", viewer, "Ranked for your own requests first."],
    ["requester (Jun)", jun, "Ranked for your own requests first."],
  ]) {
    const p = await open(c, HOME);
    const r = await p.evaluate(() => ({
      count: document.querySelector("h1")?.getAttribute("data-home-count"),
      rows: document.querySelectorAll('[data-needs="list"] ol > li').length,
      line: document.querySelector("[data-rank-order]")?.textContent ?? "",
      order: document.querySelector("[data-rank-order]")?.getAttribute("data-rank-order") ?? "",
    }));
    const countOk = String(r.rows) === String(r.count);
    check(`Home, ${who}: the heading's count equals the Needs-you rows (${r.count}/${r.rows})${want ? `, and the line says "${want}"` : ""}`, countOk && (!want || r.line === want || r.rows < 2), JSON.stringify(r));
    await p.close();
  }
  {
    const p = await open(jun, HOME);
    const row = await p.evaluate(() => {
      const li = [...document.querySelectorAll('[data-needs="list"] ol > li')].find((x) => /Declined/.test(x.textContent ?? ""));
      return li ? { text: li.textContent ?? "", href: li.querySelector('a[href*="review="]')?.getAttribute("href") ?? "", propose: [...li.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Propose again"), first: li === document.querySelector('[data-needs="list"] ol > li') } : null;
    });
    check("Home, requester: the declined request is back, first in requester order, with the reason and Propose again", !!row && row.first && row.propose && /measure yet/.test(row.text), JSON.stringify(row));
    const see = await p.evaluate(() => [...document.querySelectorAll('[data-needs="list"] ol > li')].some((li) => /See the change/.test(li.textContent ?? "")));
    check('Home, requester: a returned suggested change says "See the change", not the decision', see);
    await shot(p, "r2-home-requester-dark-1440");
    if (row?.href) {
      await p.goto(BASE + HOME + row.href.slice(row.href.indexOf("?")), { waitUntil: "networkidle0" });
      await sleep(600);
      await p.goto(BASE + HOME, { waitUntil: "networkidle0" });
      await sleep(600);
      const still = await p.evaluate(() => [...document.querySelectorAll('[data-needs="list"] ol > li')].some((x) => /Propose again/.test(x.textContent ?? "")));
      check("Home, requester: after its review is opened, the declined request leaves Needs you", !still);
    }
    await p.close();
  }

  // ---- 2. "See who decides" in the integrated review drawer, by keyboard; not on phones ----
  const gs = (await apiAs(owner, "GET", `${W}/goals`)).goals;
  const pilot = gs.find((g) => g.title === "Partner pilot ready for review");
  const pend = await apiAs(rafi, "POST", `${W}/goals/${pilot.id}/change-requests`, { base_version: pilot.version, changes: { title: `${pilot.title} (who decides)` }, reason: "Who decides check (fictional)." });
  for (const theme of ["dark", "light"]) {
    const p = await open(owner, `${HOME}?review=${pilot.id}.${pend.id}`, { theme });
    await p.waitForSelector("[data-review]", { timeout: 15000 });
    const closed = await p.evaluate(() => !document.querySelector("[data-who-decides]")?.closest("details")?.open);
    let found = false;
    for (let i = 0; i < 120 && !found; i++) {
      await p.keyboard.press("Tab");
      found = await p.evaluate(() => document.activeElement?.tagName === "SUMMARY" && /See who decides/.test(document.activeElement.textContent ?? ""));
    }
    await p.keyboard.press("Enter");
    await sleep(500);
    const r = await p.evaluate(() => ({ open: !!document.querySelector("[data-who-decides]")?.closest("details")?.open, cards: document.querySelectorAll("[data-who-decides] [data-lane-card]").length, now: document.querySelector('[data-who-decides] [data-state="now"]')?.getAttribute("data-lane-card"), lines: document.querySelectorAll("[data-who-decides] path[data-link]").length, live: document.querySelectorAll('[data-who-decides] path[data-link="live"]').length }));
    check(`review (${theme}): "See who decides" closed by default, opened by keyboard, Now = waiting for a decision, lines drawn`, closed && found && r.open && r.cards === 8 && r.now === "deciding" && r.lines > 0 && r.live > 0, JSON.stringify({ closed, found, ...r }));
    await p.evaluate(() => document.querySelector("[data-who-decides]")?.scrollIntoView({ block: "start" }));
    await shot(p, `r2-who-decides-${theme}-1440`);
    if (theme === "dark") {
      let step = false;
      for (let i = 0; i < 40 && !step; i++) {
        await p.keyboard.press("Tab");
        step = await p.evaluate(() => !!document.activeElement?.closest("[data-steps]") && /Approve and launch/.test(document.activeElement?.textContent ?? ""));
      }
      await p.keyboard.press("Enter");
      await sleep(900);
      const after = await p.evaluate(() => ({ url: location.search, picked: document.querySelector("[data-decision-input], [data-confirm]")?.getAttribute("data-decision-input") ?? document.querySelector("[data-confirm]")?.getAttribute("data-confirm") }));
      const st = (await apiAs(owner, "GET", `${W}/goals/${pilot.id}/change-requests/${pend.id}`)).state;
      check("review: a step pressed by keyboard opens that choice in the drawer's ReviewActions, and sends nothing", step && /choice=approve_and_launch/.test(after.url) && after.picked === "approve_and_launch" && st === "pending", JSON.stringify({ step, ...after, st }));
    }
    await p.close();
  }
  for (const w of [390, 320]) {
    const p = await open(owner, `${HOME}?review=${pilot.id}.${pend.id}`, { width: w });
    await p.waitForSelector("[data-review]", { timeout: 15000 });
    const shown = await p.evaluate(() => {
      const d = document.querySelector("[data-who-decides]")?.closest("details");
      return !!d && d.offsetParent !== null;
    });
    check(`review at ${w}: "See who decides" is not rendered (the one-sentence answer stands alone)`, !shown && (await over(p)) <= 0);
    await p.close();
  }

  // ---- 3. The Requests desk's "Approve only" ----
  {
    const mk = async (title, withLink) => {
      const g = gs.find((x) => x.title === title);
      const cr = await apiAs(rafi, "POST", `${W}/goals/${g.id}/change-requests`, { base_version: g.version, changes: { title: `${g.title} (shortcut)` }, reason: "Shortcut check (fictional)." });
      if (withLink) await apiAs(rafi, "POST", `${W}/goals/${g.id}/change-requests/${cr.id}/evidence`, { revision: 1, kind: "doc", url: "https://example.test/kestrel/docs/shortcut", label: "Shortcut note (fictional)" });
      return { cr, g };
    };
    const withEv = await mk("Every release carries its audit evidence", true);
    const noEv = await mk("Expand to regulated customers", false);
    const vanish = await mk("Pass the security review", true);
    const p = await open(owner, REQS);
    await p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => /All/.test(b.textContent ?? ""))?.click());
    await sleep(500);
    const rowHas = (id) => p.evaluate((x) => { const tr = document.querySelector(`[data-row="${x}"]`)?.closest("tr"); return !!tr && [...tr.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Approve only"); }, id);
    const launchRows = await p.evaluate(() => [...document.querySelectorAll("tr")].filter((tr) => /Launch v\d/.test(tr.innerText) && [...tr.querySelectorAll("button")].some((x) => x.textContent?.trim() === "Approve only")).length);
    check("Requests: 'Approve only' with evidence and approve, not without evidence, never on a launch row", (await rowHas(withEv.cr.id)) && !(await rowHas(noEv.cr.id)) && launchRows === 0);
    const evId = (await apiAs(rafi, "GET", `${W}/goals/${vanish.g.id}/change-requests/${vanish.cr.id}`)).revisions[0].evidence[0].id;
    await apiAs(rafi, "DELETE", `${W}/goals/${vanish.g.id}/change-requests/${vanish.cr.id}/evidence/${evId}`);
    const click = (id) => p.evaluate((x) => [...(document.querySelector(`[data-row="${x}"]`)?.closest("tr")?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "Approve only")?.click(), id);
    await click(vanish.cr.id);
    await sleep(1000);
    const vNote = await p.evaluate((x) => document.querySelector(`[data-row="${x}"]`)?.closest("tr")?.querySelector("[data-row-notice]")?.textContent ?? "", vanish.cr.id);
    const vState = (await apiAs(owner, "GET", `${W}/goals/${vanish.g.id}/change-requests/${vanish.cr.id}`)).state;
    check("Requests: evidence removed after render: nothing sent, and the row says why", /evidence was removed/i.test(vNote) && vState === "pending", vNote);
    await click(withEv.cr.id);
    await sleep(1000);
    const done = await p.evaluate(() => [...document.querySelectorAll("[data-row-notice]")].map((e) => e.textContent ?? "").find((t) => /Recorded/.test(t)) ?? "");
    const after = await apiAs(owner, "GET", `${W}/goals/${withEv.g.id}/change-requests/${withEv.cr.id}`);
    check("Requests: one click records Approve only (approved, launch pending) and says so", /Recorded: you approved revision 1/.test(done) && after.state === "approved" && after.launch === "pending", done);
    await p.evaluate(() => document.querySelector('[data-row-notice="done"]')?.scrollIntoView({ block: "center" }));
    await shot(p, "r2-requests-shortcut-dark-1440");
    await p.close();
    const vp = await open(viewer, REQS);
    check("Requests: a viewer never sees 'Approve only'", !(await vp.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Approve only"))));
    await vp.close();
  }

  // ---- 4. A failed delivery read (through the shared cache) is unknown, never "nothing sent" ----
  {
    const p = await open(owner, HOME, { intercept: (req) => req.method() === "GET" && /\/change-requests\/[^/]+\/value$/.test(new URL(req.url()).pathname) });
    const r = await p.evaluate(() => ({ amber: document.querySelector("[data-needs-partial]")?.textContent ?? "", h1: document.querySelector("h1")?.textContent ?? "" }));
    check("Home with the delivery reads failing: the amber line names the deliveries to apps, and the heading says 'At least'", /the deliveries to apps/.test(r.amber) && /At least|could not be read/.test(r.h1), JSON.stringify(r));
    await p.close();
  }

  // ---- 5. The deliberate cap, rendered ----
  {
    for (let i = 0; i < 14; i++) await apiAs(owner, "POST", `${W}/goals`, { title: `Cap specimen goal ${i + 1} (fictional)`, visibility: "workspace" });
    const p = await open(owner, HOME);
    const cap = await p.evaluate(() => document.querySelector("[data-needs-capped]")?.textContent?.trim() ?? "");
    check(`Home: the cap line renders ("${cap}")`, /Requests to agents not checked on \d+ goals?\./.test(cap));
    await shot(p, "r2-cap-line-dark-1440");
    await p.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exitCode = fail ? 1 : 0;
