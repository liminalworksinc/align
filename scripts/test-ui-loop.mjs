#!/usr/bin/env node
// Browser loop for a custom (/setup) scenario, as two people and one agent would run it:
//   leadership sets up the fixture; a synthetic agent session reads Align (capture event with an align tool);
//   the asking and owning teams, each in its own browser profile, propose -> ask for changes with conditions ->
//   accept -> approve without a sandbox test, by visible labels only; then both see the agreed version, the
//   decision record shows the conditions, no screen shows Northstar copy, and the agent session has exactly one
//   wake-up with the conditions quoted. Cleans up: consent revoked (purges the synthetic session), back to Northstar.
// First, for Northstar and for the fixture (LIM-2424, Sean #6): two tabs sharing one cookie; a tab whose sign-in
//   changed in the other tab sends no write, names both teams, and continues as the new team only when asked.
//
// Usage: node scripts/test-ui-loop.mjs <baseUrl> [fixture.json]   (default data/scenarios/example-custom.json)
// Chrome: CHROME_PATH, else /Applications/Google Chrome.app.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { baseUrl, PASSCODES, signIn } from "./lib/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = baseUrl();
const FIXTURE = path.resolve(process.argv[3] || path.join(ROOT, "data/scenarios/example-custom.json"));
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RUN = Date.now().toString(36);
const AGENT_REPO = "test-ui-loop-agent";
const AGENT = `test-ui-loop-${RUN}`;
const MEASURE = `UILOOP ${RUN}: the shared resource is held for the asking team two nights a week`;
const COUNTER = `UILOOP ${RUN}: the shared resource is held for the asking team on Tuesday and Thursday nights`;
const CONDITIONS = `UILOOP conditions ${RUN}: post before each use, stop by 6 AM when the owning team needs it next morning, and hand it back working.`;
const ASKING = fixture.asking.team;
const OWNING = fixture.owning.team;
// Northstar copy that must never show for a custom scenario. Northstar team names count only when this company
// has no team of that name (Fernway's asking team is "Product").
const own = new Set([fixture.leadership?.team, ASKING, OWNING].filter(Boolean));
const nsTeams = ["Security", "CEO"].filter((t) => !own.has(t));
const LEAK = new RegExp(`Northstar|Sparta|Alike|p-beta|p-throughput${nsTeams.map((t) => `|\\b${t}\\b`).join("")}`);
const WAIT_MS = 30000; // next dev compiles a page on first visit

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${String(detail).slice(0, 500)}` : ""}`);
  return ok;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const leakIn = (t) => (t.match(new RegExp(`.{0,60}(?:${LEAK.source}).{0,60}`)) ?? [null])[0];

async function api(cookie, method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

// ---- browser helpers: visible labels only ----
async function click(page, text, sel = "button") {
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT_MS) {
    const ok = await page.evaluate(
      (text, sel) => {
        const el = [...document.querySelectorAll(sel)].find((b) => b.offsetParent !== null && !b.disabled && b.innerText.replace(/\s+/g, " ").includes(text));
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      },
      text,
      sel,
    );
    if (ok) return;
    await sleep(250);
  }
  const seen = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((b) => b.offsetParent !== null).map((b) => b.innerText.replace(/\s+/g, " ").slice(0, 50)), sel);
  throw new Error(`no ${sel} with "${text}"; visible: ${seen.join(" | ")}`);
}
async function fill(page, labelText, value) {
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT_MS) {
    const ok = await page.evaluate(
      (labelText, value) => {
        const label = [...document.querySelectorAll("label")].find((l) => l.offsetParent !== null && l.innerText.replace(/\s+/g, " ").includes(labelText));
        const el = label?.querySelector("textarea, input:not([type=checkbox]):not([type=radio])");
        if (!el) return false;
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); // React-safe
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      labelText,
      value,
    );
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`no field labelled "${labelText}"`);
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, needle) {
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT_MS) {
    if ((await text(page)).includes(needle)) return true;
    await sleep(300);
  }
  return false;
}
async function signInUi(page, team, passcode, at = "/") {
  await page.goto(BASE + at, { waitUntil: "networkidle2", timeout: 60000 });
  await click(page, team, "label");
  await fill(page, "Passcode", passcode).catch(() => page.type("input[type=password]", passcode));
  await click(page, "Sign in");
  return waitText(page, "Your turn");
}
async function openProposals(page) {
  await page.reload({ waitUntil: "networkidle2" });
  await click(page, "Your turn");
  if (await waitText(page, MEASURE.slice(0, 30))) await click(page, MEASURE.slice(0, 30)).catch(() => {}); // open it from the inbox
}

