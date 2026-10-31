#!/usr/bin/env node
// The decision value card, its next-step links and its funnel events (issue #30 items 2–5, LIM-2445).
// Builds once (skip with --no-build), then runs production servers on <port> with workspaces in a temp ALIGN_DATA_DIR:
//   phase "unit":   lib/value.ts link checks, text cleaning and measured spans (no server)
//   phase "local":  Mode L, open create -> the card only after RATIFIED (API and browser), measured times from real
//                   timestamps, not_yet shown as not yet, feedback stored/capped/cleaned, new actions accepted and unknown
//                   ones refused, role-only events, cross-workspace isolation, Restart keeps them, ws-admin funnel
//   phase "hosted": HOSTED=1 as Fly runs it -> no new route, HOSTED_ROUTES unchanged, a bad waitlist/LOI URL is hidden
//   phase "layout": LIM-2452 cycle 2 on a custom workspace: the phone layout (Propose a change above the fold, one
//                   ConnectAI), the Goals map at every width, the asker's review at 768, 44px tap targets at 390,
//                   the Switch team menu at 700, and the AI apps copy (Read the current plan / Last read an older plan, never follow or work from)
// Usage: node scripts/test-funnel.mjs <port> [--no-build] [--only local|layout|hosted]   (from a worktree root; refuses 3100 and the main checkout)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const PORT = Number(process.argv[2]);
const BUILD = !process.argv.includes("--no-build");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null; // one phase: local, layout or hosted
if (!Number.isInteger(PORT) || PORT === 3100) {
  console.error("usage: node scripts/test-funnel.mjs <port> [--no-build] (not 3100)");
  process.exit(2);
}
const ROOT = process.cwd();
if (path.resolve(ROOT) === path.join(os.homedir(), "liminal/align")) {
  console.error(`test-funnel: refusing the main checkout ${ROOT}; run from a worktree`);
  process.exit(2);
}
if (spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]).status === 0) {
  console.error(`test-funnel: port ${PORT} is already in use`);
  process.exit(2);
}
const V = await import("../lib/value.ts");
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "data/scenarios/example-custom.json"), "utf8"));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HOSTED_HOST = "align.test";
const FORM_ID = "1FAIpQLSfxBjrDxvd3VmRhK_rwYU7-YCFSwV3cZLxDkyFLPYEUM5vU7g";
const ACTIONS = ["value_card_viewed", "value_reported", "waitlist_clicked", "loi_cta_clicked"];

let pass = 0;
let fail = 0;
let phaseName = "";
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  [${phaseName}] ${name}${ok ? "" : `  ${String(detail).slice(0, 300)}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- HTTP (node:http, so Host and Origin are exactly what we say) ----
let HOSTED = false;
function req(method, p, { body, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const write = !["GET", "HEAD"].includes(method);
    const h = HOSTED
      ? { host: HOSTED_HOST, "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.7", ...(write ? { origin: `https://${HOSTED_HOST}` } : {}) }
      : { host: `127.0.0.1:${PORT}` };
    let data;
    if (body !== undefined) {
      data = JSON.stringify(body);
      h["content-type"] = "application/json";
      h["content-length"] = Buffer.byteLength(data);
    }
    if (cookie) h.cookie = cookie;
    Object.assign(h, headers);
    for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
    const r = http.request({ host: "127.0.0.1", port: PORT, method, path: p, headers: h }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(t);
        } catch {}
        resolve({ status: res.statusCode, text: t, json, cookie: ((res.headers["set-cookie"] ?? [])[0] || "").split(";")[0] });
      });
    });
    r.on("error", reject);
    if (data !== undefined) r.write(data);
    r.end();
  });
}
const timer = (cookie, body, headers) => req("POST", "/api/timer", { cookie, body, headers });

async function newWorkspace(marker, extra = {}) {
  const f = structuredClone(FIXTURE);
  f.company = `${f.company} ${marker}`;
  const r = await req("POST", "/api/workspaces", { body: { ...f, ...extra } });
  if (r.status !== 201) throw new Error(`create ${marker}: ${r.status} ${r.text}`);
  const ws = r.json.workspace.id;
  const c = {};
  for (const role of ["leadership", "product", "security"]) {
    const s = await req("POST", "/api/session", { body: { workspace: ws, role, passcode: r.json.passcodes[role] } });
    if (s.status !== 200) throw new Error(`sign in ${role}: ${s.status} ${s.text}`);
    c[role] = s.cookie;
  }
  return { ws, c, passcodes: r.json.passcodes };
}
async function agree(w) {
  const p = await req("POST", "/api/proposals", { cookie: w.c.product, body: { proposed_measure_text: "Retention first for two weeks", rationale: "The review needs it", reciprocal_commitment: "We freeze schema changes" } });
  const pid = p.json?.id;
  const a = await req("POST", `/api/proposals/${pid}/accept`, { cookie: w.c.security, body: { rationale: "ok", accept_untested: true } });
  return { pid, ok: p.status === 200 && a.status === 200, detail: `${p.status} ${a.status} ${a.text.slice(0, 200)}` };
}

