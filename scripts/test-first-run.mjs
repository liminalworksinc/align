#!/usr/bin/env node
// The first-run card of a custom workspace (components/FirstRun.tsx, rendered by ConnectAI into Home's canvas).
// Builds once (skip with --no-build), then runs production servers on <port> with workspaces in a temp ALIGN_DATA_DIR:
//   phase "static": the card fetches nothing itself; ConnectAI is mounted once; Home is the only place that mounts it
//   phase "local":  Mode L, open create -> a fresh workspace with no connected agent shows both paths, the sample link
//                   resolves (200) and is labelled fictional, what the agent can read matches the server's tools, Hide
//                   persists, the status follows the server (approved, not seen by Align yet; a failed check), and once Align has
//                   seen an app (any MCP request) the card yields to Home's section and the sidebar (seen on the current
//                   plan, then on an older one); the card adds no request to the connections poll
//   phase "hosted": HOSTED=1 as Fly runs it -> no sample link (Northstar is not served), "/" still goes to /new, and an
//                   OAuth connection plus one MCP request flips the sidebar to "Seen on the current plan" and the card yields
// Screenshots of each state at 390, 768 and 1440 px go to $FIRST_RUN_SHOTS (default: a temp folder, printed at the end).
// Usage: node scripts/test-first-run.mjs <port> [--no-build]   (from a worktree root; refuses 3100 and the main checkout)

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const PORT = Number(process.argv[2]);
const BUILD = !process.argv.includes("--no-build");
if (!Number.isInteger(PORT) || PORT === 3100) {
  console.error("usage: node scripts/test-first-run.mjs <port> [--no-build] (not 3100)");
  process.exit(2);
}
const ROOT = process.cwd();
if (path.resolve(ROOT) === path.join(os.homedir(), "liminal/align")) {
  console.error(`test-first-run: refusing the main checkout ${ROOT}; run from a worktree`);
  process.exit(2);
}
if (spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]).status === 0) {
  console.error(`test-first-run: port ${PORT} is already in use`);
  process.exit(2);
}
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "data/scenarios/example-custom.json"), "utf8"));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HOSTED_HOST = "align.test";
const REDIRECT = "http://127.0.0.1:33418/callback";
const SHOTS = process.env.FIRST_RUN_SHOTS || mkdtempSync(path.join(os.tmpdir(), "align-first-run-shots-"));
mkdirSync(SHOTS, { recursive: true });
const WIDTHS = [390, 768, 1440];

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
const origin = () => (HOSTED ? `https://${HOSTED_HOST}` : `http://127.0.0.1:${PORT}`);
function req(method, p, { body, form, cookie, headers = {}, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const write = !["GET", "HEAD"].includes(method) && !["/api/mcp", "/oauth/token", "/oauth/register"].includes(p);
    const h = HOSTED
      ? { host: HOSTED_HOST, "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.11", ...(write ? { origin: origin() } : {}) }
      : { host: `127.0.0.1:${PORT}`, ...(write ? { origin: origin() } : {}) };
    let data;
    if (body !== undefined) {
      data = JSON.stringify(body);
      h["content-type"] = "application/json";
    } else if (form !== undefined) {
      data = new URLSearchParams(form).toString();
      h["content-type"] = "application/x-www-form-urlencoded";
    }
    if (data !== undefined) h["content-length"] = Buffer.byteLength(data);
    if (cookie) h.cookie = cookie;
    Object.assign(h, headers);
    for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
    const r = http.request({ host: "127.0.0.1", port: PORT, method, path: p, headers: h }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const t = raw ? "" : buf.toString("utf8");
        let json = null;
        try {
          json = JSON.parse(t);
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text: t, buf, json, cookie: ((res.headers["set-cookie"] ?? [])[0] || "").split(";")[0] });
      });
    });
    r.on("error", reject);
    if (data !== undefined) r.write(data);
    r.end();
  });
}

