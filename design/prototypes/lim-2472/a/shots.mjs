#!/usr/bin/env node
// LIM-2472 concept A: screenshots of the journey, by real clicks in Chrome against a running Mode L server.
//
//   node design/prototypes/lim-2472/a/shots.mjs <BASE> <OUT_DIR> [seed.json]
//
// BASE is the server (e.g. http://127.0.0.1:3801, started with ALIGN_TEST_IDP=1 and a fresh ALIGN_DATA_DIR). Without
// seed.json the script runs ../s/seed-agent.mjs first and keeps its output at <OUT_DIR>/seed.json (mode 600, local throwaway
// test-IdP passwords). Writes <nn>-<screen>-<theme>-<width>.png into OUT_DIR. The screens send no decision; the
// asserted decision steps run last, on a throwaway goal dropped at the end, so it can run again against the same data. Run from the implementation folder or anywhere: puppeteer-core is resolved
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
  // Concept A's Home says "Work by goal"; the integrated Home has the Goals lines instead.
  await p.waitForFunction(() => { const m = document.querySelector("main"); return !!m && (m.innerText.includes("Work by goal") || !!m.querySelector("[data-goal-lines]")) && !/Loading/.test(m.innerText); }, { timeout: 90_000, polling: 250 }).catch(async () => {
    throw new Error(`Home not ready at ${p.url()}: ${await p.evaluate(() => document.querySelector("main")?.innerText.slice(0, 300) ?? "(none)").catch(() => "(navigating)")}`);
  });
  await p.waitForNetworkIdle({ idleTime: 400, timeout: 20000 }).catch(() => undefined);
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
  await ready(p, "Work on this goal", "[role=dialog]");
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
    // The decision's own Cancel, not the Add evidence form's (which can still be open above it).
    const b = [...document.querySelectorAll("[role=dialog] button")].find((e) => e.offsetParent !== null && !e.closest("[data-add-evidence]") && /^(Cancel|Back)$/.test(e.textContent?.trim() ?? ""));
    b?.click();
  });
  await p.waitForFunction((t) => [...document.querySelectorAll(`[role=dialog] [data-decision="${t}"]`)].some((e) => e.offsetParent !== null), { timeout: 10_000 }, dominant).catch(() => undefined);
  if (!(await choicesShown(p, dominant))) throw new Error(`after Cancel (${where}) the drawer shows no choices`);
}
/** Press Tab (Shift+Tab with `back`) until the focused element matches `sel` (and starts with `text`, when given) and
 *  is visible; throw after `max` presses. Keyboard only: nothing here clicks. */
async function tabTo(p, { sel, text }, what, { back = false, max = 80 } = {}) {
  const at = () =>
    p.evaluate(
      (s, t) => {
        const a = document.activeElement;
        return !!a && a.matches(s) && a.offsetParent !== null && (!t || (a.textContent ?? "").trim().startsWith(t));
      },
      sel,
      text ?? "",
    );
  for (let i = 0; i < max; i++) {
    if (await at()) return;
    if (back) await p.keyboard.down("Shift");
    await p.keyboard.press("Tab");
    if (back) await p.keyboard.up("Shift");
  }
  throw new Error(`keyboard at ${p.viewport()?.width}: Tab never reached ${what}`);
}
const focusIn = (p, sel) => p.evaluate((s) => !!document.activeElement?.closest(s), sel);
const dialogHref = (p, attr) => p.$eval(`[role=dialog] [${attr}]`, (a) => a.getAttribute("href"));
const goalTitle = "Ship self-serve onboarding";

const W = [1440, 390, 320];
// ALIGN_SHOTS_ONLY_ASSERTS=1 skips the screenshots and runs only the asserted steps (Menu by keyboard, decisions, review
// link arrivals, the keyboard decision at 320): how this script verifies a branch whose Home is not concept A's.
const ONLY_ASSERTS = process.env.ALIGN_SHOTS_ONLY_ASSERTS === "1";
if (!ONLY_ASSERTS) for (const theme of ["dark", "light"]) {
  // 00: the three states together (pending decision, launched plan, an unobserved outcome) at desktop width.
  const { p, ctx } = await page("owner", theme, 1440);
  await home(p);
  await shot(p, "00-three-states", theme, 1440, false);
  await ctx.close();
}