// ---- server ----
let server = null;
let serverOut = "";
async function start(env) {
  rmSync(path.join(ROOT, "data/state.json"), { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^(ALIGN_|HOSTED$|AI_GATEWAY_API_KEY$|ANTHROPIC_)/.test(k)) delete clean[k];
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  serverOut = "";
  server.stderr.on("data", (c) => (serverOut += c));
  server.stdout.on("data", (c) => (serverOut += c));
  let exited = false;
  server.on("exit", () => (exited = true));
  for (let i = 0; i < 90 && !exited; i++) {
    try {
      if ((await req("GET", "/api/workspaces/config")).status === 200) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`server did not start: ${serverOut.slice(-400)}`);
}
async function stop() {
  if (!server) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  spawnSync("pkill", ["-f", `next start -H 127.0.0.1 -p ${PORT}`]);
  server = null;
  await sleep(2500);
  rmSync(path.join(ROOT, "data/state.json"), { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
}
process.on("exit", () => {
  if (server)
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
});

// ---- phase unit ----
function phaseUnit() {
  phaseName = "unit";
  const form = `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`;
  check("waitlist: the Google Form URL is allowed", V.waitlistUrlOk(form) === form, V.waitlistUrlOk(form));
  const badWait = ["http://docs.google.com/forms/d/x", "https://evil.example/forms/x", "https://docs.google.com.evil.example/forms/x", "https://docs.google.com/document/d/x", "https://u:p@docs.google.com/forms/x", "https://docs.google.com:8443/forms/x", "javascript:alert(1)", "not a url", ""];
  check("waitlist: http, another host, a look-alike host, a non-form path, credentials, a port, javascript:, junk and empty are hidden (null)", badWait.every((u) => V.waitlistUrlOk(u) === null), badWait.filter((u) => V.waitlistUrlOk(u) !== null).join(" "));
  check("LOI: an https URL or a mailto: with one address is allowed", V.loiUrlOk("https://example.com/loi") && V.loiUrlOk("mailto:founder@example.com?subject=LOI"), "");
  const badLoi = ["http://example.com/loi", "javascript:alert(1)", "mailto:a@b.co,c@d.co", "mailto:nobody", "https://u:p@example.com/", "data:text/html,x", ""];
  check("LOI: http, javascript:, data:, credentials, two addresses and a bad address are hidden (null)", badLoi.every((u) => V.loiUrlOk(u) === null), badLoi.filter((u) => V.loiUrlOk(u) !== null).join(" "));
  const badLoi2 = ["mailto:%E0%A4%A@example.com", "mailto:a@b.co?bcc=x@y.co", "mailto:a@b.co?body=hi", "mailto:a@b.co?subject=LOI&cc=x@y.co", "https://example.com:8443/loi", "https://user@example.com/loi"];
  let threw = "";
  for (const u of badLoi2)
    try {
      if (V.loiUrlOk(u) !== null) threw += ` allowed:${u}`;
    } catch (e) {
      threw += ` threw:${u}:${e?.name}`;
    }
  check("LOI: a malformed percent-escape, a mailto query other than subject (bcc, body, cc), a non-default https port and credentials are hidden, never thrown", threw === "", threw);
  check("LOI: a mailto with only a subject and an https URL on any host with the default port are allowed", V.loiUrlOk("mailto:a@b.co?subject=Align%20LOI") && V.loiUrlOk("https://loi.example.org:443/x") === "https://loi.example.org/x", "");
  check("cleaning removes C1 controls (U+0080–U+009F) and U+061C", V.cleanValueText("a\u0085b\u009Fc\u061Cd\u0080") === "abcd", JSON.stringify(V.cleanValueText("a\u0085b\u009Fc\u061Cd\u0080")));
  check("cleaning removes control, bidi and zero-width characters and collapses whitespace", V.cleanValueText(" a\u0000b‮c​d \n\t e ") === "abcd e", JSON.stringify(V.cleanValueText(" a\u0000b‮c​d \n\t e ")));
  const t0 = "2026-10-29T10:00:00.000Z";
  check(
    "measured spans read from the two timestamps (14 minutes, 2 hours 5 minutes, 3 days 4 hours, 45 seconds); a reversed or missing one is null",
    V.spanWords(t0, "2026-10-29T10:14:10.000Z") === "14 minutes" &&
      V.spanWords(t0, "2026-10-29T12:05:00.000Z") === "2 hours 5 minutes" &&
      V.spanWords(t0, "2026-11-01T14:00:00.000Z") === "3 days 4 hours" &&
      V.spanWords(t0, "2026-10-29T10:00:45.000Z") === "45 seconds" &&
      V.spanWords("2026-10-29T11:00:00.000Z", t0) === null &&
      V.spanWords(undefined, t0) === null,
    "",
  );
  check("the five answers, in order", V.ESTIMATES.map((e) => e.id).join(",") === "same_day,two_to_three_days,about_a_week,longer,would_not_be_decided", "");
}

// ---- browser helpers ----
async function browserFor(cookie) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const [name, ...v] = cookie.split("=");
  await page.setCookie({ name, value: v.join("="), domain: "127.0.0.1", path: "/", httpOnly: true });
  return { browser, page };
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, re, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (re.test(await bodyText(page))) return true;
    await sleep(300);
  }
  return false;
}
const stateOf = (dir, ws) => JSON.parse(readFileSync(path.join(dir, "workspaces", ws, "state.json"), "utf8"));
const writeState = (dir, ws, s) => writeFileSync(path.join(dir, "workspaces", ws, "state.json"), JSON.stringify(s, null, 2), { mode: 0o600 });

// ---- phase local ----
async function phaseLocal(dir) {
  phaseName = "local";
  HOSTED = false;
  await start({ ALIGN_DATA_DIR: dir, ALIGN_ALLOW_OPEN_CREATE: "1" });
  const A = await newWorkspace("FUNNELA");
  const B = await newWorkspace("FUNNELB");

  // The page carries the default next-step links (the waitlist form, and the LOI link defaulting to it).
  const page = await req("GET", `/w/${A.ws}`);
  check("the workspace page carries the default waitlist form URL", page.status === 200 && page.text.includes(FORM_ID), `${page.status}`);

  // Before agreement: every funnel action is refused (the card shows nothing yet), and nothing is stored.
  const p = await req("POST", "/api/proposals", { cookie: A.c.product, body: { proposed_measure_text: "Retention first for two weeks", rationale: "The review needs it", reciprocal_commitment: "We freeze schema changes" } });
  const pid = p.json?.id;
  const early = await Promise.all(ACTIONS.map((action) => timer(A.c.leadership, { action, proposal_id: pid, feedback: { estimate: "same_day" } })));
  check("before RATIFIED every funnel action -> 409, no funnel stored", early.every((r) => r.status === 409) && stateOf(dir, A.ws).funnel === undefined, early.map((r) => r.status).join(","));
  const noProp = await timer(A.c.leadership, { action: "value_card_viewed" });
  check("a funnel action without a proposal id -> 409", noProp.status === 409, `${noProp.status}`);
  {
    const { browser, page: pg } = await browserFor(A.c.product);
    try {
      await pg.goto(`http://127.0.0.1:${PORT}/w/${A.ws}`, { waitUntil: "networkidle0" });
      await waitText(pg, /Your turn/);
      check("browser: before RATIFIED, Your turn has no value card", !/What this decision gave you/.test(await bodyText(pg)), "");
    } finally {
      await browser.close();
    }
  }
  const acc = await req("POST", `/api/proposals/${pid}/accept`, { cookie: A.c.security, body: { rationale: "ok", accept_untested: true } });
  check("agreement reached (RATIFIED)", acc.status === 200 && acc.json?.state === "RATIFIED", `${acc.status} ${acc.text.slice(0, 200)}`);

  // Real timestamps: put the proposal 14 minutes 10 seconds before its acceptance on disk; the card reads 14 minutes.
  {
    const s = stateOf(dir, A.ws);
    const ratified = s.acceptances.at(-1).ratified_at;
    s.proposals.find((x) => x.id === pid).created_at = new Date(Date.parse(ratified) - 850_000).toISOString();
    writeState(dir, A.ws, s);
  }

  // Actions: the four new ones are accepted, an unknown one is still refused, an old one still works.
  const unknown = await timer(A.c.product, { action: "made_up_action", proposal_id: pid });
  const old = await timer(A.c.product, { action: "brief_reviewed" });
  check("an unknown action is still refused (400 Unknown timer action)", unknown.status === 400 && /Unknown timer action/.test(unknown.json?.error ?? ""), `${unknown.status} ${unknown.text}`);
  check("an existing timer action still answers 200", old.status === 200, `${old.status}`);
  const viewed = await Promise.all(["leadership", "product", "security"].map((r) => timer(A.c[r], { action: "value_card_viewed", proposal_id: pid })));
  const again = await timer(A.c.product, { action: "value_card_viewed", proposal_id: pid });
  check("value_card_viewed -> 200 for every role, and again -> 200", viewed.every((r) => r.status === 200) && again.status === 200, viewed.map((r) => r.status).join(","));
  const wl = await timer(A.c.product, { action: "waitlist_clicked", proposal_id: pid });
  const loi = await timer(A.c.security, { action: "loi_cta_clicked", proposal_id: pid });
  check("waitlist_clicked and loi_cta_clicked -> 200", wl.status === 200 && loi.status === 200, `${wl.status} ${loi.status}`);
  let s = stateOf(dir, A.ws);
  const views = s.funnel.events.filter((e) => e.action === "value_card_viewed");
  check("value_card_viewed is kept once per role per proposal (3 events for 4 calls)", views.length === 3 && new Set(views.map((e) => e.role)).size === 3, JSON.stringify(views));
  check(
    "every event holds exactly action, role, proposal_id and a time: no session id, name, passcode or code",
    s.funnel.events.every((e) => Object.keys(e).sort().join(",") === "action,at,proposal_id,role" && ["leadership", "product", "security"].includes(e.role) && !Number.isNaN(Date.parse(e.at))) &&
      !Object.values(A.passcodes).some((pc) => JSON.stringify(s.funnel).includes(pc)) &&
      !JSON.stringify(s.funnel).includes(FIXTURE.asking.lead),
    JSON.stringify(s.funnel.events[0]),
  );
  check("funnel events are not written to the audit log (the record's Activity tab is unchanged)", !s.audit.some((a) => ACTIONS.includes(a.action)), "");

  // Feedback: validated, capped at 500 after cleaning, cleaned, stored with the role and time, once per role.
  const fb = (cookie, feedback) => timer(cookie, { action: "value_reported", proposal_id: pid, feedback });
  const bad = await Promise.all([fb(A.c.product, {}), fb(A.c.product, { estimate: "forever" }), fb(A.c.product, { estimate: "about_a_week", text: 42 }), fb(A.c.product, { estimate: "about_a_week", text: "x".repeat(501) }), fb(A.c.product, { estimate: "about_a_week", text: "y".repeat(4001) })]);
  check("feedback: no answer, an unknown answer, a non-text note, 501 and 4001 characters -> 400", bad.every((r) => r.status === 400), bad.map((r) => r.status).join(","));
  check("feedback: nothing stored by the refusals", !stateOf(dir, A.ws).funnel.reports.length, "");
  const dirty = `${"‮\u0007"}${"z".repeat(500)}${"​"}`; // 503 characters, 500 once cleaned
  const ok = await fb(A.c.product, { estimate: "about_a_week", text: dirty });
  check("feedback: 500 characters after cleaning -> 200, stored cleaned", ok.status === 200 && ok.json?.report?.text === "z".repeat(500), `${ok.status} ${ok.text.slice(0, 200)}`);
  const twice = await fb(A.c.product, { estimate: "same_day" });
  check("feedback: a second answer from the same role -> 409", twice.status === 409, `${twice.status}`);
  const lead = await fb(A.c.leadership, { estimate: "would_not_be_decided", text: "LEADNOTE private to leadership" });
  check("feedback: another role answers separately -> 200", lead.status === 200, `${lead.status}`);
  s = stateOf(dir, A.ws);
  const rep = s.funnel.reports.find((r) => r.role === "product");
  check("feedback is stored with role, estimate, text and time, and a value_reported event", rep?.estimate === "about_a_week" && rep.text.length === 500 && !Number.isNaN(Date.parse(rep.at)) && s.funnel.events.some((e) => e.action === "value_reported" && e.role === "product"), JSON.stringify(rep).slice(0, 200));
  const vProd = (await req("GET", "/api/state", { cookie: A.c.product })).json;
  const vSec = (await req("GET", "/api/state", { cookie: A.c.security })).json;
  check("the state view gives each role only its own answers, and no events", vProd.funnel?.reports?.length === 1 && vProd.funnel.reports[0].role === "product" && !vProd.funnel.events && vSec.funnel?.reports?.length === 0 && !JSON.stringify(vSec).includes("LEADNOTE"), JSON.stringify(vProd.funnel).slice(0, 200));

  // Cross-workspace isolation.
  const bBefore = readFileSync(path.join(dir, "workspaces", B.ws, "state.json"), "utf8");
  const crossProp = await timer(B.c.leadership, { action: "value_card_viewed", proposal_id: pid });
  const crossHdr = await timer(A.c.product, { action: "waitlist_clicked", proposal_id: pid }, { "x-align-workspace": B.ws });
  check("B's session naming A's proposal -> 409, and A's cookie on a B tab -> 409; B unchanged", crossProp.status === 409 && crossHdr.status === 409 && readFileSync(path.join(dir, "workspaces", B.ws, "state.json"), "utf8") === bBefore, `${crossProp.status} ${crossHdr.status}`);
  const bView = (await req("GET", "/api/state", { cookie: B.c.leadership })).text;
  check("B's state has no funnel and none of A's answers", !("funnel" in JSON.parse(bView)) && !bView.includes("LEADNOTE") && !bView.includes("z".repeat(50)), "");
  const bAgree = await agree(B);
  const bViewed = await timer(B.c.security, { action: "value_card_viewed", proposal_id: bAgree.pid });
  const aEvents = stateOf(dir, A.ws).funnel.events.length;
  check("B's own events land in B only", bAgree.ok && bViewed.status === 200 && stateOf(dir, B.ws).funnel.events.length === 1 && stateOf(dir, A.ws).funnel.events.length === aEvents, bAgree.detail);

  // Northstar: the new actions don't exist there, and Northstar state is untouched.
  const ns = await req("POST", "/api/session", { body: { role: "product", passcode: "product-demo" } });
  await req("GET", "/api/state", { cookie: ns.cookie }); // Northstar's state file exists before the comparison
  const nsBefore = existsSync(path.join(ROOT, "data/state.json")) ? readFileSync(path.join(ROOT, "data/state.json"), "utf8") : "";
  const nsTry = await timer(ns.cookie, { action: "value_card_viewed", proposal_id: "prop-x" });
  const nsAfter = existsSync(path.join(ROOT, "data/state.json")) ? readFileSync(path.join(ROOT, "data/state.json"), "utf8") : "";
  check("Northstar: a funnel action -> 400 Unknown timer action, Northstar state unchanged", nsTry.status === 400 && nsBefore === nsAfter && !nsAfter.includes("funnel"), `${nsTry.status} ${nsTry.text}`);

  // Browser, as each role: the card after RATIFIED, measured 14 minutes, launch not decided -> not yet -> approved.
  const shots = {};
  for (const role of ["leadership", "product", "security"]) {
    const { browser, page: pg } = await browserFor(A.c[role]);
    try {
      await pg.goto(`http://127.0.0.1:${PORT}/w/${A.ws}`, { waitUntil: "networkidle0" });
      const shown = await waitText(pg, /What this decision gave you/);
      const t = await bodyText(pg);
      shots[role] = t;
      const want = [/Accepted change/i, /Who approved/i, /Affected goals and teams/i, /On the new plan/i, /Still on the old plan/i, /Join the Align waitlist/, /The waitlist form ends with an optional, non-binding letter of intent\./];
      const card = t.slice(t.indexOf("What this decision gave you"));
      check(`browser ${role}: Your turn shows the card after RATIFIED, with the accepted change, approvers, goals and teams, work and links`, shown && want.every((re) => re.test(card)), `missing ${want.filter((re) => !re.test(card)).join(" ")} :: ${card.slice(0, 900)}`);
      check(`browser ${role}: measured time comes from the timestamps (Proposal to agreement: 14 minutes)`, /Proposal to agreement:\s*14 minutes/.test(t), (t.match(/Proposal to agreement:[^\n]*/) ?? [""])[0]);
      if (role === "leadership") check("browser: with no launch decision the card says not decided yet", /Launch decision:\s*Not decided yet/.test(t) && /no launch decision yet/.test(t), (t.match(/Launch decision:[^\n]*/) ?? [""])[0]);
      // LIM-2452 review: at exactly 768px (the md edge, where the shell's phone layout is off) a workspace's leadership
      // header (Restart this scenario, Switch team, Sign out) wraps instead of running off the screen.
      if (role === "leadership") {
        await pg.setViewport({ width: 768, height: 1000 });
        await sleep(600);
        const m = await pg.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, W: window.innerWidth }));
        await pg.setViewport({ width: 1440, height: 1000 });
        await sleep(300);
        check("browser leadership: at 768 the workspace page does not scroll sideways", m.scrollWidth <= m.W, JSON.stringify(m));
      }
      const links = await pg.$$eval("a[target=_blank]", (as) => as.map((a) => ({ href: a.href, rel: a.rel, text: a.textContent })));
      const w = links.find((l) => /waitlist/.test(l.text));
      const l = links.find((x) => /letter of intent/.test(x.text));
      check(`browser ${role}: both links open the form in a new tab with rel="noopener noreferrer"`, w?.href.includes(FORM_ID) && l?.href.includes(FORM_ID) && w.rel === "noopener noreferrer" && l.rel === "noopener noreferrer", JSON.stringify(links));
      if (role === "product") check("browser product: its saved answer reads 'Your estimate: about a week · Measured here: 14 minutes'", /Your estimate:\s*about a week\s*·\s*Measured here:\s*14 minutes/.test(t), (t.match(/Your estimate:[^\n]*/) ?? [""])[0]);
      if (role === "security") {
        // Answer through the page: choose, save, and the answer replaces the question.
        await pg.evaluate(() => [...document.querySelectorAll("label")].find((x) => /2–3 days/.test(x.textContent))?.click());
        await pg.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Save my answer/.test(x.textContent))?.click());
        check("browser security: answering in the page shows 'Your estimate: 2–3 days · Measured here: 14 minutes'", await waitText(pg, /Your estimate:\s*2–3 days\s*·\s*Measured here:\s*14 minutes/), "");
        // The decision record shows the card too.
        await pg.evaluate(() => [...document.querySelectorAll("button")].find((x) => /See the decision/.test(x.textContent))?.click());
        check("browser security: the decision record shows the card", (await waitText(pg, /Decision record|Summary/)) && (await waitText(pg, /What this decision gave you/)), "");
      }
    } finally {
      await browser.close();
    }
  }
  check("browser: viewing the card recorded value_card_viewed without duplicates (still one per role)", stateOf(dir, A.ws).funnel.events.filter((e) => e.action === "value_card_viewed").length === 3, "");

  const notYet = await req("POST", `/api/proposals/${pid}/launch`, { cookie: A.c.leadership, body: { decision: "not_yet" } });
  {
    const st = stateOf(dir, A.ws);
    const a = st.acceptances.at(-1);
    a.launch_decision.at = new Date(Date.parse(st.proposals.find((x) => x.id === pid).created_at) + 22 * 60_000 + 5_000).toISOString();
    writeState(dir, A.ws, st);
  }
  {
    const { browser, page: pg } = await browserFor(A.c.product);
    try {
      await pg.goto(`http://127.0.0.1:${PORT}/w/${A.ws}`, { waitUntil: "networkidle0" });
      await waitText(pg, /What this decision gave you/);
      const t = await bodyText(pg);
      check("not_yet shows as not yet (not pending), with its measured time (22 minutes)", notYet.status === 200 && /Launch decision:\s*Not yet/.test(t) && /Proposal to launch decision \(not yet\):\s*22 minutes/.test(t) && !/Launch decision:\s*Not decided yet/.test(t), (t.match(/Launch decision:[^\n]*/) ?? [""])[0]);
    } finally {
      await browser.close();
    }
  }
  const approved = await req("POST", `/api/proposals/${pid}/launch`, { cookie: A.c.leadership, body: { decision: "approved", accept_untested: true } });
  {
    const { browser, page: pg } = await browserFor(A.c.leadership);
    try {
      await pg.goto(`http://127.0.0.1:${PORT}/w/${A.ws}`, { waitUntil: "networkidle0" });
      await waitText(pg, /What this decision gave you/);
      const t = await bodyText(pg);
      check("approved shows who approved the launch", approved.status === 200 && /Launch decision:\s*Approved by/.test(t) && /Proposal to launch decision \(approved\)/.test(t), (t.match(/Launch decision:[^\n]*/) ?? [""])[0]);
    } finally {
      await browser.close();
    }
  }

  // A workspace that is created but never signed in to: accepted, not started.
  const idle = await req("POST", "/api/workspaces", { body: { ...FIXTURE, company: `${FIXTURE.company} FUNNELC` } });
  const C = idle.json?.workspace?.id;
  // ws-admin funnel: per workspace events and totals; no names, passcodes or free text unless --with-feedback.
  const admin = (args) => spawnSync("node", ["scripts/ws-admin.mjs", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ALIGN_DATA_DIR: dir } });
  const funnelOut = () => admin(["funnel"]);
  const out = funnelOut();
  const t = out.stdout;
  check(
    "ws-admin funnel lists each workspace with accepted/started/finished, launch decisions, and every event with its role",
    out.status === 0 && t.includes(A.ws) && t.includes(B.ws) && /accepted \(workspace created\)/.test(t) && /started \(first signed-in action\)/.test(t) && /finished \(proposal ratified\)/.test(t) && /value_card_viewed {2}leadership/.test(t) && /waitlist_clicked {2}product/.test(t) && /loi_cta_clicked {2}security/.test(t) && /launch_not_yet/.test(t) && /launch_approved/.test(t),
    t.slice(0, 600) + out.stderr,
  );
  const cBlock = t.split(C ?? "none")[1]?.split(/\nw_|\ntotals/)[0] ?? "";
  check("ws-admin funnel: a workspace nobody signed in to is accepted but not started (its creation row doesn't count)", !!C && /accepted \(workspace created\)/.test(cBlock) && !/started/.test(cBlock), cBlock);
  check("ws-admin funnel: workspaces where people acted are started (positive case)", /started: 2\n/.test(t) && /accepted: 3 workspace\(s\)/.test(t), t.split("totals")[1]);
  check("ws-admin funnel totals count events across workspaces", /finished: 2/.test(t) && /value_card_viewed: 4 event\(s\) in 2 workspace\(s\)/.test(t) && /value_reported: 3 event\(s\) in 1 workspace\(s\)/.test(t), t.split("totals")[1]);
  check("ws-admin funnel prints no workspace names, passcodes or free text by default", !t.includes("FUNNELA") && !Object.values(A.passcodes).some((pc) => t.includes(pc)) && !t.includes("LEADNOTE") && !t.includes("zzzz"), "");
  const withText = admin(["funnel", "--with-feedback"]).stdout;
  check("ws-admin funnel --with-feedback includes the free text", withText.includes("LEADNOTE private to leadership"), "");

  // Restart (leadership) rebuilds the scenario and keeps the funnel, like the audit log; ws-admin still counts it finished.
  const before = JSON.stringify(stateOf(dir, A.ws).funnel);
  const reset = await req("POST", "/api/reset", { cookie: A.c.leadership, body: { confirm: "reset" } });
  check("Restart keeps the funnel events and answers, and ws-admin still reports A finished", reset.status === 200 && JSON.stringify(stateOf(dir, A.ws).funnel) === before && /finished: 2/.test(funnelOut().stdout), `${reset.status}`);

  // value_card_viewed fires when the card is on screen, not on mount: B's product opens Your turn in a short window
  // (the card below the fold), then scrolls to it.
  {
    const viewedBy = (role) => stateOf(dir, B.ws).funnel.events.filter((e) => e.action === "value_card_viewed" && e.role === role).length;
    const { browser, page: pg } = await browserFor(B.c.product);
    try {
      await pg.setViewport({ width: 1440, height: 420 });
      await pg.goto(`http://127.0.0.1:${PORT}/w/${B.ws}`, { waitUntil: "networkidle0" });
      await waitText(pg, /What this decision gave you/);
      await sleep(3000);
      const offscreen = await pg.evaluate(() => {
        const r = document.querySelector('section[aria-label="What this decision gave you"]').getBoundingClientRect();
        return r.top >= window.innerHeight;
      });
      check("browser: a card below the fold records no value_card_viewed", offscreen && viewedBy("product") === 0, `offscreen=${offscreen} events=${viewedBy("product")}`);
      await pg.evaluate(() => document.querySelector('section[aria-label="What this decision gave you"]').scrollIntoView({ block: "start" }));
      let n = 0;
      for (let i = 0; i < 20 && !n; i++) {
        await sleep(300);
        n = viewedBy("product");
      }
      await pg.evaluate(() => window.scrollTo(0, 0));
      await pg.evaluate(() => document.querySelector('section[aria-label="What this decision gave you"]').scrollIntoView({ block: "start" }));
      await sleep(1500);
      check("browser: scrolling the card into view records value_card_viewed once (not again on a second scroll)", n === 1 && viewedBy("product") === 1, `${n} ${viewedBy("product")}`);
    } finally {
      await browser.close();
    }
  }

  // A view is the card's top seen for a second (LIM-2445 under-count). The card is taller than the scroll column (the main
  // column on desktop, the window on a phone), so a person who scrolls to it sees its heading and first rows, not half of it.
  // Per viewport, a fresh workspace: product never scrolls to it, then glances (< 500 ms); security looks for 1.5 s, twice.
  for (const [vw, vh] of [
    [1440, 900],
    [390, 844],
  ]) {
    const W = await newWorkspace(`FUNNELV${vw}`);
    const ag = await agree(W);
    const viewedBy = (role) => (stateOf(dir, W.ws).funnel?.events ?? []).filter((e) => e.action === "value_card_viewed" && e.role === role).length;
    const settle = async (role, want) => {
      let n = viewedBy(role);
      for (let i = 0; i < 10 && n < want; i++) {
        await sleep(300);
        n = viewedBy(role);
      }
      return n;
    };
    // Scroll the card's scroll container so its top `px` pixels show at the bottom of the column (px = 0 scrolls to the top).
    const showTop = (pg, px) =>
      pg.evaluate((px) => {
        const card = document.querySelector('section[aria-label="What this decision gave you"]');
        let sc = card.parentElement;
        while (sc && sc !== document.body && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
        const win = !sc || sc === document.body;
        if (px === 0) {
          if (win) window.scrollTo(0, 0);
          else sc.scrollTop = 0;
        } else {
          const bottom = win ? window.innerHeight : sc.getBoundingClientRect().bottom;
          const delta = card.getBoundingClientRect().top - (bottom - px);
          if (win) window.scrollBy(0, delta);
          else sc.scrollTop += delta;
        }
        const top = card.getBoundingClientRect().top;
        const colTop = win ? 0 : sc.getBoundingClientRect().top;
        const bottom = win ? window.innerHeight : sc.getBoundingClientRect().bottom;
        return { visible: Math.round(Math.max(0, bottom - Math.max(top, colTop))), headingAt: Math.round(top - colTop), column: Math.round(bottom - colTop), card: Math.round(card.getBoundingClientRect().height) };
      }, px);
    const open = async (role) => {
      const b = await browserFor(W.c[role]);
      await b.page.setViewport({ width: vw, height: vh });
      await b.page.goto(`http://127.0.0.1:${PORT}/w/${W.ws}`, { waitUntil: "networkidle0" });
      await waitText(b.page, /What this decision gave you/);
      return b;
    };
    {
      const { browser, page: pg } = await open("product");
      try {
        await sleep(2500);
        const at = await showTop(pg, 0);
        check(`browser ${vw}x${vh}: (a) a card never scrolled to records no value_card_viewed`, ag.ok && at.visible === 0 && viewedBy("product") === 0, `${ag.detail} ${JSON.stringify(at)} events=${viewedBy("product")}`);
        const g = await showTop(pg, 380);
        await sleep(300);
        await showTop(pg, 0);
        await sleep(2500);
        check(`browser ${vw}x${vh}: (c) the card's top seen under 500 ms, then scrolled away, records no value_card_viewed`, g.visible >= 300 && viewedBy("product") === 0, `${JSON.stringify(g)} events=${viewedBy("product")}`);
      } finally {
        await browser.close();
      }
    }
    {
      const { browser, page: pg } = await open("security");
      try {
        await sleep(1000);
        const before = viewedBy("security");
        // As a person scrolls to it: the heading and the accepted change in view, ~380 px of the card showing.
        const at = await showTop(pg, 380);
        await sleep(1500);
        const n = await settle("security", 1);
        check(`browser ${vw}x${vh}: (b) the card's top in view for 1.5 s records value_card_viewed exactly once`, before === 0 && n === 1, `before=${before} after=${n} ${JSON.stringify(at)}`);
        await showTop(pg, 0);
        await sleep(500);
        await showTop(pg, 380);
        await sleep(2000);
        check(`browser ${vw}x${vh}: (d) viewing the card a second time still leaves one value_card_viewed`, viewedBy("security") === 1, `events=${viewedBy("security")}`);
      } finally {
        await browser.close();
      }
    }
  }

  await stop();
  // Deleting the workspace deletes its funnel.
  const del = admin(["delete", A.ws]);
  check("ws-admin delete removes the workspace and its funnel; funnel then lists only B", del.status === 0 && !existsSync(path.join(dir, "workspaces", A.ws)) && !admin(["funnel"]).stdout.includes(A.ws), del.stderr);
}