// ---- server ----
let server = null;
async function start(env) {
  rmSync(path.join(ROOT, "data/state.json"), { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^(ALIGN_|HOSTED$|AI_GATEWAY_API_KEY$|ANTHROPIC_)/.test(k)) delete clean[k];
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "ignore", "pipe"], detached: true });
  let err = "";
  server.stderr.on("data", (c) => (err += c));
  for (let i = 0; i < 90; i++) {
    try {
      if ((await req("GET", "/api/workspaces/config")).status === 200) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`server did not start: ${err.slice(-400)}`);
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

// ---- workspaces and OAuth (the same flow as scripts/test-oauth.mjs: DCR client, PKCE, approve, token, one read) ----
async function newWorkspace(marker, extra = {}) {
  const r = await req("POST", "/api/workspaces", { body: { ...FIXTURE, company: `${FIXTURE.company} ${marker}`, ...extra } });
  if (r.status !== 201) throw new Error(`create ${marker}: ${r.status} ${r.text}`);
  const w = { id: r.json.workspace.id, passcodes: r.json.passcodes, c: {} };
  for (const role of ["leadership", "product", "security"]) {
    const s = await req("POST", "/api/session", { body: { workspace: w.id, role, passcode: w.passcodes[role] } });
    if (s.status !== 200) throw new Error(`sign in ${role}: ${s.status} ${s.text}`);
    w.c[role] = s.cookie;
  }
  return w;
}
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
async function newClient(name) {
  const r = await req("POST", "/oauth/register", { body: { client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" } });
  if (r.status !== 201) throw new Error(`register ${name}: ${r.status} ${r.text}`);
  return r.json.client_id;
}
/** Approve as `role` and exchange the code: the app is approved, and has read nothing yet. */
async function connect(w, clientId, role) {
  const { verifier, challenge } = pkce();
  const params = { response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "st-1", resource: `${origin()}/api/mcp` };
  const a = await req("POST", "/api/oauth/approve", { body: { params, decision: "approve", workspace: w.id, role, passcode: w.passcodes[role] } });
  const code = a.json?.redirect ? new URL(a.json.redirect).searchParams.get("code") : null;
  if (!code) throw new Error(`approve: ${a.status} ${a.text.slice(0, 200)}`);
  const t = await req("POST", "/oauth/token", { form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${origin()}/api/mcp` } });
  if (!t.json?.access_token) throw new Error(`token: ${t.status} ${t.text.slice(0, 200)}`);
  return t.json.access_token;
}
const rpc = (tok, method, params) =>
  req("POST", "/api/mcp", { body: { jsonrpc: "2.0", id: 1, method, params }, headers: { accept: "application/json, text/event-stream", authorization: `Bearer ${tok}` } });
function rpcResult(r) {
  const text = r.text.includes("data:") ? r.text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) : r.text;
  try {
    return JSON.parse(text).result ?? null;
  } catch {
    return null;
  }
}
const connections = (w) => req("GET", "/api/workspaces/connections", { cookie: w.c.leadership });
async function untilApi(w, pred, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await connections(w);
    if (pred(r.json)) return true;
    await sleep(250);
  }
  return false;
}

// ---- browser ----
// Mode L: a real page on 127.0.0.1. Hosted: https://align.test, every request answered by forwarding it to the server
// with Fly's headers and the session cookie (Chrome never opens a connection), so the page is exactly what Fly serves.
async function browserFor(cookie) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.blockConnections = false;
  if (HOSTED) {
    await page.setRequestInterception(true);
    page.on("request", async (rq) => {
      const u = new URL(rq.url());
      if (u.host !== HOSTED_HOST) return rq.abort();
      if (page.blockConnections && u.pathname === "/api/workspaces/connections") return rq.abort();
      const h = { ...rq.headers() };
      delete h["accept-encoding"];
      delete h.host;
      try {
        const body = rq.postData();
        const r = await new Promise((resolve, reject) => {
          const hh = { ...h, host: HOSTED_HOST, "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.11", cookie };
          if (body !== undefined) hh["content-length"] = Buffer.byteLength(body);
          const x = http.request({ host: "127.0.0.1", port: PORT, method: rq.method(), path: u.pathname + u.search, headers: hh }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
          });
          x.on("error", reject);
          if (body !== undefined) x.write(body);
          x.end();
        });
        const headers = {};
        for (const [k, v] of Object.entries(r.headers)) if (!["set-cookie", "content-length", "transfer-encoding", "connection"].includes(k)) headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
        await rq.respond({ status: r.status, headers, body: r.body });
      } catch {
        await rq.abort().catch(() => {});
      }
    });
  } else {
    await page.setRequestInterception(true);
    page.on("request", (rq) => (page.blockConnections && new URL(rq.url()).pathname === "/api/workspaces/connections" ? rq.abort() : rq.continue()));
    const [name, ...v] = cookie.split("=");
    await page.setCookie({ name, value: v.join("="), domain: "127.0.0.1", path: "/", httpOnly: true });
  }
  return { browser, page };
}
async function waitFor(page, fn, ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(300);
  }
  return false;
}
const card = (page) => page.evaluate(() => {
  const s = document.querySelector('section[aria-label="Get started"]');
  return s ? { label: s.getAttribute("aria-label"), state: s.getAttribute("data-state"), text: s.innerText } : null;
});
/** The card's Copy button is shown without scrolling anything inside the card: no clipping ancestor hides it. */
const copyVisible = (page) => page.evaluate(() => {
  const sec = document.querySelector('section[aria-label="Get started"]');
  const b = sec && [...sec.querySelectorAll("button")].find((x) => x.textContent === "Copy");
  if (!b) return "no Copy button";
  const r = b.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return "zero size";
  for (let el = b.parentElement; el && el !== sec; el = el.parentElement) {
    const st = getComputedStyle(el);
    if (/(auto|scroll|hidden|clip)/.test(st.overflowY + st.overflowX)) {
      const c = el.getBoundingClientRect();
      if (r.top < c.top || r.bottom > c.bottom || r.left < c.left || r.right > c.right) return `clipped by ${el.tagName}.${el.className}`;
    }
  }
  return "ok";
});
async function copyVisibleAt(page) {
  const out = [];
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await sleep(400);
    out.push(`${width}:${await copyVisible(page)}`);
  }
  await page.setViewport({ width: 1440, height: 1000 });
  return out;
}
async function shots(page, name) {
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 1000 });
    await sleep(400);
    await page.screenshot({ path: path.join(SHOTS, `${phaseName}-${name}-${width}.png`), fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 1000 });
}
/** Requests to the connections route in the first `ms` after a reload. */
async function pollsOnLoad(page, ms = 3000) {
  let n = 0;
  const on = (rq) => {
    if (new URL(rq.url()).pathname === "/api/workspaces/connections") n++;
  };
  page.on("request", on);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(ms);
  page.off("request", on);
  return n;
}

// ---- phase static ----
function phaseStatic() {
  phaseName = "static";
  const src = (f) => (existsSync(path.join(ROOT, f)) ? readFileSync(path.join(ROOT, f), "utf8") : null);
  const firstRun = src("components/FirstRun.tsx");
  check("components/FirstRun.tsx exists", firstRun !== null, "missing");
  check("FirstRun.tsx makes no request and runs no timer loop of its own (no fetch, api(), setInterval)", firstRun !== null && !/\bfetch\(|\bapi\(|setInterval/.test(firstRun), "");
  const mounts = readdirSync(path.join(ROOT, "components"))
    .filter((f) => f.endsWith(".tsx"))
    .flatMap((f) => (src(`components/${f}`).match(/<ConnectAI\b/g) ?? []).map(() => f));
  check("ConnectAI (the connections poll) is mounted exactly once, in Home.tsx", mounts.length === 1 && mounts[0] === "Home.tsx", mounts.join(","));
  check("FirstRun is rendered only by ConnectAI", (src("components/Home.tsx").match(/<FirstRun\b/g) ?? []).length === 0 && (src("components/ConnectAI.tsx").match(/<FirstRun\b/g) ?? []).length === 1, "");
}

// ---- phase local ----
async function phaseLocal(dir) {
  phaseName = "local";
  HOSTED = false;
  await start({ ALIGN_DATA_DIR: dir, ALIGN_ALLOW_OPEN_CREATE: "1", ALIGN_CREATE_PER_HOUR: "50" });
  const w = await newWorkspace("FIRSTRUN");
  const { browser, page } = await browserFor(w.c.leadership);
  try {
    await page.goto(`${origin()}/w/${w.id}`, { waitUntil: "networkidle2" });
    const shown = await waitFor(page, async () => (await card(page))?.label === "Get started");
    const c0 = await card(page);
    check("a fresh workspace with no connected agent shows the first-run card", shown, c0 ? JSON.stringify(c0).slice(0, 200) : "no card");
    check(
      "the card offers both paths: Explore a sample (Sample (fictional)) and Connect one agent (Claude Code)",
      !!c0 && /Explore a sample/.test(c0.text) && /Sample \(fictional\)/.test(c0.text) && /Connect one agent/.test(c0.text) && /Claude Code/.test(c0.text),
      c0?.text,
    );
    check("Connect one agent shows the Claude Code setup line and status 'No AI app has connected yet.'", !!c0 && /claude mcp add/.test(c0.text) && /No AI app has connected yet\./.test(c0.text) && c0.state === "none", c0?.text);
    check("the card says the line adds Align for the user account and writes hooks to .claude/settings.local.json", /for your user account/.test(c0?.text ?? "") && /\.claude\/settings\.local\.json/.test(c0?.text ?? ""), c0?.text);
    const cv = await copyVisibleAt(page);
    check("Copy is visible without scrolling the setup line, at 390 and 1440", cv.every((x) => x.endsWith(":ok")), cv.join(" "));
    check("it says what the agent can't do: propose, approve or change anything", !!c0 && /It can’t propose, approve or change anything here/.test(c0.text.replace(/\s+/g, " ")), "");
    await shots(page, "none");

    // The sample link: a fictional label, and the page it opens answers 200 on this server.
    const link = await page.evaluate(() => {
      const a = document.querySelector('section[aria-label="Get started"] a[aria-label*="sample" i]');
      return a ? { href: a.getAttribute("href"), label: a.getAttribute("aria-label") } : null;
    });
    const target = link ? await req("GET", link.href) : null;
    check("the Explore link is labelled fictional and resolves (200)", !!link && /fictional/i.test(link.label) && target?.status === 200, `${JSON.stringify(link)} ${target?.status}`);

    // What it can read: one line per MCP tool the server lists for a workspace app.
    const reads = await page.evaluate(() => [...document.querySelectorAll('ul[aria-label="What the agent can read"] li')].map((li) => li.textContent));
    const client = await newClient("Claude Code");
    const tok = await connect(w, client, "leadership");

    // Approved, not seen yet: the grant exists with no last_used_at.
    const approvedApi = await untilApi(w, (j) => j?.apps?.length === 1 && j.apps[0].last_used_at === null, 3000);
    if (approvedApi) {
      await page.reload({ waitUntil: "networkidle2" });
      const ok = await waitFor(page, async () => (await card(page))?.state === "approved");
      const c1 = await card(page);
      check("approved, not seen yet: the card says 'Claude Code: Approved, not seen by Align yet'", ok && /Claude Code: Approved, not seen by Align yet\./.test(c1?.text ?? ""), c1?.text);
      await shots(page, "approved");
    } else check("approved, not seen yet: the server reports the grant with no last_used_at", false, (await connections(w)).text);
    // Any authenticated MCP request marks the app seen (last_used_at), tools/list included, so it comes after that check.
    const tools = rpcResult(await rpc(tok, "tools/list", {}))?.tools ?? [];
    check("'It can read' has one line per tool the MCP server lists, and every tool only reads", reads.length > 0 && reads.length === tools.length && tools.every((t) => t.annotations?.readOnlyHint === true), `${reads.length} lines, ${tools.length} tools`);
    check(
      "the work-map and goal-activity lines say they are what sessions reported (not what Align saw), with no hosted suffix in Mode L",
      tools.some((t) => t.name === "align_get_goal_activity") &&
        tools.some((t) => t.name === "align_get_work_map") &&
        reads.includes("What connected sessions reported on each goal") &&
        reads.includes("Sessions that reported in, grouped by goal (the work map)") &&
        !reads.some((r) => /What agents did|off on the test server|^The work map$/.test(r)),
      reads.join(" | "),
    );

    // The card adds no request: the load-time polls are the same with the card shown and hidden (counted on w2 below).
    // A failed check: the card says so, and claims nothing about the agents.
    page.blockConnections = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    const errored = await waitFor(page, async () => (await card(page))?.state === "error", 10000);
    const c4 = await card(page);
    check("when the connections check fails the card says it couldn't check, and names no agent", errored && /Couldn’t check connected AI apps/.test(c4?.text ?? "") && !/Claude Code/.test(c4?.text ?? ""), c4?.text);
    await shots(page, "error");
    page.blockConnections = false;

    // One MCP request: the server marks the app seen on the current plan, and the card yields. Home's "Connected AI
    // apps" section and the sidebar show the app from then on.
    const read = await rpc(tok, "tools/call", { name: "align_list_goals", arguments: {} });
    const onPlan = await untilApi(w, (j) => j?.apps?.[0]?.on_current_plan === true);
    check("after one MCP request the server reports the app seen on the current plan", read.status === 200 && onPlan, `${read.status} ${(await connections(w)).text}`);
    const sidebar = () => page.evaluate(() => document.querySelector('ul[aria-label="Connected AI apps"]')?.textContent ?? "");
    const home = () => page.evaluate(() => document.querySelector('section#agents')?.textContent ?? "");
    await page.reload({ waitUntil: "networkidle2" });
    const flipped = await waitFor(page, async () => /Claude Code\s*Seen on the current plan/.test(await sidebar()));
    const yielded = await waitFor(page, async () => !(await card(page)), 5000);
    check("once seen, the sidebar says 'Claude Code Seen on the current plan'", flipped, await sidebar());
    check("once seen, the first-run card yields (gone), and Home's section says Claude Code was seen on the current plan", yielded && /Claude Code[\s\S]*Seen on the current plan/.test(await home()), `${yielded} ${await home()}`);
    const sideNow = await sidebar();
    check("the sidebar claims no read or work: no 'read', 'working', 'follows', 'stuck', 'blocked' or 'progress'", !/\bread\b|working|follows|works from|stuck|blocked|progress/i.test(sideNow), sideNow);
    await shots(page, "yielded");

    // The plan changes (a proposal): the sidebar says the app was last seen on an older plan; the card stays gone.
    const p = await req("POST", "/api/proposals", { cookie: w.c.product, body: { proposed_measure_text: "Retention first for two weeks", rationale: "The review needs it", reciprocal_commitment: "We freeze schema changes" } });
    const stale = await untilApi(w, (j) => j?.apps?.[0]?.on_current_plan === false);
    await page.reload({ waitUntil: "networkidle2" });
    const older = await waitFor(page, async () => /Claude Code\s*Last seen on an older plan/.test(await sidebar()));
    check("after the plan changes the sidebar says Claude Code was last seen on an older plan, and no card comes back", p.status === 200 && stale && older && !(await card(page)), `${p.status} ${await sidebar()}`);
    check("Home's section says the same: Last seen on an older plan", /Claude Code[\s\S]*Last seen on an older plan/.test(await home()), await home());
    await shots(page, "older");

    // Hide, on a fresh workspace: gone, and still gone after a reload (localStorage). The card adds no request: the
    // load-time connections polls are the same with it shown and hidden.
    const wh = await newWorkspace("FIRSTRUNH1");
    const { browser: bh, page: ph } = await browserFor(wh.c.leadership);
    try {
      await ph.goto(`${origin()}/w/${wh.id}`, { waitUntil: "networkidle2" });
      await waitFor(ph, async () => (await card(ph))?.state === "none");
      const withCard = await pollsOnLoad(ph);
      await waitFor(ph, async () => (await card(ph))?.state === "none");
      await ph.evaluate(() => [...document.querySelectorAll('section[aria-label="Get started"] button')].find((b) => b.textContent === "Hide")?.click());
      await sleep(300);
      const goneNow = !(await card(ph));
      const withoutCard = await pollsOnLoad(ph);
      await sleep(1500);
      const goneAfter = !(await card(ph));
      check("Hide removes the card and it stays hidden after a reload", goneNow && goneAfter, `${goneNow} ${goneAfter}`);
      check("the card adds no connections request (same count on load with it shown and hidden)", withCard === withoutCard && withCard >= 1, `${withCard} vs ${withoutCard}`);
    } finally {
      await bh.close();
    }

    // Blocked storage: the card still renders (try/catch around every access).
    const w2 = await newWorkspace("FIRSTRUN2");
    const { browser: b2, page: p2 } = await browserFor(w2.c.product);
    try {
      await p2.evaluateOnNewDocument(() => {
        Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
      });
      await p2.goto(`${origin()}/w/${w2.id}`, { waitUntil: "networkidle2" });
      check("with storage blocked the card still shows (each access is guarded)", await waitFor(p2, async () => (await card(p2))?.label === "Get started"), "");
    } finally {
      await b2.close();
    }
  } finally {
    await browser.close();
  }
  await stop();
}

// ---- phase hosted ----
async function phaseHosted(dir) {
  phaseName = "hosted";
  HOSTED = true;
  const INVITE = "first-run-invite-01";
  await start({
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "r".repeat(48),
    ALIGN_DATA_DIR: dir,
    ALIGN_SIGNUP_CODES: `${INVITE},first-run-invite-02`,
    ALIGN_DELETE_BY: "2026-11-13",
    ALIGN_PRODUCT_PASSCODE: "product-strong-pass-7",
    ALIGN_SECURITY_PASSCODE: "security-strong-pass-7",
    ALIGN_LEADERSHIP_PASSCODE: "leadership-strong-pass-7",
  });
  const root = await req("GET", "/");
  check("hosted: '/' (Northstar) still redirects to /new, so there is no sample to link", root.status === 307 && /\/new$/.test(root.headers.location ?? ""), `${root.status} ${root.headers.location}`);
  const w = await newWorkspace("FIRSTRUNH", { signup_code: INVITE });
  const { browser, page } = await browserFor(w.c.leadership);
  try {
    await page.goto(`${origin()}/w/${w.id}`, { waitUntil: "networkidle2" });
    const shown = await waitFor(page, async () => (await card(page))?.label === "Get started");
    const c0 = await card(page);
    const link = await page.evaluate(() => !!document.querySelector('section[aria-label="Get started"] a[href="/"]'));
    const title = await page.evaluate(() => document.querySelector('section[aria-label="Get started"] h2')?.textContent);
    check("hosted: the card is the one path, titled 'Connect one agent': no sample path, no 'Two ways', no sample link", shown && title === "Connect one agent" && !/Explore a sample|Two ways|made-up company|Sample \(fictional\)/.test(c0?.text ?? "") && !link, `${title} | ${c0?.text}`);
    const hcv = await copyVisibleAt(page);
    check("hosted: Copy is visible without scrolling the setup line, at 390 and 1440", hcv.every((x) => x.endsWith(":ok")), hcv.join(" "));
    const hReads = await page.evaluate(() => [...document.querySelectorAll('ul[aria-label="What the agent can read"] li')].map((li) => li.textContent));
    check(
      "hosted: the work-map and goal-activity lines say they are reported and off on the test server",
      hReads.includes("What connected sessions reported on each goal (off on the test server)") && hReads.includes("Sessions that reported in, grouped by goal (the work map) (off on the test server)"),
      hReads.join(" | "),
    );
    check("hosted: the setup line names this server's https MCP URL", /claude mcp add/.test(c0?.text ?? "") && c0.text.includes(`https://${HOSTED_HOST}/api/mcp`), c0?.text);
    await shots(page, "none");
    const tok = await connect(w, await newClient("Claude Code"), "leadership");
    const read = await rpc(tok, "tools/call", { name: "align_list_goals", arguments: {} });
    const onPlan = await untilApi(w, (j) => j?.apps?.[0]?.on_current_plan === true);
    await page.reload({ waitUntil: "networkidle2" });
    const side = () => page.evaluate(() => document.querySelector('ul[aria-label="Connected AI apps"]')?.textContent ?? "");
    const flipped = await waitFor(page, async () => /Claude Code\s*Seen on the current plan/.test(await side()));
    check("hosted: after an OAuth connection and one MCP request the sidebar says Claude Code was seen on the current plan, and the card yields", read.status === 200 && onPlan && flipped && !(await card(page)), `${read.status} ${await side()}`);
    await shots(page, "yielded");
  } finally {
    await browser.close();
  }
  await stop();
}

// ---- run ----
phaseStatic();
if (BUILD) {
  const build = spawnSync("npx", ["next", "build"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HOSTED: "", ALIGN_DATA_DIR: "" } });
  if (build.status !== 0) {
    console.log(`FAIL  next build\n${(build.stdout + build.stderr).slice(-1500)}`);
    process.exit(1);
  }
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "align-first-run-"));
try {
  await phaseLocal(path.join(tmp, "local"));
  await phaseHosted(path.join(tmp, "hosted"));
} catch (e) {
  fail++;
  console.log(`FAIL  [${phaseName}] ${e?.stack ?? e}`);
} finally {
  await stop();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`screenshots: ${SHOTS}`);
console.log(`test-first-run: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
