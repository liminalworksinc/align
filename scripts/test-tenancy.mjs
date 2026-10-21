#!/usr/bin/env node
// Multi-workspace tenancy tests (spec rev 2 section 11, groups A to C, Mode L). Starts its own dev servers on <port>,
// one per config phase, with custom workspaces in a temp ALIGN_DATA_DIR. Northstar stays in ./data, as in test-all.
// Usage: node scripts/test-tenancy.mjs <port>   (from a worktree root; refuses 3100 and a busy port)
//   phase "closed": no create config            -> creation closed
//   phase "code":   signup code, cap 3          -> wrong code, cap race
//   phase "open":   open create (serve.sh mode) -> everything else, plus the Northstar snapshot with workspaces on disk
//   phase "hosted": HOSTED=1 refusals at startup, then a valid hosted config (Host align.test, X-Forwarded-Proto https)

import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.argv[2]);
if (!Number.isInteger(PORT) || PORT === 3100) {
  console.error("usage: node scripts/test-tenancy.mjs <port> (not 3100)");
  process.exit(2);
}
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "data/scenarios/example-custom.json"), "utf8"));
delete FIXTURE.confirm;
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
    const h = { host: HOSTED_HOST, "x-forwarded-proto": "https", ...headers };
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
        resolve({ status: res.statusCode, text: t, json, setCookie: sc.join("\n"), cookie: (sc[0] || "").split(";")[0] });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const HOSTED_HOST = "align.test";

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
  server = spawn("npx", ["next", "dev", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "ignore", "pipe"], detached: true });
  let exited = false;
  let stderr = "";
  server.stderr.on("data", (c) => (stderr += c));
  server.on("exit", () => (exited = true));
  for (let i = 0; i < 90 && !exited; i++) {
    try {
      // Hosted servers answer only for their allowlisted Host over (forwarded) https.
      const r = env.HOSTED === "1" ? await hosted("GET", "/api/workspaces/config") : await fetch(`${BASE}/api/workspaces/config`);
      if (r.status === 200) return { started: true, stderr };
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { started: false, stderr };
}
async function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  spawnSync("pkill", ["-f", `next dev -H 127.0.0.1 -p ${PORT}`]);
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
  await call("POST", `/api/timer?workspace=${b}`, { cookie: sa.product, body: { action: "brief_reviewed", workspace: b }, headers: { "x-align-workspace": b } });
  check("A2 workspace in body/query/header ignored: B untouched", treeHash(path.join(wsRoot, b)) === nB0, "B changed");
  const meA = await call("GET", `/api/session?workspace=${b}`, { cookie: sa.product });
  check("A2 GET /api/session reports A", meA.json?.workspace === a, meA.text);
  const info = await call("GET", `/api/workspaces/${b}/login-info`);
  const leads = [FIXTURE.leadership.lead, FIXTURE.asking.lead, FIXTURE.owning.lead];
  check("A2 login-info for B: names only, no person names, no plan text", info.status === 200 && info.text.includes("BMARK") && !leads.some((l) => info.text.includes(l)) && !info.text.includes(FIXTURE.plan.text.slice(0, 30)), info.text);

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
  const c6 = await call("POST", `/api/proposals/${pid}/counter`, { cookie: sa.security, body: { proposed_measure_text: "AMARK revised", rationale: "AMARK r", changes_plan: false } });
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
  const p6b = await call("POST", "/api/proposals", { cookie: sa.product, body: { proposed_measure_text: "AMARK second", rationale: "r", reciprocal_commitment: "c" } });
  const rj = await call("POST", `/api/proposals/${p6b.json?.id}/reject`, { cookie: sa.security, body: {} });
  check("A6 custom reject -> 200", rj.status === 200, `${rj.status} ${rj.text.slice(0, 200)}`);
  check("A6 Northstar files byte-identical after the custom flow", fileHash(NS_STATE) === ns6, `changed keys: ${changedKeys(ns6Text, readFileSync(NS_STATE, "utf8"))}`);
  const ns = await northstarSignIn();
  const bTree6 = treeHash(path.join(wsRoot, a));
  await call("POST", "/api/timer", { cookie: ns.product, body: { action: "brief_reviewed" } });
  await call("POST", "/api/proposals", { cookie: ns.product, body: { plan_id: "p-beta", plan_version: 1, simulation_refs: [], proposed_measure_text: "NS", rationale: "NS", reciprocal_commitment: "NS" } });
  check("A6 Northstar actions leave A's files byte-identical", treeHash(path.join(wsRoot, a)) === bTree6, "A changed");

  // A7 parallel writes
  const actions = ["ceo_change_viewed", "brief_reviewed", "scenario_reviewed", "evidence_opened"];
  await Promise.all([
    ...Array.from({ length: 20 }, (_, i) => call("POST", "/api/timer", { cookie: [sa.product, sa.security][i % 2], body: { action: actions[i % 4] } })),
    ...Array.from({ length: 20 }, (_, i) => call("POST", "/api/timer", { cookie: [sb.product, sb.security][i % 2], body: { action: actions[i % 4] } })),
  ]);
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
  const good = {
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "t".repeat(48),
    ALIGN_DATA_DIR: hostedDir,
    ALIGN_SIGNUP_CODE: "hosted-signup-code-1",
    ALIGN_PRODUCT_PASSCODE: "product-strong-pass-1",
    ALIGN_SECURITY_PASSCODE: "security-strong-pass-1",
    ALIGN_LEADERSHIP_PASSCODE: "leadership-strong-pass-1",
  };
  const refusals = [
    ["default passcodes", { ALIGN_PRODUCT_PASSCODE: undefined, ALIGN_SECURITY_PASSCODE: undefined, ALIGN_LEADERSHIP_PASSCODE: undefined }, "non-default passcode"],
    ["no ALIGN_HOSTS", { ALIGN_HOSTS: undefined }, "ALIGN_HOSTS"],
    ["an AI key", { AI_GATEWAY_API_KEY: "sk-test" }, "AI_GATEWAY_API_KEY"],
  ];
  for (const [what, delta, needle] of refusals) {
    const env = { ...good, ...delta };
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    const r = await startServer(env);
    check(`H1 HOSTED=1 refuses to start with ${what}`, !r.started && r.stderr.includes(needle), r.started ? "it started" : r.stderr.slice(-300));
    await stopServer();
  }
  await mustStart(good);
  const hLoop = await call("GET", "/api/workspaces/config");
  const hOther = await withHost("GET", "/api/workspaces/config", "evil.example");
  check("H2 a non-allowlisted Host is refused (loopback and a foreign name -> 421)", hLoop.status === 421 && hOther.status === 421, `${hLoop.status} ${hOther.status}`);
  // The hosted app must answer on its own (allowlisted) name, pages included, and refuse every other name.
  const hPage = await hosted("GET", "/");
  const hSignIn = await hosted("POST", "/api/session", { body: { role: "product", passcode: good.ALIGN_PRODUCT_PASSCODE } });
  const hPageOther = await withHost("GET", "/", "evil.example");
  const hSignInOther = await withHost("POST", "/api/session", "evil.example", { role: "product", passcode: good.ALIGN_PRODUCT_PASSCODE });
  check("H2 allowlisted Host: GET / and POST /api/session -> 200", hPage.status === 200 && hSignIn.status === 200, `${hPage.status} ${hSignIn.status}`);
  check("H2 non-allowlisted Host: GET / and POST /api/session -> 421, no cookie", hPageOther.status === 421 && hSignInOther.status === 421 && !hSignInOther.setCookie, `${hPageOther.status} ${hSignInOther.status}`);
  const hHttp = await hosted("GET", "/api/workspaces/config", { headers: { "x-forwarded-proto": "http" } });
  check("H2 plain http behind the proxy -> 403", hHttp.status === 403, `${hHttp.status}`);
  const hOpen = await hosted("POST", "/api/workspaces", { body: FIXTURE });
  check("H3 hosted create needs the signup code (open create is off)", hOpen.status === 403, `${hOpen.status} ${hOpen.text}`);
  const hA = await hosted("POST", "/api/workspaces", { body: { ...marked("HAMARK"), signup_code: good.ALIGN_SIGNUP_CODE }, headers: { origin: `https://${HOSTED_HOST}` } });
  const hB = await hosted("POST", "/api/workspaces", { body: { ...marked("HBMARK"), signup_code: good.ALIGN_SIGNUP_CODE } });
  check("H3 hosted create with the signup code and same-site Origin -> 201", hA.status === 201 && hB.status === 201, `${hA.status} ${hB.status} ${hA.text.slice(0, 200)}`);
  const hForeign = await hosted("POST", "/api/workspaces", { body: { ...FIXTURE, signup_code: good.ALIGN_SIGNUP_CODE }, headers: { origin: "https://evil.example" } });
  check("H3 foreign Origin -> 403", hForeign.status === 403, `${hForeign.status}`);
  const hl = await hosted("POST", "/api/session", { body: { workspace: hA.json.workspace.id, role: "product", passcode: hA.json.passcodes.product } });
  check("H4 workspace session cookie: __Host- name, Secure, HttpOnly, SameSite=Strict", hl.status === 200 && /^__Host-align_session=/.test(hl.setCookie) && /; Secure/.test(hl.setCookie) && /HttpOnly/.test(hl.setCookie) && /SameSite=Strict/.test(hl.setCookie), hl.setCookie);
  const nsDefault = await hosted("POST", "/api/session", { body: { role: "product", passcode: "product-demo" } });
  check("H4 the default Northstar passcode does not sign in", nsDefault.status === 401, `${nsDefault.status}`);
  const plainCookie = hl.cookie.replace(/^__Host-/, "");
  const hPlain = await hosted("GET", "/api/session", { cookie: plainCookie });
  check("H4 a cookie without the __Host- prefix is not a session when hosted", hPlain.json?.actor === null, hPlain.text);
  const hCap = await hosted("POST", "/api/sessions/events", { body: { harness: "claude-code", session_id: "h-1", hook_event: "UserPromptSubmit", prompt: "x" } });
  check("H5 capture refused (/api/sessions/events -> 404)", hCap.status === 404, `${hCap.status}`);
  const hNs = await Promise.all(["/api/state", "/api/sessions", "/api/simulations", "/api/mappings", "/api/policy/security", "/api/directives?session=*"].map((p) => hosted("GET", p)));
  check("H6 Northstar is not served anonymously (state, sessions, simulations, mappings, policy, directives -> 404)", hNs.every((r) => r.status === 404), hNs.map((r) => r.status).join(","));
  const hlB = await hosted("POST", "/api/session", { body: { workspace: hB.json.workspace.id, role: "product", passcode: hB.json.passcodes.product } });
  const hsA = await hosted("GET", "/api/state", { cookie: hl.cookie });
  const hsB = await hosted("GET", "/api/state", { cookie: hlB.cookie });
  check("H7 two hosted workspaces can't see each other", hsA.status === 200 && hsB.status === 200 && hsA.text.includes("HAMARK") && !hsA.text.includes("HBMARK") && hsB.text.includes("HBMARK") && !hsB.text.includes("HAMARK"), `${hsA.status} ${hsB.status}`);
  check("H7 no Northstar content in a hosted workspace", !/Northstar|Sparta/.test(hsA.text), hsA.text.match(/Northstar|Sparta/)?.[0]);
} catch (e) {
  check("tenancy run", false, e?.stack ?? e);
} finally {
  await stopServer();
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