// ---- phase hosted ----
async function phaseHosted(dir) {
  phaseName = "hosted";
  // HOSTED_ROUTES is unchanged: proxy.ts matches the merge base with origin/main (skipped without git), and no
  // new path is reachable when hosted.
  const base = spawnSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  if (base) {
    const d = spawnSync("git", ["diff", "--quiet", base, "--", "proxy.ts"], { cwd: ROOT });
    check(`proxy.ts (HOSTED_ROUTES) is unchanged against ${base.slice(0, 7)}`, d.status === 0, "proxy.ts differs");
  }
  check("HOSTED_ROUTES still lists /api/timer", /\/\^\\\/api\\\/timer\$\//.test(readFileSync(path.join(ROOT, "proxy.ts"), "utf8")), "");
  HOSTED = true;
  const INVITE = "funnel-invite-0001";
  await start({
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "f".repeat(48),
    ALIGN_DATA_DIR: dir,
    ALIGN_SIGNUP_CODES: `${INVITE},funnel-invite-0002`,
    ALIGN_DELETE_BY: "2026-11-13",
    ALIGN_PRODUCT_PASSCODE: "product-strong-pass-9",
    ALIGN_SECURITY_PASSCODE: "security-strong-pass-9",
    ALIGN_LEADERSHIP_PASSCODE: "leadership-strong-pass-9",
    ALIGN_WAITLIST_URL: "https://evil.example/forms/d/x/viewform",
    ALIGN_LOI_URL: "mailto:%E0%A4%A@example.com", // a malformed escape: hidden, and the page still renders
  });
  const w = await newWorkspace("FUNNELH", { signup_code: INVITE });
  const ag = await agree(w);
  check("hosted: agreement reached", ag.ok, ag.detail);
  const okEv = await timer(w.c.product, { action: "value_card_viewed", proposal_id: ag.pid });
  const okFb = await timer(w.c.product, { action: "value_reported", proposal_id: ag.pid, feedback: { estimate: "longer" } });
  check("hosted: funnel events and the answer go through /api/timer -> 200", okEv.status === 200 && okFb.status === 200, `${okEv.status} ${okFb.status}`);
  const noOrigin = await timer(w.c.product, { action: "waitlist_clicked", proposal_id: ag.pid }, { origin: undefined });
  const foreign = await timer(w.c.product, { action: "waitlist_clicked", proposal_id: ag.pid }, { origin: "https://evil.example" });
  const anon = await timer(undefined, { action: "waitlist_clicked", proposal_id: ag.pid });
  check("hosted: no Origin -> 403, another site -> 403, signed out -> 401", noOrigin.status === 403 && foreign.status === 403 && anon.status === 401, `${noOrigin.status} ${foreign.status} ${anon.status}`);
  const paths = ["/api/funnel", "/api/value", "/api/waitlist", "/api/loi", "/api/timer/value", "/api/workspaces/funnel", "/api/feedback"];
  const closed = await Promise.all(paths.map((p) => req("POST", p, { cookie: w.c.product, body: { action: "value_card_viewed" } })));
  check("hosted: no new route is reachable (funnel, value, waitlist, LOI, feedback paths -> 404)", closed.every((r) => r.status === 404), closed.map((r) => r.status).join(","));
  const pg = await req("GET", `/w/${w.ws}`);
  check(
    "hosted: a bad ALIGN_WAITLIST_URL and a malformed ALIGN_LOI_URL are hidden (null in the page), and the page still renders (200)",
    pg.status === 200 && !pg.text.includes("evil.example") && !pg.text.includes("%E0%A4%A") && /waitlist\\?"\s*:\s*null/.test(pg.text) && /loi\\?"\s*:\s*null/.test(pg.text),
    `${pg.status} ${(pg.text.match(/nextStep.{0,80}/) ?? [""])[0]}`,
  );
  await stop();
}

// ---- phase layout (LIM-2452 cycle 2): a custom workspace's phone layout, Goals map, tap targets, agents copy ----
// Production build, Mode L. Each check failed on 87f1866 and passes after cycle 2. Northstar is never opened here
// (its UI text is test-ui-northstar's).
async function phaseLayout(dir) {
  phaseName = "layout";
  HOSTED = false;
  await start({ ALIGN_DATA_DIR: dir, ALIGN_ALLOW_OPEN_CREATE: "1" });
  const W = await newWorkspace("LAYOUT");
  const origin = `http://127.0.0.1:${PORT}`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
  const open = async (role, width, height) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const logs = [];
    page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
    await page.setViewport({ width, height });
    const [name, ...v] = W.c[role].split("=");
    await page.setCookie({ name, value: v.join("="), domain: "127.0.0.1", path: "/", httpOnly: true });
    await page.goto(`${origin}/w/${W.ws}`, { waitUntil: "networkidle0" });
    await waitText(page, /Your turn/);
    await sleep(800);
    return { page, ctx, logs };
  };
  const nav = async (page, label) => {
    await page.evaluate((label) => [...document.querySelectorAll('nav[aria-label="Main"] button')].find((b) => b.querySelector("span span")?.textContent === label)?.click(), label);
    await sleep(900);
  };
  const clickMain = async (page, re) => {
    const ok = await page.evaluate((src) => {
      const b = [...document.querySelectorAll("main button")].find((x) => new RegExp(src).test(x.textContent));
      b?.click();
      return !!b;
    }, re.source);
    await sleep(900);
    return ok;
  };
  // ConnectAI copies, found by their button so this also counts 87f1866's (which had no data attribute).
  const connectCopies = (page) =>
    page.evaluate(() => {
      const bs = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Connect an AI app");
      return { total: bs.length, main: bs.filter((b) => b.closest("main")).length, rail: bs.filter((b) => b.closest("aside")).length };
    });
  const overflow = (page) =>
    page.evaluate(() => {
      const m = document.querySelector("main");
      return { doc: document.documentElement.scrollWidth, W: window.innerWidth, main: m.scrollWidth, mainW: m.clientWidth };
    });
  const fits = (o) => o.doc <= o.W && o.main <= o.mainW;
  const hydration = (logs) => logs.filter((l) => /hydrat|Minified React error #(418|423|425)/i.test(l));
  // Primary actions at 390: every Button with one of these labels, wherever it shows.
  const PRIMARY = /^(Send proposal to |Approve the change to my goal$|Send my conditions to |Ask for changes$|Decline this proposal$|Not yet$|Approve launch$|Try to approve )/;
  const short = [];
  const labels = new Set();
  const measure = async (page, where) => {
    const hs = await page.evaluate(
      (src) =>
        [...document.querySelectorAll("main button")]
          .filter((b) => new RegExp(src).test(b.textContent.trim()))
          .map((b) => ({ t: b.textContent.trim().slice(0, 40), h: Math.round(b.getBoundingClientRect().height * 100) / 100 })),
      PRIMARY.source,
    );
    for (const x of hs) {
      labels.add(x.t.split(" ").slice(0, 3).join(" "));
      if (x.h < 44) short.push(`${where}: ${x.t} ${x.h}px`);
    }
  };
  try {
    // (a) + (b) 390x844, the asking team's first screen: "Propose a change" above the fold, no ConnectAI in the rail.
    {
      const { page, ctx, logs } = await open("product", 390, 844);
      // The shell's share (sidebar, header, goal strip) of the first screen: the view's heading starts by y=560 (87f1866:
      // ~1010). Where Propose a change lands below that depends on the Your turn view's own order (lane A's file).
      const m = await page.evaluate(() => ({
        heading: document.querySelector("main h1")?.getBoundingClientRect().top ?? null,
        propose: [...document.querySelectorAll("main button span")].find((x) => x.textContent.trim() === "Propose a change")?.getBoundingClientRect().top ?? null,
      }));
      check("(a) 390x844: the phone chrome is compact; the first screen's heading starts above y=560", m.heading !== null && m.heading < 560, JSON.stringify(m));
      const turn = await connectCopies(page);
      await nav(page, "Work");
      const work = await connectCopies(page);
      const row = await page.evaluate(() => document.querySelector("main")?.innerText.match(/Connected AI apps[^\n]*/i)?.[0] ?? "");
      check(
        "(b) 390: no ConnectAI on Your turn; on Work exactly one, at the top of Work, as the row 'Connected AI apps · None connected'",
        turn.total === 0 && work.total === 1 && work.main === 1 && /^Connected AI apps · None connected$/.test(row),
        `turn=${JSON.stringify(turn)} work=${JSON.stringify(work)} row=${row}`,
      );
      // The row's button opens the setup steps inline (no dialog).
      await clickMain(page, /^Connect an AI app$/);
      const inline = await page.evaluate(() => ({ region: !!document.querySelector('main [role="region"][aria-label="Connect an AI app"] [role="tablist"]'), dialog: !!document.querySelector('[role="dialog"]') }));
      check("(b) 390: Connect an AI app on the row opens the setup steps inline, not a dialog", inline.region && !inline.dialog, JSON.stringify(inline));
      check("(b) 390: no hydration error on the phone layout", hydration(logs).length === 0, hydration(logs).join(" | "));
      await ctx.close();
    }
    {
      const { page, ctx } = await open("product", 1440, 1000);
      const c = await connectCopies(page);
      await nav(page, "Work");
      const w = await connectCopies(page);
      check("(b) 1440: exactly one ConnectAI, in the rail, on Your turn and on Work", c.total === 1 && c.rail === 1 && w.total === 1 && w.rail === 1, `${JSON.stringify(c)} ${JSON.stringify(w)}`);
      await ctx.close();
    }
    // (c) Goals: the map never scrolls sideways (page or main column).
    {
      const bad = [];
      for (const width of [500, 600, 768, 1100, 1268, 1440]) {
        const { page, ctx } = await open("product", width, 1000);
        await nav(page, "Goals");
        const o = await overflow(page);
        const map = await page.evaluate(() => !!document.querySelector('main button[aria-label*=" depends on "]'));
        if (!fits(o) || !map) bad.push(`${width}: ${JSON.stringify(o)} map=${map}`);
        await ctx.close();
      }
      check("(c) Goals: no horizontal overflow at 500, 600, 768, 1100, 1268 and 1440", bad.length === 0, bad.join(" | "));
    }
    // (f) Switch team as leadership at 700: the menu stays on screen.
    {
      const { page, ctx } = await open("leadership", 700, 1000);
      await page.evaluate(() => [...document.querySelectorAll("header button")].find((b) => /Switch team/.test(b.textContent))?.click());
      await sleep(400);
      const r = await page.evaluate(() => {
        const m = document.querySelector('[role="menu"][aria-label="Switch team"]')?.getBoundingClientRect();
        return m ? { left: m.left, right: m.right, W: document.documentElement.clientWidth } : null;
      });
      check("(f) 700, leadership: the Switch team menu fits on screen", !!r && r.left >= 0 && r.right <= r.W, JSON.stringify(r));
      await ctx.close();
    }
    // (g) part 1, before any app: the rail's zero line and the limit line say "can read", never "works from"/"follow".
    {
      const s0 = stateOf(dir, W.ws);
      s0.limits = [{ id: "lim-layout", team: "security", type: "must", text: "LAYOUT keep the audit trail", sources: [{ kind: "manual", title: "Layout check", date: "2026-10-30", quote: "keep it" }], state: "suggested", updated_at: new Date().toISOString() }];
      writeState(dir, W.ws, s0);
      const { page, ctx } = await open("security", 1440, 1000);
      await waitText(page, /LAYOUT keep the audit trail/);
      const t = await bodyText(page);
      check(
        "(g) custom: 'Connect your AI apps and they can read this one plan.' and 'Agents can read it once you confirm.'; the old lines are gone",
        t.includes("None connected. Connect your AI apps and they can read this one plan.") && t.includes("Agents can read it once you confirm.") && !/works from this one plan|Agents follow it/.test(t),
        (t.match(/None connected[^\n]*/) ?? [""])[0] + " :: " + (t.match(/[^\n]*once you confirm[^\n]*/) ?? [""])[0],
      );
      await ctx.close();
    }
    // (d) + (e): the proposal flow at 390 (tap targets) and the asker's review of a counter at 768 (no overflow).
    {
      const { page, ctx } = await open("product", 390, 844);
      await clickMain(page, /Propose a change/);
      await measure(page, "composer");
      await ctx.close();
    }
    const prop = await req("POST", "/api/proposals", { cookie: W.c.product, body: { proposed_measure_text: "LAYOUT retention first for two weeks", rationale: "The review needs it", reciprocal_commitment: "We freeze schema changes" } });
    const pid = prop.json?.id;
    {
      const { page, ctx } = await open("security", 390, 844);
      await clickMain(page, /Review the proposal/);
      for (const opt of ["Accept", "Accept if…", "Counter", "Decline"]) {
        await page.evaluate((opt) => [...document.querySelectorAll("main button[aria-pressed]")].find((b) => b.querySelector("b")?.textContent === opt)?.click(), opt);
        await sleep(400);
        await measure(page, `review/${opt}`);
      }
      await ctx.close();
    }
    {
      const { page, ctx } = await open("product", 390, 844);
      await clickMain(page, /reviews the proposal/);
      await measure(page, "asker waiting");
      await ctx.close();
    }
    const ctr = await req("POST", `/api/proposals/${pid}/counter`, { cookie: W.c.security, body: { proposed_measure_text: "LAYOUT retention first for two weeks, reviewed weekly", rationale: "Needs a review cadence", conditions: "Post before each use." } });
    {
      const { page, ctx } = await open("product", 768, 1000);
      const opened = await clickMain(page, /Review the changes/);
      const o = await overflow(page);
      const b = await page.evaluate(() => {
        const x = [...document.querySelectorAll("main button")].find((y) => /^Accept .* changes and confirm what /.test(y.textContent.trim()));
        const r = x?.getBoundingClientRect();
        const box = x?.parentElement?.getBoundingClientRect();
        return r ? { right: Math.round(r.right * 100) / 100, parentRight: Math.round(box.right * 100) / 100 } : null;
      });
      check(
        "(d) 768: the asker's review of a counter does not overflow (page, main column, and the Accept … changes button inside its row)",
        ctr.status === 200 && opened && fits(o) && !!b && b.right <= b.parentRight,
        `${ctr.status} ${ctr.text.slice(0, 120)} ${JSON.stringify(o)} ${JSON.stringify(b)}`,
      );
      await ctx.close();
    }
    await req("POST", `/api/proposals/${pid}/acknowledge`, { cookie: W.c.product, body: {} });
    const acc = await req("POST", `/api/proposals/${pid}/accept`, { cookie: W.c.security, body: { rationale: "ok", accept_untested: true } });
    {
      const { page, ctx } = await open("leadership", 390, 844);
      await clickMain(page, /Decide the launch/);
      await measure(page, "launch");
      await ctx.close();
    }
    check(
      "(e) 390: every primary action (Send proposal, Approve the change, Send my conditions, Ask for changes, Decline, Try to approve, Approve launch, Not yet) is at least 44px tall",
      acc.status === 200 && labels.size >= 8 && short.length === 0,
      `seen ${[...labels].join(", ")}; accept=${acc.status}; short: ${short.join(" | ")}`,
    );
    // (g) part 2: two connected apps, one that read before the plan changed and one after. The rail says "Read the
    // current plan" / "Last read an older plan" (the server's on_current_plan); the phone row counts them.
    {
      const { createHash, randomBytes } = await import("node:crypto");
      const REDIRECT = "http://127.0.0.1:33418/callback";
      const connectApp = async (name) => {
        const reg = await (await fetch(`${origin}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }) })).json();
        const verifier = randomBytes(32).toString("base64url");
        const params = { response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "st-1", resource: `${origin}/api/mcp` };
        const ap = await req("POST", "/api/oauth/approve", { body: { params, decision: "approve", workspace: W.ws, role: "security", passcode: W.passcodes.security }, headers: { origin } });
        const code = ap.json?.redirect ? new URL(ap.json.redirect).searchParams.get("code") : "";
        const form = new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: `${origin}/api/mcp` });
        const tok = await (await fetch(`${origin}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form })).json();
        return tok.access_token;
      };
      const read = (t) =>
        fetch(`${origin}/api/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${t}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "align_list_goals", arguments: {} } }),
        }).then((r) => r.text());
      const t1 = await connectApp("Layout Old App");
      await read(t1);
      await sleep(500);
      await req("POST", `/api/proposals/${pid}/launch`, { cookie: W.c.leadership, body: { decision: "not_yet" } }); // the plan changes
      const t2 = await connectApp("Layout New App");
      await read(t2);
      await sleep(800);
      const apps = (await req("GET", "/api/workspaces/connections", { cookie: W.c.security })).json?.apps ?? [];
      const { page, ctx } = await open("security", 1440, 1000);
      await waitText(page, /Layout New App/);
      const rail = await page.evaluate(() => document.querySelector('ul[aria-label="Connected AI apps"]')?.innerText ?? "");
      // ✓ in violet for the current plan, ▲ in amber for an older one; no emerald anywhere in the list.
      const railTone = await page.evaluate(() => {
        const ul = document.querySelector('ul[aria-label="Connected AI apps"]');
        const marks = [...(ul?.querySelectorAll("span[aria-hidden]") ?? [])].map((s) => [s.textContent, s.className]);
        return !!ul && !ul.innerHTML.includes("emerald") && marks.some(([t, c]) => t === "✓" && c.includes("text-violet-700")) && marks.some(([t, c]) => t === "▲" && c.includes("text-amber-700"));
      });
      check(
        "(g) rail: 'Layout New App Read the current plan' (violet ✓), 'Layout Old App Last read an older plan' (the server's on_current_plan); no 'on the latest plan' or 'still on an older plan'",
        apps.filter((a) => a.on_current_plan).length === 1 && /Layout New App Read the current plan/.test(rail) && /Layout Old App Last read an older plan/.test(rail) && !/on the latest plan|still on an older plan|has read the latest/.test(rail) && railTone,
        `${JSON.stringify(apps.map((a) => [a.name, a.on_current_plan]))} :: ${rail}`,
      );
      await ctx.close();
      const ph = await open("security", 390, 844);
      await nav(ph.page, "Work");
      const row = await ph.page.evaluate(() => document.querySelector("main")?.innerText.match(/Connected AI apps[^\n]*/i)?.[0] ?? "");
      check("(g) 390 row: 'Connected AI apps · 2 connected · 1 read the current plan'", row === "Connected AI apps · 2 connected · 1 read the current plan", row);
      await ph.ctx.close();
    }
  } finally {
    await browser.close();
  }
  await stop();
}

// ---- run ----
phaseUnit();
if (BUILD) {
  const build = spawnSync("npx", ["next", "build"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HOSTED: "", ALIGN_DATA_DIR: "" } });
  if (build.status !== 0) {
    console.log(`FAIL  next build\n${(build.stdout + build.stderr).slice(-1500)}`);
    process.exit(1);
  }
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "align-funnel-"));
try {
  if (!ONLY || ONLY === "local") await phaseLocal(path.join(tmp, "local"));
  if (!ONLY || ONLY === "layout") await phaseLayout(path.join(tmp, "layout"));
  if (!ONLY || ONLY === "hosted") await phaseHosted(path.join(tmp, "hosted"));
} catch (e) {
  fail++;
  console.log(`FAIL  [${phaseName}] ${e?.stack ?? e}`);
} finally {
  await stop();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`test-funnel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
