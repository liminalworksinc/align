#!/usr/bin/env node
// LIM-2472 concept B screenshots and click checks. Seeds a fictional workspace through the real API only (the shared
// agent seed design/prototypes/lim-2472/s/seed-agent.mjs first, then seed.mjs on top of it), then drives the
// decision-desk journey with real clicks and writes PNGs named <nn>-<screen>-<theme>-<width>.png.
//
//   node design/prototypes/lim-2472/b/shots.mjs <BASE> <OUT>
//   e.g. node design/prototypes/lim-2472/b/shots.mjs http://127.0.0.1:3802 /tmp/b-shots
//
// BASE must be a Mode L server started with ALIGN_TEST_IDP=1 and its own ALIGN_DATA_DIR (see LIM-2472-REPORT-B.md,
// "Boot it"). Uses puppeteer-core from the implementation's node_modules and Chrome at CHROME_PATH (default: the macOS
// Google Chrome). The journey screens use the side-by-side page's numbers: 00-three-states, 01-home, 02-decision,
// 03-approve-and-launch-confirm, 04-not-yours, 05-record, 06-work-evidence, 07-first-run, 08-connect-agent; dark at
// 1440, 390 and 320, light for 00/01/02 at 1440 and 01 at 390. Extras: 09-drawer (after Approve only), 10-launched,
// 11-home-member, 12-home-viewer, 13-decision-viewer. Each screen waits for its own text and throws when it is missing;
// the click checks (Cancel, the drawer staying open on a done notice, a refused notice after a decline made elsewhere)
// throw on failure. Exit 1 on any sideways page scroll.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
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
let checks = 0;
function check(name, ok) {
  if (!ok) throw new Error(`check failed: ${name}`);
  checks++;
  console.log(`ok   ${name}`);
}

// The shared agent seed writes its accounts (throwaway test-IdP passwords) to a private temp file, removed at the end.
const tmp = mkdtempSync(path.join(os.tmpdir(), "lim2472-b-"));
const agentOut = path.join(tmp, "agent.json");
const sa = spawnSync(process.execPath, [path.join(here, "../s/seed-agent.mjs"), BASE, agentOut], { encoding: "utf8" });
if (sa.status !== 0) {
  console.error(`seed-agent.mjs failed: ${sa.stderr || sa.stdout}`);
  process.exit(1);
}
const agent = JSON.parse(readFileSync(agentOut, "utf8"));
rmSync(tmp, { recursive: true, force: true });
const s = await seed(BASE, agent);
console.log(`seeded ${s.ws}: the shared agent seed, then concept B's requests on top`);

async function login(acct) {
  const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: acct.email, password: acct.password }) });
  if (!r.ok) throw new Error(`sign-in ${acct.email}: ${r.status}`);
  const host = new URL(BASE).hostname;
  return r.headers.getSetCookie().map((c) => {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: host, path: "/", httpOnly: true };
  });
}
const header = (cookies) => cookies.map((c) => `${c.name}=${c.value}`).join("; ");
async function apiAs(cookies, method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { origin: BASE, cookie: header(cookies), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}

async function newPage(browser, cookies, theme) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem("align-theme", t);
    } catch {}
  }, theme);
  await page.setCookie(...cookies);
  await page.setViewport({ width: 1440, height: 900 });
  return page;
}

async function settle(page) {
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => undefined);
  await sleep(250);
}

/** Wait for this screen's own text; throw when it never shows. */
async function expectText(page, text, timeout = 15000) {
  try {
    await page.waitForFunction((t) => document.body?.innerText.includes(t), { timeout }, text);
  } catch {
    throw new Error(`"${text}" never showed on ${page.url()}`);
  }
}

