#!/usr/bin/env node
// Multi-workspace tenancy tests (spec rev 2 section 11, groups A to C, Mode L). Builds once, then starts its own
// production servers (next start) on <port>,
// one per config phase, with custom workspaces in a temp ALIGN_DATA_DIR. Northstar stays in ./data, as in test-all.
// Usage: node scripts/test-tenancy.mjs <port>   (from a worktree root; refuses 3100, the main checkout and a busy port)
//   phase "closed": no create config            -> creation closed
//   phase "code":   signup code, cap 3          -> wrong code, cap race
//   phase "open":   open create (serve.sh mode) -> everything else, plus the Northstar snapshot with workspaces on disk
//   phase "hosted": HOSTED=1 refusals at startup, then a valid hosted config (Host align.test, X-Forwarded-Proto https)

import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
// Sean #6 low (c): the /new form's matcher for code refusals (lib/codes.ts has no imports, so Node loads it directly).
const { isCodeRefusal, CREATION_CLOSED } = await import("../lib/codes.ts");
// Sean #6 carry-over: the error page's and the noscript notice's words (lib/labels.ts has only type imports).
const { ERROR_PAGE, ERROR_RETRY, NOSCRIPT } = await import("../lib/labels.ts");

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Poll `fn` until it returns true, up to `ms`. */
async function waitFor(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const PORT = Number(process.argv[2]);
if (!Number.isInteger(PORT) || PORT === 3100) {
  console.error("usage: node scripts/test-tenancy.mjs <port> (not 3100)");
  process.exit(2);
}
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
// startServer deletes ./data/state.json and data/.secret, so refuse the main checkout (the live demo's data) and a
// busy port before anything is touched, as test-all.sh does.
if (path.resolve(ROOT) === path.join(os.homedir(), "liminal/align")) {
  console.error(`test-tenancy: refusing the main checkout ${ROOT}; run from a worktree`);
  process.exit(2);
}
if (spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]).status === 0) {
  console.error(`test-tenancy: port ${PORT} is already in use`);
  process.exit(2);
}
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "data/scenarios/example-custom.json"), "utf8"));
const NS_STATE = path.join(ROOT, "data/state.json");
const ENDED = "Your session ended. Sign in again.";
const WRONG = "Wrong passcode for this role";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${String(detail).slice(0, 300)}`}`);
}