// 09, 10: Home as each role sees it: a member (Theo) and a viewer (Ines), dark, desktop and phone.
if (!ONLY_ASSERTS) for (const [person, n] of [["member", "09-home-member"], ["viewer", "10-home-viewer"]]) {
  if (!who(person)) continue;
  for (const width of [1440, 390]) {
    const { p, ctx } = await page(person, "dark", width);
    await home(p);
    await shot(p, n, "dark", width);
    await ctx.close();
  }
}

if (!ONLY_ASSERTS) for (const width of W) {
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
        await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.offsetParent !== null && b.textContent?.trim() === "Add evidence")?.click());
        await p.waitForSelector("[role=dialog] [data-add-evidence] input[type=url]", { visible: true, timeout: 10_000 });
        const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
        await p.type("[role=dialog] [data-add-evidence] input[type=url]", `https://docs.example.test/shots-${stamp}`);
        const inputs = await p.$$("[role=dialog] [data-add-evidence] input");
        await inputs[inputs.length - 1].type(`Shots check ${stamp} (fictional)`);
        await p.$eval("[role=dialog] [data-add-evidence] button[type=submit]", (b) => b.click());
        // The new link shows in the drawer, and the drawer has a Self-reported label (EvidenceLabel kind "self").
        await p
          .waitForFunction((t) => document.querySelector("[role=dialog]")?.innerHTML.includes(t) && !!document.querySelector('[role=dialog] [data-evidence="self"]'), { timeout: 20_000 }, `shots-${stamp}`)
          .catch(() => {
            throw new Error("Add evidence: the new link or its Self-reported label is not in the drawer");
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
      const record = await dialogHref(p, 'data-to="record"');
      const work = await dialogHref(p, 'data-to="work"');
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
// Asserted at 390 and 320, keyboard only, no screenshot: the top bar's Menu opens the navigation sheet and moves focus
// into it; Escape closes it and gives focus back to Menu; Close does the same; a link in the sheet navigates, and the
// next page starts with the sheet closed.
for (const width of [390, 320]) {
  const { p, ctx } = await page("owner", "dark", width);
  await home(p);
  const menuBtn = 'button[aria-controls="ca-menu"]';
  const sheetOpen = () => p.waitForSelector("[data-menu-sheet]", { timeout: 5000 }).catch(() => {
    throw new Error(`Menu at ${width}: Enter opened no sheet`);
  });
  const sheetClosed = (how) => p.waitForFunction(() => !document.querySelector("[data-menu-sheet]"), { timeout: 5000 }).catch(() => {
    throw new Error(`Menu at ${width}: ${how} left the sheet open`);
  });
  const onMenu = async (how) => {
    if (!(await p.evaluate((s) => document.activeElement === document.querySelector(s), menuBtn))) throw new Error(`Menu at ${width}: after ${how} focus is not back on Menu`);
  };
  await tabTo(p, { sel: menuBtn, text: "Menu" }, "Menu");
  await p.keyboard.press("Enter");
  await sheetOpen();
  if (!(await focusIn(p, "[data-menu-sheet]"))) throw new Error(`Menu at ${width}: focus did not move into the sheet`);
  await p.keyboard.press("Escape");
  await sheetClosed("Escape");
  await onMenu("Escape");
  await p.keyboard.press("Enter");
  await sheetOpen();
  await tabTo(p, { sel: menuBtn, text: "Close" }, "Close", { back: true });
  await p.keyboard.press("Enter");
  await sheetClosed("Close");
  await onMenu("Close");
  await p.keyboard.press("Enter");
  await sheetOpen();
  await tabTo(p, { sel: "[data-menu-sheet] a", text: "Requests" }, "Requests in the sheet");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => location.pathname.endsWith("/requests"), { timeout: 30_000 }).catch(() => {
    throw new Error(`Menu at ${width}: Requests did not navigate`);
  });
  await ready(p, "Change requests");
  if ((await p.$eval(menuBtn, (b) => b.getAttribute("aria-expanded"))) !== "false" || (await p.$("[data-menu-sheet]"))) throw new Error(`Menu at ${width}: the next page opened with the sheet open`);
  await ctx.close();
}

// Asserted at 1440, no screenshot, where the Home mounts "Since you last looked" (data-since): a fresh browser has no
// last visit, so the section shows only the first-visit line and never the words "last visit"; a second visit in the
// same browser (a new tab, so a new baseline) with nothing changed by anyone else shows "Nothing changed since your
// last visit." A Home without the section (concept A's own) skips this, and says so.
{
  const { p, ctx } = await page("owner", "dark", 1440);
  await home(p);
  const sinceState = (pg) =>
    pg.waitForFunction(() => { const e = document.querySelector("[data-since]"); return !e ? "absent" : e.getAttribute("data-since") === "reading" ? false : e.getAttribute("data-since"); }, { timeout: 30_000 }).then((h) => h.jsonValue());
  if ((await p.$("[data-since]")) === null) console.log("Since: not on this Home, first-visit asserts skipped");
  else {
    const first = await sinceState(p);
    const text = await p.$eval("[data-since]", (e) => e.innerText);
    if (first !== "first" || !text.includes("First visit on this device") || /last visit/i.test(text)) throw new Error(`Since, first visit: wanted only the first-visit line, got data-since=${first}: ${text.slice(0, 200)}`);
    const again = await ctx.newPage();
    await again.setViewport({ width: 1440, height: 900 });
    await home(again);
    const second = await sinceState(again);
    const text2 = await again.$eval("[data-since]", (e) => e.innerText);
    if (second !== "0" || !text2.includes("Nothing changed since your last visit.")) throw new Error(`Since, second visit: wanted "Nothing changed since your last visit.", got data-since=${second}: ${text2.slice(0, 200)}`);
  }
  await ctx.close();
}

// Asserted at 1440, no screenshot, after every screenshot: the drawer stays open with its outcome notice after a decision
// lands, and after a refusal. Both run on a throwaway goal Mara creates here, each on its own pending request (Theo
// proposes, as a member would), so the seeded goals and requests are untouched. An approved request can't be withdrawn,
// so the goal is dropped at the end (a new version, status dropped), which supersedes what it left: nothing from these
// steps shows on a later run's screens.
{
  const signIn = async (person) => {
    const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: who(person).email, password: who(person).password }) });
    if (r.status !== 200) throw new Error(`sign-in ${person}: ${r.status}`);
    return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  };
  const call = async (cookie, method, url, body) => {
    const r = await fetch(`${BASE}${url}`, { method, headers: { origin: BASE, cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const theo = await signIn("member");
  const mara = await signIn("owner");
  const made = await call(mara, "POST", `/api/v2/workspaces/${WS}/goals`, { title: "Drawer check (shots.mjs, fictional)" });
  const goal = made.id ?? made.goal?.id;
  if (!goal) throw new Error(`create goal: no id (${JSON.stringify(made).slice(0, 200)})`);
  const version = async () => {
    const g = await call(mara, "GET", `/api/v2/workspaces/${WS}/goals/${goal}`);
    return g.version ?? g.goal?.version;
  };
  const propose = async (tag) => {
    const cr = await call(theo, "POST", `/api/v2/workspaces/${WS}/goals/${goal}/change-requests`, {
      base_version: await version(),
      changes: { title: `Drawer check (${tag}, fictional)` },
      reason: `A drawer check from shots.mjs (${tag}). Fictional.`,
    });
    return cr.id ? cr : cr.change_request;
  };
  const approveOnly = async (p) => {
    await pick(p, "Approve only");
    await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.offsetParent !== null && b.textContent?.trim() === "Review this decision")?.click());
    await p.waitForFunction(() => [...document.querySelectorAll("[role=dialog] button")].some((b) => b.offsetParent !== null && b.textContent?.trim().startsWith("Confirm:")), { timeout: 10_000 });
    await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.offsetParent !== null && b.textContent?.trim().startsWith("Confirm:"))?.click());
  };
  const { p, ctx } = await page("owner", "dark", 1440);
  let privGoal = null;
  try {
    // Success: Approve only -> the drawer stays, with the done notice and the request as approved, not launched.
    const ok = await propose("approve only");
    await goto(p, `/app/w/${WS}?review=${goal}.${ok.id}`);
    await ready(p, "Work on this goal", "[role=dialog]");
    await approveOnly(p);
    await p.waitForSelector('[role=dialog] [data-notice="done"]', { timeout: 20_000 }).catch(() => {
      throw new Error("Approve only: the drawer shows no done notice (or closed)");
    });
    await ready(p, "Approved, not launched", "[role=dialog]");

    // Refusal: the request is declined from Node while the drawer is open -> Approve only -> the drawer stays, red.
    const no = await propose("refused");
    await goto(p, `/app/w/${WS}?review=${goal}.${no.id}`);
    await ready(p, "Work on this goal", "[role=dialog]");
    await call(mara, "POST", `/api/v2/workspaces/${WS}/goals/${goal}/change-requests/${no.id}/reject`, { revision: no.revision, reason: "Declined from Node by shots.mjs (fictional)." });
    await approveOnly(p);
    await p.waitForSelector('[role=dialog] [data-notice="refused"]', { timeout: 20_000 }).catch(() => {
      throw new Error("refusal: the drawer shows no refused notice (or closed)");
    });
    if (!(await p.$("[role=dialog]"))) throw new Error("refusal: the drawer closed");

    // A review link opens complete on a cold load (a fresh browser context each time) for every role at every width, and
    // a link to a request the person can't read opens the not-found state, which is the same whether the request doesn't
    // exist or sits on a goal they can't see, and shows nothing of it. The private goal is Mara's, dropped at the end.
    const made2 = await call(mara, "POST", `/api/v2/workspaces/${WS}/goals`, { title: "Private check (shots.mjs, fictional)", visibility: "private" });
    privGoal = made2.id ?? made2.goal?.id;
    let privCr = "cr_shotsdoesnotexist";
    try {
      const c = await call(mara, "POST", `/api/v2/workspaces/${WS}/goals/${privGoal}/change-requests`, { base_version: 1, changes: { title: "Private check (renamed, fictional)" }, reason: "Private check from shots.mjs. Fictional." });
      privCr = (c.id ? c : c.change_request).id;
    } catch {
      /* an owner may not propose on their own goal: the made-up id on the hidden goal is the same 404 */
    }
    const pendingCr = seed.change_requests?.pending;
    const pendingGoal = seed.goals?.onboarding;
    for (const person of ["owner", "member", "viewer"]) {
      for (const width of W) {
        const c = await page(person, "dark", width);
        await goto(c.p, `/app/w/${WS}?review=${pendingGoal}.${pendingCr}`);
        await ready(c.p, "Work on this goal", "[role=dialog]");
        if (!(await c.p.$eval("[role=dialog]", (d, t) => d.innerText.includes(t), goalTitle))) throw new Error(`review link, ${person} at ${width}: the drawer doesn't show the goal`);
        await goto(c.p, `/app/w/${WS}?review=${pendingGoal}.cr_shotsdoesnotexist`);
        await ready(c.p, "No such request", "[role=dialog]");
        if (!(await c.p.$("[role=dialog] [data-review-missing]"))) throw new Error(`review link, ${person} at ${width}: a made-up id shows no not-found state`);
        if (person !== "owner") {
          await goto(c.p, `/app/w/${WS}?review=${privGoal}.${privCr}`);
          await ready(c.p, "No such request", "[role=dialog]");
          const leaks = await c.p.$eval("[role=dialog]", (d) => /Private check/.test(d.innerText));
          if (leaks || !(await c.p.$("[role=dialog] [data-review-missing]"))) throw new Error(`review link, ${person} at ${width}: a hidden goal's request is not a plain not-found`);
        }
        await c.ctx.close();
      }
    }

    // Keyboard only at 320: from a cold review link, Tab to Approve and launch, Enter, Tab to its confirmation, Enter;
    // the drawer shows the done notice, and Escape closes it.
    const kb = await propose("keyboard at 320");
    const k = await page("owner", "dark", 320);
    await goto(k.p, `/app/w/${WS}?review=${goal}.${kb.id}`);
    await ready(k.p, "Work on this goal", "[role=dialog]");
    await tabTo(k.p, { sel: '[role=dialog] [data-decision="Approve and launch"]' }, "Approve and launch");
    await k.p.keyboard.press("Enter");
    const step = await k.p
      .waitForFunction(
        () => {
          const b = [...document.querySelectorAll("[role=dialog] button")].find((e) => e.offsetParent !== null && /^(Confirm:|Review this decision)/.test(e.textContent?.trim() ?? ""));
          return b ? (b.textContent ?? "").trim() : false;
        },
        { timeout: 10_000 },
      )
      .then((h) => h.jsonValue());
    if (String(step).startsWith("Review this decision")) {
      await tabTo(k.p, { sel: "[role=dialog] button", text: "Review this decision" }, "Review this decision");
      await k.p.keyboard.press("Enter");
    }
    await tabTo(k.p, { sel: "[role=dialog] button", text: "Confirm:" }, "the confirmation");
    await k.p.keyboard.press("Enter");
    await k.p.waitForSelector('[role=dialog] [data-notice="done"]', { timeout: 20_000 }).catch(() => {
      throw new Error("keyboard at 320: Approve and launch shows no done notice");
    });
    await k.p.keyboard.press("Escape");
    await k.p.waitForFunction(() => !document.querySelector("[role=dialog]"), { timeout: 5000 }).catch(() => {
      throw new Error("keyboard at 320: Escape did not close the drawer");
    });
    await k.ctx.close();

    // "Propose a change" at 390 as the member, where the shell offers it (round 2): from the throwaway goal's page, the
    // Menu's control opens the form with that goal chosen; Send with nothing else filled shows the form's own words and
    // focuses the first field it names; then a new title, a why and a link send, and the request carries the link.
    {
      const m = await page("member", "dark", 390);
      await goto(m.p, `/app/w/${WS}/goals/${goal}`);
      await ready(m.p, "Drawer check");
      await m.p.click('button[aria-controls="ca-menu"]');
      await m.p.waitForSelector("[data-menu-sheet]", { timeout: 5000 });
      if (!(await m.p.$("[data-menu-sheet] [data-propose-open]"))) console.log("Propose a change: not in this shell, asserts skipped");
      else {
        await m.p.click("[data-menu-sheet] [data-propose-open]");
        await ready(m.p, "Nothing changes until they approve", "[role=dialog]");
        if ((await m.p.$eval('[data-propose-field="goal"]', (e) => e.value)) !== goal) throw new Error("Propose: the goal's page didn't pre-fill the goal");
        await m.p.click("[data-propose-send]");
        await m.p.waitForFunction(() => [...document.querySelectorAll("[role=dialog] [role=alert]")].some((e) => e.textContent?.includes("Say why this should change.")), { timeout: 5000 }).catch(() => {
          throw new Error("Propose: an empty send didn't say what's missing");
        });
        if ((await m.p.evaluate(() => document.activeElement?.getAttribute("data-propose-field"))) !== "part") throw new Error("Propose: focus didn't go to the first field named");
        if (await m.p.evaluate(() => /reason is required/i.test(document.querySelector("[role=dialog]")?.innerText ?? ""))) throw new Error("Propose: the server's words reached an empty field");
        await m.p.select('[data-propose-field="part"]', "title");
        await m.p.$eval('[data-propose-field="text"]', (e) => e.select());
        await m.p.type('[data-propose-field="text"]', "Drawer check (proposed, fictional)");
        await m.p.type('[data-propose-field="why"]', "Proposed from the shell by shots.mjs. Fictional.");
        await m.p.type('[data-propose-field="link"]', "https://docs.example.test/propose-check");
        await m.p.click("[data-propose-send]");
        await m.p.waitForSelector('[role=dialog] [data-propose="sent"]', { timeout: 20_000 }).catch(() => {
          throw new Error("Propose: Send for approval didn't reach the sent state");
        });
        const open = (await call(theo, "GET", `/api/v2/workspaces/${WS}/goals/${goal}/change-requests?state=pending`)).change_requests ?? [];
        const mineNow = open.find((c) => c.changes?.title === "Drawer check (proposed, fictional)");
        if (!mineNow) throw new Error("Propose: no pending request with the proposed title");
        if (mineNow.evidence_count !== 1) throw new Error(`Propose: the request has ${mineNow.evidence_count} links, wanted 1`);
        // The summary said "1 link, from you (Self-reported)": the review must say the same of that link.
        await m.p.click('[role=dialog] [data-propose="sent"] a');
        await ready(m.p, "Work on this goal", "[role=dialog]");
        if (!(await m.p.$('[role=dialog] [data-evidence="self"]'))) throw new Error("Propose: the review doesn't label the proposer's link Self-reported");
      }
      await m.ctx.close();
    }
  } finally {
    await ctx.close();
    await call(mara, "POST", `/api/v2/workspaces/${WS}/goals/${goal}/versions`, { version: await version(), status: "dropped" });
    if (privGoal) {
      const g = await call(mara, "GET", `/api/v2/workspaces/${WS}/goals/${privGoal}`);
      await call(mara, "POST", `/api/v2/workspaces/${WS}/goals/${privGoal}/versions`, { version: g.version ?? g.goal?.version, status: "dropped" });
    }
  }
}

await browser.close();
console.log(`wrote ${written.length} screenshots to ${OUT}`);