// LIM-2452: a phone (390 wide, or `width`). The page must not scroll sideways, and `needle` (a button's exact label),
// when given, must sit inside the width. Resizing keeps the page's state; it goes back to 1440 afterwards.
async function narrow(page, label, needle, width = 390) {
  await page.setViewport({ width, height: 844 });
  await sleep(600);
  const r = await page.evaluate((needle) => {
    const W = window.innerWidth;
    const el = needle ? [...document.querySelectorAll("button, a, span")].filter((e) => e.offsetParent !== null && e.innerText?.replace(/\s+/g, " ").trim() === needle).at(-1) : null;
    const b = el?.getBoundingClientRect();
    // On a failure, name what runs past the edge: the text nodes and elements whose right side is beyond the width.
    const past = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n && past.length < 3; n = walk.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(n);
      if (range.getBoundingClientRect().right > W + 1) past.push(`"${n.nodeValue.slice(0, 40)}" in ${n.parentElement?.tagName}.${String(n.parentElement?.className).slice(0, 80)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, W, found: !!el, left: b ? Math.round(b.left) : null, right: b ? Math.round(b.right) : null, past };
  }, needle ?? null);
  await page.setViewport({ width: 1440, height: 900 });
  await sleep(300);
  check(`${label}: no sideways scroll at ${width}${needle ? `, and "${needle}" fits the width` : ""}`, r.scrollWidth <= r.W && (!needle || (r.found && r.left >= 0 && r.right <= r.W)), JSON.stringify(r));
}

// LIM-2452 review: at 390 the Switch team menu opens inside the screen (every item within [0, width]), then closes.
async function narrowMenu(page, label) {
  await page.setViewport({ width: 390, height: 844 });
  await sleep(600);
  await click(page, "Switch team");
  await page.waitForSelector("[role=menuitem]", { timeout: 10000 });
  const r = await page.evaluate(() => ({ W: window.innerWidth, items: [...document.querySelectorAll("[role=menuitem]")].map((m) => { const b = m.getBoundingClientRect(); return { text: m.innerText.trim(), left: Math.round(b.left), right: Math.round(b.right) }; }) }));
  await click(page, "Switch team"); // close it again
  await page.setViewport({ width: 1440, height: 900 });
  await sleep(300);
  check(`${label}: at 390 every Switch team menu item is inside the screen`, r.items.length > 0 && r.items.every((i) => i.left >= 0 && i.right <= r.W), JSON.stringify(r));
}

// One click, no waiting: false when no visible enabled button carries the text (the page already stopped).
const clickNow = (page, label) =>
  page.evaluate((label) => {
    const el = [...document.querySelectorAll("button")].find((b) => b.offsetParent !== null && !b.disabled && b.innerText.replace(/\s+/g, " ").includes(label));
    el?.click();
    return !!el;
  }, label);
const STATE_FILE = path.join(ROOT, "data/state.json"); // the audit log is not in any API view
const audit = () => JSON.parse(readFileSync(STATE_FILE, "utf8")).audit ?? [];

/**
 * LIM-2424 (Sean #6): two tabs of one browser share the session cookie. Tab A signs in as team X; tab B then signs in
 * as team Y; tab A, still showing X's screen, tries a write right after B's sign-in lands. No write may reach the
 * server as Y; A stops, names both teams, and "Continue as Y" loads Y's view.
 * prepare(A) gets A one click away from the write; `write` is that click's label.
 */
async function crossTab(name, { X, Y, xPass, yPass, yRole, at = "/", prepare, write }) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
  try {
    const ctx = await browser.createBrowserContext(); // one profile, two tabs: one cookie jar
    const [A, B] = [await ctx.newPage(), await ctx.newPage()];
    for (const pg of [A, B]) await pg.setViewport({ width: 1440, height: 900 });
    const signedX = await signInUi(A, X, xPass, at);
    await prepare(A);
    // Tab B (already showing X: one cookie) signs in as Y, as a quick sign-out/sign-in or a background tab A allows;
    // the moment its sign-in lands, tab A, still showing X, clicks the write.
    await B.goto(BASE + at, { waitUntil: "networkidle2", timeout: 60000 });
    // Tab B's own page load can log a timer touchpoint as X (e.g. Your turn's ceo_change_viewed); let it land before
    // the baseline, so only what happens after the switch counts.
    await sleep(1000);
    const before = audit();
    const signedY = await B.evaluate(
      async (role, passcode) => (await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, passcode }) })).status === 200,
      yRole,
      yPass,
    );
    const clicked = await clickNow(A, write);
    const notice = `You signed in as ${Y} in another tab. This tab was ${X}.`;
    const told = await waitText(A, notice);
    await sleep(1000);
    console.log(`      (${name}: tab A's write click ${clicked ? `was made while it still showed ${X}` : "found the tab already stopped by its poll"})`);
    const after = audit();
    const fresh = after.slice(before.length);
    check(
      `CT1 ${name}: a write from a tab signed in as ${X} after another tab signed in as ${Y} never reaches the server (no new audit row)`,
      signedX && signedY && fresh.length === 0,
      JSON.stringify({ signedX, signedY, clicked, fresh }),
    );
    check(`CT2 ${name}: the stale tab stops and names both teams, with Continue as ${Y}`, told && (await text(A)).includes(`Continue as ${Y}`), (await text(A)).slice(0, 400));
    const continued = await click(A, `Continue as ${Y}`).then(() => true, () => false);
    const t0 = Date.now();
    let head = "";
    while (Date.now() - t0 < WAIT_MS && !head.includes(`${Y} ·`)) {
      head = await A.evaluate(() => document.querySelector("header")?.innerText.replace(/\s+/g, " ") ?? "");
      await sleep(300);
    }
    check(`CT3 ${name}: Continue as ${Y} loads ${Y}'s view in the stale tab`, continued && head.includes(`${Y} ·`) && !(await text(A)).includes(notice), head.slice(0, 300));
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`Align custom-scenario browser loop against ${BASE} (fixture ${path.relative(ROOT, FIXTURE)})\n`);
  if (!check("Chrome is available", existsSync(CHROME), `set CHROME_PATH; not found at ${CHROME}`)) return;
  const lead = await signIn(BASE, "leadership");
  const r0 = await api(lead, "POST", "/api/reset", { confirm: "reset" });
  // Northstar: any team may start the demo over (?ops), so a write sent as the other team would land.
  await crossTab("Northstar", {
    X: "Product", Y: "Security", xPass: PASSCODES.product, yPass: PASSCODES.security, yRole: "security", at: "/?ops",
    prepare: (A) => click(A, "Start the demo over"),
    write: "Click again to reset",
  });
  const s0 = await api(lead, "POST", "/api/scenario", { ...fixture, confirm: "replace" });
  check("setup: Northstar reset, then leadership sets up the fixture", r0.status === 200 && s0.status === 200, `${r0.status} ${s0.status} ${s0.text.slice(0, 200)}`);
  // The custom fixture: the asking team's tab has a proposal ready to send when the owning team signs in elsewhere.
  await crossTab("custom", {
    X: ASKING, Y: OWNING, xPass: PASSCODES.product, yPass: PASSCODES.security, yRole: "security",
    prepare: async (A) => {
      await click(A, "New conflict"); // v6 rail: with no proposal yet, + New conflict opens the composer directly
      if (!(await waitText(A, "Send proposal to"))) await click(A, "Propose a change");
      await fill(A, `New target for ${OWNING}`, `${MEASURE} (cross-tab)`);
      await fill(A, "Why", "UILOOP cross-tab check.");
      await fill(A, `What ${ASKING} will do in return`, "UILOOP cross-tab check.");
    },
    write: "Send proposal to",
  });

  // The agent: a session that reads Align after setup, as the capture hook reports it.
  const g = await api(lead, "POST", "/api/sessions/consent", { harness: "claude-code", repo: AGENT_REPO });
  const c = await api(null, "POST", "/api/sessions/events", { harness: "claude-code", session_id: AGENT, hook_event: "PostToolUse", repo: AGENT_REPO, cwd: AGENT_REPO, tool_name: "mcp__align__align_get_accepted_plan" });
  check("agent: consent for a synthetic repo, and a session that read Align", g.status === 200 && c.status === 200, `${g.status} ${c.status}`);

  let directivesAfterApproval = null; // read before U14 replaces the scenario, which clears the agent's wake-ups
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
  try {
    const [A, O] = await Promise.all([browser.createBrowserContext(), browser.createBrowserContext()].map(async (ctx) => (await ctx).newPage()));
    for (const pg of [A, O]) await pg.setViewport({ width: 1440, height: 900 });

    await A.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
    const signInText = await text(A);
    check("U1 sign-in screen names the company and both teams", signInText.includes(fixture.company) && signInText.includes(ASKING) && signInText.includes(OWNING), signInText.slice(0, 300));
    check("U1 sign-in screen has no Northstar copy", !LEAK.test(signInText), leakIn(signInText));
    if (fixture.company_note) check("CN4 the sign-in screen shows the company note under the company line", signInText.includes(fixture.company_note) && signInText.indexOf(fixture.company_note) > signInText.indexOf(fixture.company), signInText.slice(0, 400));
    check("P1-2 sign-in screen tells a solo tester how to switch teams", /Testing on your own\?/.test(signInText) && /Switch team/.test(signInText), signInText.slice(0, 400));
    check("U2 both teams sign in, each in its own browser profile", (await signInUi(A, ASKING, PASSCODES.product)) && (await signInUi(O, OWNING, PASSCODES.security)));
    const home = await text(A);
    check("U2 the asking team's home has no Northstar copy", !LEAK.test(home), leakIn(home));
    if (fixture.company_note) {
      const head = await A.evaluate(() => document.querySelector("header")?.innerText ?? "");
      check("CN4 the header shows the company note under the company name, once signed in", head.includes(fixture.company) && head.indexOf(fixture.company_note) > head.indexOf(fixture.company), head.slice(0, 300));
    }

    await narrow(A, "N1 the asking team's first signed-in screen", "Propose a change");
    await narrowMenu(A, "N6 the asking team's header");

    // Propose (with no proposal yet, + New conflict opens the composer directly)
    await click(A, "New conflict");
    if (!(await waitText(A, "Send proposal to"))) await click(A, "Propose a change");
    await fill(A, `New target for ${OWNING}`, MEASURE);
    await fill(A, "Why", "UILOOP the asking team needs the shared resource alone for long blocks.");
    await fill(A, `What ${ASKING} will do in return`, "UILOOP the asking team uses nothing during the day and hands it back working.");
    await click(A, "Send proposal to");
    check("U3 the asking team sends the proposal", await waitText(A, "Waiting"), (await text(A)).slice(0, 300));

    // The owning team asks for changes, with conditions
    await openProposals(O);
    await waitText(O, "Your decision");
    await narrow(O, "N2 the owning team's review of the proposal");
    // Lane C: choose Counter, write the one required input (the revised target), open the optional extras, then
    // review and confirm. Nothing is sent before the confirmation.
    await click(O, "Counter");
    await fill(O, "Your revised target", COUNTER);
    await click(O, "Add a reason or conditions");
    await fill(O, "Your reason (optional)", "UILOOP two fixed nights are easier to plan around.");
    await fill(O, "Conditions (optional", CONDITIONS);
    await click(O, "Review this decision");
    check("U4 the confirmation names the revised target and that the asking team must accept it", (await waitText(O, "Confirm: Counter")) && (await text(O)).includes(`${ASKING} must accept your changes`), (await text(O)).slice(-800));
    await click(O, "Confirm: Counter");
    check("U4 the owning team asks for changes and waits on the asking team", await waitText(O, `Waiting for ${ASKING}`), (await text(O)).slice(0, 300));
    {
      // While countered the owner may still decline (flow.ts rejectProposal), and nothing else. Not exercised here.
      const t = await text(O);
      check("U4b while waiting, the owner is offered Decline only, with the hand-off to the asking team", t.includes("You can still decline instead of waiting") && t.includes("Decline") && !t.includes("Approve this exact revision") && t.includes(`Act as`), t.slice(-800));
    }

    // The asking team sees the conditions and accepts
    await openProposals(A);
    check("U5 the asking team sees the conditions before accepting, marked not confirmed yet", (await waitText(A, CONDITIONS.slice(0, 40))) && /not confirmed yet/i.test(await text(A)), (await text(A)).slice(0, 500));
    check("U5 the asking team is not offered the owner's decline line", !(await text(A)).includes("You can still decline"), (await text(A)).slice(-600));
    await narrow(A, "N3 the asking team's review of the changes, with its long accept button");
    await click(A, `Accept ${OWNING}`);
    await click(A, "Review this decision");
    await click(A, "Confirm: Accept");
    check("U5 the asking team accepts the changes", await waitText(A, "accepted"), (await text(A)).slice(0, 300));

    // U5b The refusal demo, while the proposal waits on the owner. The owner never sees the button; the asking team's
    // click reaches the real accept endpoint and is handed back (403) with the state unchanged.
    const openState = async () => {
      const st = (await api(lead, "GET", "/api/state")).json;
      const pr = (st?.proposals ?? []).find((x) => !["RATIFIED", "REJECTED"].includes(x.state));
      return { state: pr?.state, acceptances: st?.acceptances?.length ?? 0 };
    };
    const TRY = `Try to approve (only ${OWNING} can)`;
    await openProposals(O);
    await waitText(O, "Your decision");
    check("U5b the owner sees no \"Try to approve\" button", !(await text(O)).includes("Try to approve"), (await text(O)).slice(0, 300));
    const s5 = await openState();
    await openProposals(A);
    check("U5b the asking team sees the refusal demo button while it waits", await waitText(A, TRY), (await text(A)).slice(-600));
    await click(A, TRY);
    const handed = await waitText(A, `Handed back: only ${OWNING} can approve this`);
    const s5b = await openState();
    check(
      "U5b the asking team's click is handed back by the server (403) and nothing changes",
      handed && s5b.state === s5.state && s5b.acceptances === s5.acceptances,
      JSON.stringify({ handed, s5, s5b, tail: (await text(A)).slice(-300) }),
    );

    // U5c A stale tab must not approve. A second tab of the asking team's browser keeps its asking-team screen (its
    // state polls are blocked, as for a backgrounded tab) while the first tab switches this browser to the owner. The
    // stale tab's button re-reads who is signed in, refuses with no request, and nothing changes.
    const A2 = await A.browserContext().newPage();
    await A2.setViewport({ width: 1440, height: 900 });
    await A2.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
    await openProposals(A2);
    await waitText(A2, TRY);
    let acceptCalls = 0;
    await A2.setRequestInterception(true);
    A2.on("request", (req) => {
      const u = req.url();
      if (/\/api\/proposals\/[^/]+\/accept/.test(u)) acceptCalls++;
      if (/\/api\/state/.test(u)) return void req.abort();
      void req.continue();
    });
    const pass = (page, v) => page.evaluate((v) => { const el = document.querySelector("input[type=password]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    await click(A, "Switch team");
    await click(A, OWNING, "[role=menuitem]");
    await A.waitForSelector("input[type=password]", { timeout: 30000 });
    await pass(A, PASSCODES.security);
    await click(A, "Sign in");
    const nowOwner = await waitText(A, `Acting as ${OWNING}`);
    const s5c = await openState();
    await click(A2, TRY);
    const stale = await waitText(A2, "This tab is out of date");
    const s5d = await openState();
    check(
      "U5c a stale asking-team tab, after this browser switched to the owner, refuses on its own: no accept request, nothing changes",
      nowOwner && stale && acceptCalls === 0 && s5d.state === s5c.state && s5d.acceptances === s5c.acceptances,
      JSON.stringify({ nowOwner, stale, acceptCalls, s5c, s5d }),
    );
    await A2.close();
    await click(A, "Switch team");
    await click(A, ASKING, "[role=menuitem]");
    await A.waitForSelector("input[type=password]", { timeout: 30000 });
    await pass(A, PASSCODES.product);
    await click(A, "Sign in");
    check("U5c the asking team's browser switches back", await waitText(A, `Acting as ${ASKING}`), (await text(A)).slice(0, 300));

    // Before approval: the agent has nothing to wake on
    const before = await api(null, "GET", `/api/directives?session=claude-code:${AGENT}`);
    check("U6 before approval the agent has no wake-up", (before.json?.pending ?? []).length === 0, before.text.slice(0, 300));

    // P1-2b Switch team (LIM-2437 bd53f6f6): the owner's window switches to the asking team. Its sign-in opens with that
    // team chosen and still needs its passcode; as the asking team it can't approve the owner's goal (no permission
    // carries over); switching back needs the owner's passcode (a wrong one is refused).
    const passcode = (page, v) => page.evaluate((v) => { const el = document.querySelector("input[type=password]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    const checkedTeam = (page) => page.evaluate(() => document.querySelector("input[type=radio]:checked")?.closest("label")?.innerText.replace(/\s+/g, " ") ?? "");
    await click(O, "Switch team");
    await click(O, ASKING, "[role=menuitem]");
    const toAsking = (await O.waitForSelector("input[type=password]", { timeout: 30000 }).then(() => true, () => false)) && (await checkedTeam(O)).includes(ASKING);
    await passcode(O, PASSCODES.product);
    await click(O, "Sign in");
    const actingAsking = await waitText(O, `Acting as ${ASKING}`);
    const wrongActor = await O.evaluate(async () => {
      const st = await (await fetch("/api/state", { cache: "no-store" })).json();
      const open = (st.proposals ?? []).find((x) => !["RATIFIED", "REJECTED"].includes(x.state));
      const r = await fetch(`/api/proposals/${open?.id}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accept_untested: true }) });
      const after = await (await fetch("/api/state", { cache: "no-store" })).json();
      return { status: r.status, before: open?.state, after: (after.proposals ?? []).find((x) => x.id === open?.id)?.state };
    });
    check(
      "P1-2b Switch team: the owner's window switches to the asking team (preselected, passcode required) and that team's approval of the owner's goal is refused, state unchanged",
      toAsking && actingAsking && wrongActor.status === 403 && wrongActor.after === wrongActor.before,
      JSON.stringify({ toAsking, actingAsking, wrongActor }),
    );
    await click(O, "Switch team");
    await click(O, OWNING, "[role=menuitem]");
    await O.waitForSelector("input[type=password]", { timeout: 30000 });
    await passcode(O, "not-the-owner-passcode");
    await click(O, "Sign in");
    await sleep(800);
    const wrongPass = !(await text(O)).includes(`Acting as ${OWNING}`);
    await passcode(O, PASSCODES.security);
    await click(O, "Sign in");
    check("P1-2b switching back to the owning team needs its passcode (a wrong one is refused)", wrongPass && (await waitText(O, `Acting as ${OWNING}`)), (await text(O)).slice(0, 300));

    // The owning team approves, ticking "without a sandbox test"
    await openProposals(O);
    await waitText(O, "Your decision");
    await click(O, "Approve this exact revision");
    await click(O, "without a sandbox test", "label");
    await click(O, "Review this decision");
    check("U7 the confirmation says approval is not launch", (await waitText(O, "Approval is not launch")), (await text(O)).slice(-800));
    await click(O, "Confirm: Approve this exact revision");
    check("U7 the owning team approves: the page says \"Agreed, launch pending\"", await waitText(O, "Agreed, launch pending"), (await text(O)).slice(0, 300));
    await click(O, "See the decision");
    await sleep(800);
    const dec = await text(O);
    check("U8 the decision record shows the conditions (not confirmed yet), that agreement is not launch approval, and one next step", dec.includes(CONDITIONS.slice(0, 40)) && /not approval to launch/i.test(dec) && /Not confirmed yet/.test(dec) && (dec.match(/Next step/gi) ?? []).length === 1, dec.slice(0, 500));
    check("U8 the decision record has no Northstar copy", !LEAK.test(dec), leakIn(dec));
    check("U8 open conditions are flagged not confirmed yet, once", (dec.match(/not confirmed yet/gi) ?? []).length === 1, dec.slice(0, 500));
    await narrow(O, "N4 the decision record");

    const acc = (await api(lead, "GET", "/api/state")).json?.acceptances?.at(-1);
    for (const [pg, team] of [[A, ASKING], [O, OWNING]]) {
      await pg.reload({ waitUntil: "networkidle2" });
      await click(pg, "Your turn");
      await sleep(800);
      const t = await text(pg);
      check(`U9 ${team} sees the agreed version ${acc?.accepted_version} and the teams agreed`, !!acc && t.includes(acc.accepted_version) && t.includes(COUNTER.slice(0, 40)) && /agreed/i.test(t), t.slice(0, 400));
    }

    // U11 The time-to-agreement clock starts on landing. This run never clicks "See goals" or the company node: both
    // teams landed on Your turn while the company change was unresolved, which counts as seeing it.
    const timer = (await api(lead, "GET", "/api/state")).json?.timer;
    check("U11 the time-to-agreement clock started from landing on Your turn (no goals click)", !!timer?.started_at && (timer?.touchpoints?.length ?? 0) > 0, JSON.stringify(timer).slice(0, 300));

    // U12 "Not yet" keeps the launch pending: leadership still has the decision waiting, and the teams still see it.
    const ratified = (await api(lead, "GET", "/api/state")).json?.proposals?.find((x) => x.state === "RATIFIED");
    const ny = await api(lead, "POST", `/api/proposals/${ratified?.id}/launch`, { decision: "not_yet" });
    const LP = await (await browser.createBrowserContext()).newPage();
    await LP.setViewport({ width: 1440, height: 900 });
    const leadIn = await signInUi(LP, fixture.leadership?.team ?? "Leadership", PASSCODES.leadership);
    await sleep(800);
    const lt = await text(LP);
    check(
      "U12 after \"not yet\" leadership's Your turn still shows the launch decision, and counts it",
      ny.status === 200 && leadIn && lt.includes("Decide the launch") && /1 thing waiting on you/.test(lt),
      JSON.stringify({ status: ny.status, body: ny.text.slice(0, 120), tail: lt.slice(0, 400) }),
    );
    await A.reload({ waitUntil: "networkidle2" });
    await click(A, "Your turn");
    check("U12 after \"not yet\" the asking team still sees that leadership decides the launch", await waitText(A, "decides the launch"), (await text(A)).slice(0, 400));
    await LP.close();

    await waitText(A, "What this decision gave you");
    await narrow(A, "N5 the asking team's Your turn with the decision value card");

    // U13 After a decided proposal, + New conflict opens the composer, not the old decided thread.
    await click(A, "New conflict");
    check("U13 after a ratified proposal, + New conflict opens the composer", await waitText(A, "Send proposal to"), (await text(A)).slice(0, 400));

    // U14 A declined proposal is visible to the asking team. Fresh fixture, the asking team proposes, the owner
    // declines (ProposalsView tells the owner "… sees that you declined"): Your turn and Decisions both say so.
    directivesAfterApproval = await api(null, "GET", `/api/directives?session=claude-code:${AGENT}`);
    const s14 = await api(lead, "POST", "/api/scenario", { ...fixture, confirm: "replace" });
    await A.reload({ waitUntil: "networkidle2" });
    await click(A, "New conflict");
    if (!(await waitText(A, "Send proposal to"))) await click(A, "Propose a change");
    await fill(A, `New target for ${OWNING}`, `${MEASURE} (declined run)`);
    await fill(A, "Why", "UILOOP decline path.");
    await fill(A, `What ${ASKING} will do in return`, "UILOOP nothing extra.");
    await click(A, "Send proposal to");
    await waitText(A, "Waiting");
    // The owner declines on screen: the notice stays on the declined request (it leaves activeProposal()).
    await O.reload({ waitUntil: "networkidle2" });
    await openProposals(O);
    await waitText(O, "Your decision");
    await click(O, "Decline");
    await click(O, "Review this decision");
    await click(O, "Confirm: decline this request");
    const recorded = await waitText(O, "Recorded: you declined this request");
    check("U14 the owner declines on screen and stays on that request with the recorded notice", recorded, (await text(O)).slice(-800));
    const pend = (await api(lead, "GET", "/api/state")).json?.proposals?.find((x) => x.state === "PENDING_SECURITY" || x.state === "REJECTED");
    const rj = pend?.state === "REJECTED" ? { status: 200, text: "declined on screen" } : await api(await signIn(BASE, "security"), "POST", `/api/proposals/${pend?.id}/reject`, {});
    await A.reload({ waitUntil: "networkidle2" });
    await click(A, "Your turn");
    const yt = await waitText(A, "declined your last proposal");
    await click(A, "Decisions");
    const dl = await waitText(A, "Declined by");
    check(
      "U14 after the owner declines, the asking team's Your turn and Decisions both show the decline",
      s14.status === 200 && rj.status === 200 && yt && dl,
      JSON.stringify({ setup: s14.status, reject: rj.status, body: rj.text.slice(0, 120), yt, dl, tail: (await text(A)).slice(0, 300) }),
    );
  } finally {
    await browser.close();
  }

  // The agent's wake-up: one, with the conditions quoted and no command
  const after = directivesAfterApproval ?? (await api(null, "GET", `/api/directives?session=claude-code:${AGENT}`));
  const d = after.json?.pending ?? [];
  check(
    "U10 after approval the agent has exactly one wake-up, conditions quoted, no run command",
    d.length === 1 && d[0].text.includes(`«${CONDITIONS}»`) && /no run command/.test(d[0].text) && !LEAK.test(d[0].text),
    JSON.stringify(d).slice(0, 400),
  );

  const rv = await api(lead, "DELETE", "/api/sessions/consent", { harness: "claude-code", repo: AGENT_REPO });
  const r1 = await api(lead, "POST", "/api/reset", { confirm: "reset" });
  check("cleanup: consent revoked (synthetic session purged), back to Northstar", rv.status === 200 && r1.status === 200, `${rv.status} ${r1.status}`);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL  aborted: ${e?.message ?? e}`);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