async function shoot(page, nn, screen, theme, widths, text) {
  for (const w of widths) {
    await page.setViewport({ width: w, height: w >= 1000 ? 900 : 844 });
    await settle(page);
    if (text) await expectText(page, text);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) problems.push(`${nn}-${screen}-${theme}-${w}: page scrolls sideways by ${over}px`);
    const file = path.join(OUT, `${nn}-${screen}-${theme}-${w}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`wrote ${file}${over > 0 ? `  (sideways scroll ${over}px)` : ""}`);
  }
  await page.setViewport({ width: 1440, height: 900 });
  await settle(page);
}

async function go(page, url, text) {
  await page.goto(BASE + url, { waitUntil: "networkidle0" });
  await settle(page);
  if (text) await expectText(page, text);
}

/** Click the first element matching `sel` whose text includes `text`. */
async function clickText(page, sel, text) {
  const ok = await page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t) && e.offsetParent !== null);
      if (!el) return false;
      el.click();
      return true;
    },
    sel,
    text,
  );
  if (!ok) throw new Error(`no visible ${sel} with "${text}" on ${page.url()}`);
  await settle(page);
}
const has = (page, sel) => page.evaluate((x) => !!document.querySelector(x), sel);

/** The page's count (H1 data-need-count, from NeedsList's onCount) against the Needs-you rows rendered. */
async function countMatches(page, who) {
  await page.waitForFunction(() => document.querySelector("h1[data-need-count]")?.getAttribute("data-need-count") !== "", { timeout: 20000 });
  const r = await page.evaluate(() => ({ n: Number(document.querySelector("h1[data-need-count]").getAttribute("data-need-count")), rows: document.querySelectorAll('[data-needs="list"] ol > li').length, h1: document.querySelector("h1").textContent }));
  check(`${who}: the page's count (${r.n}) equals the Needs-you rows rendered (${r.rows}), and 0 says "Nothing needs you"`, r.n === r.rows && (r.n !== 0 || /Nothing needs you/.test(r.h1)));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
try {
  const owner = await login(s.people.dana);
  const member = await login(agent.accounts.member);
  const viewer = await login(agent.accounts.viewer);
  const eli = await login(s.people.eli);
  const ALL = [1440, 390, 320];
  const desk = `/app/w/${s.ws}`;
  const dec = (r) => `/app/w/${s.ws}/decisions/${r.goal.id}/${r.id}`;

  const feedOf = async (c) => {
    const f = await apiAs(c, "GET", `/api/v2/workspaces/${s.ws}/change-requests`);
    return [...f.waiting_on_me, ...f.mine, ...f.others];
  };
  let rows = await feedOf(owner);
  const rafis = rows.find((r) => r.state === "pending" && r.requester.name === "Rafi Haddad");
  const notMine = rows.find((r) => r.state === "pending" && r.requester.name === "Jun Okada");
  const launched = rows.find((r) => r.launch === "launched" && r.id === agent.change_requests.launched);
  if (!rafis || !notMine || !launched) throw new Error("the seeded requests are not all there");

  for (const theme of ["dark", "light"]) {
    const page = await newPage(browser, owner, theme);
    // 00: a pending approval, a launched plan and an unobserved agent outcome on one screen (All view).
    await go(page, desk, "Decision desk");
    await clickText(page, '[role="radio"]', "All");
    await shoot(page, "00", "three-states", theme, [1440], "Launched as v");
    await go(page, desk, "Decision desk");
    await shoot(page, "01", "home", theme, theme === "dark" ? ALL : [1440, 390], "Waiting on me");
    await go(page, dec(rafis), "Where this request is");
    await shoot(page, "02", "decision", theme, theme === "dark" ? ALL : [1440], "Where this request is");
    await page.close();
  }

  const page = await newPage(browser, owner, "dark");
  await go(page, desk, "Decision desk");
  await countMatches(page, "owner");
  // 03: a live connector opens the shared ReviewActions on that choice.
  await go(page, dec(rafis), "Where this request is");
  await clickText(page, "button[data-edge-from]", "Approve and launch");
  await clickText(page, "[data-action-bar] button", "Review this decision");
  check("connector Approve and launch opens its confirmation", await has(page, '[data-confirm="approve_and_launch"]'));
  await shoot(page, "03", "approve-and-launch-confirm", "dark", ALL, "Confirm: Approve and launch");
  await clickText(page, "[data-confirm] button", "Back");
  await clickText(page, "[data-action-bar] button", "Cancel");
  check("Back, then Cancel, returns to the choices with nothing sent", !(await has(page, "[data-confirm]")) && (await has(page, "[data-decision]")) && !(await has(page, "[data-notice]")));
  await clickText(page, "button[data-edge-from]", "Decline");
  check("a different connector (Decline) opens its own input", await page.evaluate(() => !!document.querySelector("[data-action-bar] textarea")));
  await clickText(page, "button[data-edge-from]", "Approve and launch");
  await clickText(page, "[data-action-bar] button", "Review this decision");
  await clickText(page, "[data-confirm] button", "Confirm: Approve and launch");
  await expectText(page, "Launched as v");
  check("Approve and launch: a done notice and the map lit on Launched", (await has(page, '[data-notice="done"]')) && (await has(page, '[data-node="launched"][data-current="1"]')));
  await shoot(page, "10", "launched", "dark", [1440, 390], "Launched as v");

  // 04: a request that isn't the owner's to decide: inert connectors say who can.
  await go(page, dec(notMine), "Where this request is");
  check("not yours: no live connector, a line naming who decides", !(await has(page, 'button[data-edge-from][data-live="1"]')) && (await has(page, "[data-not-yours]")));
  await shoot(page, "04", "not-yours", "dark", ALL, "Mina Torres can");

  // 05: the shared decision record, in the desk shell; 06: Work and evidence for the launched goal.
  await go(page, `/app/w/${s.ws}/record?cr=${rafis.id}`, "Review");
  await shoot(page, "05", "record", "dark", ALL, "Review");
  await go(page, `/app/w/${s.ws}/work?goal=${launched.goal.id}`);
  await shoot(page, "06", "work-evidence", "dark", ALL);

  // 09: open a pending request in the drawer, Approve only: the drawer stays open on the done notice while the row leaves
  // "Waiting on me" for "Waiting on others" behind it.
  rows = await feedOf(owner);
  const toApprove = rows.find((r) => r.state === "pending" && r.can.approve && r.waiting_on_me);
  if (!toApprove) throw new Error("no pending request left for the owner to approve");
  await go(page, desk, "Decision desk");
  await page.evaluate((id) => document.querySelector(`[data-row="${id}"]`)?.closest("button")?.click(), toApprove.id);
  await settle(page);
  await expectText(page, "Approve only");
  await clickText(page, "[data-drawer] [data-decision]", "Approve only");
  await clickText(page, "[data-drawer] button", "Review this decision");
  await clickText(page, "[data-confirm] button", "Confirm: Approve only");
  await expectText(page, "Approved, not launched");
  check("drawer: still open after Approve only, with the done notice", (await has(page, `[data-drawer="${toApprove.id}"]`)) && (await has(page, '[data-drawer] [data-notice="done"]')));
  await shoot(page, "09", "drawer", "dark", ALL, "Approved, not launched");
  await page.keyboard.press("Escape");

  // A refused decision: a request is declined elsewhere (the API, as its approver) while the drawer is open on it.
  const audit = rows.find((r) => r.goal.title === "Every release carries its audit evidence");
  const g = await apiAs(owner, "GET", `/api/v2/workspaces/${s.ws}/goals/${audit.goal.id}`);
  const mina = await login(s.people.mina);
  const fresh = await apiAs(mina, "POST", `/api/v2/workspaces/${s.ws}/goals/${audit.goal.id}/change-requests`, { base_version: g.goal?.version ?? g.version, changes: { title: "Every release carries its audit evidence and a reviewer (fictional)" }, reason: "Reviewers asked to be named on each release." });
  await go(page, desk, "Decision desk");
  await page.evaluate((id) => document.querySelector(`[data-row="${id}"]`)?.closest("button")?.click(), fresh.id);
  await settle(page);
  await expectText(page, "Approve only");
  await apiAs(owner, "POST", `/api/v2/workspaces/${s.ws}/goals/${audit.goal.id}/change-requests/${fresh.id}/reject`, { revision: fresh.revision, reason: "Declined elsewhere for the click check (fictional)." });
  await clickText(page, "[data-drawer] [data-decision]", "Approve only");
  await clickText(page, "[data-drawer] button", "Review this decision");
  await clickText(page, "[data-confirm] button", "Confirm: Approve only");
  await sleep(500);
  check("drawer: a decision refused after a decline elsewhere shows the refused notice and stays open", (await has(page, `[data-drawer="${fresh.id}"]`)) && (await page.evaluate(() => !!document.querySelector('[data-drawer] [data-notice="refused"], [data-drawer] [data-notice="retry"]'))));
  await page.close();

  // 11, 12, 13: what each role sees.
  const mp = await newPage(browser, member, "dark");
  await go(mp, desk, "Decision desk");
  await countMatches(mp, "member");
  await shoot(mp, "11", "home-member", "dark", [1440, 390], "Decision desk");
  await mp.close();
  const vp = await newPage(browser, viewer, "dark");
  await go(vp, desk, "Decision desk");
  await countMatches(vp, "viewer");
  await shoot(vp, "12", "home-viewer", "dark", [1440, 390], "Decision desk");
  await go(vp, dec(rafis), "Where this request is");
  check("viewer: no live connector on the decision page", !(await has(vp, 'button[data-edge-from][data-live="1"]')));
  await shoot(vp, "13", "decision-viewer", "dark", [1440], "Where this request is");
  await vp.close();

  // "See who decides": in the real review drawer, by keyboard. Closed by default; Enter opens it; the map draws its lines;
  // a step of this person's, pressed from the keyboard, opens that choice in the drawer's action bar. Not rendered on phones.
  {
    // A fresh request for the owner to decide (the journey above used the seeded ones).
    const rafiC = await login(s.people.rafi);
    const gs = (await apiAs(owner, "GET", `/api/v2/workspaces/${s.ws}/goals`)).goals;
    const pg = gs.find((g) => g.title === "Partner pilot ready for review") ?? gs.find((g) => g.owner.id === s.people.dana.id && g.status === "active");
    const pend = await apiAs(rafiC, "POST", `/api/v2/workspaces/${s.ws}/goals/${pg.id}/change-requests`, { base_version: pg.version, changes: { title: `${pg.title} (who decides check)` }, reason: "A request to show who decides (fictional)." });
    for (const theme of ["dark", "light"]) {
      const wp = await newPage(browser, owner, theme);
      await wp.setViewport({ width: 1440, height: 900 });
      await go(wp, `${desk}?review=${pend.goal.id}.${pend.id}`, "See who decides");
      const closed = await wp.evaluate(() => !document.querySelector("[data-who-decides]")?.closest("details")?.open);
      // Keyboard: Tab until the summary has focus, then Enter.
      let found = false;
      for (let i = 0; i < 80 && !found; i++) {
        await wp.keyboard.press("Tab");
        found = await wp.evaluate(() => document.activeElement?.tagName === "SUMMARY" && /See who decides/.test(document.activeElement.textContent ?? ""));
      }
      await wp.keyboard.press("Enter");
      await settle(wp);
      await sleep(300);
      const open = await wp.evaluate(() => ({ open: !!document.querySelector("[data-who-decides]")?.closest("details")?.open, cards: document.querySelectorAll("[data-who-decides] [data-lane-card]").length, now: document.querySelector('[data-who-decides] [data-state="now"]')?.getAttribute("data-lane-card"), lines: document.querySelectorAll("[data-who-decides] path[data-link]").length, live: document.querySelectorAll('[data-who-decides] path[data-link="live"]').length }));
      check(`${theme}: "See who decides" is closed by default, opens from the keyboard, lights the request's state and draws its lines`, closed && found && open.open && open.cards === 8 && open.now === "deciding" && open.lines > 0 && open.live > 0);
      await wp.screenshot({ path: path.join(OUT, `14-who-decides-${theme}-1440.png`), fullPage: false });
      console.log(`wrote 14-who-decides-${theme}-1440.png`);
      if (theme === "dark") {
        // Tab to the card's "Approve and launch" step and press it: the action bar opens on that choice; nothing is sent.
        let step = false;
        for (let i = 0; i < 40 && !step; i++) {
          await wp.keyboard.press("Tab");
          step = await wp.evaluate(() => !!document.activeElement?.closest("[data-steps]") && /Approve and launch/.test(document.activeElement?.textContent ?? ""));
        }
        await wp.keyboard.press("Enter");
        await settle(wp);
        const r = await wp.evaluate(() => ({ url: location.search, input: document.querySelector("[data-action-bar] [data-decision-input], [data-action-bar] [data-confirm]")?.getAttribute("data-decision-input") ?? document.querySelector("[data-action-bar] [data-confirm]")?.getAttribute("data-confirm") }));
        const after = (await apiAs(owner, "GET", `/api/v2/workspaces/${s.ws}/goals/${pend.goal.id}/change-requests/${pend.id}`)).state;
        check("a step pressed from the keyboard opens that choice in the review's action bar, and sends nothing", step && /choice=approve_and_launch/.test(r.url) && r.input === "approve_and_launch" && after === "pending");
      }
      await wp.close();
    }
    for (const w of [390, 320]) {
      const pp = await newPage(browser, owner, "dark");
      await pp.setViewport({ width: w, height: 844 });
      await go(pp, `${desk}?review=${pend.goal.id}.${pend.id}`, "change request");
      const shown = await pp.evaluate(() => {
        const d = document.querySelector("[data-who-decides]")?.closest("details");
        return !!d && d.offsetParent !== null;
      });
      check(`${w}: "See who decides" is not rendered on a phone (the one-sentence answer stands alone)`, !shown);
      await pp.close();
    }
  }

  // A source that fails (forced 500 on one read at a time): the list never says "Nothing needs you", never shows a bare 0
  // in its filter, and reports partial to the page.
  const SOURCES = [
    ["change-requests", `/api/v2/workspaces/${s.ws}/change-requests(\\?|$)`, ["owner", "viewer"]],
    ["asks", `/api/v2/workspaces/${s.ws}/asks(\\?|$)`, ["owner", "viewer"]],
    ["alignments", `/api/v2/workspaces/${s.ws}/alignments(\\?|$)`, ["owner", "viewer"]],
    ["home", `/api/v2/workspaces/${s.ws}/home(\\?|$)`, ["owner", "viewer"]],
    // Per-goal reads: a failed one is unknown too, never only a note behind "How it's ranked".
    ["value (what Align sent)", `/api/v2/workspaces/${s.ws}/goals/[^/]+/change-requests/[^/]+/value$`, ["owner", "member"]],
    ["requests to agents", `/api/v2/workspaces/${s.ws}/goals/[^/]+/requests$`, ["owner", "member"]],
  ];
  const cookieOf = { owner, member, viewer };
  for (const [src, pattern, roles] of SOURCES)
    for (const who of roles) {
      const cookies = cookieOf[who];
      const fp = await newPage(browser, cookies, "dark");
      await fp.setRequestInterception(true);
      const re = new RegExp(pattern);
      fp.on("request", (req) => (req.method() === "GET" && re.test(new URL(req.url()).pathname + (new URL(req.url()).search ? "?" : "")) ? req.respond({ status: 500, contentType: "application/json", body: '{"error":"forced"}' }) : req.continue()));
      await fp.goto(BASE + desk, { waitUntil: "networkidle0" });
      await fp.waitForFunction(() => document.querySelector("h1[data-need-partial]")?.getAttribute("data-need-partial") === "1", { timeout: 20000 }).catch(() => undefined);
      const r = await fp.evaluate(() => ({
        partial: document.querySelector("h1[data-need-partial]")?.getAttribute("data-need-partial"),
        nothing: /Nothing needs you/.test(document.body.innerText),
        zeros: [...document.querySelectorAll('[data-needs="list"] [role="radio"]')].map((b) => b.textContent ?? "").filter((t) => / 0$/.test(t.trim())),
        amber: !!document.querySelector("[data-needs-partial]"),
      }));
      check(`${who}, ${src} read failing: partial reported, amber line shown, no "Nothing needs you", no bare 0 in the filter`, r.partial === "1" && r.amber && !r.nothing && r.zeros.length === 0);
      await fp.close();
    }

  // 07: first run for a clean person (an empty workspace); 08: connect an agent.
  const ep = await newPage(browser, eli, "dark");
  await go(ep, `/app/w/${s.empty}`, "No decisions yet");
  await shoot(ep, "07", "first-run", "dark", ALL, "No decisions yet");
  await go(ep, `/app/w/${s.empty}/apps`);
  await shoot(ep, "08", "connect-agent", "dark", ALL);
  await ep.close();
} finally {
  await browser.close();
}
console.log(`\n${checks} click checks passed`);
if (problems.length) {
  console.log(`${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exitCode = 1;
} else console.log("no sideways page scroll in any shot");
