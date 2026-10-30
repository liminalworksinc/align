#!/usr/bin/env node
// Goal sessions hosted-server tests (docs/v2/WIRE.md). Builds once, then starts its own production servers (next start)
// on <port> with a temp ALIGN_DATA_DIR, one per phase:
//   off     ALIGN_GOAL_SESSIONS unset                          -> every /app and /api/v2 path is 404, no v2 database
//   on      ALIGN_GOAL_SESSIONS=1 ALIGN_GOAL_SESSIONS_TEST_IDP=1 (Mode L) -> identity, RBAC, devices, sessions, usage, spend, directives,
//                                                      directive cursor, receipts, alignments, stop sharing, delete, web UI
//   hosted  HOSTED=1 ALIGN_GOAL_SESSIONS=1                      -> startup refusals for v2 settings, then the v2 routes behind
//                                                      the hosted host/https/edge checks
// Usage: node scripts/test-v2.mjs <port>   (from a worktree root; refuses 3100, the main checkout and a busy port)

import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.argv[2]);
if (!Number.isInteger(PORT) || PORT === 3100) {
  console.error("usage: node scripts/test-v2.mjs <port> (not 3100)");
  process.exit(2);
}
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
if (path.resolve(ROOT) === path.join(os.homedir(), "liminal/align")) {
  console.error(`test-v2: refusing the main checkout ${ROOT}; run from a worktree`);
  process.exit(2);
}
if (spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]).status === 0) {
  console.error(`test-v2: port ${PORT} is already in use`);
  process.exit(2);
}
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const NS_STATE = path.join(ROOT, "data/state.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${String(detail).slice(0, 400)}`}`);
}

// ---- HTTP: every response is kept per caller, so the private-goal canary can be checked across all of them ----
const seen = []; // { who, text }
async function call(who, method, p, { body, raw, cookie, bearer, headers = {} } = {}) {
  const h = { ...headers };
  if ((body !== undefined || raw !== undefined) && !h["content-type"]) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  if (bearer) h.authorization = `Bearer ${bearer}`;
  const res = await fetch(BASE + p, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  seen.push({ who, text, p });
  return { status: res.status, json, text, headers: res.headers, setCookies: res.headers.getSetCookie?.() ?? [] };
}

const HOSTED_HOST = "align.test";
function hosted(method, p, { body, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { host: HOSTED_HOST, "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.7", ...headers };
    for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
    if (data) Object.assign(h, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
    if (cookie) h.cookie = cookie;
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path: p, headers: h }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(t);
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text: t, json });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---- servers ----
let server = null;
const CLEAN_KEYS = ["AI_GATEWAY_API_KEY", "ALIGN_CAPTURE", "ALIGN_SECRET", "ALIGN_URL", "ALIGN_MCP_URL", "ALIGN_ALLOW_OPEN_CREATE", "ALIGN_SIGNUP_CODE", "ALIGN_SIGNUP_CODES", "ALIGN_MAX_WORKSPACES", "ALIGN_CREATE_PER_HOUR", "ALIGN_DATA_DIR", "ALIGN_PUBLIC", "HOSTED", "ALIGN_HOSTS", "ALIGN_NORTHSTAR_PUBLIC", "ALIGN_PRODUCT_PASSCODE", "ALIGN_SECURITY_PASSCODE", "ALIGN_LEADERSHIP_PASSCODE", "ALIGN_DELETE_BY", "ALIGN_GOAL_SESSIONS", "ALIGN_GOAL_SESSIONS_TEST_IDP", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "ALIGN_PUBLIC_ORIGIN"];
async function startServer(env) {
  rmSync(NS_STATE, { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
  const clean = { ...process.env };
  for (const k of CLEAN_KEYS) delete clean[k];
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "ignore", "pipe"], detached: true });
  let exited = false;
  let stderr = "";
  server.stderr.on("data", (c) => (stderr += c));
  server.on("exit", () => (exited = true));
  let last = 0;
  for (let i = 0; i < 90 && !exited; i++) {
    try {
      const r = env.HOSTED === "1" ? await hosted("GET", "/api/workspaces/config") : await fetch(`${BASE}/api/workspaces/config`);
      last = r.status;
      if (r.status === 200) return { started: true, stderr: () => stderr, exited, last };
      if (r.status === 503) break;
    } catch {}
    await sleep(1000);
  }
  return { started: false, stderr: () => stderr, exited, last };
}
async function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  spawnSync("pkill", ["-f", `next start -H 127.0.0.1 -p ${PORT}`]);
  server = null;
  await sleep(2500);
  rmSync(NS_STATE, { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
}
async function mustStart(env) {
  const r = await startServer(env);
  if (!r.started) throw new Error(`server did not start: ${r.stderr().slice(-600)}`);
  return r;
}
process.on("exit", () => {
  if (server)
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
});

// ---- v2 routes on disk (for the flag-off walk) ----
function v2Routes() {
  const out = [];
  const walk = (dir, url) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith("_")) continue;
      const seg = e.name.replace(/^\[\.\.\..*\]$/, "x/y").replace(/^\[.*\]$/, "x");
      if (e.isDirectory()) walk(path.join(dir, e.name), `${url}/${seg}`);
      else if (/^(route|page)\.tsx?$/.test(e.name)) out.push(url);
    }
  };
  walk(path.join(ROOT, "app/app"), "/app");
  walk(path.join(ROOT, "app/api/v2"), "/api/v2");
  return out;
}

// ---- identity helpers ----
const cookieOf = (setCookies) =>
  setCookies
    .map((c) => c.split(";")[0])
    .filter((c) => !/=$/.test(c))
    .join("; ");

async function signUp(who, name, email) {
  // Better Auth wants the Origin a browser sends on these.
  const r = await call(who, "POST", "/api/v2/auth/sign-up/email", { headers: { origin: BASE }, body: { name, email, password: `pw-${who}-123456` } });
  return { status: r.status, id: r.json?.user?.id, cookie: cookieOf(r.setCookies), setCookies: r.setCookies, who, email, name };
}

let dbFile = "";
const withDb = (fn) => {
  const d = new DatabaseSync(dbFile, { timeout: 5000 });
  try {
    return fn(d);
  } finally {
    d.close();
  }
};

/** A device keypair and its HMAC secret, as the agent would keep them. */
function newDeviceKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { pub: publicKey.export({ format: "jwk" }).x, privateKey, secret: randomBytes(32) };
}
const sessionKey = (dev, ws, harness, native) => createHmac("sha256", dev.secret).update(`${ws}\0${harness}\0${native}`).digest("base64url");
const repoKey = (dev, ws, repo) => createHmac("sha256", dev.secret).update(`${ws}\0repo\0${repo}`).digest("base64url");
const reqKey = (dev, id) => createHmac("sha256", dev.secret).update(`req\0${id}`).digest("base64url");
const epochId = () => `ep_${randomBytes(18).toString("base64url")}`;
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
function refreshSig(dev, deviceId, refreshToken, ts) {
  return sign(null, Buffer.from(`align-refresh\n${deviceId}\n${sha256hex(refreshToken)}\n${ts}`, "utf8"), dev.privateKey).toString("base64url");
}

/** The whole device flow for one user, granted `wsIds`. The poll interval is skipped by clearing last_poll_at in
 *  the database (the test has file access, like a host admin), so the run doesn't wait 5 s per poll. */
async function pairDevice(who, user, wsIds, name = `${who}'s laptop`) {
  const keys = newDeviceKeys();
  const a = await call(who, "POST", "/api/v2/device/authorize", { body: { device_name: name, public_key: keys.pub } });
  if (a.status !== 200) throw new Error(`authorize ${a.status} ${a.text}`);
  const ap = await call(who, "POST", "/api/v2/device/approve", { cookie: user.cookie, body: { user_code: a.json.user_code, workspace_ids: wsIds } });
  if (ap.status !== 200) throw new Error(`approve ${ap.status} ${ap.text}`);
  const t = await call(who, "POST", "/api/v2/device/token", { body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: a.json.device_code } });
  if (t.status !== 200) throw new Error(`token ${t.status} ${t.text}`);
  return { ...keys, who, user, id: t.json.device_id, access: t.json.access_token, refresh: t.json.refresh_token };
}

const usageRow = (dev, id, epoch, extra = {}) => ({
  request_key: reqKey(dev, id),
  ts: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  epoch_id: epoch,
  model: "claude-sonnet-4-5",
  query_source: "main",
  input: 1000,
  output: 200,
  cache_read: 5000,
  cache_write_5m: 300,
  cache_write_1h: 0,
  cache_write_unsplit: 0,
  basis: "subscription_included",
  est_list_usd_micros: 12_345,
  price_table_version: "2026-10-01",
  source: "otel",
  ...extra,
});

const NUMS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "est_list_usd_micros", "unpriced_requests"];
function invariantHolds(s) {
  return NUMS.every((k) => s.total[k] === s.rows.reduce((n, r) => n + r[k], 0) + s.unallocated[k]);
}

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "align-v2-"));
const build = spawnSync("npx", ["next", "build"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HOSTED: "", ALIGN_DATA_DIR: "", ALIGN_GOAL_SESSIONS: "" } });
if (build.status !== 0) {
  console.log(`FAIL  next build\n${(build.stdout + build.stderr).slice(-1500)}`);
  process.exit(1);
}