// ---- HTTP ----
async function call(method, p, { body, cookie, headers = {}, raw } = {}) {
  const h = { ...headers };
  if ((body !== undefined || raw !== undefined) && !h["content-type"]) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  const res = await fetch(BASE + p, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}

/** fetch() won't send a forged Host; node:http will. */
function withHost(method, p, host, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port: PORT, method, path: p, headers: { host, ...(data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {}) } },
      (res) => {
        let t = "";
        res.on("data", (c) => (t += c));
        res.on("end", () => resolve({ status: res.statusCode, text: t, setCookie: (res.headers["set-cookie"] ?? []).join("\n") }));
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

/** A request as the platform proxy forwards it in hosted mode: allowlisted Host and X-Forwarded-Proto https. */
function hosted(method, p, { body, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    // As Fly's edge forwards it: allowlisted Host, X-Forwarded-Proto https and Fly-Client-IP. undefined drops a header.
    // A browser sends Origin on every write; on the hosted site it is https://<Host> (QA-exit finding: checked exactly).
    const write = !["GET", "HEAD"].includes(method);
    const h = { host: HOSTED_HOST, "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.7", ...(write ? { origin: `https://${HOSTED_HOST}` } : {}), ...headers };
    for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
    if (data) Object.assign(h, { "content-type": h["content-type"] ?? "application/json", "content-length": Buffer.byteLength(data) });
    if (cookie) h.cookie = cookie;
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path: p, headers: h }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(t);
        } catch {}
        const sc = res.headers["set-cookie"] ?? [];
        resolve({ status: res.statusCode, headers: res.headers, text: t, json, setCookie: sc.join("\n"), cookie: (sc[0] || "").split(";")[0] });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const HOSTED_HOST = "align.test";
/** The page's server HTML carries the noscript notice once, inside <noscript> (the RSC payload's <script>s, which
 *  repeat the text, are left out, as in LD1). */
function noscriptIn(html) {
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
  return visible.split(NOSCRIPT).length === 2 && /<noscript>(?:(?!<\/noscript>)[\s\S])*Align needs JavaScript/.test(visible);
}

const create = (body, extra = {}) => call("POST", "/api/workspaces", { body, ...extra });
async function signIn(ws, passcodes) {
  const out = {};
  for (const role of ["leadership", "product", "security"]) {
    const r = await call("POST", "/api/session", { body: { workspace: ws, role, passcode: passcodes[role] } });
    if (r.status !== 200) throw new Error(`sign in ${ws} ${role}: ${r.status} ${r.text}`);
    out[role] = r.cookie;
    out[`${role}_sid`] = r.json.sid;
  }
  return out;
}
async function northstarSignIn() {
  const out = {};
  for (const role of ["leadership", "product", "security"]) {
    const r = await call("POST", "/api/session", { body: { role, passcode: `${role}-demo` } });
    out[role] = r.cookie;
  }
  return out;
}

/** The fixture with a marker appended to every text field, so leaks are detectable. */
function marked(m) {
  const t = (s) => `${s} ${m}`;
  const f = structuredClone(FIXTURE);
  f.company = t(f.company);
  f.leadership = { team: t(f.leadership.team), lead: t(f.leadership.lead) };
  f.company_goal = { objective: t(f.company_goal.objective), measures: f.company_goal.measures.map(t) };
  for (const side of ["asking", "owning"]) f[side] = { ...f[side], team: t(f[side].team), lead: t(f[side].lead), objective: t(f[side].objective), measures: f[side].measures.map(t) };
  f.dependency = t(f.dependency);
  f.work_items = f.work_items.map((w) => ({ ...w, task: t(w.task) }));
  f.plan = { title: t(f.plan.title), text: t(f.plan.text) };
  return f;
}

// ---- files ----
const fileHash = (f) => (existsSync(f) ? createHmac("sha256", "k").update(readFileSync(f)).digest("hex") : "absent");
function treeHash(dir) {
  if (!existsSync(dir)) return "absent";
  const h = createHmac("sha256", "k");
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}
function allText(dir) {
  let out = "";
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out += readFileSync(p, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Top-level keys whose JSON differs: failure detail only. */
function changedKeys(a, b) {
  const x = JSON.parse(a);
  const y = JSON.parse(b);
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).join(",") || "(formatting only)";
}

// ---- servers ----
let server = null;
async function startServer(env) {
  rmSync(NS_STATE, { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
  const clean = { ...process.env };
  for (const k of ["AI_GATEWAY_API_KEY", "ALIGN_CAPTURE", "ALIGN_SECRET", "ALIGN_URL", "ALIGN_MCP_URL", "ALIGN_ALLOW_OPEN_CREATE", "ALIGN_SIGNUP_CODE", "ALIGN_MAX_WORKSPACES", "ALIGN_CREATE_PER_HOUR", "ALIGN_DATA_DIR", "ALIGN_PUBLIC", "HOSTED", "ALIGN_HOSTS", "ALIGN_NORTHSTAR_PUBLIC", "ALIGN_PRODUCT_PASSCODE", "ALIGN_SECURITY_PASSCODE", "ALIGN_LEADERSHIP_PASSCODE"]) delete clean[k];
  // A production server (next start on the build made once below), as Fly runs it: no dev-only behaviour (hot
  // reload, on-demand compiles) in any gate, and hosted refusals are checked as they really happen.
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "ignore", "pipe"], detached: true });
  let exited = false;
  let stderr = "";
  server.stderr.on("data", (c) => (stderr += c));
  server.on("exit", () => (exited = true));
  let last = 0; // the last HTTP status seen: a refused hosted server that stays up must answer 503, never serve
  for (let i = 0; i < 90 && !exited; i++) {
    try {
      // Hosted servers answer only for their allowlisted Host over (forwarded) https.
      const r = env.HOSTED === "1" ? await hosted("GET", "/api/workspaces/config") : await fetch(`${BASE}/api/workspaces/config`);
      last = r.status;
      if (r.status === 200) return { started: true, stderr, exited, last };
      if (r.status === 503) break; // up, but serving nothing (proxy.ts startupProblems)
      if (r.status === 410) return { started: false, closed: true, stderr, exited, last, log: () => stderr, gone: () => exited }; // up, closed (H12)
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { started: false, stderr, exited, last };
}
async function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  spawnSync("pkill", ["-f", `next start -H 127.0.0.1 -p ${PORT}`]);
  server = null;
  await new Promise((r) => setTimeout(r, 2500));
  rmSync(NS_STATE, { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
}
async function mustStart(env) {
  const r = await startServer(env);
  if (!r.started) throw new Error(`server did not start: ${r.stderr.slice(-400)}`);
}
process.on("exit", () => {
  if (server)
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
});

// ---- token helpers (the test has file access, like a host admin) ----
function decode(cookie) {
  const v = decodeURIComponent(cookie.split("=").slice(1).join("="));
  const [p, mac] = v.split(".");
  return { payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")), p, mac };
}
function forge(payload, secret) {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `align_session=${encodeURIComponent(`${p}.${createHmac("sha256", secret).update(p).digest("base64url")}`)}`;
}

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "align-tenancy-"));
// One production build for every phase. Config is read at request time (lib/config.ts), so one build serves them all.
const build = spawnSync("npx", ["next", "build"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HOSTED: "", ALIGN_DATA_DIR: "" } });
if (build.status !== 0) {
  console.log(`FAIL  next build\n${(build.stdout + build.stderr).slice(-1500)}`);
  process.exit(1);
}
try {
  // ======== phase closed ========
  await mustStart({ ALIGN_DATA_DIR: path.join(tmpRoot, "closed") });
  const closed = await create(FIXTURE);
  check("B13 creation closed without signup code or ALIGN_ALLOW_OPEN_CREATE -> 403", closed.status === 403, `${closed.status} ${closed.text}`);
  const cfgClosed = await call("GET", "/api/workspaces/config");
  check("B13 config says a signup code is required", cfgClosed.json?.signup_code_required === true, cfgClosed.text);
  await stopServer();

  // ======== phase code ========
  await mustStart({ ALIGN_DATA_DIR: path.join(tmpRoot, "code"), ALIGN_SIGNUP_CODE: "tenancy-code-1", ALIGN_MAX_WORKSPACES: "3", ALIGN_CREATE_PER_HOUR: "100" });
  const wrong = await create({ ...FIXTURE, signup_code: "nope" });
  check("B13 wrong signup code -> 403", wrong.status === 403, `${wrong.status} ${wrong.text}`);
  check("LC1 the /new form recognises Mode L's wrong signup code as a code-field error", isCodeRefusal(wrong.json?.error), wrong.text);
  const c1 = await create({ ...FIXTURE, signup_code: "tenancy-code-1" });
  const c2 = await create({ ...FIXTURE, signup_code: "tenancy-code-1" });
  check("B13 right signup code -> 201", c1.status === 201 && c2.status === 201, `${c1.status} ${c2.status}`);
  const race = await Promise.all([create({ ...FIXTURE, signup_code: "tenancy-code-1" }), create({ ...FIXTURE, signup_code: "tenancy-code-1" })]);
  const statuses = race.map((r) => r.status).sort();
  check("B13 cap reached with two concurrent creates at N-1: exactly one succeeds", statuses[0] === 201 && statuses[1] === 409, statuses.join(","));
  const cfgFull = await call("GET", "/api/workspaces/config");
  check("B13 config reports max_reached", cfgFull.json?.max_reached === true, cfgFull.text);
  await stopServer();

  // ======== phase open ========
  const dataDir = path.join(tmpRoot, "open");
  const wsRoot = path.join(dataDir, "workspaces");
  const mcpToken = "tenancy-" + Date.now();
  await mustStart({ ALIGN_DATA_DIR: dataDir, ALIGN_ALLOW_OPEN_CREATE: "1", ALIGN_CREATE_PER_HOUR: "1000", ALIGN_MCP_TOKEN: mcpToken });

  // C19 Northstar API + MCP snapshot with another workspace on disk (before any Northstar capture: sessions survive reset)
  const W0 = await create(marked("ZMARK"));
  check("C19 setup: a workspace exists on disk", W0.status === 201, `${W0.status} ${W0.text.slice(0, 200)}`);
  const snap = spawnSync("node", ["scripts/snapshot-northstar.mjs", BASE], { env: { ...process.env, ALIGN_MCP_TOKEN: mcpToken }, encoding: "utf8" });
  check("C19 Northstar snapshot identical to 850971e with workspaces on disk", snap.status === 0, (snap.stdout + snap.stderr).split("\n").slice(-4).join(" "));

  // A11 create-time marker: a captured Northstar session must not reach a new workspace.
  // B1-1: capture needs a consent record for the harness and repo, granted by Northstar leadership.
  const nsLead = (await call("POST", "/api/session", { body: { role: "leadership", passcode: "leadership-demo" } })).cookie;
  const consent = await call("POST", "/api/sessions/consent", { cookie: nsLead, body: { harness: "claude-code", repo: "tenancy-repo" } });
  const cap = await call("POST", "/api/sessions/events", { body: { harness: "claude-code", session_id: "tenancy-capture-1", hook_event: "UserPromptSubmit", prompt: "NSMARKER captured prompt", cwd: "/tmp/tenancy-repo", repo: "tenancy-repo" } });
  check("A11 setup: consent granted and the synthetic capture accepted", consent.status === 200 && cap.status === 200, `${consent.status} ${cap.status} ${cap.text}`);
  // B1-6: anonymous state no longer carries sessions, so read it as Northstar leadership.
  const nsAfterCapture = await call("GET", "/api/state", { cookie: nsLead });
  check("A11 setup: the Northstar capture landed", nsAfterCapture.text.includes("NSMARKER"), "capture marker not in Northstar state");
  // Background work after a capture (registry refresh, mapping when the external model is on) can still write
  // Northstar; wait until its state file is stable so later Northstar hash checks compare like with like.
  let stable = false;
  for (let i = 0, last = ""; i < 30 && !stable; i++) {
    await call("GET", "/api/state", { cookie: nsLead });
    await new Promise((r) => setTimeout(r, 700));
    const h = fileHash(NS_STATE);
    stable = h === last;
    last = h;
  }
  check("A11 setup: Northstar state settled after the capture", stable, "state kept changing");

  // B13 request-shape refusals
  const plain = await create(undefined, { raw: JSON.stringify(FIXTURE), headers: { "content-type": "text/plain" } });
  check("B13 text/plain -> 415", plain.status === 415, `${plain.status}`);
  const foreign = await create(FIXTURE, { headers: { origin: "http://evil.example" } });
  check("B13 foreign Origin -> 403", foreign.status === 403, `${foreign.status}`);
  const over = await create(undefined, { raw: JSON.stringify({ ...FIXTURE, pad: "x".repeat(70 * 1024) }) });
  check("B13 oversize -> 413", over.status === 413, `${over.status}`);
  const protoTop = await create(undefined, { raw: JSON.stringify(FIXTURE).replace(/^\{/, '{"__proto__":{"a":1},') });
  const protoNested = await create(undefined, { raw: JSON.stringify(FIXTURE).replace('"leadership":{', '"leadership":{"__proto__":{"a":1},') });
  check("B13 __proto__ top level and nested -> 400", protoTop.status === 400 && protoNested.status === 400, `${protoTop.status} ${protoNested.status}`);
  const host = await withHost("POST", "/api/workspaces", "rebind.example:3000", FIXTURE);
  check("B13 forged Host -> 421", host.status === 421, `${host.status}`);
  const stateHost = await withHost("GET", "/api/state", "rebind.example");
  check("B13 forged Host on a Northstar route -> 421", stateHost.status === 421, `${stateHost.status}`);

  // A1 isolation
  const A = await create(marked("AMARK"));
  const B = await create(marked("BMARK"));
  check("create A and B -> 201, distinct ids, path /w/<id>, passcodes shown once", A.status === 201 && B.status === 201 && A.json.workspace.id !== B.json.workspace.id && A.json.workspace.path === `/w/${A.json.workspace.id}` && A.json.shown_once === true, `${A.status} ${B.status}`);
  const a = A.json.workspace.id;
  const b = B.json.workspace.id;
  const sa = await signIn(a, A.json.passcodes);
  const sb = await signIn(b, B.json.passcodes);
  const stA = await call("GET", "/api/state", { cookie: sa.product });
  const stB = await call("GET", "/api/state", { cookie: sb.product });
  check("A1 A's state has A's markers and none of B's", stA.text.includes("AMARK") && !stA.text.includes("BMARK"), stA.text.slice(0, 200));
  check("A1 B's state has B's markers and none of A's", stB.text.includes("BMARK") && !stB.text.includes("AMARK"), stB.text.slice(0, 200));
  check("A11 new workspace has no Northstar capture marker (state and files)", !stA.text.includes("NSMARKER") && !allText(path.join(wsRoot, a)).includes("NSMARKER"), "NSMARKER leaked");
  check("A11 new workspace starts with empty sessions, mappings, simulations", stA.json.sessions.length === 0 && stA.json.mappings.length === 0 && stA.json.simulations.length === 0, "not empty");


  // A2 a session ignores any workspace in body, query or header
  const nB0 = treeHash(path.join(wsRoot, b));
  const nA0 = treeHash(path.join(wsRoot, a));
  const a2h = await call("POST", "/api/timer", { cookie: sa.product, body: { action: "ceo_change_viewed" }, headers: { "x-align-workspace": b } });
  const a2hUnchanged = treeHash(path.join(wsRoot, a)) === nA0 && treeHash(path.join(wsRoot, b)) === nB0;
  check("M7 a write whose page names another workspace (x-align-workspace) -> 409, A and B untouched", a2h.status === 409 && a2hUnchanged, `${a2h.status} unchanged=${a2hUnchanged}`);
  check("L409 the stale-tab 409 carries code workspace_mismatch (and its message)", a2h.json?.code === "workspace_mismatch" && /another workspace/.test(a2h.json?.error ?? ""), a2h.text);
  const a2 = await call("POST", `/api/timer?workspace=${b}`, { cookie: sa.product, body: { action: "ceo_change_viewed", workspace: b }, headers: { "x-align-workspace": a } });
  check("A2 workspace in body/query ignored: the write succeeds in A, B untouched", a2.status === 200 && treeHash(path.join(wsRoot, a)) !== nA0 && treeHash(path.join(wsRoot, b)) === nB0, `${a2.status} A changed=${treeHash(path.join(wsRoot, a)) !== nA0}`);
  const meA = await call("GET", `/api/session?workspace=${b}`, { cookie: sa.product });
  check("A2 GET /api/session reports A", meA.json?.workspace === a, meA.text);
  const info = await call("GET", `/api/workspaces/${b}/login-info`);
  const leads = [FIXTURE.leadership.lead, FIXTURE.asking.lead, FIXTURE.owning.lead];
  check("A2 login-info for B: names only, no person names, no plan text", info.status === 200 && info.text.includes("BMARK") && !leads.some((l) => info.text.includes(l)) && !info.text.includes(FIXTURE.plan.text.slice(0, 30)), info.text);
  check("CN5 login-info carries the company note the workspace was set up with (the sign-in screen shows it)", !FIXTURE.company_note || info.json?.company_note === FIXTURE.company_note, info.text);

  // A3 tampered tokens
  const secret = readFileSync(path.join(ROOT, "data/.secret"), "utf8").trim();
  const ta = decode(sa.product);
  const tb = decode(sb.product);
  const editWs = `align_session=${encodeURIComponent(`${Buffer.from(JSON.stringify({ ...ta.payload, ws: b })).toString("base64url")}.${ta.mac}`)}`;
  const swapMac = `align_session=${encodeURIComponent(`${ta.p}.${tb.mac}`)}`;
  const expired = forge({ ...ta.payload, exp: Date.now() - 1000 }, secret);
  const r1 = await call("POST", "/api/timer", { cookie: editWs, body: { action: "brief_reviewed" } });
  const r2 = await call("POST", "/api/timer", { cookie: swapMac, body: { action: "brief_reviewed" } });
  const r3 = await call("POST", "/api/timer", { cookie: expired, body: { action: "brief_reviewed" } });
  check("A3 ws edited without re-signing -> 401", r1.status === 401, `${r1.status} ${r1.text}`);
  check("A3 A's payload with B's MAC -> 401", r2.status === 401, `${r2.status}`);
  check("A3 expired exp -> 401 Session ended", r3.status === 401 && r3.json?.error === ENDED, `${r3.status} ${r3.text}`);
  const st3 = await call("GET", "/api/state", { cookie: expired });
  check("A3 expired token on GET /api/state -> 401, no Northstar fallback", st3.status === 401 && !st3.text.includes("Northstar"), `${st3.status}`);

  // A4 login workspace values
  const before4 = treeHash(dataDir) + fileHash(NS_STATE);
  const bad = ["northstar", "", null, 0, "../northstar", `w_${"a".repeat(11)}`, `w_${"a".repeat(13)}`, a.toUpperCase(), `w_aaaa%2Faaaaaaa`, `${a}\u0000`, `w_aaaaaaaaaaaa`];
  const outs = await Promise.all(bad.map((w) => call("POST", "/api/session", { body: { workspace: w, role: "product", passcode: A.json.passcodes.product } })));
  check("A4 every invalid or unknown workspace value -> uniform 401", outs.every((r) => r.status === 401 && r.json?.error === WRONG), outs.map((r) => r.status).join(","));
  const wrongRole = await call("POST", "/api/session", { body: { workspace: a, role: "admin", passcode: A.json.passcodes.product } });
  const wrongPass = await call("POST", "/api/session", { body: { workspace: a, role: "product", passcode: A.json.passcodes.security } });
  check("A4 unknown role and wrong passcode -> the same 401", wrongRole.json?.error === WRONG && wrongPass.json?.error === WRONG, `${wrongRole.text} ${wrongPass.text}`);
  check("A4 nothing written by failed logins", treeHash(dataDir) + fileHash(NS_STATE) === before4, "tree changed");

  // A5 Northstar-only routes with a custom token
  const nsBefore5 = fileHash(NS_STATE);
  const r5 = await Promise.all([
    call("POST", "/api/alike", { cookie: sa.leadership, body: {} }),
    call("POST", "/api/mappings", { cookie: sa.leadership, body: { action: "remap" } }),
    call("POST", "/api/mappings/claude-code:tenancy-capture-1/confirm", { cookie: sa.leadership, body: {} }),
    call("POST", "/api/mappings/claude-code:tenancy-capture-1/reject", { cookie: sa.leadership, body: {} }),
    call("POST", "/api/org/push", { cookie: sa.leadership, body: {} }),
    call("POST", "/api/scenario", { cookie: sa.leadership, body: { ...FIXTURE, confirm: "replace" } }),
    // B1: capture consent and captured sessions are Northstar (this machine's agents) only.
    call("GET", "/api/sessions/consent", { cookie: sa.leadership }),
    call("POST", "/api/sessions/consent", { cookie: sa.leadership, body: { harness: "claude-code", repo: "tenancy-repo" } }),
    call("DELETE", "/api/sessions/consent", { cookie: sa.leadership, body: { harness: "claude-code", repo: "tenancy-repo" } }),
    call("DELETE", "/api/sessions/claude-code:tenancy-capture-1", { cookie: sa.leadership }),
    call("GET", "/api/sessions", { cookie: sa.leadership }),
  ]);
  check("A5 alike, mappings POST/confirm/reject, org/push, scenario, capture consent, session list/delete with a custom token -> 403", r5.every((r) => r.status === 403), r5.map((r) => r.status).join(","));
  check("A5 Northstar state unchanged", fileHash(NS_STATE) === nsBefore5, "changed");

  // A6 custom flow leaves Northstar byte-identical
  const ns6 = fileHash(NS_STATE);
  const ns6Text = readFileSync(NS_STATE, "utf8");
  const p6 = await call("POST", "/api/proposals", { cookie: sa.product, body: { proposed_measure_text: "AMARK new target", rationale: "AMARK why", reciprocal_commitment: "AMARK commit" } });
  const pid = p6.json?.id;
  // Conditions take the same 1000-character limit in a workspace as in /setup, not the 300-character field cap.
  const c6long = await call("POST", `/api/proposals/${pid}/counter`, { cookie: sa.security, body: { proposed_measure_text: "AMARK revised", rationale: "AMARK r", conditions: "x".repeat(1001) } });
  check("A6 workspace conditions over 1000 characters -> 400", c6long.status === 400, `${c6long.status} ${c6long.text}`);
  const c6 = await call("POST", `/api/proposals/${pid}/counter`, { cookie: sa.security, body: { proposed_measure_text: "AMARK revised", rationale: "AMARK r", changes_plan: false, conditions: `AMARK ${"c".repeat(600)}` } });
  check("A6 workspace conditions of 606 characters are kept", c6.json?.counter_versions?.at(-1)?.conditions?.length === 606, `${c6.status} ${c6.text.slice(0, 200)}`);
  const k6 = await call("POST", `/api/proposals/${pid}/acknowledge`, { cookie: sa.product, body: {} });
  const t6 = await call("POST", "/api/timer", { cookie: sa.product, body: { action: "brief_reviewed" } });
  check("A6 custom propose, counter, acknowledge, timer -> 200", [p6, c6, k6, t6].every((r) => r.status === 200), [p6, c6, k6, t6].map((r) => `${r.status}`).join(","));

  // B17 a custom accept emits no authority event
  const ctrl = new AbortController();
  let wire = "";
  const sse = fetch(`${BASE}/api/directives/stream?session=*`, { signal: ctrl.signal })
    .then(async (res) => {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        wire += Buffer.from(value).toString("utf8");
      }
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  const acc = await call("POST", `/api/proposals/${pid}/accept`, { cookie: sa.security, body: { rationale: "AMARK ok", accept_untested: true } });
  await new Promise((r) => setTimeout(r, 1500));
  ctrl.abort();
  await sse;
  check("A6 custom accept -> 200 RATIFIED", acc.status === 200, `${acc.status} ${acc.text.slice(0, 200)}`);
  check("B17 custom accept emits no authority event on ?session=*", wire.includes("event: hello") && !wire.includes("event: authority"), wire.slice(0, 300));
  // The launch route is workspace-scoped: B's leadership names A's proposal and reaches only B.
  const aTree6 = treeHash(path.join(wsRoot, a));
  const bTree6l = treeHash(path.join(wsRoot, b));
  const lB = await call("POST", `/api/proposals/${pid}/launch`, { cookie: sb.leadership, body: { decision: "approved" } });
  check("A6 B's leadership cannot launch A's proposal -> 404, A and B unchanged", lB.status === 404 && treeHash(path.join(wsRoot, a)) === aTree6 && treeHash(path.join(wsRoot, b)) === bTree6l, `${lB.status} ${lB.text}`);
  const lA = await call("POST", `/api/proposals/${pid}/launch`, { cookie: sa.leadership, body: { decision: "approved", accept_untested: true } });
  const launchedA = JSON.parse(readFileSync(path.join(wsRoot, a, "state.json"), "utf8")).acceptances.find((x) => x.proposal_id === pid)?.launch_decision;
  check("A6 A's leadership launches A's proposal -> 200, recorded in A only", lA.status === 200 && launchedA?.decision === "approved" && treeHash(path.join(wsRoot, b)) === bTree6l, `${lA.status} ${lA.text}`);
  // L7 (Sean's #7 review): the launch route refuses a page on another local port and is rate-limited per workspace.
  const aTreeL7 = treeHash(path.join(wsRoot, a));
  const lX = await call("POST", `/api/proposals/${pid}/launch`, { cookie: sa.leadership, body: { decision: "not_yet" }, headers: { origin: "http://localhost:5173" } });
  check("L7 launch from another local port (Origin http://localhost:5173) -> 403, A unchanged", lX.status === 403 && treeHash(path.join(wsRoot, a)) === aTreeL7, `${lX.status} ${lX.text}`);
  const lLoop = [];
  for (let i = 0; i < 11; i++) lLoop.push((await call("POST", `/api/proposals/${pid}/launch`, { cookie: sa.leadership, body: { decision: "approved", accept_untested: true } })).status);
  check("L7 a launch-decision loop is limited: 429 within 11 more in a minute, never more than 10 accepted", lLoop.includes(429) && lLoop.filter((x) => x === 200).length <= 9 && lLoop.every((x) => x === 200 || x === 429), lLoop.join(","));
  const p6b = await call("POST", "/api/proposals", { cookie: sa.product, body: { proposed_measure_text: "AMARK second", rationale: "r", reciprocal_commitment: "c" } });
  const rj = await call("POST", `/api/proposals/${p6b.json?.id}/reject`, { cookie: sa.security, body: {} });
  check("A6 custom reject -> 200", rj.status === 200, `${rj.status} ${rj.text.slice(0, 200)}`);
  check("A6 Northstar files byte-identical after the custom flow", fileHash(NS_STATE) === ns6, `changed keys: ${changedKeys(ns6Text, readFileSync(NS_STATE, "utf8"))}`);
  const ns = await northstarSignIn();
  const bTree6 = treeHash(path.join(wsRoot, a));
  const nsBefore6r = fileHash(NS_STATE);
  const ns6t = await call("POST", "/api/timer", { cookie: ns.product, body: { action: "brief_reviewed" } });
  const ns6p = await call("POST", "/api/proposals", { cookie: ns.product, body: { plan_id: "p-beta", plan_version: 1, simulation_refs: [], proposed_measure_text: "NS", rationale: "NS", reciprocal_commitment: "NS" } });
  check("A6 Northstar actions succeed and change Northstar, and leave A's files byte-identical", ns6t.status === 200 && ns6p.status === 200 && fileHash(NS_STATE) !== nsBefore6r && treeHash(path.join(wsRoot, a)) === bTree6, `${ns6t.status} ${ns6p.status}`);

  // A7 parallel writes
  const actions = ["ceo_change_viewed", "brief_reviewed", "scenario_reviewed", "evidence_opened"];
  const a7 = await Promise.all([
    ...Array.from({ length: 20 }, (_, i) => call("POST", "/api/timer", { cookie: [sa.product, sa.security][i % 2], body: { action: actions[(i >> 1) % 4] } })),
    ...Array.from({ length: 20 }, (_, i) => call("POST", "/api/timer", { cookie: [sb.product, sb.security][i % 2], body: { action: actions[(i >> 1) % 4] } })),
  ]);
  const touched = (w) => new Set(JSON.parse(readFileSync(path.join(wsRoot, w, "state.json"), "utf8")).timer.touchpoints.map((t) => `${t.actor}:${t.action}`));
  const want = ["product", "security"].flatMap((r) => actions.map((x) => `${r}:${x}`));
  check("A7 all 40 parallel timer calls -> 200, and each workspace records all 8 actor/action touches", a7.every((r) => r.status === 200) && want.every((k) => touched(a).has(k) && touched(b).has(k)), `${a7.map((r) => r.status).filter((x) => x !== 200).join(",")} missing A: ${want.filter((k) => !touched(a).has(k))} B: ${want.filter((k) => !touched(b).has(k))}`);
  const sidsA = new Set([sa.leadership_sid, sa.product_sid, sa.security_sid, "create"]);
  const sidsB = new Set([sb.leadership_sid, sb.product_sid, sb.security_sid, "create"]);
  const auA = JSON.parse(readFileSync(path.join(wsRoot, a, "state.json"), "utf8")).audit;
  const auB = JSON.parse(readFileSync(path.join(wsRoot, b, "state.json"), "utf8")).audit;
  check("A7 20+20 parallel timer touches each land only in their own workspace", auA.every((r) => sidsA.has(r.session_id)) && auB.every((r) => sidsB.has(r.session_id)) && auB.some((r) => r.action === "brief_reviewed"), "cross-workspace audit row");

  // B16 custom body caps
  const o16 = await call("POST", "/api/proposals", { cookie: sb.product, raw: JSON.stringify({ proposed_measure_text: "x", pad: "y".repeat(70 * 1024) }) });
  const f300 = await call("POST", "/api/proposals", { cookie: sb.product, body: { proposed_measure_text: "y".repeat(301), rationale: "r", reciprocal_commitment: "c" } });
  const f4000 = await call("POST", "/api/proposals", { cookie: sb.product, body: { proposed_measure_text: "x", text: "y".repeat(4001), rationale: "r", reciprocal_commitment: "c" } });
  check("B16 oversize custom proposal body -> 413", o16.status === 413, `${o16.status}`);
  check("B16 field over 300 / text over 4000 -> 400", f300.status === 400 && f4000.status === 400, `${f300.status} ${f4000.status}`);

  // B14 login CSRF; B15 rate limits
  const form = await call("POST", "/api/session", { raw: JSON.stringify({ workspace: b, role: "product", passcode: "x" }), headers: { "content-type": "text/plain" } });
  check("B14 login-with-workspace as text/plain -> 415", form.status === 415, `${form.status}`);
  const nsWrong = [];
  for (let i = 0; i < 11; i++) nsWrong.push((await call("POST", "/api/session", { body: { role: "product", passcode: "wrong" } })).status);
  check("B15 Northstar login never limited (11 wrong passcodes, all 401)", nsWrong.every((s) => s === 401), nsWrong.join(","));
  const fails = [];
  for (let i = 0; i < 6; i++) fails.push((await call("POST", "/api/session", { body: { workspace: b, role: "product", passcode: "wrong" } })).status);
  check("B15 custom login backs off after 5 failures (6th -> 429)", fails.slice(0, 5).every((s) => s === 401) && fails[5] === 429, fails.join(","));
  await new Promise((r) => setTimeout(r, 1200));
  const recover = await call("POST", "/api/session", { body: { workspace: b, role: "product", passcode: B.json.passcodes.product } });
  check("B15 custom login recovers after the delay", recover.status === 200, `${recover.status} ${recover.text}`);

  // Restart (leadership only) rebuilds from the saved setup
  const rp = await call("POST", "/api/reset", { cookie: sb.product, body: { confirm: "reset" } });
  const rl = await call("POST", "/api/reset", { cookie: sb.leadership, body: { confirm: "reset" } });
  const afterReset = await call("GET", "/api/state", { cookie: sb.product });
  check("Restart: product -> 403; leadership -> clean custom state, audit kept", rp.status === 403 && rl.status === 200 && afterReset.json?.scenario === "custom" && afterReset.json.proposals.length === 0 && afterReset.json.audit.some((r) => r.action === "reset"), `${rp.status} ${rl.status}`);

  // A11 at rest
  const everything = allText(dataDir) + allText(path.join(ROOT, "data"));
  const codes = [...Object.values(A.json.passcodes), ...Object.values(B.json.passcodes)];
  check("A11 no plaintext passcode under any data folder", codes.every((c) => !everything.includes(c) && !everything.includes(c.replace(/-/g, ""))), "plaintext passcode found");
  const mode = (f) => (statSync(path.join(wsRoot, a, f)).mode & 0o777).toString(8);
  check("A11 auth.json and scenario.json are 0600", mode("auth.json") === "600" && mode("scenario.json") === "600", `${mode("auth.json")} ${mode("scenario.json")}`);
  const served = stA.text + afterReset.text + info.text;
  check("A11 auth.json and scenario.json never appear in an API response", !served.includes('"salt"') && !served.includes('"epoch"') && !served.includes('"confirm":"replace"'), "leaked");

  // ---- R: fixes from Sean's PR #3 review ----
  // R14 CSRF: a custom write needs JSON from this origin (a text/plain form from another local port used to land)
  const r14 = await call("POST", "/api/timer", { cookie: sb.product, raw: JSON.stringify({ action: "brief_reviewed" }), headers: { "content-type": "text/plain" } });
  const r14o = await call("POST", "/api/timer", { cookie: sb.product, body: { action: "brief_reviewed" }, headers: { origin: "http://127.0.0.1:9" } });
  check("R14 custom write as text/plain -> 415; JSON from another origin -> 403", r14.status === 415 && r14o.status === 403, `${r14.status} ${r14o.status}`);
  // R14 every cookie-authenticated write route, generated from app/api so a new route can't be missed: a request with
  // a valid session cookie but another site's Origin is refused 403 "came from another site" (Sean's #6 review, fix 2).
  // Routes that never read the session cookie are listed with how they authenticate, and must not start reading it.
  const NOT_COOKIE = {
    "/api/sessions/events": "capture hook: consent record and agent token",
    "/api/directives/ack": "local watcher: assertLocal, or an agent token",
    "/api/mcp": "MCP: bearer token only",
  };
  const r14Routes = [];
  (function walk(dir, url) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const seg = e.name.replace(/^\[.*\]$/, "x");
      if (e.isDirectory()) walk(path.join(dir, e.name), `${url}/${seg}`);
      else if (e.name === "route.ts") {
        const src = readFileSync(path.join(dir, e.name), "utf8");
        const methods = [...src.matchAll(/export (?:async )?function (POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
        const reexport = src.match(/export \{([^}]*)\}/)?.[1] ?? "";
        for (const m of ["POST", "PUT", "PATCH", "DELETE"]) if (new RegExp(`as ${m}\\b`).test(reexport)) methods.push(m);
        for (const m of methods) r14Routes.push({ url, method: m, src });
      }
    }
  })(path.join(ROOT, "app/api"), "/api");
  const nsW = await northstarSignIn();
  const readsCookie = (src) => /require(?:Ws)?Session\(|stateContext\(/.test(src);
  const r14Probes = [];
  for (const r of r14Routes) {
    if (NOT_COOKIE[r.url]) {
      check(`R14 ${r.method} ${r.url} is not cookie-authenticated (${NOT_COOKIE[r.url]})`, !readsCookie(r.src), "it now reads the session cookie: add it to the Origin probe");
      continue;
    }
    // Workspace routes get a workspace session; Northstar-only routes the default store's leadership session.
    const cookie = /requireWsSession\(|bodyFor\(/.test(r.src) ? sb.leadership : nsW.leadership;
    r14Probes.push(call(r.method, r.url, { cookie, body: {}, headers: { origin: "http://127.0.0.1:9" } }).then((x) => ({ ...r, x })));
  }
  const r14Probed = await Promise.all(r14Probes);
  const r14Open = r14Probed.filter((p) => !(p.x.status === 403 && /another site|from this machine/i.test(p.x.json?.error ?? p.x.text)));
  check(
    `R14 all ${r14Probed.length} cookie-authenticated write routes refuse another site's Origin (403)`,
    r14Probed.length >= 20 && r14Open.length === 0,
    r14Open.map((p) => `${p.method} ${p.url} -> ${p.x.status} ${(p.x.json?.error ?? p.x.text).slice(0, 60)}`).join(" | "),
  );
  // R19 a primitive JSON body at sign-in is Northstar's 400, as before L0 (it was a 500)
  const prim = await Promise.all(["42", '"x"', "true"].map((raw) => call("POST", "/api/session", { raw })));
  check("R19 primitive JSON sign-in bodies -> 400, never 500", prim.every((r) => r.status === 400), prim.map((r) => r.status).join(","));
  // R15 the state names its workspace, so a tab can tell the cookie moved under it; Northstar's has no such key
  const nsR = await northstarSignIn();
  // M4 the default store too: a page on another local port can't reset Northstar, and directives refuse it
  const nsBeforeM4 = fileHash(NS_STATE);
  const m4o = await call("POST", "/api/reset", { cookie: nsR.leadership, raw: JSON.stringify({ confirm: "reset" }), headers: { "content-type": "text/plain", origin: "http://localhost:5173" } });
  const m4t = await call("POST", "/api/reset", { cookie: nsR.leadership, raw: JSON.stringify({ confirm: "reset" }), headers: { "content-type": "text/plain" } });
  const m4j = await call("POST", "/api/reset", { cookie: nsR.leadership, body: { confirm: "reset" }, headers: { origin: "http://localhost:5173" } });
  const m4d = await call("GET", "/api/directives?session=x", { headers: { origin: "http://localhost:5173" } });
  const m4unchanged = fileHash(NS_STATE) === nsBeforeM4;
  check("M4 Northstar reset from another local port -> 403 (text/plain or JSON), text/plain -> 415, Northstar unchanged; directives from another port -> 403", m4o.status === 403 && m4t.status === 415 && m4j.status === 403 && m4unchanged && m4d.status === 403, `${m4o.status} ${m4t.status} ${m4j.status} unchanged=${m4unchanged} ${m4d.status}`);
  const nsState = await call("GET", "/api/state", { cookie: nsR.product });
  const wsState = await call("GET", "/api/state", { cookie: sb.product });
  check("R15 custom /api/state names its workspace; Northstar's does not", wsState.json?.workspace === b && !!nsState.json && !("workspace" in nsState.json), `${wsState.json?.workspace} ${Object.keys(nsState.json ?? {}).includes("workspace")}`);
  // R12 files and folders are owner-only (state holds private constraints)
  const dmode = (statSync(path.join(wsRoot, a)).mode & 0o777).toString(8);
  check("R12 workspace folder 0700; state.json and workspace.json 0600", dmode === "700" && mode("state.json") === "600" && mode("workspace.json") === "600", `${dmode} ${mode("state.json")} ${mode("workspace.json")}`);
  // R19 an unreadable auth file is a server error, never a false "Session ended" that signs everyone out
  const authB19 = path.join(wsRoot, b, "auth.json");
  const auth19 = readFileSync(authB19, "utf8");
  writeFileSync(authB19, JSON.stringify({ epoch: 1 }), { mode: 0o600 });
  await new Promise((r) => setTimeout(r, 50));
  const r19 = await call("GET", "/api/state", { cookie: sb.product });
  writeFileSync(authB19, auth19, { mode: 0o600 });
  await new Promise((r) => setTimeout(r, 50));
  const r19ok = await call("GET", "/api/state", { cookie: sb.product });
  check("R19 malformed auth.json -> 500 (not 401 Session ended); restored -> 200", r19.status === 500 && r19.json?.error !== ENDED && r19ok.status === 200, `${r19.status} ${r19.text.slice(0, 120)} ${r19ok.status}`);
  // R15 in a browser: tab 1 shows A; tab 2 (same profile) signs in to B. Tab 1 must drop A's view without ever
  // rendering B's data, and say the browser is signed in to another workspace.
  if (existsSync(CHROME)) {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
    // next dev can reload pages in a loop while it settles after source edits, which destroys the page context:
    // reads retry, and an attempt where tab 1 never loaded A is retried in a fresh profile (up to 3). A sighting
    // of B's data in tab 1 is never retried away: it fails the check.
    const textOf = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
    const signInIn = async (page, ws, passcode) => {
      let status = 0;
      await waitFor(async () => {
        status = await page
          .evaluate(
            (ws, passcode) => fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: ws, role: "product", passcode }) }).then((r) => r.status),
            ws,
            passcode,
          )
          .catch(() => 0);
        return status !== 0;
      }, 60000);
      return status;
    };
    const attempt = async () => {
      const ctx = await browser.createBrowserContext(); // one profile: both tabs share its cookie, as in a real browser
      try {
        const t1 = await ctx.newPage();
        await t1.goto(`${BASE}/w/${a}`, { waitUntil: "domcontentloaded", timeout: 90000 }); // next dev compiles /w on first visit
        const s1 = await signInIn(t1, a, A.json.passcodes.product);
        await t1.reload({ waitUntil: "domcontentloaded" });
        const sawA = await waitFor(async () => (await textOf(t1)).includes("AMARK"), 45000);
        if (!sawA) return { s1, sawA, tab1: (await textOf(t1)).slice(0, 200) };
        const t2 = await ctx.newPage();
        await t2.goto(`${BASE}/w/${b}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        const s2 = await signInIn(t2, b, B.json.passcodes.product);
        let sawB = false;
        const told = await waitFor(async () => {
          const t = await textOf(t1);
          if (t.includes("BMARK")) sawB = true;
          return /signed in to another workspace/.test(t);
        });
        return { s1, s2, sawA, told, sawB, tab1: (await textOf(t1)).slice(0, 200) };
      } finally {
        await ctx.close();
      }
    };
    try {
      let r = { sawA: false };
      for (let i = 0; i < 3 && !r.sawA; i++) r = await attempt();
      check("R15 a tab in A, after another tab signs in to B: never shows B's data, says another workspace", r.s1 === 200 && r.s2 === 200 && r.sawA && r.told && !r.sawB, JSON.stringify(r));
    } catch (e) {
      check("R15 browser check ran", false, e.message);
    } finally {
      await browser.close();
    }
  } else check("R15 browser check needs Chrome (CHROME_PATH)", false, CHROME);

  // ---- Sean #6 carry-over: an error page and a noscript notice ----
  const E = await create(marked("EMARK"));
  const e = E.json?.workspace?.id;
  const nsPages = await Promise.all(["/", "/new", `/w/${e}`].map((p) => call("GET", p)));
  check("NS1 server HTML for /, /new and /w/<id> carries the noscript notice", nsPages.every((r) => r.status === 200 && noscriptIn(r.text)), nsPages.map((r) => `${r.status} ${noscriptIn(r.text)}`).join(" "));
  if (existsSync(CHROME)) {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
    const textOf = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
    try {
      const page = await browser.newPage();
      const jsOn = [];
      for (const p of ["/", "/new", `/w/${e}`]) {
        await page.goto(BASE + p, { waitUntil: "networkidle0", timeout: 90000 });
        jsOn.push((await textOf(page)).includes(NOSCRIPT));
      }
      await page.setJavaScriptEnabled(false);
      await page.goto(`${BASE}/w/${e}`, { waitUntil: "load" });
      const jsOff = await textOf(page);
      check("NS2 with JavaScript on, no page shows the noscript notice; with it off, /w/<id> does", jsOn.every((x) => !x) && jsOff.includes(NOSCRIPT), `on=${jsOn.join(",")} off=${jsOff.slice(0, 120)}`);
      await page.setJavaScriptEnabled(true);
      // A render error: a workspace state the server serves but the page can't draw (a goal with no measures).
      const sE = await signIn(e, E.json.passcodes);
      const stateE = path.join(wsRoot, e, "state.json");
      const stE = readFileSync(stateE, "utf8");
      const broken = JSON.parse(stE);
      for (const g of broken.goals) g.measures = null;
      writeFileSync(stateE, JSON.stringify(broken), { mode: 0o600 });
      const [cn, ...cv] = sE.product.split("=");
      await page.setCookie({ name: cn, value: cv.join("="), domain: "127.0.0.1", path: "/" });
      await page.goto(`${BASE}/w/${e}`, { waitUntil: "networkidle0", timeout: 90000 });
      const shown = await waitFor(async () => (await textOf(page)).includes(ERROR_PAGE), 30000);
      const errText = await textOf(page);
      const retry = await page.evaluate((l) => [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === l), ERROR_RETRY);
      check("E1 a render error shows the error page with Try again, and no error message or stack", shown && retry && !/TypeError|Cannot read|measures|at \w+ \(|\.js:\d/.test(errText), errText.slice(0, 200));
      writeFileSync(stateE, stE, { mode: 0o600 });
      await page.evaluate((l) => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === l)?.click(), ERROR_RETRY);
      const back = await waitFor(async () => (await textOf(page)).includes("EMARK"), 30000);
      check("E1 Try again after the state is repaired shows the workspace again", back, (await textOf(page)).slice(0, 200));
    } catch (err) {
      check("NS2/E1 browser check ran", false, err.message);
    } finally {
      await browser.close();
    }
  } else check("NS2/E1 browser check needs Chrome (CHROME_PATH)", false, CHROME);

  // U: the /w page before sign-in never polls state (spec section 11 D), and an ended session says so in the page
  if (existsSync(CHROME)) {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
    try {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      const seen = [];
      page.on("request", (r) => seen.push(new URL(r.url()).pathname));
      await page.goto(`${BASE}/w/${b}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const shown = await waitFor(async () => /Sign in as/.test(await page.evaluate(() => document.body.innerText).catch(() => "")), 45000);
      await new Promise((r) => setTimeout(r, 4000)); // > two poll intervals (1.5 s)
      check("U1 /w/<id> before sign-in shows the sign-in and never requests /api/state", shown && !seen.includes("/api/state"), `shown=${shown} state requests=${seen.filter((p) => p === "/api/state").length}`);
      // Sign in, then end the session server-side (epoch bump, as a passcode reset does): the page must say so.
      const st = await page.evaluate((ws, pc) => fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: ws, role: "product", passcode: pc }) }).then((r) => r.status), b, B.json.passcodes.product).catch(() => 0);
      await page.reload({ waitUntil: "domcontentloaded" });
      const inB = await waitFor(async () => (await page.evaluate(() => document.body.innerText).catch(() => "")).includes("BMARK"), 45000);
      // The leftover check below looks for this exact text, so it must be on the page while signed in.
      const bodyIn = await page.evaluate(() => document.body.innerText).catch(() => "");
      check("U2 setup: the signed-in page shows the signed-in role line (the leftover marker below)", bodyIn.includes("Acting as Product BMARK"), bodyIn.slice(0, 200));
      const authU = path.join(wsRoot, b, "auth.json");
      const auU = JSON.parse(readFileSync(authU, "utf8"));
      writeFileSync(authU, JSON.stringify({ ...auU, epoch: auU.epoch + 1 }), { mode: 0o600 });
      const ended = await waitFor(async () => (await page.evaluate(() => document.body.innerText).catch(() => "")).includes(ENDED), 20000);
      const leftover = (await page.evaluate(() => document.body.innerText).catch(() => "")).includes("Acting as Product BMARK");
      writeFileSync(authU, JSON.stringify(auU), { mode: 0o600 });
      await new Promise((r) => setTimeout(r, 50));
      check("U2 a session ended server-side: the page says \"Your session ended. Sign in again.\"", st === 200 && inB && ended && !leftover, JSON.stringify({ st, inB, ended, leftover }));
    } catch (e) {
      check("U browser checks ran", false, e.message);
    } finally {
      await browser.close();
    }
  } else check("U browser checks need Chrome (CHROME_PATH)", false, CHROME);

  // ---- L409: only the stale-tab 409 reloads the view; every other 409 shows its reason (Sean, PR #6 review) ----
  // Before: useAlign treated ANY 409 as "signed in elsewhere", cleared the view and swallowed ordinary conflicts.
  // The page's 1.5 s poll is paused (a wrapper on setInterval, flipped by window.__freeze) so a click lands on the
  // view as it was, as a click inside one poll interval does; act()'s own refresh still runs.
  if (existsSync(CHROME)) {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
    const freezable = () => {
      const orig = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...rest) => orig(() => { if (!window.__freeze) fn(); }, ms, ...rest);
    };
    const textOf = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
    const clickBtn = async (page, label, sel = "button") =>
      waitFor(
        () =>
          page
            .evaluate(
              (label, sel) => {
                const el = [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null && !x.disabled && x.innerText.replace(/\s+/g, " ").includes(label));
                if (!el) return false;
                el.scrollIntoView({ block: "center" });
                el.click();
                return true;
              },
              label,
              sel,
            )
            .catch(() => false),
        45000,
      );
    const fillIn = (page, label, value) =>
      waitFor(
        () =>
          page
            .evaluate(
              (label, value) => {
                const l = [...document.querySelectorAll("label")].find((x) => x.offsetParent !== null && x.innerText.replace(/\s+/g, " ").includes(label));
                const el = l?.querySelector("textarea, input:not([type=checkbox]):not([type=radio])");
                if (!el) return false;
                const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
                el.dispatchEvent(new Event("input", { bubbles: true }));
                return true;
              },
              label,
              value,
            )
            .catch(() => false),
        45000,
      );
    const pageSignIn = (page, body) =>
      page.evaluate((b) => fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.status), body).catch(() => 0);
    try {
      // (a) Northstar: Security has the proposal open with Approve showing; Security in a second window asks for changes;
      // the first window's Approve now gets the ordinary 409. Its reason must show, with the view kept and no reload.
      const nsReset = await call("POST", "/api/reset", { cookie: nsR.leadership, body: { confirm: "reset" } });
      const nsPush = await call("POST", "/api/org/push", { cookie: nsR.leadership, body: {} });
      const nsProp = await call("POST", "/api/proposals", {
        cookie: nsR.product,
        body: { plan_id: "p-beta", plan_version: 1, simulation_refs: [], proposed_measure_text: "L409MARK beta incidents triaged within 24h", rationale: "L409 rationale", reciprocal_commitment: "L409 Product tags beta issues" },
      });
      const nsPid = nsProp.json?.id;
      const w1ctx = await browser.createBrowserContext();
      const w2ctx = await browser.createBrowserContext();
      const w1 = await w1ctx.newPage();
      const w2 = await w2ctx.newPage();
      await w1.setViewport({ width: 1440, height: 900 });
      await w1.evaluateOnNewDocument(freezable);
      await w1.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const s1 = await pageSignIn(w1, { role: "security", passcode: "security-demo" });
      await w1.reload({ waitUntil: "domcontentloaded" });
      await w2.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const s2 = await pageSignIn(w2, { role: "security", passcode: "security-demo" });
      // v6: the proposal opens from its Your turn card (there is no Proposals nav item any more)
      await clickBtn(w1, "Your turn");
      await clickBtn(w1, "Review the proposal");
      const approveShown = await waitFor(async () => (await textOf(w1)).includes("Approve the change to my goal"), 45000);
      await w1.evaluate(() => {
        const box = [...document.querySelectorAll("label")].find((l) => /without a sandbox test/.test(l.innerText))?.querySelector("input[type=checkbox]");
        if (box && !box.checked) box.click();
      });
      await w1.evaluate(() => {
        window.__freeze = true;
        window.__l409 = "kept";
      });
      const counter = await w2.evaluate(
        (pid) =>
          fetch(`/api/proposals/${pid}/counter`, { method: "POST", headers: { "content-type": "application/json", "x-align-workspace": "northstar" }, body: JSON.stringify({ proposed_measure_text: "L409MARK triaged within 24h; P0 within 4h", rationale: "L409 tighten", changes_plan: false }) }).then((r) => r.status),
        nsPid,
      );
      const navs = [];
      w1.on("framenavigated", (f) => f === w1.mainFrame() && navs.push(f.url()));
      await clickBtn(w1, "Approve the change to my goal");
      const NEEDS_ACK = "Product needs to accept your changes before you can approve";
      const shown = await waitFor(async () => (await textOf(w1)).includes(NEEDS_ACK), 15000);
      await new Promise((r) => setTimeout(r, 1500));
      const after = await textOf(w1);
      const marker = await w1.evaluate(() => window.__l409).catch(() => null);
      const nsState = (await call("GET", "/api/state", { cookie: nsR.security })).json;
      check(
        "L409 (a) Northstar: Security approves in one window after asking for changes in another -> the 409 reason shows on screen, the view stays, no reload",
        nsReset.status === 200 && nsPush.status === 200 && !!nsPid && s1 === 200 && s2 === 200 && approveShown && counter === 200 && shown && after.includes(NEEDS_ACK) && after.includes("L409MARK") && marker === "kept" && navs.length === 0 && nsState?.proposals?.find((x) => x.id === nsPid)?.state === "COUNTERED",
        JSON.stringify({ reset: nsReset.status, push: nsPush.status, nsPid, s1, s2, approveShown, counter, shown, marker, navs, state: nsState?.proposals?.find((x) => x.id === nsPid)?.state, page: after.slice(0, 300) }),
      );
      // API: that ordinary 409 keeps Northstar's body exactly ({error} only, no code)
      const plain409 = await call("POST", `/api/proposals/${nsPid}/accept`, { cookie: nsR.security, body: { rationale: "x" }, headers: { "x-align-workspace": "northstar" } });
      check("L409 an ordinary 409 body is exactly {error}, no code", plain409.status === 409 && JSON.stringify(Object.keys(plain409.json ?? {})) === '["error"]' && plain409.json.error === NEEDS_ACK, plain409.text);
      await w1ctx.close();
      await w2ctx.close();
      await call("POST", "/api/reset", { cookie: nsR.leadership, body: { confirm: "reset" } });

      // (b) the stale tab: a /w page for workspace C whose browser has since signed in to Northstar. Its next write gets
      // 409 workspace_mismatch, and the page drops C's view and shows the Elsewhere notice, as before.
      const C = await create(marked("CMARK"));
      const c = C.json?.workspace?.id;
      const tctx = await browser.createBrowserContext();
      const t = await tctx.newPage();
      await t.setViewport({ width: 1440, height: 900 });
      await t.evaluateOnNewDocument(freezable);
      await t.goto(`${BASE}/w/${c}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const tIn = await pageSignIn(t, { workspace: c, role: "product", passcode: C.json?.passcodes?.product });
      await t.reload({ waitUntil: "domcontentloaded" });
      const sawC = await waitFor(async () => (await textOf(t)).includes("CMARK"), 45000);
      await clickBtn(t, "New conflict"); // v6: + New conflict opens the composer (custom scenarios keep it)
      if (!(await waitFor(async () => (await textOf(t)).includes("Send proposal to"), 10000))) await clickBtn(t, "Propose a change");
      const owning = marked("CMARK").owning.team;
      const asking = marked("CMARK").asking.team;
      const f1 = await fillIn(t, `New target for ${owning}`, "L409 stale-tab target");
      const f2 = await fillIn(t, "Why", "L409 why");
      const f3 = await fillIn(t, `What ${asking} will do in return`, "L409 in return");
      await t.evaluate(() => {
        window.__freeze = true;
      });
      const moved = await pageSignIn(t, { role: "product", passcode: "product-demo" }); // the cookie now names Northstar
      // The page checks the session before any write (LIM-2424) and would stop here without sending. Answer that one
      // check with C's session, as a cookie that changes between the check and the write would, so this still proves
      // the server's 409 guard behind it. Later session reads go through.
      let staleAnswered = false;
      await t.setRequestInterception(true);
      t.on("request", (r) => {
        if (!staleAnswered && r.method() === "GET" && new URL(r.url()).pathname === "/api/session") {
          staleAnswered = true;
          return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ actor: "product", name: "stale", sid: "stale", workspace: c }) });
        }
        void r.continue();
      });
      const mismatch = [];
      t.on("response", async (r) => {
        if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/proposals") mismatch.push({ status: r.status(), body: await r.json().catch(() => null) });
      });
      await clickBtn(t, "Send proposal to");
      const told = await waitFor(async () => /This browser is signed in to the Align demo/.test(await textOf(t)), 15000);
      const tText = await textOf(t);
      const cState = JSON.parse(readFileSync(path.join(wsRoot, c, "state.json"), "utf8"));
      check(
        "L409 (b) stale tab: its write gets 409 workspace_mismatch, the page drops the workspace view and shows the Elsewhere notice",
        C.status === 201 && tIn === 200 && sawC && f1 && f2 && f3 && moved === 200 && mismatch[0]?.status === 409 && mismatch[0]?.body?.code === "workspace_mismatch" && told && !tText.includes("L409 stale-tab target") && cState.proposals.length === 0,
        JSON.stringify({ created: C.status, tIn, sawC, f: [f1, f2, f3], moved, mismatch, told, page: tText.slice(0, 300) }),
      );
      await tctx.close();
    } catch (e) {
      check("L409 browser checks ran", false, e.message);
    } finally {
      await browser.close();
    }
  } else check("L409 browser checks need Chrome (CHROME_PATH)", false, CHROME);

  // ---- W: an agent connected to a workspace (Mode L): token, capture, MCP and wake-ups stay in that workspace ----
  const W_REPO = "w-agent-repo";
  const wForm = await call("POST", "/api/workspaces/agent-token", { cookie: sb.leadership, raw: JSON.stringify({ harness: "claude-code", repo: W_REPO }), headers: { "content-type": "text/plain" } });
  const wProduct = await call("POST", "/api/workspaces/agent-token", { cookie: sb.product, body: { harness: "claude-code", repo: W_REPO } });
  const wNs = await call("POST", "/api/workspaces/agent-token", { cookie: nsR.leadership, body: { harness: "claude-code", repo: W_REPO } });
  const wMint = await call("POST", "/api/workspaces/agent-token", { cookie: sb.leadership, body: { harness: "claude-code", repo: W_REPO } });
  const wTok = wMint.json?.token;
  check("W1 only workspace leadership mints an agent token (text/plain 415, product 403, Northstar 404), shown once", wForm.status === 415 && wProduct.status === 403 && wNs.status === 404 && wMint.status === 200 && /^agt\./.test(wTok ?? "") && wMint.json?.shown_once === true, `${wForm.status} ${wProduct.status} ${wNs.status} ${wMint.status}`);
  const wAudit = (await call("GET", "/api/state", { cookie: sb.leadership })).json?.audit ?? [];
  check("W1 minting records the consent and an audit row with the harness and repo only", wAudit.some((r) => r.action === "agent_connected" && r.target === `claude-code/${W_REPO}`) && !JSON.stringify(wAudit).includes(wTok), "no audit row, or the token leaked");
  const bearer = { authorization: `Bearer ${wTok}` };
  const ev = (sid, tool, headers = bearer, repo = W_REPO) => call("POST", "/api/sessions/events", { body: { harness: "claude-code", session_id: sid, hook_event: "PostToolUse", repo, cwd: repo, tool_name: tool }, headers });
  const nsBeforeW = fileHash(NS_STATE);
  const w2 = await ev("w-agent-1", "mcp__align__align_get_accepted_plan");
  const w2repo = await ev("w-agent-2", "Bash", bearer, "another-repo");
  const w2none = await ev("w-agent-3", "Bash", {}); // no token: the default store, which has no consent for this repo
  const bState = (await call("GET", "/api/state", { cookie: sb.leadership })).json;
  const aStateW = (await call("GET", "/api/state", { cookie: sa.leadership })).json;
  check(
    "W2 capture with the token lands in B only (not A, not Northstar); another repo -> 403; no token -> 403",
    w2.status === 200 && w2repo.status === 403 && w2none.status === 403 && bState.sessions.some((x) => x.session_id === "w-agent-1") &&
      !aStateW.sessions.some((x) => x.session_id === "w-agent-1") && fileHash(NS_STATE) === nsBeforeW,
    `${w2.status} ${w2repo.status} ${w2none.status}`,
  );
  // MCP: the agent token reads B; the server token still reads the default store
  const mcpCall = async (token, name) => {
    const r = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) });
    const t = await r.text();
    const line = t.split("\n").find((l) => l.startsWith("data: "));
    try {
      return { status: r.status, result: JSON.parse(line ? line.slice(6) : t).result };
    } catch {
      return { status: r.status, result: null };
    }
  };
  const wM = await mcpCall(wTok, "align_list_goals");
  const wMbad = await mcpCall(`${wTok.slice(0, -2)}xx`, "align_list_goals");
  check("W3 MCP with B's agent token reads B (its company, no A, no Northstar); a tampered token -> 401", wM.status === 200 && /BMARK/.test(wM.result?.structuredContent?.org ?? "") && !JSON.stringify(wM.result).includes("AMARK") && !/Northstar/.test(JSON.stringify(wM.result)) && wMbad.status === 401, `${wM.status} ${wM.result?.structuredContent?.org} ${wMbad.status}`);
  // Wake-up: B's approval reaches B's agent session, through the token, and nothing reaches the default store
  const dirW = (headers = bearer) => call("GET", "/api/directives?session=claude-code:w-agent-1", { headers }).then((r) => r.json?.pending ?? []);
  const wBefore = await dirW();
  const wp = await call("POST", "/api/proposals", { cookie: sb.product, body: { proposed_measure_text: "WMARK agreed measure", rationale: "r", reciprocal_commitment: "WMARK commitment" } });
  await call("POST", `/api/proposals/${wp.json?.id}/counter`, { cookie: sb.security, body: { proposed_measure_text: "WMARK agreed measure, weekly", rationale: "r", conditions: "WMARK conditions" } });
  await call("POST", `/api/proposals/${wp.json?.id}/acknowledge`, { cookie: sb.product, body: {} });
  const wAcc = await call("POST", `/api/proposals/${wp.json?.id}/accept`, { cookie: sb.security, body: { accept_untested: true } });
  const [wAfter, wNoTok] = [await dirW(), await dirW({})];
  check(
    "W4 B's approval: one wake-up for B's agent via its token, conditions quoted, no command; without the token, nothing",
    wBefore.length === 0 && wAcc.status === 200 && wAfter.length === 1 && wAfter[0].text.includes("«WMARK conditions»") && /no run command/.test(wAfter[0].text) && wNoTok.length === 0,
    `${wBefore.length} ${wAcc.status} ${JSON.stringify(wAfter).slice(0, 200)} ${wNoTok.length}`,
  );
  const wPlan = await mcpCall(wTok, "align_get_accepted_plan");
  check("W4 the agent reads B's agreement through MCP: agreed, with the conditions", wPlan.result?.structuredContent?.agreement?.status === "agreed" && wPlan.result?.structuredContent?.agreement?.conditions === "WMARK conditions", JSON.stringify(wPlan.result?.structuredContent ?? {}).slice(0, 200));
  const wAck = await call("POST", "/api/directives/ack", { body: { session: "claude-code:w-agent-1", event_id: wAfter[0]?.event_id }, headers: bearer });
  const delivered = (await call("GET", "/api/state", { cookie: sb.leadership })).json.sessions.find((x) => x.session_id === "w-agent-1")?.directives ?? [];
  check("W5 the watcher's ack marks delivery in B's state; the next poll is empty", wAck.status === 200 && delivered.length === 1 && (await dirW()).length === 0, `${wAck.status} ${JSON.stringify(delivered)}`);
  check("W5 the ack recorded B's authority event id", delivered.some((d) => d.event_id === wAfter[0]?.event_id), JSON.stringify(delivered));
  // Sean #6 low (g): capture can't move a session onto another repo. The token is bound to its repo, so an event that
  // names another repo is refused and the session keeps its repo and history.
  const w1Before = (await call("GET", "/api/state", { cookie: sb.leadership })).json.sessions.find((x) => x.session_id === "w-agent-1");
  const wMove = await ev("w-agent-1", "Bash", bearer, "w-moved-repo");
  const w1After = (await call("GET", "/api/state", { cookie: sb.leadership })).json.sessions.find((x) => x.session_id === "w-agent-1");
  check("W5 capture onto another repo with the session's own token -> 403; the session keeps its repo and history", wMove.status === 403 && w1After?.repo === w1Before?.repo && JSON.stringify(w1After) === JSON.stringify(w1Before), `${wMove.status} ${w1Before?.repo} -> ${w1After?.repo}`);
  // M2: an ack is small and names a real authority event; anything else records nothing
  const junkAck = await call("POST", "/api/directives/ack", { body: { session: "claude-code:w-agent-1", event_id: "not-an-authority-event" }, headers: bearer });
  const bigAck = await call("POST", "/api/directives/ack", { raw: JSON.stringify({ session: "claude-code:w-agent-1", event_id: wAfter[0]?.event_id, pad: "x".repeat(5000) }), headers: bearer });
  const deliveredAfterJunk = (await call("GET", "/api/state", { cookie: sb.leadership })).json.sessions.find((x) => x.session_id === "w-agent-1")?.directives ?? [];
  check("M2 an ack naming no authority event records nothing (fresh false); a 5 KB ack -> 413", junkAck.status === 200 && junkAck.json?.fresh === false && bigAck.status === 413 && deliveredAfterJunk.length === delivered.length, `${junkAck.status} ${junkAck.text} ${bigAck.status} ${deliveredAfterJunk.length}`);
  // M3: a token for another harness and repo of the same workspace can't read or ack this session
  const oMint = await call("POST", "/api/workspaces/agent-token", { cookie: sb.leadership, body: { harness: "codex", repo: "w-other-repo" } });
  const other = { authorization: `Bearer ${oMint.json?.token}` };
  const w1Pre = (await call("GET", "/api/state", { cookie: sb.leadership })).json.sessions.find((x) => x.session_id === "w-agent-1");
  const oOnto = await ev("w-agent-1", "Bash", other);
  const w1Post = (await call("GET", "/api/state", { cookie: sb.leadership })).json.sessions.find((x) => x.session_id === "w-agent-1");
  check("W5 another repo's token can't capture onto this repo's session (-> 403, session unchanged)", oOnto.status === 403 && JSON.stringify(w1Post) === JSON.stringify(w1Pre), `${oOnto.status}`);
  const oPoll = await call("GET", "/api/directives?session=claude-code:w-agent-1", { headers: other });
  const oAck = await call("POST", "/api/directives/ack", { body: { session: "claude-code:w-agent-1", event_id: wAfter[0]?.event_id }, headers: other });
  const [ownMap, oMap] = [await mcpCall(wTok, "align_get_work_map"), await mcpCall(oMint.json?.token, "align_get_work_map")];
  const badPoll = await call("GET", "/api/directives?session=claude-code:w-agent-1", { headers: { authorization: `Bearer ${wTok.slice(0, -2)}xx` } });
  check(
    "M3 another harness/repo's token: poll 403, ack 403, its work map omits the session (its own token's shows it); a bad agent token on directives -> 401",
    oMint.status === 200 && oPoll.status === 403 && oAck.status === 403 && JSON.stringify(ownMap.result ?? {}).includes("w-agent-1") && !JSON.stringify(oMap.result ?? {}).includes("w-agent-1") && badPoll.status === 401,
    `${oMint.status} ${oPoll.status} ${oAck.status} own=${JSON.stringify(ownMap.result ?? {}).includes("w-agent-1")} other=${JSON.stringify(oMap.result ?? {}).includes("w-agent-1")} ${badPoll.status}`,
  );
  // W6 / H1: leadership disconnects the agent in the product; every agent token stops and the repo's consent and
  // captured sessions go. Product can't disconnect.
  const dProduct = await call("DELETE", "/api/workspaces/agent-token", { cookie: sb.product, body: { harness: "claude-code", repo: W_REPO } });
  const dLead = await call("DELETE", "/api/workspaces/agent-token", { cookie: sb.leadership, body: { harness: "claude-code", repo: W_REPO } });
  const [rvCap, rvMcp, rvPoll, rvOther] = [await ev("w-agent-9", "Bash"), await mcpCall(wTok, "align_list_goals"), await call("GET", "/api/directives?session=claude-code:w-agent-1", { headers: bearer }), await call("GET", "/api/directives?session=codex:x", { headers: other })];
  const bAfterD = (await call("GET", "/api/state", { cookie: sb.leadership })).json;
  check(
    "W6 leadership disconnects (product 403): capture, MCP and directives -> 401 for every agent token; the repo's consent and sessions are removed",
    dProduct.status === 403 && dLead.status === 200 && dLead.json?.removed_consents === 1 && dLead.json?.purged_sessions >= 1 && rvCap.status === 401 && rvMcp.status === 401 && rvPoll.status === 401 && rvOther.status === 401 && !bAfterD.sessions.some((x) => x.repo === W_REPO),
    `${dProduct.status} ${dLead.status} ${dLead.text} ${rvCap.status} ${rvMcp.status} ${rvPoll.status} ${rvOther.status}`,
  );
  // Sean's #6 review fix 5: the watcher (the agent's wake-up hook) with a refused token says so on one stderr line and
  // exits 1, instead of polling the 401 silently until its window ends.
  const watch = spawnSync("node", ["scripts/align-watch.mjs"], {
    cwd: ROOT, encoding: "utf8", timeout: 15000, input: JSON.stringify({ session_id: "w-agent-1", cwd: ROOT }),
    env: { ...process.env, ALIGN_URL: BASE, ALIGN_CAPTURE: "1", ALIGN_AGENT_TOKEN: wTok, ALIGN_WATCH_WINDOW_MS: "60000" },
  });
  const watchLines = (watch.stderr ?? "").trim().split("\n").filter(Boolean);
  check(
    "W6 the watcher with a revoked token exits 1 at once with one stderr line naming the 401",
    watch.status === 1 && watchLines.length === 1 && /refused this session's token \(401\)/.test(watchLines[0]),
    `status=${watch.status} signal=${watch.signal} stderr=${JSON.stringify(watch.stderr)}`,
  );
  // H1: Restart revokes agents. A token that captured before Restart is refused after it, and must be minted again.
  const rMint = await call("POST", "/api/workspaces/agent-token", { cookie: sb.leadership, body: { harness: "claude-code", repo: W_REPO } });
  const rAuth = { authorization: `Bearer ${rMint.json?.token}` };
  const capBefore = await ev("w-agent-10", "Bash", rAuth);
  const restartB = await call("POST", "/api/reset", { cookie: sb.leadership, body: { confirm: "reset" } });
  const capAfter = await ev("w-agent-11", "Bash", rAuth);
  check("H1 Restart revokes agents: a token that captured before Restart -> 401 after", rMint.status === 200 && capBefore.status === 200 && restartB.status === 200 && capAfter.status === 401, `${rMint.status} ${capBefore.status} ${restartB.status} ${capAfter.status}`);
  // M5: Restart is limited per workspace (10 a minute), so a loop can't churn the audit archive
  const loop = [];
  for (let i = 0; i < 11; i++) loop.push((await call("POST", "/api/reset", { cookie: sb.leadership, body: { confirm: "reset" } })).status);
  check("M5 a Restart loop is limited: 429 within 11 more in a minute, never more than 10 accepted", loop.includes(429) && loop.filter((x) => x === 200).length <= 9 && loop.every((x) => x === 200 || x === 429), loop.join(","));

  // ---- Sean #6 low (e): disconnecting agents fails closed, and is rate limited (on workspace A) ----
  const eRepo = "le-repo";
  const eMint = await call("POST", "/api/workspaces/agent-token", { cookie: sa.leadership, body: { harness: "claude-code", repo: eRepo } });
  const eAuth = { authorization: `Bearer ${eMint.json?.token}` };
  const eCap = (sid) => call("POST", "/api/sessions/events", { body: { harness: "claude-code", session_id: sid, hook_event: "PostToolUse", repo: eRepo, cwd: eRepo, tool_name: "Bash" }, headers: eAuth });
  if (process.platform === "darwin") {
    // Make the epoch bump fail (auth.json can't be replaced); the state file stays writable.
    const authFile = path.join(wsRoot, a, "auth.json");
    spawnSync("chflags", ["uchg", authFile]);
    const eFail = await call("DELETE", "/api/workspaces/agent-token", { cookie: sa.leadership, body: {} });
    spawnSync("chflags", ["nouchg", authFile]);
    for (const f of readdirSync(path.join(wsRoot, a))) if (/^auth\.json\..+\.tmp$/.test(f)) rmSync(path.join(wsRoot, a, f), { force: true });
    const [mcpAfterFail, capAfterFail] = [await mcpCall(eMint.json?.token, "align_list_goals"), await eCap("le-agent-1")];
    check(
      "LE1 a disconnect whose revoke fails changes nothing: the token and its consent both still work (never a live token with its consent gone)",
      eMint.status === 200 && eFail.status >= 500 && mcpAfterFail.status === 200 && capAfterFail.status === 200,
      `mint=${eMint.status} delete=${eFail.status} mcp=${mcpAfterFail.status} capture=${capAfterFail.status}`,
    );
    // Restart has the same two writes (rebuilt state drops consents; the epoch bump revokes tokens): a Restart whose
    // revoke fails must change nothing either.
    spawnSync("chflags", ["uchg", authFile]);
    const rFail = await call("POST", "/api/reset", { cookie: sa.leadership, body: { confirm: "reset" } });
    spawnSync("chflags", ["nouchg", authFile]);
    for (const f of readdirSync(path.join(wsRoot, a))) if (/^auth\.json\..+\.tmp$/.test(f)) rmSync(path.join(wsRoot, a, f), { force: true });
    const [mcpAfterReset, capAfterReset] = [await mcpCall(eMint.json?.token, "align_list_goals"), await eCap("le-agent-3")];
    check(
      "LE4 a Restart whose revoke fails changes nothing: the token and its consent both still work (never a live token with its consent gone)",
      rFail.status >= 500 && mcpAfterReset.status === 200 && capAfterReset.status === 200,
      `reset=${rFail.status} mcp=${mcpAfterReset.status} capture=${capAfterReset.status}`,
    );
  } else check("LE1 and LE4 skipped: need chflags (macOS) to make the epoch bump fail", true);
  const eOk = await call("DELETE", "/api/workspaces/agent-token", { cookie: sa.leadership, body: {} });
  const [mcpAfterOk, capAfterOk] = [await mcpCall(eMint.json?.token, "align_list_goals"), await eCap("le-agent-2")];
  check("LE2 a successful disconnect revokes the token (MCP and capture -> 401)", eOk.status === 200 && mcpAfterOk.status === 401 && capAfterOk.status === 401, `${eOk.status} ${mcpAfterOk.status} ${capAfterOk.status}`);
  const eLoop = [];
  for (let i = 0; i < 11; i++) eLoop.push((await call("DELETE", "/api/workspaces/agent-token", { cookie: sa.leadership, body: {} })).status);
  check("LE3 a disconnect loop is limited: 429 within 11 more in a minute, never more than 10 accepted", eLoop.includes(429) && eLoop.filter((x) => x === 200).length <= 9 && eLoop.every((x) => x === 200 || x === 429), eLoop.join(","));

  // ---- spec section 11 tests 9, 18, 20 ----
  // 9: a Northstar leadership token can't export, rotate or delete a workspace, and data/ doesn't change. Those
  // operations aren't routes in this build (ws-admin.mjs deletes on the host), so every call must fail closed.
  const dataBefore9 = treeHash(dataDir) + treeHash(path.join(ROOT, "data"));
  const t9 = await Promise.all([
    call("GET", `/api/workspaces/${b}/export`, { cookie: nsR.leadership }),
    call("POST", `/api/workspaces/${b}/rotate`, { cookie: nsR.leadership, body: {} }),
    call("DELETE", `/api/workspaces/${b}`, { cookie: nsR.leadership }),
    call("POST", `/api/workspaces/${b}/delete`, { cookie: nsR.leadership, body: {} }),
  ]);
  check("S9 Northstar leadership: export, rotate and delete of a workspace all fail (no such routes -> exactly 404), data/ unchanged", t9.every((r) => r.status === 404) && treeHash(dataDir) + treeHash(path.join(ROOT, "data")) === dataBefore9, t9.map((r) => r.status).join(","));

  // 18: at the size cap a growing write is 413 and changes nothing (no archive rows either); below it, a write
  // with a long audit log trims it to 1000 rows and archives the rest.
  const C = await create(marked("CMARK"));
  const c = C.json.workspace.id;
  const sc = await signIn(c, C.json.passcodes);
  const fileC = path.join(wsRoot, c, "state.json");
  const archiveC = path.join(wsRoot, c, "audit-archive.jsonl");
  const baseC = JSON.parse(readFileSync(fileC, "utf8"));
  const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `a-old-${i}`, actor: "leadership", session_id: "old", action: "old_row", target: "x", at: new Date(Date.now() - 1e6 + i).toISOString() }));
  const big = structuredClone(baseC);
  big.goals[0].objective = "x".repeat(1_100_000);
  big.audit = rows;
  writeFileSync(fileC, JSON.stringify(big), { mode: 0o600 });
  const bigHash = fileHash(fileC);
  const grow = await call("POST", "/api/proposals", { cookie: sc.product, body: { proposed_measure_text: "CMARK grow", rationale: "r", reciprocal_commitment: "c" } });
  check("S18 at the size cap a growing write -> 413, state unchanged, no audit rows archived", grow.status === 413 && fileHash(fileC) === bigHash && !existsSync(archiveC), `${grow.status} ${grow.text.slice(0, 120)} archive=${existsSync(archiveC)}`);
  const trim = structuredClone(baseC);
  trim.audit = rows;
  writeFileSync(fileC, JSON.stringify(trim), { mode: 0o600 });
  const tw = await call("POST", "/api/proposals", { cookie: sc.product, body: { proposed_measure_text: "CMARK trimmed", rationale: "r", reciprocal_commitment: "c" } });
  const afterTrim = JSON.parse(readFileSync(fileC, "utf8"));
  const archived = existsSync(archiveC) ? readFileSync(archiveC, "utf8").trim().split("\n").length : 0;
  check("S18 below the cap a write with 1500 audit rows succeeds: 1000 kept (newest), 501 archived", tw.status === 200 && afterTrim.audit.length === 1000 && afterTrim.audit.at(-1).action === "propose" && archived === 501, `${tw.status} kept=${afterTrim.audit.length} archived=${archived}`);
  // M5: the archive is bounded: past 1 MB it rotates to audit-archive.1.jsonl (one previous file kept)
  writeFileSync(archiveC, `${JSON.stringify({ id: "pad", pad: "p".repeat(1024 * 1024) })}\n`, { mode: 0o600 });
  const trim2 = JSON.parse(readFileSync(fileC, "utf8"));
  trim2.audit = rows;
  trim2.proposals = []; // no open proposal, so the write below is accepted (and trims)
  writeFileSync(fileC, JSON.stringify(trim2), { mode: 0o600 });
  const tw2 = await call("POST", "/api/proposals", { cookie: sc.product, body: { proposed_measure_text: "CMARK rotated", rationale: "r", reciprocal_commitment: "c" } });
  const rotated = path.join(wsRoot, c, "audit-archive.1.jsonl");
  check("M5 an archive past 1 MB rotates: audit-archive.1.jsonl holds the old file, the new archive is small", tw2.status === 200 && existsSync(rotated) && statSync(rotated).size > 1024 * 1024 && existsSync(archiveC) && statSync(archiveC).size < 512 * 1024, `${tw2.status} ${tw2.text.slice(0, 120)} rotated=${existsSync(rotated)} new=${existsSync(archiveC) ? statSync(archiveC).size : "none"}`);

  // 20: a Northstar state.json from before L0 (850971e's fixture, as its first run wrote it) loads unchanged
  const nsNow = readFileSync(NS_STATE, "utf8");
  const old = spawnSync("git", ["show", "850971e:data/fixture.json"], { cwd: ROOT, encoding: "utf8" });
  writeFileSync(NS_STATE, old.stdout);
  const oldHash = fileHash(NS_STATE);
  const pol = await call("GET", "/api/policy/security"); // a pure read
  const unchanged = fileHash(NS_STATE) === oldHash;
  const oldGoals = await call("GET", "/api/state", { cookie: nsR.leadership }); // may ingest evidence, so after the hash
  check("S20 an 850971e Northstar state.json loads: a pure read leaves it byte-identical; the plan and goals read from it", old.status === 0 && pol.status === 200 && pol.json?.plan === "p-throughput@1" && unchanged && oldGoals.status === 200 && (oldGoals.json?.goals ?? []).some((g) => g.id === "g-security-v1"), `${old.status} ${pol.status} ${pol.json?.plan} unchanged=${unchanged} ${oldGoals.status}`);
  writeFileSync(NS_STATE, nsNow);

  // A10 corrupt state
  const fileA = path.join(wsRoot, a, "state.json");
  writeFileSync(fileA, readFileSync(fileA, "utf8").slice(0, 200));
  const corruptHash = fileHash(fileA);
  const r10 = await call("GET", "/api/state", { cookie: sa.product });
  check("A10 corrupt state.json -> 500, file unchanged, no Northstar content", r10.status === 500 && fileHash(fileA) === corruptHash && !r10.text.includes("Northstar"), `${r10.status} ${r10.text}`);

  // A3 replay after an epoch bump
  const authB = path.join(wsRoot, b, "auth.json");
  const au = JSON.parse(readFileSync(authB, "utf8"));
  writeFileSync(authB, JSON.stringify({ ...au, epoch: au.epoch + 1 }), { mode: 0o600 });
  await new Promise((r) => setTimeout(r, 50));
  const r3b = await call("POST", "/api/timer", { cookie: sb.product, body: { action: "brief_reviewed" } });
  check("A3 replay after an epoch bump -> 401 Session ended", r3b.status === 401 && r3b.json?.error === ENDED, `${r3b.status} ${r3b.text}`);
  writeFileSync(authB, JSON.stringify(au), { mode: 0o600 });

  // A8 a deleted workspace: tokens fail, nothing recreated, B and Northstar untouched.
  // (DELETE /api/workspace is outside the cut; this removes A the way deleteWorkspace does: rename aside, then remove.)
  const bBefore8 = treeHash(path.join(wsRoot, b));
  const nsBefore8 = fileHash(NS_STATE);
  renameSync(path.join(wsRoot, a), path.join(wsRoot, `.deleting-${a}`));
  rmSync(path.join(wsRoot, `.deleting-${a}`), { recursive: true, force: true });
  const [d1, d2, d3] = await Promise.all([
    call("POST", "/api/timer", { cookie: sa.product, body: { action: "brief_reviewed" } }),
    call("GET", "/api/state", { cookie: sa.product }),
    call("GET", `/api/workspaces/${a}/login-info`),
  ]);
  check("A8 deleted workspace: its tokens get 401 Session ended, login-info 404", d1.status === 401 && d2.status === 401 && d3.status === 404, `${d1.status} ${d2.status} ${d3.status}`);
  check("A8 deleted workspace is not recreated", !existsSync(path.join(wsRoot, a)), "directory came back");
  check("A8 B and Northstar byte-identical", treeHash(path.join(wsRoot, b)) === bBefore8 && fileHash(NS_STATE) === nsBefore8, "changed");

  // A12 static check
  const awareFiles = ["session", "state", "reset", "timer", "proposals"].map((d) => `app/api/${d}/route.ts`).concat(["acknowledge", "counter", "reject", "accept"].map((a) => `app/api/proposals/[id]/${a}/route.ts`));
  const offenders = awareFiles.filter((f) => /import\s*\{[^}]*\b(mutate|readState)\b[^}]*\}\s*from\s*["']@\/lib\/store["']/.test(readFileSync(path.join(ROOT, f), "utf8")));
  check("A12 workspace-aware routes do not import mutate or readState from lib/store", offenders.length === 0, offenders.join(" "));

  // ======== phase hosted ========
  await stopServer();
  const hostedDir = path.join(tmpRoot, "hosted");
  const INVITES = ["hosted-invite-0001", "hosted-invite-0002", "hosted-invite-0003", "hosted-invite-0004"];
  const good = {
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "t".repeat(48),
    ALIGN_DATA_DIR: hostedDir,
    ALIGN_SIGNUP_CODES: INVITES.join(","),
    ALIGN_DELETE_BY: "2026-11-06",
    ALIGN_PRODUCT_PASSCODE: "product-strong-pass-1",
    ALIGN_SECURITY_PASSCODE: "security-strong-pass-1",
    ALIGN_LEADERSHIP_PASSCODE: "leadership-strong-pass-1",
  };
  // H1 every startup refusal (lib/config.ts hostedProblems), each on its own production server.
  const refusals = [
    ["default passcodes", { ALIGN_PRODUCT_PASSCODE: undefined, ALIGN_SECURITY_PASSCODE: undefined, ALIGN_LEADERSHIP_PASSCODE: undefined }, "non-default passcode"],
    ["one default passcode", { ALIGN_SECURITY_PASSCODE: "security-demo" }, "ALIGN_SECURITY_PASSCODE must be set to a non-default"],
    ["a short passcode", { ALIGN_LEADERSHIP_PASSCODE: "short-pass" }, "ALIGN_LEADERSHIP_PASSCODE must be 12+"],
    ["no ALIGN_HOSTS", { ALIGN_HOSTS: undefined }, "ALIGN_HOSTS must list"],
    ["a loopback host", { ALIGN_HOSTS: `${HOSTED_HOST},localhost` }, "must not include loopback"],
    ["a short secret", { ALIGN_SECRET: "s".repeat(20) }, "ALIGN_SECRET must be set"],
    ["a relative data dir", { ALIGN_DATA_DIR: "data/hosted" }, "absolute path"],
    ["a data dir inside the app", { ALIGN_DATA_DIR: path.join(ROOT, "data", "hosted-inside") }, "outside the app directory"],
    ["no invite codes", { ALIGN_SIGNUP_CODES: undefined }, "ALIGN_SIGNUP_CODES must list"],
    ["a short invite code", { ALIGN_SIGNUP_CODES: "short-code,hosted-invite-0009" }, "every code must be 12+"],
    ["a shared signup code", { ALIGN_SIGNUP_CODE: "shared-signup-code-1" }, "one shared code"],
    ["open create", { ALIGN_ALLOW_OPEN_CREATE: "1" }, "ALIGN_ALLOW_OPEN_CREATE is not allowed"],
    ["a create rate", { ALIGN_CREATE_PER_HOUR: "50" }, "ALIGN_CREATE_PER_HOUR is not allowed"],
    ["Northstar public", { ALIGN_NORTHSTAR_PUBLIC: "1" }, "Northstar is off when hosted"],
    ["no deletion date", { ALIGN_DELETE_BY: undefined }, "ALIGN_DELETE_BY must be a date"],
    ["a bad deletion date", { ALIGN_DELETE_BY: "Nov 6" }, "ALIGN_DELETE_BY must be a date"],
    ["an AI key", { AI_GATEWAY_API_KEY: "sk-test" }, "AI_GATEWAY_API_KEY"],
    ["capture on", { ALIGN_CAPTURE: "1" }, "ALIGN_CAPTURE must be off"],
    ["public mode", { ALIGN_PUBLIC: "1" }, "Public mode is not supported"],
  ];
  for (const [what, delta, needle] of refusals) {
    const env = { ...good, ...delta };
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    const r = await startServer(env);
    // Refused means the process exited, or stayed up answering only 503: never "no answer within 90 s".
    check(`H1 HOSTED=1 refuses to serve with ${what}`, !r.started && (r.exited || r.last === 503) && r.stderr.includes(needle), r.started ? "it started" : `exited=${r.exited} last=${r.last} ${r.stderr.slice(-300)}`);
    await stopServer();
  }
  // P1 item 5: the deletion day itself is still served (it closes at the end of that day, Pacific), so a test running
  // on the last day isn't cut off. Today's UTC date has always not yet ended by that rule.
  const today = new Date().toISOString().slice(0, 10);
  const onTheDay = await startServer({ ...good, ALIGN_DELETE_BY: today });
  check(`P1-5 a hosted server with ALIGN_DELETE_BY = today (${today}) still serves until that day ends`, onTheDay.started, `exited=${onTheDay.exited} last=${onTheDay.last} ${onTheDay.stderr.slice(-200)}`);
  await stopServer();
  // ---- Sean #6 low (f): startup removes atomic-write temp files a crash left behind, in the root and in workspaces ----
  const fRoot = path.join(good.ALIGN_DATA_DIR, "workspaces");
  const fWs = path.join(fRoot, "w_ffffffffffff");
  mkdirSync(fWs, { recursive: true });
  const fLeft = [path.join(fWs, "auth.json.0a1b2c3d4e5f.tmp"), path.join(fWs, "state.json.1b4e28ba-2fa1-11d2-883f-0016d3cca427.tmp"), path.join(fRoot, "_used_invites.json.0a1b2c3d4e5f.tmp")];
  for (const f of fLeft) writeFileSync(f, "{}");
  const fKeep = path.join(fWs, "notes.tmp"); // not an atomic-write temp file: left alone
  writeFileSync(fKeep, "keep");
  await mustStart(good);
  check("LF1 startup removes auth.json.<hex>.tmp, state.json.<uuid>.tmp and _used_invites.json.<hex>.tmp; other files stay", fLeft.every((f) => !existsSync(f)) && existsSync(fKeep), fLeft.filter(existsSync).join(" "));
  rmSync(fWs, { recursive: true, force: true });

  // H2 the host, scheme and proxy rules
  const hLoop = await call("GET", "/api/workspaces/config");
  const hOther = await withHost("GET", "/api/workspaces/config", "evil.example");
  check("H2 a non-allowlisted Host is refused (loopback and a foreign name -> 421)", hLoop.status === 421 && hOther.status === 421, `${hLoop.status} ${hOther.status}`);
  const hHttp = await hosted("GET", "/api/workspaces/config", { headers: { "x-forwarded-proto": "http" } });
  check("H2 plain http behind the proxy -> 403", hHttp.status === 403, `${hHttp.status}`);
  const hNoEdge = await hosted("GET", "/api/workspaces/config", { headers: { "fly-client-ip": undefined } });
  check("H2 a request that did not come through Fly's edge (no Fly-Client-IP) -> 403", hNoEdge.status === 403, `${hNoEdge.status}`);
  const hNew = await hosted("GET", "/new");
  const hCfg = await hosted("GET", "/api/workspaces/config");
  check("H2 /new answers; config states the test server and its deletion date", hNew.status === 200 && hCfg.json?.test_server?.delete_by === "2026-11-06", `${hNew.status} ${hCfg.text}`);

  // ---- Sean #6 low (d): the test-server notice is in the server-rendered HTML and on the max-reached screen ----
  // The founder's notice (10-22): the date reads "November 6, 2026" (no weekday), in the notice's last paragraph.
  const LONG_DELETE = new Date(Date.parse("2026-11-06T00:00:00Z")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const NOTICE_FIRST = "Liminal Align is an early-testing product running on a test server.";
  const visibleHtml = hNew.text.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  check("LD1 /new's server HTML (no JS, before the config fetch) carries the notice once, with the deletion date", visibleHtml.split(NOTICE_FIRST).length === 2 && visibleHtml.includes(`deleted by ${LONG_DELETE}. You can request earlier deletion.`), visibleHtml.slice(0, 300));
  {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check", `--host-resolver-rules=MAP ${HOSTED_HOST} 127.0.0.1`] });
    try {
      const page = await browser.newPage();
      // As Fly's edge would forward it; the config answer is replaced to reach the max-reached screen.
      await page.setExtraHTTPHeaders({ "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.77" });
      await page.setRequestInterception(true);
      page.on("request", (r) =>
        new URL(r.url()).pathname === "/api/workspaces/config"
          ? r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ signup_code_required: true, max_reached: true, test_server: { delete_by: "2026-11-06" } }) })
          : r.continue(),
      );
      await page.goto(`http://${HOSTED_HOST}:${PORT}/new`, { waitUntil: "networkidle0" });
      const text = await page.evaluate(() => document.body.innerText);
      check("LD2 the max-reached screen also shows the test-server notice, once", /as many workspaces as it allows/.test(text) && text.split(NOTICE_FIRST).length === 2 && text.includes(`deleted by ${LONG_DELETE}. You can request earlier deletion.`), text.slice(0, 300));
    } finally {
      await browser.close();
    }
  }

  // H8 Northstar is off: its pages go to /new, its sign-in and data are 404, and no Northstar token counts
  const toNew = await Promise.all(["/", "/setup"].map((p) => hosted("GET", p)));
  check("H8 / and /setup redirect to /new", toNew.every((r) => r.status === 307 && r.headers?.location === `https://${HOSTED_HOST}/new`), toNew.map((r) => `${r.status} ${r.headers?.location}`).join(" | "));
  const nsIn = await hosted("POST", "/api/session", { body: { role: "product", passcode: good.ALIGN_PRODUCT_PASSCODE } });
  const nsDefault = await hosted("POST", "/api/session", { body: { role: "product", passcode: "product-demo" } });
  check("H8 Northstar sign-in -> 404, with its own or the default passcode, and no cookie", nsIn.status === 404 && nsDefault.status === 404 && !nsIn.setCookie, `${nsIn.status} ${nsDefault.status}`);
  const nsToken = `__Host-${forge({ actor: "leadership", sid: "forged01" }, good.ALIGN_SECRET)}`;
  const [ftState, ftProp, ftSession] = await Promise.all([
    hosted("GET", "/api/state", { cookie: nsToken }),
    hosted("POST", "/api/proposals", { cookie: nsToken, body: { proposed_measure_text: "x", reciprocal_commitment: "y" } }),
    hosted("GET", "/api/session", { cookie: nsToken }),
  ]);
  check("H8 a Northstar token signed with the hosted secret is no session (state 404, write 401, session null)", ftState.status === 404 && ftProp.status === 401 && ftSession.json?.actor === null, `${ftState.status} ${ftProp.status} ${ftSession.text}`);

  // H6 the allowlist, against every route in the app: anything not a tester route is 404 for GET and POST
  const routes = [];
  (function walk(dir, url) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const seg = e.name.replace(/^\[.*\]$/, "x");
      if (e.isDirectory()) walk(path.join(dir, e.name), `${url}/${seg}`);
      else if (/^(route|page)\.tsx?$/.test(e.name)) routes.push(url || "/");
    }
  })(path.join(ROOT, "app"), "");
  const TESTER = [/^\/new$/, /^\/w\/x$/, /^\/api\/workspaces$/, /^\/api\/workspaces\/config$/, /^\/api\/workspaces\/x\/login-info$/, /^\/api\/session$/, /^\/api\/state$/, /^\/api\/timer$/, /^\/api\/reset$/, /^\/api\/proposals$/, /^\/api\/proposals\/x\/(?:accept|acknowledge|counter|launch|reject)$/,
    // Connected AI apps (proxy.ts, founder ruling 10-26): OAuth-only MCP, the OAuth server, the connected-apps list. scripts/test-oauth.mjs covers them.
    /^\/api\/mcp$/, /^\/\.well-known\/oauth-protected-resource(?:\/api\/mcp)?$/, /^\/\.well-known\/oauth-authorization-server$/, /^\/oauth\/(?:authorize|token|register)$/, /^\/api\/oauth\/approve$/, /^\/api\/workspaces\/connections$/];
  const shut = routes.filter((r) => !TESTER.some((t) => t.test(r)) && !["/", "/setup"].includes(r));
  const probes = await Promise.all(shut.flatMap((r) => [hosted("GET", r), hosted("POST", r, { body: {} })]).map((x) => x.then((y) => y.status)));
  const open = shut.filter((_, i) => probes[2 * i] !== 404 || probes[2 * i + 1] !== 404);
  check(`H6 all ${shut.length} non-tester routes (Northstar, capture, evidence, agent routes) -> 404 for GET and POST`, shut.length >= 15 && open.length === 0, `open: ${open.join(" ")} (of ${routes.length} routes)`);

  // H3 creation: single-use invites, the wrong-code limit
  const hOpen = await hosted("POST", "/api/workspaces", { body: FIXTURE });
  check("H3 hosted create needs an invite code (open create is off)", hOpen.status === 403, `${hOpen.status} ${hOpen.text}`);
  const hA = await hosted("POST", "/api/workspaces", { body: { ...marked("HAMARK"), signup_code: INVITES[0] }, headers: { origin: `https://${HOSTED_HOST}` } });
  const hB = await hosted("POST", "/api/workspaces", { body: { ...marked("HBMARK"), signup_code: INVITES[1] } });
  check("H3 hosted create with an invite code and same-site Origin -> 201", hA.status === 201 && hB.status === 201, `${hA.status} ${hB.status} ${hA.text.slice(0, 200)}`);
  const hPages = [hNew, await hosted("GET", `/w/${hA.json?.workspace?.id}`)];
  check("NS1 hosted: server HTML for /new and /w/<id> carries the noscript notice", hPages.every((r) => r.status === 200 && noscriptIn(r.text)), hPages.map((r) => `${r.status} ${noscriptIn(r.text)}`).join(" "));
  const reuse = await hosted("POST", "/api/workspaces", { body: { ...FIXTURE, signup_code: INVITES[0] } });
  check("H3 an invite code works once (reuse -> 403 already used)", reuse.status === 403 && /already used/.test(reuse.text), `${reuse.status} ${reuse.text}`);
  const usedFileText = readFileSync(path.join(hostedDir, "workspaces", "_used_invites.json"), "utf8");
  check("H3 used invites are stored as hashes, never the codes", !INVITES.some((c) => usedFileText.includes(c)) && JSON.parse(usedFileText).length === 2, usedFileText.slice(0, 200));
  const hForeign = await hosted("POST", "/api/workspaces", { body: { ...FIXTURE, signup_code: INVITES[2] }, headers: { origin: "https://evil.example" } });
  check("H3 foreign Origin -> 403 (and the invite is not spent)", hForeign.status === 403 && JSON.parse(readFileSync(path.join(hostedDir, "workspaces", "_used_invites.json"), "utf8")).length === 2, `${hForeign.status}`);
  const guess = [];
  for (let i = 0; i < 11; i++) guess.push((await hosted("POST", "/api/workspaces", { body: { ...FIXTURE, signup_code: `wrong-code-${i}-xxxx` }, headers: { "fly-client-ip": "203.0.113.50" } })).status);
  const otherClient = await hosted("POST", "/api/workspaces", { body: { ...marked("HCMARK"), signup_code: INVITES[2] }, headers: { "fly-client-ip": "198.51.100.60" } });
  check("H3 wrong codes: 10 refused (403), then 429 for that client; another client still creates", guess.slice(0, 10).every((x) => x === 403) && guess[10] === 429 && otherClient.status === 201, `${guess.join(",")} other=${otherClient.status}`);

  // ---- Sean #6 low (a): an IPv4-mapped Fly-Client-IP is its IPv4 client, not one shared ::ffff:0:0/64 bucket ----
  const wrongFrom = async (ip, i) => (await hosted("POST", "/api/workspaces", { body: { ...FIXTURE, signup_code: `wrong-mapped-${i}-xxxx` }, headers: { "fly-client-ip": ip } })).status;
  const mappedLimited = [await wrongFrom("::ffff:203.0.113.50", 0), await wrongFrom("::ffff:cb00:7132", 1)];
  check("LA1 the IPv4-mapped forms of a limited IPv4 client are that client (dotted and hex -> 429)", mappedLimited.every((x) => x === 429), mappedLimited.join(","));
  const mappedA = [];
  for (let i = 0; i < 10; i++) mappedA.push(await wrongFrom("::ffff:192.0.2.10", 10 + i));
  const mappedB = await wrongFrom("::ffff:192.0.2.11", 30);
  check("LA2 10 wrong codes from ::ffff:192.0.2.10 don't limit ::ffff:192.0.2.11 (a different IPv4 client -> 403, not 429)", mappedA.every((x) => x === 403) && mappedB === 403, `${mappedA.join(",")} other=${mappedB}`);
  const v6a = [];
  for (let i = 0; i < 10; i++) v6a.push(await wrongFrom("2001:db8:aa:1::1", 40 + i));
  const v6Same64 = await wrongFrom("2001:db8:aa:1:ffff::9", 50);
  check("LA3 IPv6 still keys by /64: another address in the same /64 is limited (429)", v6a.every((x) => x === 403) && v6Same64 === 429, `${v6a.join(",")} same64=${v6Same64}`);

  // ---- Sean #6 low (c): the hosted invite refusal ("invite code") gets the form's field-level hint ----
  check("LC2 the /new form recognises the hosted invite refusal (wrong or spent) as a code-field error", reuse.status === 403 && isCodeRefusal(reuse.json?.error), reuse.text);
  check("LC3 'creation is closed' is not a code-field error (no code would help)", !isCodeRefusal(CREATION_CLOSED));
  check("LC4 the /new form uses the shared matcher, not its own pattern", /isCodeRefusal\(error\)/.test(readFileSync(path.join(ROOT, "app/new/NewWorkspace.tsx"), "utf8")) && !/\/signup code\/i/.test(readFileSync(path.join(ROOT, "app/new/NewWorkspace.tsx"), "utf8")));

  // H4 the cookie
  const hl = await hosted("POST", "/api/session", { body: { workspace: hA.json.workspace.id, role: "product", passcode: hA.json.passcodes.product } });
  check("H4 workspace session cookie: __Host- name, Secure, HttpOnly, SameSite=Strict", hl.status === 200 && /^__Host-align_session=/.test(hl.setCookie) && /; Secure/.test(hl.setCookie) && /HttpOnly/.test(hl.setCookie) && /SameSite=Strict/.test(hl.setCookie), hl.setCookie);
  const plainCookie = hl.cookie.replace(/^__Host-/, "");
  const hPlain = await hosted("GET", "/api/session", { cookie: plainCookie });
  check("H4 a cookie without the __Host- prefix is not a session when hosted", hPlain.json?.actor === null, hPlain.text);

  // H5 capture
  const hCap = await hosted("POST", "/api/sessions/events", { body: { harness: "claude-code", session_id: "h-1", hook_event: "UserPromptSubmit", prompt: "x" } });
  check("H5 capture refused (/api/sessions/events -> 404)", hCap.status === 404, `${hCap.status}`);

  // H7 isolation
  const hlB = await hosted("POST", "/api/session", { body: { workspace: hB.json.workspace.id, role: "product", passcode: hB.json.passcodes.product } });
  const hsA = await hosted("GET", "/api/state", { cookie: hl.cookie });
  const hsB = await hosted("GET", "/api/state", { cookie: hlB.cookie });
  check("H7 two hosted workspaces can't see each other", hsA.status === 200 && hsB.status === 200 && hsA.text.includes("HAMARK") && !hsA.text.includes("HBMARK") && hsB.text.includes("HBMARK") && !hsB.text.includes("HAMARK"), `${hsA.status} ${hsB.status}`);
  check("H7 no Northstar content in a hosted workspace", !/Northstar|Sparta/.test(hsA.text), hsA.text.match(/Northstar|Sparta/)?.[0]);

  // HO QA-exit finding: a hosted write's Origin must be exactly https://<Host>. http:// (same name), another port and no
  // Origin are refused and change nothing; the site's own https Origin still approves.
  {
    const hId = hA.json.workspace.id;
    const hSec = await hosted("POST", "/api/session", { body: { workspace: hId, role: "security", passcode: hA.json.passcodes.security } });
    const hp = await hosted("POST", "/api/proposals", { cookie: hl.cookie, body: { proposed_measure_text: "HAMARK origin target", rationale: "HAMARK why", reciprocal_commitment: "HAMARK commit" } });
    const approve = (origin) => hosted("POST", `/api/proposals/${hp.json?.id}/accept`, { cookie: hSec.cookie, body: { rationale: "HAMARK ok", accept_untested: true }, headers: { origin } });
    const hTree = treeHash(path.join(hostedDir, "workspaces", hId));
    const refused = [];
    for (const o of [`http://${HOSTED_HOST}`, `https://${HOSTED_HOST}:8443`, undefined, "null"]) refused.push({ o, r: await approve(o) });
    const unchanged = treeHash(path.join(hostedDir, "workspaces", hId)) === hTree;
    check("HO1 setup: hosted security signed in and a proposal is open", hSec.status === 200 && hp.status === 200, `${hSec.status} ${hp.status} ${hp.text.slice(0, 120)}`);
    check(`HO1 hosted approve with Origin http://${HOSTED_HOST} -> 403, state unchanged`, refused[0].r.status === 403 && unchanged, `${refused[0].r.status} ${refused[0].r.text.slice(0, 120)} unchanged=${unchanged}`);
    check(`HO2 hosted approve with Origin https://${HOSTED_HOST}:8443 (another port), none, or "null" -> 403`, refused.slice(1).every((x) => x.r.status === 403) && unchanged, refused.map((x) => `${x.o}:${x.r.status}`).join(" "));
    const ok = await approve(`https://${HOSTED_HOST}`);
    const hState = await hosted("GET", "/api/state", { cookie: hSec.cookie });
    check(`HO3 hosted approve with Origin https://${HOSTED_HOST} -> 200, ratified`, ok.status === 200 && hState.json?.proposals?.find((x) => x.id === hp.json?.id)?.state === "RATIFIED", `${ok.status} ${ok.text.slice(0, 160)}`);
  }

  // H9 backoff is per client: an attacker's wrong tries lock out only the attacker
  const att = [];
  for (let i = 0; i < 6; i++) att.push((await hosted("POST", "/api/session", { body: { workspace: hA.json.workspace.id, role: "security", passcode: "wrong-pass" }, headers: { "fly-client-ip": "203.0.113.9" } })).status);
  const legit = await hosted("POST", "/api/session", { body: { workspace: hA.json.workspace.id, role: "security", passcode: hA.json.passcodes.security }, headers: { "fly-client-ip": "198.51.100.7" } });
  check("H9 6 wrong tries from one client -> 429 there; the right passcode from another client -> 200", att.slice(0, 5).every((x) => x === 401) && att[5] === 429 && legit.status === 200, `${att.join(",")} legit=${legit.status}`);

  // H10 a sign-in burst is bounded and doesn't stall other workspaces
  const t0 = Date.now();
  const burst = Promise.all(Array.from({ length: 24 }, (_, i) => hosted("POST", "/api/session", { body: { workspace: hB.json.workspace.id, role: "leadership", passcode: `burst-${i}-wrong` }, headers: { "fly-client-ip": `192.0.2.${i + 1}` } }).then((r) => r.status)));
  await new Promise((r) => setTimeout(r, 30));
  // M1: creating a workspace with an invite isn't starved by the burst, and the invite isn't burned
  const createDuring = hosted("POST", "/api/workspaces", { body: { ...marked("HDMARK"), signup_code: INVITES[3] }, headers: { "fly-client-ip": "198.51.100.90" } });
  const during = await hosted("GET", "/api/state", { cookie: hl.cookie });
  const readMs = Date.now() - t0;
  const bs = await burst;
  check("H10 24 parallel sign-ins: at most 10 hash (the rest 429), and another workspace still reads in under 1.5 s", bs.filter((x) => x === 429).length >= 14 && bs.every((x) => x === 401 || x === 429) && during.status === 200 && readMs < 1500, `${bs.join(",")} read=${during.status} in ${readMs} ms`);
  const cd = await createDuring;
  check("M1 a create with an invite during the sign-in burst -> 201", cd.status === 201, `${cd.status} ${cd.text.slice(0, 200)}`);

  // H11 the operator delete tool (go-C condition 4), while the server runs
  const admin = (...a) => spawnSync("node", ["scripts/ws-admin.mjs", ...a], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ALIGN_DATA_DIR: hostedDir } });
  const listed = admin("list");
  const del = admin("delete", hB.json.workspace.id);
  const afterDel = await Promise.all([hosted("GET", `/api/workspaces/${hB.json.workspace.id}/login-info`), hosted("GET", "/api/state", { cookie: hlB.cookie })]);
  const events = readFileSync(path.join(hostedDir, "workspaces", "_events.jsonl"), "utf8");
  check(
    "H11 ws-admin lists, then deletes B while serving: B 404 / Session ended, an event row, A untouched",
    listed.status === 0 && listed.stdout.includes(hB.json.workspace.id) && del.status === 0 && afterDel[0].status === 404 && afterDel[1].status === 401 &&
      events.includes(`"deleted","id":"${hB.json.workspace.id}"`) && (await hosted("GET", "/api/state", { cookie: hl.cookie })).status === 200,
    `${listed.status} ${del.status} ${del.stderr} ${afterDel.map((r) => r.status)}`,
  );
  const all = admin("delete", "--all");
  check("H11 delete --all needs --yes", all.status === 2 && existsSync(path.join(hostedDir, "workspaces", hA.json.workspace.id)), `${all.status} ${all.stderr}`);

  {
    // H12 closed mode: once ALIGN_DELETE_BY has ended the server still starts (a refused start crash-loops on Fly, and
    // then nobody can ssh in to purge), answers 410 to every request whatever its headers, and stays up through the
    // purge. Same volume as above, so A's workspace is still there to purge.
    await stopServer();
    const shut = await startServer({ ...good, ALIGN_DELETE_BY: "2020-01-01" });
    await new Promise((r) => setTimeout(r, 3000)); // a refused start would have exited by now
    const probes = await Promise.all([
      hosted("GET", "/api/workspaces/config"),
      hosted("GET", "/new"),
      hosted("GET", "/"),
      hosted("GET", "/api/state", { cookie: hl.cookie }),
      hosted("POST", "/api/session", { body: { workspace: hA.json.workspace.id, role: "leadership", passcode: hA.json.passcodes.leadership } }),
      hosted("POST", "/api/workspaces", { body: { ...marked("H12MARK"), signup_code: INVITES[2] } }),
      hosted("GET", `/api/workspaces/${hA.json.workspace.id}/login-info`),
      hosted("GET", "/api/workspaces/config", { headers: { "fly-client-ip": undefined } }),
      withHost("GET", "/api/workspaces/config", "evil.example"),
    ]);
    const codes = probes.map((r) => r.status);
    check(
      "H12 past ALIGN_DELETE_BY: the server starts closed and stays up; every request, with any headers, gets 410 and no tester data",
      shut.closed && !shut.gone() && codes.every((c) => c === 410) && probes.every((r) => !r.text.includes(hA.json.workspace.name ?? "HDMARK") && !r.text.includes("passcode")) &&
        shut.log().includes("closed, every request gets 410"),
      `closed=${shut.closed} exited=${shut.gone()} ${codes.join(",")} log=${shut.log().slice(-200)}`,
    );
    const purge = admin("delete", "--all", "--yes");
    const left = readdirSync(path.join(hostedDir, "workspaces")).filter((n) => /^(\.(tmp|deleting)-)?w_[a-z2-7]{12}$/.test(n));
    const after = await hosted("GET", "/api/workspaces/config");
    check(
      "H12 the purge (ws-admin delete --all --yes) succeeds on the closed server: no workspace left, a deleted row each, still up and 410",
      purge.status === 0 && purge.stdout.includes(`deleted ${hA.json.workspace.id}`) && left.length === 0 && !shut.gone() && after.status === 410 &&
        readFileSync(path.join(hostedDir, "workspaces", "_events.jsonl"), "utf8").includes(`"deleted","id":"${hA.json.workspace.id}"`),
      `${purge.status} ${purge.stdout} ${purge.stderr} left=${left} exited=${shut.gone()} ${after.status}`,
    );
  }
} catch (e) {
  check("tenancy run", false, e?.stack ?? e);
} finally {
  await stopServer();
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