try {
  // ======== phase off: ALIGN_GOAL_SESSIONS unset ========
  const offDir = path.join(tmpRoot, "off");
  await mustStart({ ALIGN_DATA_DIR: offDir });
  const routes = v2Routes();
  const probes = await Promise.all(routes.flatMap((r) => [call("anon", "GET", r), call("anon", "POST", r, { body: {} })]));
  const open = routes.filter((_, i) => probes[2 * i].status !== 404 || probes[2 * i + 1].status !== 404);
  check(`off: all ${routes.length} v2 paths (/app pages and /api/v2 routes) -> 404 for GET and POST`, routes.length >= 40 && open.length === 0, `open: ${open.join(" ")}`);
  const offAuth = await call("anon", "POST", "/api/v2/auth/sign-up/email", { body: { name: "x", email: "x@example.test", password: "password-123" } });
  check("off: Better Auth endpoints are 404 too", offAuth.status === 404, `${offAuth.status}`);
  check("off: no v2 database is created", !existsSync(path.join(offDir, "v2")), "data/v2 exists");
  const v1 = await call("anon", "GET", "/api/workspaces/config");
  check("off: v1 routes still answer", v1.status === 200, `${v1.status}`);
  await stopServer();

  // ======== phase on: ALIGN_GOAL_SESSIONS=1 with the test identity provider ========
  const onDir = path.join(tmpRoot, "on");
  await mustStart({ ALIGN_DATA_DIR: onDir, ALIGN_GOAL_SESSIONS: "1", ALIGN_GOAL_SESSIONS_TEST_IDP: "1" });
  dbFile = path.join(onDir, "v2", "align.sqlite");
  const mode = (p) => (statSync(p).mode & 0o777).toString(8);
  check("storage: v2 directory 0700 and database file 0600", mode(path.join(onDir, "v2")) === "700" && mode(dbFile) === "600", `${mode(path.join(onDir, "v2"))} ${mode(dbFile)}`);
  const pragmas = withDb((d) => ({ jm: d.prepare("PRAGMA journal_mode").get().journal_mode, uv: d.prepare("PRAGMA user_version").get().user_version, tables: d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name) }));
  check("storage: WAL, migrated (user_version 2), v2_ tables and Better Auth tables", pragmas.jm === "wal" && pragmas.uv === 2 && pragmas.tables.includes("v2_usage") && pragmas.tables.includes("v2_activity") && pragmas.tables.includes("v2_goal_acks") && pragmas.tables.includes("ba_user"), JSON.stringify(pragmas));

  // -- identity --
  const U1 = await signUp("U1", "Una One", "u1@example.test");
  const U2 = await signUp("U2", "Uli Two", "u2@example.test");
  const U3 = await signUp("U3", "Uma Three", "u3@example.test");
  const U4 = await signUp("U4", "Ugo Four", "u4@example.test");
  const users = [U1, U2, U3, U4];
  check("auth: test IdP sign-up for U1..U4 -> 200 with u_ ids and a session cookie", users.every((u) => u.status === 200 && /^u_[a-z2-7]{24}$/.test(u.id) && u.cookie), users.map((u) => `${u.status} ${u.id}`).join(" "));
  const cookieNames = U1.setCookies.map((c) => c.split("=")[0]);
  check("auth: the session cookie is align_v2.session_token (never v1's align_session), HttpOnly", cookieNames.includes("align_v2.session_token") && !cookieNames.some((n) => /align_session/.test(n)) && U1.setCookies.some((c) => /HttpOnly/i.test(c)), U1.setCookies.join(" | "));
  const dup = await call("U1", "POST", "/api/v2/auth/sign-up/email", { headers: { origin: BASE }, body: { name: "x", email: "u1@example.test", password: "password-123" } });
  check("auth: a second account with the same email is refused (no linking by email)", dup.status !== 200, `${dup.status}`);
  const me1 = await call("U1", "GET", "/api/v2/me", { cookie: U1.cookie });
  check("auth: GET /me with the cookie -> user, device null", me1.status === 200 && me1.json.user.id === U1.id && me1.json.device === null, me1.text);
  const noAuth = await call("anon", "GET", "/api/v2/me");
  check("auth: GET /me without credentials -> 401", noAuth.status === 401 && noAuth.json?.error === "unauthorized", noAuth.text);
  const evilSignIn = await call("anon", "POST", "/api/v2/auth/sign-in/email", { headers: { origin: "http://evil.example" }, body: { email: "u1@example.test", password: "pw-U1-123456" } });
  check("auth: sign-in from a foreign Origin is refused", evilSignIn.status === 403, `${evilSignIn.status}`);

  // -- workspaces, invites, pods --
  const wsA = await call("U1", "POST", "/api/v2/workspaces", { cookie: U1.cookie, body: { name: "Workspace A" } });
  const wsB = await call("U4", "POST", "/api/v2/workspaces", { cookie: U4.cookie, body: { name: "Workspace B" } });
  const A = wsA.json?.id;
  const B = wsB.json?.id;
  check("workspaces: create A (U1 owner) and B (U4 owner) -> 201 ws_ ids", wsA.status === 201 && wsB.status === 201 && /^ws_/.test(A) && /^ws_/.test(B), `${wsA.status} ${wsB.status}`);
  const inv = {};
  for (const [u, role] of [
    [U2, "member"],
    [U3, "member"],
    [U4, "viewer"],
  ]) {
    const r = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: u.email.toUpperCase(), role } });
    inv[u.who] = r.json?.token;
  }
  check("invites: owner creates invite links (email normalized)", Object.values(inv).every((t) => /^[A-Za-z0-9_-]{43}$/.test(t || "")), JSON.stringify(inv));
  const wrongEmail = await call("U3", "POST", `/api/v2/invites/${inv.U2}/accept`, { cookie: U3.cookie, body: {} });
  check("invites: accepting someone else's invite -> 403 email_mismatch", wrongEmail.status === 403 && wrongEmail.json?.error === "email_mismatch", wrongEmail.text);
  const acc = await Promise.all([U2, U3, U4].map((u) => call(u.who, "POST", `/api/v2/invites/${inv[u.who]}/accept`, { cookie: u.cookie, body: {} })));
  check("invites: U2, U3 join A as members, U4 as viewer", acc.every((r) => r.status === 200) && acc[2].json.role === "viewer", acc.map((r) => r.status).join(","));
  const reuse = await call("U2", "POST", `/api/v2/invites/${inv.U2}/accept`, { cookie: U2.cookie, body: {} });
  check("invites: an invite works once (reuse -> 404)", reuse.status === 404, `${reuse.status}`);
  const memberInvite = await call("U3", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U3.cookie, body: { email: "z@example.test", role: "member" } });
  check("rbac: a member creating an invite -> 403 owner_only", memberInvite.status === 403 && memberInvite.json?.error === "owner_only", memberInvite.text);
  const pod = await call("U1", "POST", `/api/v2/workspaces/${A}/pods`, { cookie: U1.cookie, body: { name: "Platform pod" } });
  const P1 = pod.json?.id;
  const addLead = await call("U1", "POST", `/api/v2/workspaces/${A}/pods/${P1}/members`, { cookie: U1.cookie, body: { user_id: U2.id, role: "lead" } });
  const leadAdds = await call("U2", "POST", `/api/v2/workspaces/${A}/pods/${P1}/members`, { cookie: U2.cookie, body: { user_id: U3.id, role: "member" } });
  const memberAdds = await call("U3", "POST", `/api/v2/workspaces/${A}/pods/${P1}/members`, { cookie: U3.cookie, body: { user_id: U4.id, role: "member" } });
  check("pods: owner creates a pod and adds a lead; the lead adds a member; a pod member can't (403 not_pod_lead)", pod.status === 201 && addLead.status === 200 && leadAdds.status === 200 && memberAdds.status === 403 && memberAdds.json?.error === "not_pod_lead", `${pod.status} ${addLead.status} ${leadAdds.status} ${memberAdds.status} ${memberAdds.text}`);

  // -- goals --
  const CANARY = `CANARY-PRIV-${randomBytes(6).toString("hex")}`;
  const mkGoal = (u, body) => call(u.who, "POST", `/api/v2/workspaces/${A}/goals`, { cookie: u.cookie, body });
  const G1 = (await mkGoal(U1, { title: "Ship onboarding v2", visibility: "workspace", measures: [{ text: "Activation rate", target: "40%" }], anchors: { repos: ["github.com/acme/web"] } })).json;
  const G2 = (await mkGoal(U2, { title: "Platform reliability", visibility: "pod", pod_id: P1, measures: [{ text: "p99 latency", target: "200ms" }] })).json;
  const GP = (await mkGoal(U2, { title: `${CANARY} secret plan`, visibility: "private", measures: [{ text: `${CANARY} measure`, target: null }] })).json;
  const G3 = (await mkGoal(U3, { title: "Docs refresh", visibility: "workspace" })).json;
  const GB = (await call("U4", "POST", `/api/v2/workspaces/${B}/goals`, { cookie: U4.cookie, body: { title: "B goal" } })).json;
  check("goals: create workspace, pod, private and B goals -> g_ ids at version 1", [G1, G2, GP, G3, GB].every((g) => /^g_/.test(g?.id) && g.version === 1), JSON.stringify([G1, G2, GP, G3, GB].map((g) => g?.id ?? g)));
  const viewerGoal = await mkGoal(U4, { title: "Viewer goal" });
  check("rbac: a viewer creating a goal -> 403 read_only", viewerGoal.status === 403 && viewerGoal.json?.error === "read_only", viewerGoal.text);
  const notInPod = await mkGoal(U1, { title: "Owner pod goal", visibility: "pod", pod_id: P1 });
  check("rbac: a pod goal from someone outside the pod (even the workspace owner) -> 403 not_in_pod", notInPod.status === 403 && notInPod.json?.error === "not_in_pod", notInPod.text);
  const feedOf = async (u) => (await call(u.who, "GET", `/api/v2/workspaces/${A}/goals`, { cookie: u.cookie })).json?.goals?.map((g) => g.id) ?? [];
  const feeds = { U1: await feedOf(U1), U2: await feedOf(U2), U3: await feedOf(U3), U4: await feedOf(U4) };
  check("visibility: the private goal is in its owner's feed only (not the workspace owner's)", feeds.U2.includes(GP.id) && !feeds.U1.includes(GP.id) && !feeds.U3.includes(GP.id) && !feeds.U4.includes(GP.id), JSON.stringify(feeds));
  check("visibility: the pod goal reaches pod members and the workspace owner, not the viewer outside the pod", feeds.U1.includes(G2.id) && feeds.U2.includes(G2.id) && feeds.U3.includes(G2.id) && !feeds.U4.includes(G2.id), JSON.stringify(feeds));
  const ownerReadsPrivate = await call("U1", "GET", `/api/v2/workspaces/${A}/goals/${GP.id}`, { cookie: U1.cookie });
  check("visibility: the workspace owner reading the private goal by id -> 404", ownerReadsPrivate.status === 404, `${ownerReadsPrivate.status}`);
  const crossGoal = await call("U1", "GET", `/api/v2/workspaces/${A}/goals/${GB.id}`, { cookie: U1.cookie });
  const crossGoal2 = await call("U4", "GET", `/api/v2/workspaces/${A}/goals/${GB.id}`, { cookie: U4.cookie });
  check("rbac: a goal id from workspace B under workspace A -> 404 (also for B's owner)", crossGoal.status === 404 && crossGoal2.status === 404, `${crossGoal.status} ${crossGoal2.status}`);
  const nonMember = await Promise.all(
    [`/api/v2/workspaces/${B}`, `/api/v2/workspaces/${B}/goals`, `/api/v2/workspaces/${B}/goals/${GB.id}`, `/api/v2/workspaces/${B}/sessions`, `/api/v2/workspaces/${B}/spend`, `/api/v2/workspaces/${B}/alignments`, `/api/v2/workspaces/${B}/invites`].map((p) => call("U1", "GET", p, { cookie: U1.cookie })),
  );
  const nonMemberW = await Promise.all(
    [
      [`/api/v2/workspaces/${B}/goals`, { title: "x" }],
      [`/api/v2/workspaces/${B}/invites`, { email: "a@b.c", role: "member" }],
      [`/api/v2/workspaces/${B}/pods`, { name: "x" }],
      [`/api/v2/workspaces/${B}/alignments`, { target_goal_id: GB.id, choice: "contribution", session_keys: [] }],
      [`/api/v2/workspaces/${B}/goals/${GB.id}/versions`, { title: "y" }],
    ].map(([p, b]) => call("U1", "POST", p, { cookie: U1.cookie, body: b })),
  );
  check("rbac: a non-member on every workspace B route (GET and POST) -> 404", [...nonMember, ...nonMemberW].every((r) => r.status === 404), [...nonMember, ...nonMemberW].map((r) => r.status).join(","));
  const notOwnerEdit = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${G1.id}/versions`, { cookie: U3.cookie, body: { title: "hijack" } });
  check("rbac: editing someone else's goal -> 403 not_goal_owner", notOwnerEdit.status === 403 && notOwnerEdit.json?.error === "not_goal_owner", notOwnerEdit.text);
  const viewerWrites = await Promise.all([
    call("U4", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U4.cookie, body: { email: "q@example.test", role: "member" } }),
    call("U4", "POST", `/api/v2/workspaces/${A}/pods`, { cookie: U4.cookie, body: { name: "x" } }),
    call("U4", "POST", `/api/v2/workspaces/${A}/alignments`, { cookie: U4.cookie, body: { target_goal_id: G1.id, choice: "contribution", session_keys: [] } }),
  ]);
  check("rbac: viewer writes (invite, pod, alignment) -> 403", viewerWrites.every((r) => r.status === 403), viewerWrites.map((r) => `${r.status}:${r.json?.error}`).join(","));
  const bearerOnWeb = await Promise.all([
    call("anon", "GET", "/api/v2/workspaces", { bearer: "alnd_x", cookie: U1.cookie }),
    call("anon", "GET", "/api/v2/auth/get-session", { bearer: "alnd_x", cookie: U1.cookie }),
    call("anon", "POST", `/api/v2/workspaces/${A}/goals`, { bearer: "alnd_x", cookie: U1.cookie, body: { title: "x" } }),
  ]);
  check("web routes refuse a Bearer token (even with a valid cookie) -> 403 bearer_not_allowed", bearerOnWeb.every((r) => r.status === 403 && r.json?.error === "bearer_not_allowed"), bearerOnWeb.map((r) => r.status).join(","));
  const crossSite = await call("U1", "POST", `/api/v2/workspaces/${A}/goals`, { cookie: U1.cookie, headers: { origin: "http://evil.example" }, body: { title: "csrf" } });
  const textPlain = await call("U1", "POST", `/api/v2/workspaces/${A}/goals`, { cookie: U1.cookie, headers: { "content-type": "text/plain" }, raw: JSON.stringify({ title: "csrf" }) });
  check("web writes: a foreign Origin -> 403 cross_site; text/plain -> 415", crossSite.status === 403 && crossSite.json?.error === "cross_site" && textPlain.status === 415, `${crossSite.status} ${textPlain.status}`);

  // exhaustive policy matrix, straight from lib/v2/policy.ts (role x pod role x visibility x ownership x action)
  const policy = await import(path.join(ROOT, "lib/v2/policy.ts"));
  let cases = 0;
  const wrong = [];
  for (const wsRole of [null, "owner", "member", "viewer"])
    for (const podRole of [null, "lead", "member"])
      for (const vis of ["private", "pod", "workspace"])
        for (const own of [true, false])
          for (const transfer of [true, false]) {
            const pp = { userId: "u_me", wsId: "ws_x", wsRole, pods: new Map(podRole ? [["pod_1", podRole]] : []) };
            const goal = { kind: "goal", ownerId: own ? "u_me" : "u_other", visibility: vis, podId: vis === "pod" ? "pod_1" : null };
            const read = policy.authorize(pp, "goal.read", goal);
            const expectRead = !!wsRole && (own || (vis === "workspace") || (vis === "pod" && (wsRole === "owner" || !!podRole)));
            const bind = policy.authorize(pp, "goal.bind", { kind: "bind", goal, hasTransfer: transfer });
            const expectBind = expectRead && wsRole !== "viewer" && (own || (vis === "pod" && !!podRole) || transfer);
            const bindStatus = !expectRead ? 404 : expectBind ? 200 : 403;
            const edit = policy.authorize(pp, "goal.edit", goal);
            const expectEdit = !expectRead ? 404 : wsRole !== "viewer" && own ? 200 : 403;
            const st = (d) => (d.ok ? 200 : d.status);
            cases += 3;
            if (read.ok !== expectRead) wrong.push(`read ${wsRole}/${podRole}/${vis}/${own}`);
            if (st(bind) !== bindStatus) wrong.push(`bind ${wsRole}/${podRole}/${vis}/${own}/${transfer}: ${st(bind)} want ${bindStatus}`);
            if (st(edit) !== expectEdit) wrong.push(`edit ${wsRole}/${podRole}/${vis}/${own}: ${st(edit)} want ${expectEdit}`);
          }
  for (const wsRole of [null, "owner", "member", "viewer"])
    for (const a of ["workspace.manage", "goal.create", "session.share", "alignment.create", "spend.read"]) {
      const d = policy.authorize({ userId: "u_me", wsId: "ws_x", wsRole, pods: new Map() }, a, a === "goal.create" ? { kind: "goal_draft", podId: null } : { kind: "workspace" });
      const want = !wsRole ? 404 : policy.WORKSPACE_ROLE_ACTIONS[wsRole].includes(a) ? 200 : 403;
      cases++;
      if ((d.ok ? 200 : d.status) !== want) wrong.push(`${a} as ${wsRole}`);
    }
  check(`policy: ${cases} role x pod role x visibility x ownership x transfer cases match the spec (private never readable by a workspace owner)`, wrong.length === 0 && cases > 400, wrong.slice(0, 5).join("; "));

  // -- device pairing --
  const k1 = newDeviceKeys();
  const auth1 = await call("D", "POST", "/api/v2/device/authorize", { body: { device_name: "Una's MacBook", public_key: k1.pub } });
  check(
    "device: authorize -> device_code (43+), user_code XXXX-XXXX, verification_uri /app/device, expires_in 600, interval 5",
    auth1.status === 200 && auth1.json.device_code.length >= 43 && /^[B-DF-HJ-NP-TV-XZ]{4}-[B-DF-HJ-NP-TV-XZ]{4}$/.test(auth1.json.user_code) && auth1.json.verification_uri === `${BASE}/app/device` && auth1.json.expires_in === 600 && auth1.json.interval === 5,
    auth1.text,
  );
  const badKey = await call("D", "POST", "/api/v2/device/authorize", { body: { device_name: "x", public_key: "AAAA" } });
  check("device: a malformed public key -> 400", badKey.status === 400, `${badKey.status}`);
  const poll = (code) => call("D", "POST", "/api/v2/device/token", { body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: code } });
  const p1 = await poll(auth1.json.device_code);
  const p2 = await poll(auth1.json.device_code);
  const interval = withDb((d) => d.prepare("SELECT interval_s FROM v2_device_requests WHERE user_code = ?").get(auth1.json.user_code).interval_s);
  check("device: first poll -> authorization_pending; an immediate second poll -> slow_down (interval now 10 s)", p1.status === 400 && p1.json.error === "authorization_pending" && p2.status === 400 && p2.json.error === "slow_down" && interval === 10, `${p1.text} ${p2.text} ${interval}`);
  const look = await call("U1", "GET", `/api/v2/device/requests/${auth1.json.user_code.toLowerCase().replace("-", " ")}`, { cookie: U1.cookie });
  const lookBad = await call("U1", "GET", `/api/v2/device/requests/BBBB-BBBB`, { cookie: U1.cookie });
  check("device: the signed-in user looks the code up (any case/spacing): device name and age; an unknown code -> 404", look.status === 200 && look.json.device_name === "Una's MacBook" && look.json.age_seconds >= 0 && lookBad.status === 404, `${look.text} ${lookBad.status}`);
  const approveB = await call("U1", "POST", "/api/v2/device/approve", { cookie: U1.cookie, body: { user_code: auth1.json.user_code, workspace_ids: [A, B] } });
  check("device: approving a workspace you are not in (B) -> 404", approveB.status === 404, `${approveB.status}`);
  const approve = await call("U1", "POST", "/api/v2/device/approve", { cookie: U1.cookie, body: { user_code: auth1.json.user_code, workspace_ids: [A] } });
  withDb((d) => d.prepare("UPDATE v2_device_requests SET last_poll_at = NULL WHERE user_code = ?").run(auth1.json.user_code));
  const tok = await poll(auth1.json.device_code);
  check("device: after approval, token -> 200 dv_ id, alnd_ access (3600 s), alnr_ refresh, user", approve.status === 200 && tok.status === 200 && /^dv_/.test(tok.json.device_id) && /^alnd_/.test(tok.json.access_token) && tok.json.expires_in === 3600 && /^alnr_/.test(tok.json.refresh_token) && tok.json.user.id === U1.id, tok.text);
  withDb((d) => d.prepare("UPDATE v2_device_requests SET last_poll_at = NULL WHERE user_code = ?").run(auth1.json.user_code));
  const tokAgain = await poll(auth1.json.device_code);
  check("device: the device code is spent after one success (second token -> 400 expired_token)", tokAgain.status === 400 && tokAgain.json.error === "expired_token", tokAgain.text);
  const stored = withDb((d) => d.prepare("SELECT token_hash FROM v2_device_tokens WHERE device_id = ?").all(tok.json.device_id).map((r) => r.token_hash));
  check("device: tokens are stored only as SHA-256 hashes", stored.length === 2 && stored.includes(sha256hex(tok.json.access_token)) && !stored.some((h) => h.includes(tok.json.access_token)), stored.join(","));
  const D1 = { ...k1, who: "U1", user: U1, id: tok.json.device_id, access: tok.json.access_token, refresh: tok.json.refresh_token };

  const kExp = newDeviceKeys();
  const authExp = await call("D", "POST", "/api/v2/device/authorize", { body: { device_name: "expiring", public_key: kExp.pub } });
  withDb((d) => d.prepare("UPDATE v2_device_requests SET expires_at = ? WHERE user_code = ?").run(new Date(Date.now() - 1000).toISOString(), authExp.json.user_code));
  const expPoll = await poll(authExp.json.device_code);
  const expLook = await call("U1", "GET", `/api/v2/device/requests/${authExp.json.user_code}`, { cookie: U1.cookie });
  check("device: an expired code -> expired_token for the agent and 404 at /app/device", expPoll.json?.error === "expired_token" && expLook.status === 404, `${expPoll.text} ${expLook.status}`);
  const kDen = newDeviceKeys();
  const authDen = await call("D", "POST", "/api/v2/device/authorize", { body: { device_name: "denied", public_key: kDen.pub } });
  const deny = await call("U1", "POST", "/api/v2/device/deny", { cookie: U1.cookie, body: { user_code: authDen.json.user_code } });
  const denPoll = await poll(authDen.json.device_code);
  check("device: a denied code -> access_denied", deny.status === 200 && denPoll.json?.error === "access_denied", `${deny.status} ${denPoll.text}`);
  const unknownCode = await poll(randomBytes(32).toString("base64url"));
  check("device: an unknown device code -> 400 invalid_grant", unknownCode.status === 400 && unknownCode.json?.error === "invalid_grant", unknownCode.text);

  const meDev = await call("U1", "GET", "/api/v2/me", { bearer: D1.access });
  check("device: GET /me with Bearer -> user, device, only the granted workspace (A)", meDev.status === 200 && meDev.json.device?.id === D1.id && meDev.json.workspaces.length === 1 && meDev.json.workspaces[0].id === A && meDev.json.workspaces[0].role === "owner", meDev.text);
  const withOrigin = await call("U1", "GET", "/api/v2/me", { bearer: D1.access, headers: { origin: BASE } });
  const withCookie = await call("U1", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D1.access, cookie: U1.cookie });
  const tokenOrigin = await call("D", "POST", "/api/v2/device/token", { headers: { origin: BASE }, body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "x".repeat(43) } });
  const authorizeCookie = await call("D", "POST", "/api/v2/device/authorize", { cookie: U1.cookie, body: { device_name: "x", public_key: k1.pub } });
  check(
    "device routes refuse any Origin header (browser) and any Cookie header -> 403",
    withOrigin.status === 403 && withOrigin.json?.error === "browser_not_allowed" && withCookie.status === 403 && withCookie.json?.error === "cookies_not_allowed" && tokenOrigin.status === 403 && authorizeCookie.status === 403,
    `${withOrigin.status} ${withCookie.status} ${tokenOrigin.status} ${authorizeCookie.status}`,
  );
  const badBearer = await call("U1", "GET", "/api/v2/directives", { bearer: "alnd_notatoken_notatoken_xx" });
  check("device: an unknown access token -> 401 invalid_token", badBearer.status === 401 && badBearer.json?.error === "invalid_token", badBearer.text);

  // refresh: signature, rotation, reuse
  const ts = new Date().toISOString();
  const badSig = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: D1.id, refresh_token: D1.refresh, ts, sig: refreshSig(kExp, D1.id, D1.refresh, ts) } });
  const stillOk = await call("U1", "GET", "/api/v2/me", { bearer: D1.access });
  check("refresh: a signature from another key -> 401 invalid_grant, and the device keeps working", badSig.status === 401 && badSig.json?.error === "invalid_grant" && stillOk.status === 200, `${badSig.text} ${stillOk.status}`);
  const oldTs = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const stale = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: D1.id, refresh_token: D1.refresh, ts: oldTs, sig: refreshSig(D1, D1.id, D1.refresh, oldTs) } });
  const tamper = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: D1.id, refresh_token: D1.refresh, ts, sig: refreshSig(D1, D1.id, D1.refresh, new Date(Date.now() + 1000).toISOString()) } });
  check("refresh: ts outside +-5 min -> 401; a signature over a different message -> 401", stale.status === 401 && tamper.status === 401, `${stale.status} ${tamper.status}`);
  const r1 = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: D1.id, refresh_token: D1.refresh, ts, sig: refreshSig(D1, D1.id, D1.refresh, ts) } });
  check("refresh: a valid signature -> 200 new access and a rotated refresh token", r1.status === 200 && /^alnd_/.test(r1.json.access_token) && r1.json.refresh_token !== D1.refresh && r1.json.expires_in === 3600, r1.text);
  const ts2 = new Date().toISOString();
  const r2 = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: D1.id, refresh_token: r1.json.refresh_token, ts: ts2, sig: refreshSig(D1, D1.id, r1.json.refresh_token, ts2) } });
  check("refresh: the rotated token refreshes again", r2.status === 200, r2.text);
  // A dedicated device for the reuse test, so D1 stays usable.
  const DR = await pairDevice("U1", U1, [A], "reuse test");
  const ts3 = new Date().toISOString();
  const rr1 = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: DR.id, refresh_token: DR.refresh, ts: ts3, sig: refreshSig(DR, DR.id, DR.refresh, ts3) } });
  const rrReuse = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: DR.id, refresh_token: DR.refresh, ts: ts3, sig: refreshSig(DR, DR.id, DR.refresh, ts3) } });
  const afterReuse = await call("U1", "GET", "/api/v2/me", { bearer: rr1.json?.access_token });
  const newRefreshDead = await call("D", "POST", "/api/v2/device/refresh", { body: { device_id: DR.id, refresh_token: rr1.json?.refresh_token, ts: ts3, sig: refreshSig(DR, DR.id, rr1.json?.refresh_token ?? "", ts3) } });
  const drRow = withDb((d) => d.prepare("SELECT revoked_at, revoked_reason FROM v2_devices WHERE id = ?").get(DR.id));
  check(
    "refresh: reusing an old refresh token revokes the device (new access 401, new refresh 401, revoked_reason refresh_reuse)",
    rr1.status === 200 && rrReuse.status === 401 && afterReuse.status === 401 && newRefreshDead.status === 401 && drRow.revoked_at && drRow.revoked_reason === "refresh_reuse",
    `${rr1.status} ${rrReuse.status} ${afterReuse.status} ${newRefreshDead.status} ${JSON.stringify(drRow)}`,
  );
  D1.access = r2.json.access_token;
  D1.refresh = r2.json.refresh_token;

  const D2 = await pairDevice("U2", U2, [A]);
  const D3 = await pairDevice("U3", U3, [A]);
  const D4 = await pairDevice("U4", U4, [A, B]);
  const DL = await pairDevice("U3", U3, [A], "logout test");
  const logout = await call("U3", "DELETE", "/api/v2/devices/self", { bearer: DL.access });
  const afterLogout = await call("U3", "GET", "/api/v2/me", { bearer: DL.access });
  check("device: DELETE /devices/self -> 204, then its token is 401", logout.status === 204 && afterLogout.status === 401, `${logout.status} ${afterLogout.status}`);
  const devList = await call("U3", "GET", "/api/v2/devices", { cookie: U3.cookie });
  const otherRevoke = await call("U1", "DELETE", `/api/v2/devices/${D3.id}`, { cookie: U1.cookie });
  check("device: the web lists my devices; revoking another user's device -> 404", devList.status === 200 && devList.json.devices.length === 2 && otherRevoke.status === 404, `${devList.status} ${otherRevoke.status}`);
  const d4OnA = await call("U4", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D4.access });
  const d1OnB = await call("U1", "GET", `/api/v2/workspaces/${B}/goals`, { bearer: D1.access });
  check("device grants: a device sees granted workspaces only (B is 404 for U1's device)", d4OnA.status === 200 && d1OnB.status === 404, `${d4OnA.status} ${d1OnB.status}`);

  // -- goals feed: ETag / 304 / bindable --
  const f1 = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access });
  const etag = f1.headers.get("etag");
  const f2 = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access, headers: { "if-none-match": etag } });
  const bind = Object.fromEntries((f1.json?.goals ?? []).map((g) => [g.id, g.bindable]));
  check("feed: ETag matches the version; If-None-Match -> 304 with no body", f1.status === 200 && etag === `"${f1.json.version}"` && f2.status === 304 && f2.text === "", `${f1.status} ${etag} ${f2.status}`);
  check("feed: bindable = own goal or pod goal (U3: G3 yes, G2 yes via pod, G1 no)", bind[G3.id] === true && bind[G2.id] === true && bind[G1.id] === false && !(GP.id in bind), JSON.stringify(bind));
  const f1Goal = f1.json.goals.find((g) => g.id === G1.id);
  check("feed: a Goal carries id, version, title, measures (id, text, target), status, visibility, owner, pod, anchors", f1Goal && f1Goal.measures[0].id && f1Goal.measures[0].target === "40%" && f1Goal.owner.id === U1.id && f1Goal.pod === null && f1Goal.anchors.repos[0] === "github.com/acme/web" && Array.isArray(f1Goal.anchors.issues), JSON.stringify(f1Goal));

  // -- sessions, epochs, usage --
  const T0 = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const at = (min) => new Date(Date.parse(T0) + min * 60 * 1000).toISOString();
  const S3a = sessionKey(D3, A, "claude-code", "native-3a");
  const S3b = sessionKey(D3, A, "codex", "native-3b");
  const S2a = sessionKey(D2, A, "claude-code", "native-2a");
  const S1a = sessionKey(D1, A, "claude-code", "native-1a");
  const put = (dev, key, extra = {}) =>
    call(dev.who, "PUT", `/api/v2/workspaces/${A}/sessions/${key}`, { bearer: dev.access, body: { harness: key === S3b ? "codex" : "claude-code", repo_key: repoKey(dev, A, `/src/${dev.who}`), repo_alias: `${dev.who}-repo`, started_at: T0, title: `${dev.who} session`, ...extra } });
  const ps = await put(D3, S3a);
  const psAgain = await put(D3, S3a, { title: "renamed" });
  check("sessions: PUT shares a session -> 200 shared, no epoch yet; PUT again updates it", S3a.length === 43 && ps.status === 200 && ps.json.state === "shared" && ps.json.current_epoch === null && psAgain.status === 200, `${ps.text} ${psAgain.status}`);
  const stolen = await put(D2, S3a);
  check("sessions: a key owned by another user/device -> 404", stolen.status === 404, `${stolen.status}`);
  const viewerShare = await put(D4, sessionKey(D4, A, "claude-code", "v"));
  check("rbac: a viewer's device sharing a session -> 403 read_only", viewerShare.status === 403 && viewerShare.json?.error === "read_only", viewerShare.text);
  await put(D3, S3b);
  await put(D2, S2a);
  await put(D1, S1a);
  const epoch = (dev, key, body) => call(dev.who, "POST", `/api/v2/workspaces/${A}/sessions/${key}/epochs`, { bearer: dev.access, body: { root_turn: null, cause: "manual", ...body } });
  const E1 = epochId();
  const E2 = epochId();
  const needAl = await epoch(D3, S3a, { epoch_id: E1, goal_id: G1.id, starts_at: T0 });
  check("epochs: binding to a goal that isn't yours or your pod's -> 403 alignment_required", needAl.status === 403 && needAl.json?.error === "alignment_required", needAl.text);
  const privBind = await epoch(D3, S3a, { epoch_id: E1, goal_id: GP.id, starts_at: T0 });
  check("epochs: binding to someone's private goal -> 404", privBind.status === 404, `${privBind.status}`);
  const e1 = await epoch(D3, S3a, { epoch_id: E1, goal_id: G3.id, starts_at: T0 });
  const e1Again = await epoch(D3, S3a, { epoch_id: E1, goal_id: G3.id, starts_at: T0 });
  const e1Conflict = await epoch(D3, S3a, { epoch_id: E1, goal_id: G2.id, starts_at: T0 });
  check("epochs: a first epoch may start at the session's start; the same epoch again is idempotent; same id with other values -> 409", e1.status === 200 && e1.json.starts_at === T0 && e1.json.ends_at === null && e1.json.goal_version_at_start === 1 && e1Again.status === 200 && e1Conflict.status === 409, `${e1.text} ${e1Again.status} ${e1Conflict.status}`);
  const e2 = await epoch(D3, S3a, { epoch_id: E2, goal_id: G2.id, starts_at: at(60), root_turn: "turn-7" });
  const e1Row = withDb((d) => d.prepare("SELECT ends_at FROM v2_epochs WHERE epoch_id = ?").get(E1));
  check("epochs: a pod goal binds; opening it closes the previous epoch at its start", e2.status === 200 && e1Row.ends_at === at(60), `${e2.text} ${JSON.stringify(e1Row)}`);
  const overlap = await epoch(D3, S3a, { epoch_id: epochId(), goal_id: G3.id, starts_at: at(30) });
  const early = await epoch(D3, S3b, { epoch_id: epochId(), goal_id: G3.id, starts_at: new Date(Date.parse(T0) - 60000).toISOString() });
  const badCause = await epoch(D3, S3b, { epoch_id: epochId(), goal_id: G3.id, starts_at: T0, cause: "directive:dir_aaaaaaaaaaaaaaaaaaaaaaaa" });
  check("epochs: overlapping an earlier epoch -> 409 epoch_overlap; before the session started -> 400; an unknown directive cause -> 400", overlap.status === 409 && overlap.json?.error === "epoch_overlap" && early.status === 400 && badCause.status === 400, `${overlap.status} ${early.status} ${badCause.status}`);
  const E3b = epochId();
  await epoch(D3, S3b, { epoch_id: E3b, goal_id: null, starts_at: T0 });
  const E2a = epochId();
  const priv = await epoch(D2, S2a, { epoch_id: E2a, goal_id: GP.id, starts_at: T0 });
  const E1a = epochId();
  const own1 = await epoch(D1, S1a, { epoch_id: E1a, goal_id: G1.id, starts_at: T0 });
  check("epochs: an unbound epoch (goal null) and the owner's own private goal bind", priv.status === 200 && own1.status === 200, `${priv.text} ${own1.text}`);

  const upload = (dev, key, rows, extra = {}) => call(dev.who, "POST", `/api/v2/workspaces/${A}/sessions/${key}/usage`, { bearer: dev.access, body: { rows }, ...extra });
  const rowsA = [usageRow(D3, "r1", E1), usageRow(D3, "r2", E1, { basis: "api_usd" }), usageRow(D3, "r3", E1, { est_list_usd_micros: null, model: "mystery-model" }), usageRow(D3, "r4", E2, { query_source: "subagent" })];
  const u1 = await upload(D3, S3a, rowsA);
  const u2 = await upload(D3, S3a, rowsA);
  const u3 = await upload(D3, S3a, [{ ...rowsA[0], output: 999 }]);
  const kept = withDb((d) => d.prepare("SELECT output FROM v2_usage WHERE request_key = ?").get(rowsA[0].request_key).output);
  check("usage: a batch -> accepted 4; the same batch -> duplicates 4; same key with other values -> conflict, never overwritten", u1.json?.accepted === 4 && u2.json?.duplicates === 4 && u2.json.accepted === 0 && u3.json?.conflicts === 1 && kept === 200, `${u1.text} ${u2.text} ${u3.text} ${kept}`);
  const u4 = await upload(D3, S3a, [usageRow(D3, "r5", E3b), usageRow(D3, "r6", epochId())]);
  check("usage: a row whose epoch belongs to another session, or is unknown -> rejected per row as conflicts", u4.json?.accepted === 0 && u4.json.conflicts === 2, u4.text);
  await upload(D3, S3b, [usageRow(D3, "b1", E3b), usageRow(D3, "b2", E3b, { basis: "workspace_credits" })]);
  await upload(D2, S2a, [usageRow(D2, "p1", E2a, { input: 7777 })]);
  await upload(D1, S1a, [usageRow(D1, "o1", E1a, { basis: "estimated_list_usd" })]);
  const tooMany = await upload(D3, S3a, Array.from({ length: 501 }, (_, i) => usageRow(D3, `m${i}`, E1)));
  const tooBig = await call("U3", "POST", `/api/v2/workspaces/${A}/sessions/${S3a}/usage`, { bearer: D3.access, raw: JSON.stringify({ rows: [], pad: "x".repeat(260 * 1024) }) });
  const malformed = await upload(D3, S3a, [{ ...usageRow(D3, "bad", E1), input: -1 }]);
  check("usage: 501 rows -> 413; over 256 KB -> 413; a malformed row -> 400", tooMany.status === 413 && tooBig.status === 413 && malformed.status === 400, `${tooMany.status} ${tooBig.status} ${malformed.status}`);
  const otherUpload = await upload(D2, S3a, [usageRow(D2, "x", E1)]);
  check("usage: uploading to another user's session -> 404", otherUpload.status === 404, `${otherUpload.status}`);

  // -- spend --
  const spendOf = async (u, by) => (await call(u.who, "GET", `/api/v2/workspaces/${A}/spend?by=${by}`, { cookie: u.cookie })).json;
  const sp = {};
  for (const u of users) for (const by of ["goal", "pod", "session"]) sp[`${u.who}:${by}`] = await spendOf(u, by);
  check("spend: total = sum of rows + unallocated, for every number, for U1..U4 by goal, pod and session", Object.values(sp).every((s) => s && invariantHolds(s)), Object.entries(sp).filter(([, s]) => !s || !invariantHolds(s)).map(([k]) => k).join(" "));
  const g1 = sp["U1:goal"];
  check("spend: 8 requests in total; 2 unallocated; 1 unpriced; basis sums present", g1.total.requests === 8 && g1.unallocated.requests === 2 && g1.unpriced_requests === 1 && g1.total.by_basis.subscription_included.requests >= 4 && g1.total.by_basis.api_usd.requests === 1, JSON.stringify(g1.total).slice(0, 300));
  const privRowU1 = g1.rows.find((r) => r.kind === "private");
  const privRowU2 = sp["U2:goal"].rows.find((r) => r.goal?.id === GP.id);
  check("spend: the private goal's usage is an unnamed private row for others (workspace owner included) and named for its owner", privRowU1 && privRowU1.input === 7777 && !privRowU1.goal && privRowU2 && privRowU2.input === 7777, JSON.stringify(g1.rows.map((r) => r.label)));
  const sessRows = sp["U3:session"].rows;
  check("spend: by session names only the caller's own sessions; everyone else's is one row", sessRows.some((r) => r.kind === "session") && sessRows.filter((r) => r.kind === "others").length === 1 && !sessRows.some((r) => r.kind === "session" && r.label.startsWith("U1")), JSON.stringify(sessRows.map((r) => r.label)));
  const viewerSpend = sp["U4:goal"];
  check("spend: a viewer may read spend; the pod goal it can't see is in the private row", viewerSpend.rows.some((r) => r.kind === "private") && !viewerSpend.rows.some((r) => r.goal?.id === G2.id), JSON.stringify(viewerSpend.rows.map((r) => r.label)));
  const ranged = (await call("U1", "GET", `/api/v2/workspaces/${A}/spend?by=goal&from=${encodeURIComponent(new Date().toISOString())}`, { cookie: U1.cookie })).json;
  check("spend: from/to filter by request time", ranged.total.requests === 0 && invariantHolds(ranged), JSON.stringify(ranged.total).slice(0, 100));

  // -- directives --
  const dirs = async (dev, cursor = 0) => (await call(dev.who, "GET", `/api/v2/directives?cursor=${cursor}`, { bearer: dev.access })).json;
  const before3 = await dirs(D3);
  const v2G2 = await call("U2", "POST", `/api/v2/workspaces/${A}/goals/${G2.id}/versions`, { cookie: U2.cookie, body: { version: 1, title: "Platform reliability (p99)" } });
  const after3 = await dirs(D3, before3.next_cursor);
  const gv = after3.directives.find((d) => d.kind === "goal_version");
  check("directives: a new goal version -> 201 version 2, and a goal_version directive for the session bound to it", v2G2.status === 201 && v2G2.json.version === 2 && gv && gv.session_keys.length === 1 && gv.session_keys[0] === S3a && gv.goal.version === 2 && gv.goal.title === "Platform reliability (p99)" && /^dir_/.test(gv.id) && gv.ws === A && gv.binding === null, JSON.stringify(after3));
  const dirRow = withDb((d) => d.prepare("SELECT d.created_at AS dc, g.updated_at AS gu FROM v2_directives d JOIN v2_goals g ON g.id = d.goal_id WHERE d.id = ?").get(gv?.id ?? ""));
  check("directives: the directive row was written in the goal version's transaction (same timestamp)", dirRow && dirRow.dc >= dirRow.gu, JSON.stringify(dirRow));
  const d2dirs = await dirs(D2);
  check("directives: other devices don't get directives for sessions that aren't theirs", !d2dirs.directives.some((d) => d.id === gv?.id), JSON.stringify(d2dirs.directives.map((d) => d.kind)));
  const staleVersion = await call("U2", "POST", `/api/v2/workspaces/${A}/goals/${G2.id}/versions`, { cookie: U2.cookie, body: { version: 1, title: "again" } });
  check("goals: a version based on an old version -> 409 stale_version", staleVersion.status === 409 && staleVersion.json?.error === "stale_version", staleVersion.text);
  const stopByOwner = await call("U1", "POST", `/api/v2/workspaces/${A}/sessions/${S3a}/stop`, { cookie: U1.cookie, body: {} });
  const stopByMember = await call("U2", "POST", `/api/v2/workspaces/${A}/sessions/${S3a}/stop`, { cookie: U2.cookie, body: {} });
  const resumeBySelf = await call("U3", "POST", `/api/v2/workspaces/${A}/sessions/${S3a}/resume`, { cookie: U3.cookie, body: {} });
  const sr = (await dirs(D3, after3.next_cursor)).directives;
  check("directives: stop by a workspace owner and resume by the session owner -> stop and resume directives; another member -> 404", stopByOwner.status === 200 && stopByMember.status === 404 && resumeBySelf.status === 200 && sr.map((d) => d.kind).join(",") === "stop,resume" && sr.every((d) => d.goal === null && d.session_keys[0] === S3a), `${stopByOwner.status} ${stopByMember.status} ${resumeBySelf.status} ${JSON.stringify(sr.map((d) => d.kind))}`);

  // receipts
  const rec = (dev, id, body) => call(dev.who, "POST", `/api/v2/directives/${id}/receipts`, { bearer: dev.access, body });
  const nowIso = new Date().toISOString();
  const rc1 = await rec(D3, sr[0].id, { session_key: S3a, state: "received", at: nowIso });
  const rc2 = await rec(D3, sr[0].id, { session_key: S3a, state: "received", at: nowIso });
  const rc3 = await rec(D3, sr[0].id, { session_key: S3a, state: "enforced", at: nowIso });
  const rcOther = await rec(D2, sr[0].id, { session_key: S3a, state: "received", at: nowIso });
  const rcWrongKey = await rec(D3, sr[0].id, { session_key: S3b, state: "received", at: nowIso });
  const rcBig = await call("U3", "POST", `/api/v2/directives/${sr[0].id}/receipts`, { bearer: D3.access, raw: JSON.stringify({ session_key: S3a, state: "applied", at: nowIso, pad: "x".repeat(3000) }) });
  check("receipts: received -> fresh true, again -> fresh false, enforced -> fresh true; another user's session or a non-target -> 404; over 2 KB -> 413", rc1.json?.fresh === true && rc2.json?.fresh === false && rc3.json?.fresh === true && rcOther.status === 404 && rcWrongKey.status === 404 && rcBig.status === 413, `${rc1.text} ${rc2.text} ${rc3.text} ${rcOther.status} ${rcWrongKey.status} ${rcBig.status}`);
  const sessView = await call("U3", "GET", `/api/v2/workspaces/${A}/sessions`, { cookie: U3.cookie });
  const ownerView = await call("U1", "GET", `/api/v2/workspaces/${A}/sessions`, { cookie: U1.cookie });
  check("sessions page: mine with goal, stop status and usage; owners see everyone's alias and state, never titles", sessView.status === 200 && sessView.json.mine.length === 2 && sessView.json.all === null && ownerView.json.all.length >= 4 && !ownerView.text.includes("U3 session") && ownerView.json.mine.length === 1, `${sessView.status} ${ownerView.text.slice(0, 200)}`);

  // cursor paging over > 100 directives
  for (let i = 0; i < 52; i++) {
    await call("U3", "POST", `/api/v2/workspaces/${A}/sessions/${S3b}/stop`, { cookie: U3.cookie, body: {} });
    await call("U3", "POST", `/api/v2/workspaces/${A}/sessions/${S3b}/resume`, { cookie: U3.cookie, body: {} });
  }
  const page1 = await dirs(D3, 0);
  const page2 = await dirs(D3, page1.next_cursor);
  const page3 = await dirs(D3, page2.next_cursor);
  const allSeq = [...page1.directives, ...page2.directives].map((d) => d.seq);
  check(
    "directives: cursor paging returns at most 100 per page in seq order, next_cursor continues, the end returns none",
    page1.directives.length === 100 && page2.directives.length >= 7 && page3.directives.length === 0 && page3.next_cursor === page2.next_cursor && allSeq.every((s, i) => i === 0 || s > allSeq[i - 1]) && page1.next_cursor === String(page1.directives[99].seq),
    `${page1.directives.length} ${page2.directives.length} ${page3.directives.length}`,
  );

  // Cursor catch-up (what the local sync does each pass) and revoke ending access.
  const DS = await pairDevice("U3", U3, [A], "cursor test");
  const SS = sessionKey(DS, A, "claude-code", "cursor");
  await put(DS, SS);
  for (let i = 0; i < 3; i++) await call("U3", "POST", `/api/v2/workspaces/${A}/sessions/${SS}/${i % 2 ? "resume" : "stop"}`, { cookie: U3.cookie, body: {} });
  const dsAll = (await dirs(DS)).directives;
  const later = await dirs(DS, dsAll[0].seq);
  check("directives: a device catches up from its cursor with only later directives, in seq order", dsAll.length === 3 && later.directives.length === 2 && later.directives[0].seq === dsAll[1].seq && later.directives[1].seq === dsAll[2].seq, JSON.stringify(later).slice(0, 200));
  const revokeDs = await call("U3", "DELETE", `/api/v2/devices/${DS.id}`, { cookie: U3.cookie });
  const revokedPoll = await call(DS.who, "GET", "/api/v2/directives?cursor=0", { bearer: DS.access });
  const dirBrowser = await call("anon", "GET", "/api/v2/directives?cursor=0", { bearer: D3.access, headers: { origin: BASE } });
  check("directives: a revoked device gets 401; a browser Origin gets 403", revokeDs.status === 204 && revokedPoll.status === 401 && dirBrowser.status === 403, `${revokeDs.status} ${revokedPoll.status} ${dirBrowser.status}`);

  // -- alignments --
  const al = (u, body) => call(u.who, "POST", `/api/v2/workspaces/${A}/alignments`, { cookie: u.cookie, body });
  const act = (u, id, action, body = {}) => call(u.who, "POST", `/api/v2/workspaces/${A}/alignments/${id}/${action}`, { cookie: u.cookie, body });
  const getAl = (u, id) => call(u.who, "GET", `/api/v2/workspaces/${A}/alignments/${id}`, { cookie: u.cookie });
  const contrib = await al(U3, { target_goal_id: G1.id, source_goal_id: G3.id, choice: "contribution", session_keys: [], note: "Docs help onboarding" });
  check("alignment (contribution): effects contributes_to only; approvers = the target's owner only", contrib.status === 201 && contrib.json.effects.map((e) => e.kind).join() === "contributes_to" && contrib.json.approvers.map((a) => a.id).join() === U1.id && contrib.json.state === "pending", contrib.text);
  const cApprove = await act(U1, contrib.json.id, "approve", { revision: 1 });
  const d3AfterContrib = await dirs(D3, page2.next_cursor);
  const feedAfterContrib = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access });
  check("alignment (contribution): approved; no binding_changed and G1 still not bindable", cApprove.json?.state === "approved" && !d3AfterContrib.directives.some((d) => d.kind === "binding_changed") && feedAfterContrib.json.goals.find((g) => g.id === G1.id).bindable === false, `${cApprove.text} ${JSON.stringify(d3AfterContrib.directives.map((d) => d.kind))}`);
  const g1Detail = await call("U1", "GET", `/api/v2/workspaces/${A}/goals/${G1.id}`, { cookie: U1.cookie });
  check("alignment (contribution): the target goal lists the contributing goal", g1Detail.json?.contributions?.some((c) => c.goal?.id === G3.id), g1Detail.text.slice(0, 300));

  // -- goal tree: a child contributes to a parent, is reviewed against its versions, and may depend on other goals --
  const GT = (await mkGoal(U1, { title: "Trinity runs several unmodified models on one onboard GPU", visibility: "workspace", measures: [{ text: "Two models that don't fit share the GPU", target: "0 missed deadlines" }] })).json;
  const GC = (await mkGoal(U3, { title: "Orchestration controller", visibility: "workspace" })).json;
  const tree = await al(U3, { target_goal_id: GT.id, source_goal_id: GC.id, choice: "contribution", session_keys: [], note: null });
  await act(U1, tree.json.id, "approve", { revision: 1 });
  const childIn = async (u, dev) => (await call(u.who, "GET", `/api/v2/workspaces/${A}/goals`, dev ? { bearer: dev.access } : { cookie: u.cookie })).json.goals.find((g) => g.id === GC.id);
  const c0 = await childIn(U3, D3);
  check("tree: an approved contribution makes the target a parent, reviewed at its current version", c0?.contributes_to?.length === 1 && c0.contributes_to[0].id === GT.id && c0.contributes_to[0].version === 1 && c0.contributes_to[0].reviewed_version === 1 && c0.contributes_to[0].stale === false && Array.isArray(c0.depends_on), JSON.stringify(c0));
  const fBefore = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access });
  await call("U1", "POST", `/api/v2/workspaces/${A}/goals/${GT.id}/versions`, { cookie: U1.cookie, body: { version: 1, measures: [{ text: "Two models that don't fit share the GPU", target: "0 missed deadlines" }, { text: "Task success near solo", target: "within 5 points" }] } });
  const c1 = await childIn(U3, D3);
  const fAfter = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access, headers: { "if-none-match": `"${fBefore.json.version}"` } });
  check("tree: a new parent version marks the child stale (the feed changes, so agents refetch it)", c1.contributes_to[0].version === 2 && c1.contributes_to[0].reviewed_version === 1 && c1.contributes_to[0].stale === true && fAfter.status === 200, `${JSON.stringify(c1.contributes_to)} ${fAfter.status}`);
  const revOther = await call("U2", "POST", `/api/v2/workspaces/${A}/goals/${GC.id}/review`, { cookie: U2.cookie, body: { parent_id: GT.id } });
  const revNotParent = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GC.id}/review`, { cookie: U3.cookie, body: { parent_id: G1.id } });
  const revOk = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GC.id}/review`, { cookie: U3.cookie, body: { parent_id: GT.id } });
  check("tree: only the child's owner reviews it, only against a real parent; then it is current again", revOther.status === 403 && revNotParent.status === 404 && revOk.status === 200 && revOk.json.contributes_to[0].stale === false && revOk.json.contributes_to[0].reviewed_version === 2, `${revOther.status} ${revNotParent.status} ${revOk.text.slice(0, 200)}`);
  const depOk = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GC.id}/versions`, { cookie: U3.cookie, body: { version: 1, depends_on: [G1.id] } });
  const depSelf = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GC.id}/versions`, { cookie: U3.cookie, body: { version: 2, depends_on: [GC.id] } });
  const depPriv = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GC.id}/versions`, { cookie: U3.cookie, body: { version: 2, depends_on: [GP.id] } });
  const depMany = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GC.id}/versions`, { cookie: U3.cookie, body: { version: 2, depends_on: [G1.id, G2.id, G3.id, GT.id, GB.id, "g_x"] } });
  check("tree: depends_on is a versioned field of the goal; itself -> 400, a goal you can't see -> 404, more than 5 -> 400", depOk.status === 201 && depOk.json.version === 2 && depOk.json.depends_on.join() === G1.id && depSelf.status === 400 && depPriv.status === 404 && depMany.status === 400, `${depOk.status} ${depSelf.status} ${depPriv.status} ${depMany.status}`);
  const depSeen = await childIn(U4, D4);
  check("tree: a reader who can't see a dependency doesn't learn its id", depSeen && Array.isArray(depSeen.depends_on) && depSeen.depends_on.every((id) => id === G1.id), JSON.stringify(depSeen?.depends_on));

  // -- activity: in-flight work signals between members, kept 24 hours --
  const actPost = (dev, items, extra = {}) => call(dev.who, "POST", `/api/v2/workspaces/${A}/activity`, { bearer: dev.access, body: { items }, ...extra });
  const actGet = (dev, after = 0) => call(dev.who, "GET", `/api/v2/workspaces/${A}/activity?after=${after}`, { bearer: dev.access });
  const RID = "a".repeat(32);
  const nowAt = new Date().toISOString();
  const okItems = [
    { session_key: S3a, kind: "edit", at: nowAt, repo_id: RID, path_hash: "b".repeat(32), path: "trinity_sched/preempt.py" },
    { session_key: S3a, kind: "commit", at: nowAt, repo_id: RID, text: "Add preemption hook" },
    { session_key: S3a, kind: "claim", at: nowAt, repo_id: RID, path_hash: "c".repeat(32), path: "hal/timing.py", text: "tick budget" },
    { session_key: S2a, kind: "edit", at: nowAt, repo_id: RID, path_hash: "d".repeat(32) },
    { session_key: S3a, kind: "edit", at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(), repo_id: RID, path_hash: "e".repeat(32) },
  ];
  const ap = await actPost(D3, okItems);
  check("activity: a device posts its own sessions' items; another device's session and items older than 24 h are skipped", ap.status === 200 && ap.json.accepted === 3, ap.text);
  const ag1 = await actGet(D1);
  const mineRows = ag1.json?.items?.filter((i) => i.session_key === S3a) ?? [];
  const aClaim = mineRows.find((i) => i.kind === "claim");
  check("activity: another member who can read the session's goal sees the items with the sender's name, harness and goal", ag1.status === 200 && mineRows.length === 3 && mineRows.every((i) => i.user.id === U3.id && i.mine === false && i.harness === "claude-code") && mineRows[0].path === "trinity_sched/preempt.py", ag1.text.slice(0, 300));
  check("activity: a claim expires after 1 hour, other items after 24 hours", aClaim && Date.parse(aClaim.expires_at) - Date.parse(aClaim.at) === 3600 * 1000 && Date.parse(mineRows[0].expires_at) - Date.parse(mineRows[0].at) === 24 * 3600 * 1000, JSON.stringify(aClaim));
  const ag4 = await actGet(D4);
  const goalOfS3a = mineRows[0]?.goal_id;
  check("activity: a member who can't read the session's goal sees none of it", ag4.status === 200 && !ag4.json.items.some((i) => i.session_key === S3a) && goalOfS3a === G2.id, `${ag4.text.slice(0, 200)} goal ${goalOfS3a}`);
  const ag1b = await actGet(D1, ag1.json.cursor);
  check("activity: the cursor returns only newer items", ag1b.status === 200 && ag1b.json.items.length === 0 && ag1b.json.cursor === ag1.json.cursor, ag1b.text);
  const badPath = await actPost(D3, [{ ...okItems[0], path: "/Users/someone/repo/x.py" }]);
  const dotdot = await actPost(D3, [{ ...okItems[0], path: "../x.py" }]);
  const badRepo = await actPost(D3, [{ ...okItems[0], repo_id: "not-hex" }]);
  const actTooMany = await actPost(D3, Array.from({ length: 201 }, () => okItems[1]));
  const actBrowser = await call("U3", "POST", `/api/v2/workspaces/${A}/activity`, { bearer: D3.access, headers: { origin: BASE }, body: { items: [] } });
  const actWeb = await call("U3", "GET", `/api/v2/workspaces/${A}/activity`, { cookie: U3.cookie });
  check("activity: absolute or ../ paths, bad hashes and over 200 items -> 400; a browser or a cookie -> refused", badPath.status === 400 && dotdot.status === 400 && badRepo.status === 400 && actTooMany.status === 400 && actBrowser.status === 403 && actWeb.status === 403, `${badPath.status} ${dotdot.status} ${badRepo.status} ${actTooMany.status} ${actBrowser.status} ${actWeb.status}`);

  // work_toward for S3a, currently on G2 (U2's pod goal): approvers U1 (target), U3 (session owner), U2 (goal it leaves)
  const wt = await al(U3, { target_goal_id: G1.id, choice: "work_toward", session_keys: [S3a], note: "Moving to onboarding" });
  const expected = [U1.id, U2.id, U3.id].sort().join();
  check("alignment (work_toward): effects contributes_to + governing_goal + allocation_transfer; approvers = target owner, session owner, owner of the goal the allocation leaves", wt.status === 201 && wt.json.effects.map((e) => e.kind).join() === "contributes_to,governing_goal,allocation_transfer" && wt.json.approvers.map((a) => a.id).sort().join() === expected && wt.json.approvers.find((a) => a.id === U3.id).approved === true, wt.text);
  check("alignment: effects are plain words", wt.json.effects.every((e) => e.text.length > 20 && !/\u2014/.test(e.text)) && /Past usage stays/.test(wt.json.effects[2].text), JSON.stringify(wt.json.effects));
  const outsider = await getAl(U4, wt.json.id);
  check("alignment: someone not part of it -> 404", outsider.status === 404, `${outsider.status}`);
  const u2ok = await act(U2, wt.json.id, "approve", { revision: 1 });
  const counter = await act(U1, wt.json.id, "counter", { revision: 1, choice: "work_toward", keep: [0], note: "OK but only this one" });
  const afterCounter = await getAl(U3, wt.json.id);
  const u2Voided = afterCounter.json?.approvers.find((a) => a.id === U2.id)?.approved === false;
  check("alignment: a counter creates revision 2 (countered) and voids earlier approvals", u2ok.json?.state === "pending" && counter.status === 200 && counter.json.revision === 2 && counter.json.state === "countered" && u2Voided && afterCounter.json.approvers.find((a) => a.id === U1.id).approved === true, `${u2ok.text} ${counter.text}`);
  const approveCountered = await act(U2, wt.json.id, "approve", { revision: 2 });
  check("alignment: approving while countered -> 409 (the requester must accept first)", approveCountered.status === 409, approveCountered.text);
  const accept = await act(U3, wt.json.id, "accept_counter", { revision: 2 });
  const staleRev = await act(U2, wt.json.id, "approve", { revision: 1 });
  check("alignment: the requester accepts the counter -> pending; approve naming revision 1 -> 409 stale_revision", accept.json?.state === "pending" && staleRev.status === 409 && staleRev.json?.error === "stale_revision", `${accept.text} ${staleRev.text}`);
  const before = await dirs(D3, page2.next_cursor);
  const finalApprove = await act(U2, wt.json.id, "approve", { revision: 2 });
  const after = await dirs(D3, before.next_cursor);
  const bc = after.directives.find((d) => d.kind === "binding_changed");
  check(
    "alignment: the last approval -> approved, and a binding_changed directive for the session (next root turn, cause alignment:<id>)",
    finalApprove.json?.state === "approved" && bc && bc.session_keys.join() === S3a && bc.binding.goal_id === G1.id && bc.binding.effective === "next_root_turn" && bc.binding.cause === `alignment:${wt.json.id}` && bc.goal.id === G1.id,
    `${finalApprove.text} ${JSON.stringify(after.directives)}`,
  );
  check("alignment: notes and counters never reach agents", !JSON.stringify(after).includes("Moving to onboarding") && !JSON.stringify(after).includes("only this one"), "a note reached a directive");
  const feedAfter = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access });
  check("alignment: G1 is now bindable for U3", feedAfter.json.goals.find((g) => g.id === G1.id).bindable === true, "");
  const E4 = epochId();
  const e4 = await epoch(D3, S3a, { epoch_id: E4, goal_id: G1.id, starts_at: at(90), cause: `directive:${bc?.id}` });
  const notCovered = await epoch(D3, S3b, { epoch_id: epochId(), goal_id: G1.id, starts_at: at(90) });
  check("alignment: the agent opens an epoch on G1 for the covered session (cause directive:<id>); an uncovered session still -> 403", e4.status === 200 && e4.json.goal_id === G1.id && notCovered.status === 403, `${e4.text} ${notCovered.status}`);
  await upload(D3, S3a, [usageRow(D3, "after-align", E4)]);
  const spendAfter = (await call("U1", "GET", `/api/v2/workspaces/${A}/spend?by=goal`, { cookie: U1.cookie })).json;
  check("alignment: future usage counts under G1; past usage did not move", spendAfter.rows.find((r) => r.goal?.id === G1.id)?.requests === 2 && spendAfter.rows.find((r) => r.goal?.id === G2.id)?.requests === 1 && invariantHolds(spendAfter), JSON.stringify(spendAfter.rows.map((r) => [r.label, r.requests])));
  const revoke = await act(U1, wt.json.id, "revoke");
  const afterRevoke = await dirs(D3, after.next_cursor);
  const bs = afterRevoke.directives.find((d) => d.kind === "binding_suspended");
  const s3aState = withDb((d) => d.prepare("SELECT state FROM v2_sessions WHERE session_key = ?").get(S3a).state);
  const putAfter = await put(D3, S3a);
  check(
    "alignment: revoke -> revoked; binding_suspended for the session bound only by it; the session is suspended with no open epoch",
    revoke.json?.state === "revoked" && bs && bs.session_keys.join() === S3a && bs.binding.cause === `alignment:${wt.json.id}` && s3aState === "suspended" && putAfter.json?.state === "suspended" && putAfter.json.current_epoch === null,
    `${revoke.text} ${JSON.stringify(afterRevoke.directives)} ${s3aState} ${putAfter.text}`,
  );
  const inflight = await upload(D3, S3a, [usageRow(D3, "inflight", E4)]);
  const rebindG1 = await epoch(D3, S3a, { epoch_id: epochId(), goal_id: G1.id, starts_at: new Date().toISOString() });
  const rebindOwn = await epoch(D3, S3a, { epoch_id: epochId(), goal_id: G3.id, starts_at: new Date().toISOString() });
  const spendRev = (await call("U1", "GET", `/api/v2/workspaces/${A}/spend?by=goal`, { cookie: U1.cookie })).json;
  check("alignment: revoke is prospective (in-flight usage of the old epoch still lands under G1); G1 needs alignment again; picking an own goal resumes sharing", inflight.json?.accepted === 1 && rebindG1.status === 403 && rebindOwn.status === 200 && spendRev.rows.find((r) => r.goal?.id === G1.id)?.requests === 3, `${inflight.text} ${rebindG1.status} ${rebindOwn.text}`);
  const wd = await al(U3, { target_goal_id: G1.id, choice: "work_toward", session_keys: [S3b] });
  const wdo = await act(U3, wd.json.id, "withdraw");
  const rj = await al(U3, { target_goal_id: G1.id, choice: "work_toward", session_keys: [S3b] });
  const rjByRequester = await act(U3, rj.json.id, "reject");
  const rjo = await act(U1, rj.json.id, "reject");
  const afterReject = await act(U1, rj.json.id, "approve", { revision: 1 });
  check("alignment: withdraw by the requester; reject by an approver (not the requester); a decided request can't be approved", wdo.json?.state === "withdrawn" && rjByRequester.status === 403 && rjo.json?.state === "rejected" && afterReject.status === 409, `${wdo.status} ${rjByRequester.status} ${rjo.status} ${afterReject.status}`);
  const otherSessions = await al(U3, { target_goal_id: G1.id, choice: "work_toward", session_keys: [S2a] });
  const privTarget = await al(U3, { target_goal_id: GP.id, choice: "contribution", session_keys: [S3b] });
  check("alignment: listing someone else's session -> 404; a private goal as target -> 404", otherSessions.status === 404 && privTarget.status === 404, `${otherSessions.status} ${privTarget.status}`);
  const lists = await call("U1", "GET", `/api/v2/workspaces/${A}/alignments`, { cookie: U1.cookie });
  check("alignment: the list splits waiting on me / mine / others", lists.status === 200 && Array.isArray(lists.json.waiting_on_me) && lists.json.others.length >= 3, lists.text.slice(0, 200));
  // A private goal as the source of U2's request: its approver sees it unnamed.
  const privSource = await call("U2", "POST", `/api/v2/workspaces/${A}/alignments`, { cookie: U2.cookie, body: { target_goal_id: G1.id, source_goal_id: GP.id, choice: "contribution", session_keys: [] } });
  const privSourceSeen = await getAl(U1, privSource.json?.id);
  check("alignment: a private source goal is unnamed for the approver", privSource.status === 201 && privSourceSeen.status === 200 && privSourceSeen.json.source_goal.visible === false && /a goal you can't see/.test(privSourceSeen.json.effects[0].text), privSourceSeen.text.slice(0, 300));

  // -- stop sharing, then delete --
  const stopShare = await call("U3", "POST", `/api/v2/workspaces/${A}/sessions/${S3b}/stop-sharing`, { cookie: U3.cookie, body: {} });
  const upAfterStop = await upload(D3, S3b, [usageRow(D3, "late", E3b)]);
  const putAfterStop = await put(D3, S3b);
  const epochAfterStop = await epoch(D3, S3b, { epoch_id: epochId(), goal_id: G3.id, starts_at: new Date().toISOString() });
  const strangerStop = await call("U1", "POST", `/api/v2/workspaces/${A}/sessions/${S3b}/stop-sharing`, { cookie: U1.cookie, body: {} });
  check("stop sharing: -> stopped; then usage, re-share and epochs -> 409 sharing_stopped; someone else's session -> 404", stopShare.json?.state === "stopped" && upAfterStop.status === 409 && upAfterStop.json?.error === "sharing_stopped" && putAfterStop.status === 409 && epochAfterStop.status === 409 && strangerStop.status === 404, `${stopShare.text} ${upAfterStop.status} ${putAfterStop.status} ${epochAfterStop.status} ${strangerStop.status}`);
  const totalBefore = (await call("U1", "GET", `/api/v2/workspaces/${A}/spend?by=goal`, { cookie: U1.cookie })).json.total.requests;
  const delOther = await call("U1", "DELETE", `/api/v2/workspaces/${A}/sessions/${S3a}`, { cookie: U1.cookie });
  const del = await call("U3", "DELETE", `/api/v2/workspaces/${A}/sessions/${S3a}`, { bearer: D3.access });
  const delWeb = await call("U3", "DELETE", `/api/v2/workspaces/${A}/sessions/${S3b}`, { cookie: U3.cookie });
  const leftovers = withDb((d) => {
    const out = {};
    for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'v2_%'").all()) {
      const cols = d.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
      let n = 0;
      for (const row of d.prepare(`SELECT * FROM ${name}`).all()) if (cols.some((c) => typeof row[c] === "string" && (row[c].includes(S3a) || row[c].includes(S3b)))) n++;
      if (n) out[name] = n;
    }
    return out;
  });
  const totalAfter = (await call("U1", "GET", `/api/v2/workspaces/${A}/spend?by=goal`, { cookie: U1.cookie })).json;
  check("delete: someone else -> 404; the owner (Bearer and cookie) -> 204", delOther.status === 404 && del.status === 204 && delWeb.status === 204, `${delOther.status} ${del.status} ${delWeb.status}`);
  check("delete: zero rows anywhere in the v2 tables still mention the deleted sessions (read from the database file)", Object.keys(leftovers).length === 0, JSON.stringify(leftovers));
  check("delete: spend totals change (and the invariant still holds)", totalAfter.total.requests < totalBefore && invariantHolds(totalAfter), `${totalBefore} -> ${totalAfter.total.requests}`);

  // -- the device authorize limit (10 per hour per client), last so earlier pairings aren't affected --
  let limited = 0;
  for (let i = 0; i < 12; i++) if ((await call("D", "POST", "/api/v2/device/authorize", { body: { device_name: "x", public_key: k1.pub } })).status === 429) limited++;
  check("device: authorize is limited to 10 per hour per client (then 429)", limited > 0, `${limited}`);

  // -- the web UI renders: pages need a session, then load --
  const pagePaths = ["/app", "/app/device", "/app/devices", `/app/w/${A}`, `/app/w/${A}/goals/${G1.id}`, `/app/w/${A}/people`, `/app/w/${A}/sessions`, `/app/w/${A}/alignments`, `/app/w/${A}/spend`, `/app/invite/${"x".repeat(43)}`];
  const anonPages = await Promise.all(pagePaths.map((p) => call("anon", "GET", p)));
  check("ui: every /app page without a session sends you to /app/sign-in", anonPages.every((r) => (r.status === 307 && /\/app\/sign-in/.test(r.headers.get("location") || "")) || (r.status === 200 && r.text.includes("/app/sign-in?next="))), anonPages.map((r) => r.status).join(","));
  const userPages = await Promise.all(pagePaths.map((p) => call("U1", "GET", p, { cookie: U1.cookie })));
  check("ui: every /app page renders for a signed-in user (200, no error page)", userPages.every((r) => r.status === 200 && !/Application error|Internal Server Error/.test(r.text)), userPages.map((r) => r.status).join(","));
  const signInPage = await call("anon", "GET", "/app/sign-in");
  check("ui: the sign-in page offers the test sign-in only (no OAuth configured here)", signInPage.status === 200 && signInPage.text.includes("Test sign-in") && !signInPage.text.includes("Continue with Google"), `${signInPage.status}`);
  if (existsSync(CHROME)) {
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${BASE}/app/sign-in?next=/app`, { waitUntil: "networkidle0" });
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Create a test account"))?.click());
      await page.waitForSelector('input[autocomplete="name"]');
      await page.type('input[autocomplete="name"]', "Browser User");
      await page.type('input[type="email"]', "ui@example.test");
      await page.type('input[type="password"]', "browser-pass-1");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => document.querySelector("form button[type=submit]")?.click())]);
      await page.waitForFunction(() => document.body.innerText.includes("Your workspaces"), { timeout: 15000 });
      await page.type("main form input", "UI workspace");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Create")?.click())]);
      await page.waitForFunction(() => document.body.innerText.includes("New goal"), { timeout: 15000 });
      await page.type('main form input:not([aria-label])', "Browser goal");
      await page.type('input[aria-label="Measure 1"]', "Browser measure");
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Create goal")?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Browser goal") && document.body.innerText.includes("Browser measure"), { timeout: 15000 });
      const wsUrl = page.url();
      await page.goto(`${wsUrl}/spend`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Estimated list cost") && document.body.innerText.includes("Total"), { timeout: 15000 });
      const spendText = await page.evaluate(() => document.body.innerText);
      await page.goto(`${wsUrl}/people`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Invite someone"), { timeout: 15000 });
      for (const t of ["sessions", "alignments"]) {
        await page.goto(`${wsUrl}/${t}`, { waitUntil: "networkidle0" });
        await page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 15000 }, t === "sessions" ? "Shared sessions" : "Waiting on you");
      }
      await page.goto(`${BASE}/app/devices`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Your devices"), { timeout: 15000 });
      const allText = spendText + (await page.evaluate(() => document.body.innerText));
      check("ui (Chrome): test sign-up, create a workspace and a goal, then spend, people, sessions, alignments and devices render without page errors", errors.length === 0 && /estimate/i.test(spendText), errors.join(" | "));
      check("ui (Chrome): no em dashes in rendered copy", !allText.includes("\u2014"), "em dash found");
    } catch (e) {
      check("ui (Chrome) run", false, e?.stack ?? e);
    } finally {
      await browser.close();
    }
  } else check("ui (Chrome) available", false, `no Chrome at ${CHROME}`);

  // -- the private-goal canary never reached anyone but its owner --
  const leaks = seen.filter((s) => s.who !== "U2" && s.text.includes(CANARY));
  const ownerSaw = seen.some((s) => s.who === "U2" && s.text.includes(CANARY));
  check(`canary: the private goal's text appears in none of ${seen.filter((s) => s.who !== "U2").length} responses to anyone but its owner (workspace owner included); its owner sees it`, leaks.length === 0 && ownerSaw, leaks.map((l) => `${l.who} ${l.p}`).join(" | "));
  await stopServer();

  // ======== phase hosted: v2 startup refusals, then v2 behind the hosted checks ========
  const hostedDir = path.join(tmpRoot, "hosted");
  const deleteBy = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const good = {
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "t".repeat(48),
    ALIGN_DATA_DIR: hostedDir,
    ALIGN_SIGNUP_CODES: "hosted-invite-0001,hosted-invite-0002",
    ALIGN_DELETE_BY: deleteBy,
    ALIGN_PRODUCT_PASSCODE: "product-strong-pass-1",
    ALIGN_SECURITY_PASSCODE: "security-strong-pass-1",
    ALIGN_LEADERSHIP_PASSCODE: "leadership-strong-pass-1",
    ALIGN_GOAL_SESSIONS: "1",
    BETTER_AUTH_SECRET: "b".repeat(40),
    GOOGLE_CLIENT_ID: "test-google-id",
    GOOGLE_CLIENT_SECRET: "test-google-secret",
    GITHUB_CLIENT_ID: "test-github-id",
    GITHUB_CLIENT_SECRET: "test-github-secret",
    ALIGN_PUBLIC_ORIGIN: `https://${HOSTED_HOST}`,
  };
  const refusals = [
    ["no BETTER_AUTH_SECRET", { BETTER_AUTH_SECRET: undefined }, "BETTER_AUTH_SECRET must be set"],
    ["a short BETTER_AUTH_SECRET", { BETTER_AUTH_SECRET: "short" }, "BETTER_AUTH_SECRET must be set"],
    ["no GOOGLE_CLIENT_ID", { GOOGLE_CLIENT_ID: undefined }, "GOOGLE_CLIENT_ID must be set"],
    ["no GOOGLE_CLIENT_SECRET", { GOOGLE_CLIENT_SECRET: undefined }, "GOOGLE_CLIENT_SECRET must be set"],
    ["no GITHUB_CLIENT_ID", { GITHUB_CLIENT_ID: undefined }, "GITHUB_CLIENT_ID must be set"],
    ["no GITHUB_CLIENT_SECRET", { GITHUB_CLIENT_SECRET: undefined }, "GITHUB_CLIENT_SECRET must be set"],
    ["no ALIGN_PUBLIC_ORIGIN", { ALIGN_PUBLIC_ORIGIN: undefined }, "ALIGN_PUBLIC_ORIGIN must be an https origin"],
    ["an http ALIGN_PUBLIC_ORIGIN", { ALIGN_PUBLIC_ORIGIN: `http://${HOSTED_HOST}` }, "ALIGN_PUBLIC_ORIGIN must be an https origin"],
    ["an ALIGN_PUBLIC_ORIGIN outside ALIGN_HOSTS", { ALIGN_PUBLIC_ORIGIN: "https://other.example" }, "must be listed in ALIGN_HOSTS"],
    ["ALIGN_GOAL_SESSIONS_TEST_IDP", { ALIGN_GOAL_SESSIONS_TEST_IDP: "1" }, "ALIGN_GOAL_SESSIONS_TEST_IDP is not allowed when hosted"],
  ];
  for (const [what, delta, needle] of refusals) {
    const env = { ...good, ...delta };
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    const r = await startServer(env);
    check(`hosted: ALIGN_GOAL_SESSIONS=1 refuses to serve with ${what}`, !r.started && (r.exited || r.last === 503) && r.stderr().includes(needle), r.started ? "it started" : `exited=${r.exited} last=${r.last} ${r.stderr().slice(-300)}`);
    await stopServer();
  }
  await mustStart(good);
  const hMe = await hosted("GET", "/api/v2/me");
  const hSignIn = await hosted("GET", "/app/sign-in");
  const hSession = await hosted("GET", "/api/v2/auth/get-session");
  check("hosted: v2 routes are served alongside the tester routes (/api/v2/me 401, /app/sign-in 200, Better Auth answers)", hMe.status === 401 && hSignIn.status === 200 && hSession.status === 200, `${hMe.status} ${hSignIn.status} ${hSession.status}`);
  check("hosted: the sign-in page offers Google and GitHub, never the test sign-in", hSignIn.text.includes("Continue with Google") && hSignIn.text.includes("Continue with GitHub") && !hSignIn.text.includes("Test sign-in"), "");
  const hSignUp = await hosted("POST", "/api/v2/auth/sign-up/email", { body: { name: "x", email: "x@example.test", password: "password-123" }, headers: { origin: `https://${HOSTED_HOST}` } });
  check("hosted: email + password sign-up is off", hSignUp.status !== 200, `${hSignUp.status} ${hSignUp.text.slice(0, 100)}`);
  const hHttp = await hosted("GET", "/api/v2/me", { headers: { "x-forwarded-proto": "http" } });
  const hNoEdge = await hosted("GET", "/api/v2/me", { headers: { "fly-client-ip": undefined } });
  const hForeign = await new Promise((resolve) => {
    http.get({ host: "127.0.0.1", port: PORT, path: "/api/v2/me", headers: { host: "evil.example", "x-forwarded-proto": "https", "fly-client-ip": "1.2.3.4" } }, (res) => resolve(res.statusCode));
  });
  check("hosted: v2 routes pass the same checks (http -> 403, no Fly-Client-IP -> 403, foreign Host -> 421)", hHttp.status === 403 && hNoEdge.status === 403 && hForeign === 421, `${hHttp.status} ${hNoEdge.status} ${hForeign}`);
  // Hosted cookie writes: Origin is required and must be exactly https://<Host> (as lib/http.ts, LIM-2437). The site
  // check runs before the session, so with no session the right Origin gets 401 and every other one 403 cross_site.
  const hOrigins = [undefined, `http://${HOSTED_HOST}`, `https://${HOSTED_HOST}:8443`, "null", "https://evil.example"];
  const hRefused = [];
  for (const o of hOrigins) hRefused.push({ o: o ?? "none", r: await hosted("POST", "/api/v2/workspaces", { body: { name: "x" }, headers: { origin: o } }) });
  const hRightOrigin = await hosted("POST", "/api/v2/workspaces", { body: { name: "x" }, headers: { origin: `https://${HOSTED_HOST}` } });
  check(
    "hosted: a cookie write needs Origin exactly https://<Host> (none, http, another port, null, foreign -> 403 cross_site; exact -> on to sign-in, 401)",
    hRefused.every((x) => x.r.status === 403 && x.r.json?.error === "cross_site") && hRightOrigin.status === 401,
    `${hRefused.map((x) => `${x.o}:${x.r.status}`).join(" ")} exact:${hRightOrigin.status}`,
  );
  const hNorthstar = await hosted("GET", "/api/sessions");
  check("hosted: non-tester v1 routes stay 404 with v2 on", hNorthstar.status === 404, `${hNorthstar.status}`);
  const hDev = await hosted("POST", "/api/v2/device/authorize", { body: { device_name: "x", public_key: newDeviceKeys().pub } });
  check("hosted: the device verification URI is the public origin", hDev.status === 200 && hDev.json.verification_uri === `https://${HOSTED_HOST}/app/device`, hDev.text);
} catch (e) {
  check("v2 run", false, e?.stack ?? e);
} finally {
  await stopServer();
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
