#!/usr/bin/env node
// Align server tests (docs/v2/WIRE.md). Builds once, then starts its own production servers (next start) on <port> with
// a temp ALIGN_DATA_DIR, one per phase. v2 is the only model: there is no flag, and v1's routes are gone.
//   local   Mode L, no settings        -> every /app and /api/v2 path is served; / redirects to /app; retired paths are
//                                         404; the loopback Host check (421); one server per data directory (a second
//                                         server is started on <port>+1); the local owner and its printed code;
//                                         email codes (hashed, 5 min, 3 tries, send limits, no account disclosure);
//                                         sign-in-link; test IdP off; access requests and the operator script
//   on      Mode L, ALIGN_TEST_IDP=1    -> identity, RBAC, devices (recent sign-in), sessions, usage, spend, directives,
//                                         directive cursor, receipts, alignments, stop sharing, delete, web UI; the
//                                         hosted gate settings are set and ignored; align-admin workspaces
//   hosted  HOSTED=1                    -> startup refusals, then the hosted host/https/edge checks and the route
//                                         allowlist (/ -> /app, everything else 404); no closing date (a leftover
//                                         ALIGN_DELETE_BY in the past is ignored); then email codes through a fake HTTPS
//                                         email API (first owner, invites, unknown addresses, API failure); then the
//                                         creation gate: Turnstile through a fake HTTPS verify API, creation codes and
//                                         access requests with the operator script (align-admin), disposable domains,
//                                         the caps, durable limits across a restart, and ALIGN_CREATION closed and open
// Usage: node scripts/test-v2.mjs <port>   (from a worktree root; refuses 3100, the main checkout and a busy port;
//                                           also uses <port>+1 for the second-server check)

import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
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

/** A request with exactly these headers (fetch() won't send a forged Host; node:http will). */
function rawGet(p, headers) {
  return new Promise((resolve, reject) => {
    for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
    http
      .get({ host: "127.0.0.1", port: PORT, path: p, headers }, (res) => {
        let t = "";
        res.on("data", (c) => (t += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: t }));
      })
      .on("error", reject);
  });
}

// ---- servers ----
let server = null;
let stdout = ""; // the current server's standard output (Mode L prints sign-in links there)
// Every server setting is cleared from the inherited environment, so each phase runs with exactly what it names.
const SETTING = /^(ALIGN_|HOSTED$|AI_GATEWAY_API_KEY$|ANTHROPIC_|BETTER_AUTH_|GOOGLE_|GITHUB_)/;
async function startServer(env) {
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (SETTING.test(k)) delete clean[k];
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let exited = false;
  let stderr = "";
  stdout = "";
  server.stderr.on("data", (c) => (stderr += c));
  server.stdout.on("data", (c) => (stdout += c));
  server.on("exit", () => (exited = true));
  let last = 0;
  for (let i = 0; i < 90 && !exited; i++) {
    try {
      const r = env.HOSTED === "1" ? await hosted("GET", "/api/v2/auth/get-session") : await fetch(`${BASE}/api/v2/auth/get-session`);
      last = r.status;
      if (r.status === 200) return { started: true, stderr: () => stderr, stdout: () => stdout, exited, last };
      if (r.status === 503) break; // up, but serving nothing (proxy.ts startupProblems)
    } catch {}
    await sleep(1000);
  }
  return { started: false, stderr: () => stderr, stdout: () => stdout, exited, last };
}
async function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  spawnSync("pkill", ["-f", `next start -H 127.0.0.1 -p ${PORT}`]);
  server = null;
  await sleep(2500);
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

// ---- v2 routes on disk (for the always-on walk) ----
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

/** Where a page response sends the browser: a 3xx Location, or the refresh tag Next streams for a redirect made after
 *  the page shell was sent (a redirect inside <Suspense>). */
function redirectTarget(r) {
  const loc = r.headers.get?.("location");
  if (r.status >= 300 && r.status < 400 && loc) return loc;
  const m = /id="__next-page-redirect" http-equiv="refresh" content="\d;url=([^"]*)"/.exec(r.text);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

// Email one-time codes. Mode L prints each link and writes it to <data>/v2/sign-in.txt; the test reads that file.
const SEND = "/api/v2/auth/email-otp/send-verification-otp";
const OTP_SIGN_IN = "/api/v2/auth/sign-in/email-otp";
// Better Auth wants the Origin a browser sends on these (fetch sends Sec-Fetch-Mode, so it counts as a browser).
const sendCode = (who, email) => call(who, "POST", SEND, { headers: { origin: BASE }, body: { email, type: "sign-in" } });
const codeSignIn = (who, email, otp) => call(who, "POST", OTP_SIGN_IN, { headers: { origin: BASE }, body: { email, otp } });
const signInLine = (dir) => (existsSync(path.join(dir, "v2", "sign-in.txt")) ? readFileSync(path.join(dir, "v2", "sign-in.txt"), "utf8") : "");
const codeIn = (text) => /[?&]code=(\d{6})/.exec(text)?.[1] ?? "";
const otpHash = (code) => createHash("sha256").update(code).digest("base64url");
const LINE_RE = (email) => new RegExp(`^Align sign-in for ${email.replace(/[.]/g, "\\.")}: http://127\\.0\\.0\\.1:${PORT}/app/sign-in\\?email=${encodeURIComponent(email).replace(/[.]/g, "\\.")}&code=\\d{6}$`, "m");
/** Make a Better Auth session look as if it signed in `minutes` ago (the test has file access, like a host admin). */
function ageSession(cookie, minutes) {
  const value = /align_v2\.session_token=([^;]+)/.exec(cookie)?.[1] ?? "";
  const token = decodeURIComponent(value).split(".")[0];
  return withDb((d) => d.prepare("UPDATE ba_session SET createdAt = ? WHERE token = ?").run(new Date(Date.now() - minutes * 60 * 1000).toISOString(), token).changes);
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

/** Run the operator script (scripts/align-admin.mjs) with exactly these settings, the way a host admin would. */
function admin(args, env) {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (SETTING.test(k)) delete clean[k];
  const all = { ...clean, ...env };
  for (const k of Object.keys(all)) if (all[k] === undefined) delete all[k];
  const r = spawnSync(process.execPath, ["scripts/align-admin.mjs", ...args], { cwd: ROOT, encoding: "utf8", env: all });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
/** admin(), without blocking this process: for commands that call a fake API this test itself serves. */
function adminAsync(args, env) {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (SETTING.test(k)) delete clean[k];
  const all = { ...clean, ...env };
  for (const k of Object.keys(all)) if (all[k] === undefined) delete all[k];
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ["scripts/align-admin.mjs", ...args], { cwd: ROOT, env: all, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (status) => resolve({ status, out, err }));
  });
}
/** Every creation code in a text (alc_ + 32 base32 characters). */
const codesIn = (text) => text.match(/alc_[a-z2-7]{32}/g) ?? [];
/** True when no file of this database (main, WAL) contains `needle` as plain bytes. */
const dbFilesLack = (file, needle) => [file, `${file}-wal`].every((f) => !existsSync(f) || !readFileSync(f).includes(Buffer.from(needle)));

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
const build = spawnSync("npx", ["next", "build"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HOSTED: "", ALIGN_DATA_DIR: "" } });
if (build.status !== 0) {
  console.log(`FAIL  next build\n${(build.stdout + build.stderr).slice(-1500)}`);
  process.exit(1);
}

try {
  // ======== phase local: Mode L with no settings (v2 always on, the local owner, email codes) ========
  const localDir = path.join(tmpRoot, "local");
  const localRun = await mustStart({ ALIGN_DATA_DIR: localDir });
  dbFile = path.join(localDir, "v2", "align.sqlite");
  const routes = v2Routes();
  const probes = await Promise.all(routes.flatMap((r) => [call("anon", "GET", r), call("anon", "POST", r, { body: {} })]));
  // The old flag answered {"error":"Not found"} from proxy.ts; a route's own 404 is {"error":"not_found"} (or Better Auth's).
  const closed = routes.filter((_, i) => [probes[2 * i], probes[2 * i + 1]].some((r) => r.status === 404 && r.json?.error === "Not found"));
  check(`local: all ${routes.length} v2 paths (/app pages and /api/v2 routes) are served with no flag set`, routes.length >= 40 && closed.length === 0, `closed: ${closed.join(" ")}`);
  // -- the edge: / -> /app, retired v1 paths, the loopback Host rule --
  const root = await call("anon", "GET", "/");
  check("local: / redirects to /app (307, Location ending in /app)", root.status === 307 && /\/app$/.test(root.headers.get("location") ?? ""), `${root.status} ${root.headers.get("location")}`);
  const retired = await Promise.all(["/setup", "/new", "/w/x", "/api/session", "/api/proposals", "/api/state", "/api/workspaces/config", "/api/directives"].map((p) => call("anon", "GET", p).then((r) => ({ p, r }))));
  const retiredPost = await Promise.all(["/api/sessions/events", "/api/proposals", "/api/workspaces"].map((p) => call("anon", "POST", p, { body: {} }).then((r) => ({ p, r }))));
  check("local: retired v1 paths answer 404 (/setup, /new, /w/<id>, /api/session, /api/proposals, /api/state, /api/workspaces*, /api/directives, /api/sessions/events)", [...retired, ...retiredPost].every((x) => x.r.status === 404), [...retired, ...retiredPost].map((x) => `${x.p}:${x.r.status}`).join(" "));
  const rebound = await Promise.all(["/", "/app", "/api/v2/me", "/api/v2/auth/get-session"].map((p) => rawGet(p, { host: "evil.example" })));
  const reboundPort = await rawGet("/app", { host: `evil.example:${PORT}` });
  const loopNames = await Promise.all(["localhost", "[::1]"].map((h) => rawGet("/api/v2/me", { host: `${h}:${PORT}` })));
  check(
    "local: a non-loopback Host (DNS rebinding) -> 421 'Misdirected request: this server answers to localhost only' on every path; localhost and [::1] are served",
    [...rebound, reboundPort].every((r) => r.status === 421 && r.text.includes("Misdirected request: this server answers to localhost only")) && loopNames.every((r) => r.status === 401),
    `${[...rebound, reboundPort].map((r) => r.status).join(",")} loopback:${loopNames.map((r) => r.status).join(",")}`,
  );
  // -- one server per data directory: <data>/.pid names the live server, and a second one refuses to start --
  const pidFile = path.join(localDir, ".pid");
  const heldPid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : 0;
  let pidAlive = false;
  try {
    process.kill(heldPid, 0);
    pidAlive = heldPid > 0;
  } catch {}
  check("single server: <data>/.pid holds the live server's pid, mode 0600", pidAlive && (statSync(pidFile).mode & 0o777) === 0o600, `${heldPid} ${existsSync(pidFile) ? (statSync(pidFile).mode & 0o777).toString(8) : "missing"}`);
  if (spawnSync("lsof", ["-nP", `-iTCP:${PORT + 1}`, "-sTCP:LISTEN"]).status === 0) check(`single server: port ${PORT + 1} is free for the second server`, false, "in use");
  else {
    const clean = { ...process.env };
    for (const k of Object.keys(clean)) if (SETTING.test(k)) delete clean[k];
    const second = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT + 1)], { env: { ...clean, ALIGN_DATA_DIR: localDir }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let out2 = "";
    second.stdout.on("data", (c) => (out2 += c));
    second.stderr.on("data", (c) => (out2 += c));
    const code2 = await new Promise((resolve) => {
      const t = setTimeout(() => resolve("still running"), 60000);
      second.on("exit", (c) => (clearTimeout(t), resolve(c)));
    });
    try {
      process.kill(-second.pid, "SIGTERM");
    } catch {}
    const stillOne = await call("anon", "GET", "/api/v2/me");
    check(
      "single server: a second server on the same data directory exits with 'Another Align server (pid <n>) is using <dir>. Stop it first.' and the first keeps serving",
      code2 !== 0 && code2 !== "still running" && out2.includes(`Another Align server (pid ${heldPid}) is using ${localDir}. Stop it first.`) && Number(readFileSync(pidFile, "utf8").trim()) === heldPid && stillOne.status === 401,
      `exit=${code2} ${out2.slice(-300)}`,
    );
  }
  const owners = withDb((d) => d.prepare("SELECT id, name, email, emailVerified FROM ba_user").all());
  check("local owner: the first start makes exactly one account, Local owner <owner@align.localhost>, email verified", owners.length === 1 && owners[0].name === "Local owner" && owners[0].email === "owner@align.localhost" && owners[0].emailVerified === 1, JSON.stringify(owners));
  check("local owner: in no workspace", withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM v2_members").get().n) === 0, "");
  const ownerLine = LINE_RE("owner@align.localhost");
  check("local owner: stdout prints `Align sign-in for owner@align.localhost: http://127.0.0.1:<port>/app/sign-in?email=…&code=<6 digits>`", ownerLine.test(localRun.stdout()), localRun.stdout().slice(-400));
  const signInFile = path.join(localDir, "v2", "sign-in.txt");
  const firstCode = codeIn(signInLine(localDir));
  check("local owner: sign-in.txt holds the same line, mode 0600", ownerLine.test(signInLine(localDir)) && (statSync(signInFile).mode & 0o777) === 0o600 && localRun.stdout().includes(signInLine(localDir).trim()), `${(statSync(signInFile).mode & 0o777).toString(8)} ${signInLine(localDir)}`);
  const otpRows = withDb((d) => d.prepare("SELECT identifier, value, expiresAt FROM ba_verification").all());
  check(
    "email code: stored hashed (SHA-256), never the code itself, with 0 attempts and a 5-minute expiry",
    otpRows.length === 1 && otpRows[0].identifier === "sign-in-otp-owner@align.localhost" && otpRows[0].value === `${otpHash(firstCode)}:0` && !otpRows[0].value.includes(firstCode) && Math.abs(Date.parse(otpRows[0].expiresAt) - Date.now() - 5 * 60 * 1000) < 60 * 1000,
    JSON.stringify(otpRows),
  );
  const noTestIdp = await call("anon", "POST", "/api/v2/auth/sign-up/email", { headers: { origin: BASE }, body: { name: "x", email: "x@example.test", password: "password-123" } });
  check("test IdP: without ALIGN_TEST_IDP=1 email + password sign-up is refused, no account made", noTestIdp.status !== 200 && withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM ba_user").get().n) === 1, `${noTestIdp.status}`);
  const lPage = await call("anon", "GET", "/app/sign-in");
  check("ui: the Mode L sign-in page offers the email code (Send code) and nothing else", lPage.status === 200 && lPage.text.includes("Send code") && !lPage.text.includes("Test sign-in") && !lPage.text.includes("Continue with Google") && !lPage.text.includes("Continue with GitHub") && !lPage.text.includes("No sign-in method"), `${lPage.status}`);
  const linkPage = await call("anon", "GET", `/app/sign-in?email=${encodeURIComponent("owner@align.localhost")}&code=${firstCode}&next=%2Fapp%2Fdevices`);
  check(
    "ui: the link in a code message only fills the form (code step, email and code filled, Mode L hint) and sets no cookie",
    linkPage.status === 200 && linkPage.text.includes(`value="${firstCode}"`) && linkPage.text.includes('value="owner@align.localhost"') && linkPage.text.includes("npm run sign-in-link") && linkPage.setCookies.length === 0,
    `${linkPage.status} ${linkPage.setCookies.join(" ")}`,
  );
  const stillThere = withDb((d) => d.prepare("SELECT value FROM ba_verification").get()?.value);
  check("email code: opening the link spends nothing (the code is still stored, 0 attempts)", stillThere === `${otpHash(firstCode)}:0`, stillThere);
  const otpWrong = await codeSignIn("anon", "owner@align.localhost", firstCode === "000000" ? "000001" : "000000");
  check("email code: a wrong code -> 400 INVALID_OTP, no cookie", otpWrong.status === 400 && otpWrong.json?.code === "INVALID_OTP" && otpWrong.setCookies.length === 0, otpWrong.text);
  const ownerIn = await codeSignIn("LO", "owner@align.localhost", firstCode);
  const LO = { who: "LO", cookie: cookieOf(ownerIn.setCookies) };
  const loMe = await call("LO", "GET", "/api/v2/me", { cookie: LO.cookie });
  check("email code: the printed code signs the local owner in (session cookie; /me is Local owner)", ownerIn.status === 200 && loMe.status === 200 && loMe.json.user.email === "owner@align.localhost", `${ownerIn.status} ${loMe.text}`);
  const otpReuse = await codeSignIn("anon", "owner@align.localhost", firstCode);
  check("email code: a code works once (reuse -> 400)", otpReuse.status === 400, otpReuse.text);
  const linkScript = spawnSync(process.execPath, ["scripts/sign-in-link.mjs"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PORT: String(PORT), ALIGN_LOCAL_OWNER_EMAIL: "" } });
  const scriptCode = codeIn(signInLine(localDir));
  for (let i = 0; i < 20 && !localRun.stdout().includes(signInLine(localDir).trim()); i++) await sleep(100); // the server's stdout arrives through a pipe
  check(
    "sign-in-link: asks the running server for a fresh code (exit 0); the server prints it and rewrites sign-in.txt; the script never shows the code",
    linkScript.status === 0 && scriptCode && scriptCode !== firstCode && ownerLine.test(signInLine(localDir)) && localRun.stdout().includes(signInLine(localDir).trim()) && !linkScript.stdout.includes(scriptCode) && /printed in the terminal/.test(linkScript.stdout),
    `${linkScript.status} ${linkScript.stdout} ${linkScript.stderr}`,
  );
  let clientSends = 1; // the script's send; the server's own send for the local owner has no client
  // A new address in Mode L: the code is printed for any email, and signing in makes the account.
  const anaSend = await sendCode("anon", "Ana@Example.test");
  clientSends++;
  const ownerSend = await sendCode("anon", "owner@align.localhost");
  clientSends++;
  check("email code: the send answer is the same for an address with no account as for one with an account (no disclosure)", anaSend.status === 200 && ownerSend.status === 200 && anaSend.text === ownerSend.text && anaSend.text === '{"success":true}', `${anaSend.status} ${anaSend.text} | ${ownerSend.status} ${ownerSend.text}`);
  const lastCodeFor = (email) => codeIn(stdout.split("\n").filter((l) => l.includes(`?email=${encodeURIComponent(email)}&`)).pop() ?? "");
  const anaCode = lastCodeFor("ana@example.test");
  const anaIn = await codeSignIn("anon", "ana@example.test", anaCode);
  const ana = withDb((d) => d.prepare("SELECT name, emailVerified FROM ba_user WHERE email = ?").get("ana@example.test"));
  check("accounts: in Mode L a valid code for a new address creates its account (email verified, named from the address) and signs in", anaIn.status === 200 && ana?.emailVerified === 1 && ana?.name === "ana" && cookieOf(anaIn.setCookies).includes("align_v2.session_token"), `${anaIn.status} ${anaIn.text} ${JSON.stringify(ana)}`);
  // Expired and used-up codes.
  withDb((d) => d.prepare("UPDATE ba_verification SET expiresAt = ? WHERE identifier = ?").run(new Date(Date.now() - 1000).toISOString(), "sign-in-otp-owner@align.localhost"));
  const ownerCode2 = lastCodeFor("owner@align.localhost");
  const expired = await codeSignIn("anon", "owner@align.localhost", ownerCode2);
  check("email code: a code older than 5 minutes -> 400 OTP_EXPIRED, nobody signed in", expired.status === 400 && expired.json?.code === "OTP_EXPIRED" && expired.setCookies.length === 0, expired.text);
  await sendCode("anon", "tries@example.test");
  clientSends++;
  const triesCode = codeIn(signInLine(localDir));
  const otpBad = triesCode === "000000" ? "000001" : "000000";
  const tries = [];
  for (let i = 0; i < 3; i++) tries.push(await codeSignIn("anon", "tries@example.test", otpBad));
  const fourth = await codeSignIn("anon", "tries@example.test", triesCode);
  check(
    "email code: 3 wrong tries, then even the right code -> 403 TOO_MANY_ATTEMPTS; the code is gone and no account is made",
    tries.every((r) => r.status === 400 && r.json?.code === "INVALID_OTP") && fourth.status === 403 && fourth.json?.code === "TOO_MANY_ATTEMPTS" && !withDb((d) => d.prepare("SELECT 1 FROM ba_verification WHERE identifier = ?").get("sign-in-otp-tries@example.test")) && !withDb((d) => d.prepare("SELECT 1 FROM ba_user WHERE email = ?").get("tries@example.test")),
    `${tries.map((r) => r.status).join(",")} ${fourth.status} ${fourth.text}`,
  );
  const onlySignIn = await call("anon", "POST", SEND, { headers: { origin: BASE }, body: { email: "x@example.test", type: "forget-password" } });
  const resetRoute = await call("anon", "POST", "/api/v2/auth/email-otp/request-password-reset", { headers: { origin: BASE }, body: { email: "x@example.test" } });
  check("email code: only sign-in codes are sent (other types -> 400); the plugin's other routes are off (404)", onlySignIn.status === 400 && resetRoute.status === 404, `${onlySignIn.status} ${resetRoute.status}`);
  // Send limits: 3 per email per 10 minutes, 10 per client per hour.
  const lim = [];
  for (let i = 0; i < 4; i++) lim.push(await sendCode("anon", "limit@example.test"));
  clientSends += 3;
  const afterLimit = signInLine(localDir);
  check(
    "send limits: a 4th code for the same email within 10 minutes -> 429; nothing printed, the 3rd code stays",
    lim.slice(0, 3).every((r) => r.status === 200) && lim[3].status === 429 && afterLimit.includes("limit%40example.test") && localRun.stdout().split("\n").filter((l) => l.includes("limit%40example.test")).length === 3,
    lim.map((r) => r.status).join(","),
  );
  const clientLim = [];
  for (let i = 0; clientSends + i < 10; i++) clientLim.push(await sendCode("anon", `c${i}@example.test`));
  const printedBefore = localRun.stdout().length;
  const eleventh = await sendCode("anon", "c-last@example.test");
  check(
    "send limits: the 11th code from one client within an hour, for any address -> 429, nothing printed",
    clientLim.every((r) => r.status === 200) && eleventh.status === 429 && localRun.stdout().length === printedBefore && !signInLine(localDir).includes("c-last"),
    `${clientLim.map((r) => r.status).join(",")} 11th:${eleventh.status}`,
  );
  const scriptLimited = spawnSync(process.execPath, ["scripts/sign-in-link.mjs"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PORT: String(PORT) } });
  check("sign-in-link: when the server answers 429 it exits 1 saying too many codes were sent", scriptLimited.status === 1 && /Too many codes/.test(scriptLimited.stderr), `${scriptLimited.status} ${scriptLimited.stderr}`);
  // -- access requests (PRESEED-002): a public form, stored for the operator; durable limits, 5 per client per hour and
  //    3 per address per day; Mode L blocks no domain and shows no bot check --
  const raPage = await call("anon", "GET", "/app/request-access");
  check(
    "access: /app/request-access is served signed out (no redirect to sign-in) with the form, both interest choices and copy that says it is not an agreement and commits nobody",
    raPage.status === 200 && raPage.text.includes("Request access to Align") && raPage.text.includes('value="try"') && raPage.text.includes('value="evaluate"') && raPage.text.includes("non-binding letter of intent") && raPage.text.includes("It is not an agreement") && raPage.text.includes("commit you or your employer to anything") && !raPage.text.includes("data-turnstile-sitekey"),
    `${raPage.status} ${redirectTarget(raPage)}`,
  );
  const ar = (body, headers = { origin: BASE }) => call("anon", "POST", "/api/v2/access-requests", { headers, body });
  const arBody = { email: "Req@Example.test", name: "Rea Quest", company: "Acme", team_size: "2-10", use_case: "Keep our agents on the team's goals", interest: "evaluate" };
  const ar1 = await ar(arBody);
  const arRow = withDb((d) => d.prepare("SELECT * FROM v2_access_requests WHERE email = ?").get("req@example.test"));
  check(
    "access: POST /api/v2/access-requests (no sign-in) -> 201 {received:true}; stored with email (lowercased), name, company, team size, use, interest, status pending and created_at",
    ar1.status === 201 && ar1.json?.received === true && /^ar_[a-z2-7]{24}$/.test(arRow?.id ?? "") && arRow.name === "Rea Quest" && arRow.company === "Acme" && arRow.team_size === "2-10" && arRow.use_case === arBody.use_case && arRow.interest === "evaluate" && arRow.status === "pending" && !Number.isNaN(Date.parse(arRow.created_at)) && arRow.decided_at === null,
    `${ar1.status} ${ar1.text} ${JSON.stringify(arRow)}`,
  );
  const ar2 = await ar({ ...arBody, interest: "try" });
  const arAll = withDb((d) => d.prepare("SELECT interest FROM v2_access_requests WHERE email = ?").all("req@example.test"));
  check("access: sending again while a request is pending updates that one request, with the same answer", ar2.status === 201 && ar2.text === ar1.text && arAll.length === 1 && arAll[0].interest === "try", `${ar2.status} ${JSON.stringify(arAll)}`);
  const arBad = await Promise.all([ar({ ...arBody, interest: "sign" }), ar({ ...arBody, email: "not-an-email" }), ar({ ...arBody, use_case: " " }), ar({ ...arBody, team_size: "9" }), ar({ ...arBody, use_case: "x".repeat(501) }), ar(arBody, { origin: "http://evil.example" })]);
  check(
    "access: an unknown interest, a bad email, an empty or 501-character use, an unknown team size -> 400; another site's Origin -> 403 cross_site",
    arBad.slice(0, 5).every((r) => r.status === 400) && arBad[5].status === 403 && arBad[5].json?.error === "cross_site",
    arBad.map((r) => r.status).join(","),
  );
  const ar3 = await ar(arBody);
  const ar4 = await ar(arBody);
  check("access: a 4th request for one address within a day -> 429 rate_limited (counted durably)", ar3.status === 201 && ar4.status === 429 && ar4.json?.error === "rate_limited", `${ar3.status} ${ar4.status}`);
  const arDisposable = await ar({ ...arBody, email: "someone@mailinator.com" });
  const ar5 = await ar({ ...arBody, email: "other@example.test" });
  const ar6 = await ar({ ...arBody, email: "third@example.test" });
  check(
    "access: Mode L blocks no disposable domain (mailinator.com -> 201); the 6th request from one client within an hour -> 429",
    arDisposable.status === 201 && ar5.status === 201 && ar6.status === 429 && withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM v2_rate_hits WHERE key LIKE 'access-email:%' AND key LIKE '%example.test%'").get().n) === 0,
    `${arDisposable.status} ${ar5.status} ${ar6.status}`,
  );
  // -- the operator script on access requests and codes (Mode L: no email settings, so a code is printed) --
  const opEnv = { ALIGN_DATA_DIR: localDir };
  const reqList = admin(["requests", "list", "--status", "pending"], opEnv);
  const otherId = withDb((d) => d.prepare("SELECT id FROM v2_access_requests WHERE email = ?").get("other@example.test").id);
  check(
    "align-admin: requests list --status pending lists each request (id, status, interest, name, email, company, team size, use)",
    reqList.status === 0 && reqList.out.includes(arRow.id) && reqList.out.includes("Rea Quest <req@example.test>, Acme, team 2-10") && reqList.out.includes(arBody.use_case) && reqList.out.includes(otherId) && !/ExperimentalWarning/.test(reqList.err),
    reqList.out + reqList.err,
  );
  const approved = admin(["requests", "approve", arRow.id], opEnv);
  const approvedCode = codesIn(approved.out)[0] ?? "";
  const arAfter = withDb((d) => d.prepare("SELECT status, decided_at, code_id FROM v2_access_requests WHERE id = ?").get(arRow.id));
  const codeRow = withDb((d) => d.prepare("SELECT * FROM v2_creation_codes WHERE id = ?").get(arAfter.code_id ?? ""));
  check(
    "align-admin: requests approve, with no email settings, prints one email-bound code (alc_…) once; the request is approved and names the code; the code is bound to that address, expires in 14 days, and only its HMAC is stored",
    approved.status === 0 && codesIn(approved.out).length === 1 && arAfter.status === "approved" && arAfter.decided_at && codeRow?.email === "req@example.test" && codeRow.request_id === arRow.id && Math.abs(Date.parse(codeRow.expires_at) - Date.now() - 14 * 864e5) < 6e4 && codeRow.code_hash !== approvedCode && dbFilesLack(dbFile, approvedCode),
    approved.out + approved.err + JSON.stringify(codeRow),
  );
  const again = admin(["requests", "approve", arRow.id], opEnv);
  const declined = admin(["requests", "decline", otherId], opEnv);
  check(
    "align-admin: approving a request that is no longer pending exits 1; requests decline marks one declined and sends nothing",
    again.status === 1 && /No pending request/.test(again.err) && declined.status === 0 && withDb((d) => d.prepare("SELECT status FROM v2_access_requests WHERE id = ?").get(otherId).status) === "declined" && admin(["requests", "list", "--status", "declined"], opEnv).out.includes(otherId),
    `${again.status} ${again.err} ${declined.status} ${declined.err}`,
  );
  const made = admin(["codes", "create", "--count", "2", "--days", "3"], opEnv);
  const madeCodes = codesIn(made.out);
  const listed = admin(["codes", "list"], opEnv);
  const madeIds = [...made.out.matchAll(/\((cc_[a-z2-7]{24}), anyone, until/g)].map((m) => m[1]);
  check(
    "align-admin: codes create --count 2 --days 3 prints 2 distinct unbound codes once; codes list shows ids, states and bindings and never a code",
    made.status === 0 && madeCodes.length === 2 && madeCodes[0] !== madeCodes[1] && madeIds.length === 2 && listed.status === 0 && madeIds.every((id) => listed.out.includes(id)) && listed.out.includes("req@example.test") && listed.out.includes("live") && codesIn(listed.out).length === 0 && madeCodes.every((c) => dbFilesLack(dbFile, c)),
    made.out + made.err + listed.out,
  );
  const revoked = admin(["codes", "revoke", madeIds[0]], opEnv);
  const revokedAgain = admin(["codes", "revoke", madeIds[0]], opEnv);
  const badArgs = [admin(["codes", "create", "--count", "0"], opEnv), admin(["codes", "create", "--email", "nope"], opEnv), admin(["requests", "list", "--status", "maybe"], opEnv), admin(["nothing", "here"], opEnv)];
  check(
    "align-admin: codes revoke revokes an unused code (shown as revoked; a second revoke exits 1); bad arguments exit 2 with the usage",
    revoked.status === 0 && revokedAgain.status === 1 && /revoked/.test(admin(["codes", "list"], opEnv).out) && badArgs.every((r) => r.status === 2),
    `${revoked.status} ${revokedAgain.status} ${badArgs.map((r) => r.status).join(",")}`,
  );
  const noDb = admin(["codes", "list"], { ALIGN_DATA_DIR: path.join(tmpRoot, "nowhere") });
  check("align-admin: with no database at ALIGN_DATA_DIR it exits 1 and says so", noDb.status === 1 && /No Align database/.test(noDb.err), noDb.err);
  const loopback = await call("anon", "GET", "/api/v2/me");
  check("local: loopback is not a credential (/api/v2/me without a cookie -> 401)", loopback.status === 401 && loopback.json?.error === "unauthorized", loopback.text);
  await stopServer();
  check("single server: a stopped server removes its <data>/.pid", !existsSync(path.join(localDir, ".pid")), "still there");
  const lineBefore = signInLine(localDir);
  const restarted = await mustStart({ ALIGN_DATA_DIR: localDir });
  check("local owner: a later start makes no account and sends no code", !restarted.stdout().includes("Align sign-in for") && signInLine(localDir) === lineBefore && withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM ba_user WHERE name = 'Local owner'").get().n) === 1, restarted.stdout().slice(-300));
  await stopServer();
  const noServer = spawnSync(process.execPath, ["scripts/sign-in-link.mjs"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PORT: String(PORT) } });
  check("sign-in-link: with no server running it exits 1 saying so", noServer.status === 1 && /No Align server is running/.test(noServer.stderr), `${noServer.status} ${noServer.stderr}`);

  // ======== phase on: Mode L with the test identity provider (ALIGN_TEST_IDP=1) ========
  const onDir = path.join(tmpRoot, "on");
  // The hosted creation gate, caps and Turnstile keys are set here only to show that Mode L ignores every one of them:
  // the whole phase below creates workspaces, invites members and shares sessions freely.
  const ignoredInModeL = { ALIGN_CREATION: "closed", ALIGN_MAX_WORKSPACES: "1", ALIGN_MAX_OWNED_WORKSPACES: "1", ALIGN_MAX_MEMBERS: "1", ALIGN_MAX_SESSIONS_PER_DEVICE_DAY: "1", ALIGN_TURNSTILE_SITE_KEY: "site-key-mode-l", ALIGN_TURNSTILE_SECRET_KEY: "secret-mode-l" };
  await mustStart({ ALIGN_DATA_DIR: onDir, ALIGN_TEST_IDP: "1", ...ignoredInModeL });
  dbFile = path.join(onDir, "v2", "align.sqlite");
  const mode = (p) => (statSync(p).mode & 0o777).toString(8);
  check("storage: v2 directory 0700 and database file 0600", mode(path.join(onDir, "v2")) === "700" && mode(dbFile) === "600", `${mode(path.join(onDir, "v2"))} ${mode(dbFile)}`);
  const pragmas = withDb((d) => ({ jm: d.prepare("PRAGMA journal_mode").get().journal_mode, uv: d.prepare("PRAGMA user_version").get().user_version, tables: d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name) }));
  check("storage: WAL, migrated (user_version 6), v2_ tables (connected-app grants, change requests, creation codes, access requests and durable limits included) and Better Auth tables", pragmas.jm === "wal" && pragmas.uv === 6 && ["v2_usage", "v2_activity", "v2_goal_acks", "v2_oauth_grants", "v2_change_requests", "v2_change_request_revisions", "v2_creation_codes", "v2_access_requests", "v2_rate_hits", "ba_user"].every((t) => pragmas.tables.includes(t)), JSON.stringify(pragmas));

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
  const otherPortSignIn = await call("anon", "POST", "/api/v2/auth/sign-in/email", { headers: { origin: `http://127.0.0.1:${Number(PORT) + 1}` }, body: { email: "u1@example.test", password: "pw-U1-123456" } });
  check("auth: sign-in from another localhost port is refused (only this server's own origin is trusted)", otherPortSignIn.status === 403, `${otherPortSignIn.status}`);
  // A test-IdP account's email is not verified: an email code for it is refused, and the account is left as it was.
  await sendCode("anon", "u1@example.test");
  const u1Code = codeIn(signInLine(onDir));
  const u1Wrong = await codeSignIn("anon", "u1@example.test", u1Code === "000000" ? "000001" : "000000");
  const u1Right = await codeSignIn("anon", "u1@example.test", u1Code);
  const u1Row = withDb((d) => d.prepare("SELECT emailVerified, (SELECT COUNT(*) FROM ba_account WHERE userId = ba_user.id) AS accounts FROM ba_user WHERE id = ?").get(U1.id));
  check(
    "accounts: a valid code for an account whose email is unverified -> 403 email_unverified; nothing signed in or changed (a wrong code is just INVALID_OTP)",
    u1Wrong.status === 400 && u1Wrong.json?.code === "INVALID_OTP" && u1Right.status === 403 && u1Right.json?.code === "email_unverified" && u1Right.setCookies.length === 0 && u1Row.emailVerified === 0 && u1Row.accounts === 1,
    `${u1Wrong.status} ${u1Right.status} ${u1Right.text} ${JSON.stringify(u1Row)}`,
  );

  // -- workspaces, invites, teams --
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
  const pod = await call("U1", "POST", `/api/v2/workspaces/${A}/teams`, { cookie: U1.cookie, body: { name: "Platform team" } });
  const P1 = pod.json?.id;
  const addLead = await call("U1", "POST", `/api/v2/workspaces/${A}/teams/${P1}/members`, { cookie: U1.cookie, body: { user_id: U2.id, role: "lead" } });
  const leadAdds = await call("U2", "POST", `/api/v2/workspaces/${A}/teams/${P1}/members`, { cookie: U2.cookie, body: { user_id: U3.id, role: "member" } });
  const memberAdds = await call("U3", "POST", `/api/v2/workspaces/${A}/teams/${P1}/members`, { cookie: U3.cookie, body: { user_id: U4.id, role: "member" } });
  check("teams: owner creates a team (pod_ id) and adds a lead; the lead adds a member ({team_id, user_id, role}); a team member can't (403 not_team_lead)", pod.status === 201 && /^pod_/.test(P1) && addLead.status === 200 && addLead.json?.team_id === P1 && !("pod_id" in (addLead.json ?? {})) && leadAdds.status === 200 && memberAdds.status === 403 && memberAdds.json?.error === "not_team_lead", `${pod.status} ${addLead.text} ${leadAdds.status} ${memberAdds.status} ${memberAdds.text}`);
  const leadPromotes = await call("U2", "POST", `/api/v2/workspaces/${A}/teams/${P1}/members`, { cookie: U2.cookie, body: { user_id: U3.id, role: "lead" } });
  check("teams: a lead can't make someone a lead (403 owner_only, says team lead); only a workspace owner can", leadPromotes.status === 403 && leadPromotes.json?.error === "owner_only" && /team lead/.test(leadPromotes.json?.message) && !/pod/i.test(leadPromotes.text), `${leadPromotes.status} ${leadPromotes.text}`);
  // The old /pods paths answer exactly like /teams.
  const aliasPod = await call("U1", "POST", `/api/v2/workspaces/${A}/pods`, { cookie: U1.cookie, body: { name: "Alias team" } });
  const aliasSet = await call("U1", "POST", `/api/v2/workspaces/${A}/pods/${aliasPod.json?.id}/members`, { cookie: U1.cookie, body: { user_id: U3.id, role: "member" } });
  const aliasDel = await call("U1", "DELETE", `/api/v2/workspaces/${A}/pods/${aliasPod.json?.id}/members/${U3.id}`, { cookie: U1.cookie });
  check("teams: the /pods paths are aliases (create 201, set member -> {team_id,...}, remove 204)", aliasPod.status === 201 && /^pod_/.test(aliasPod.json?.id) && aliasSet.status === 200 && aliasSet.json?.team_id === aliasPod.json?.id && aliasDel.status === 204, `${aliasPod.status} ${aliasSet.text} ${aliasDel.status}`);
  const multi = await call("U1", "POST", `/api/v2/workspaces/${A}/teams/${aliasPod.json?.id}/members`, { cookie: U1.cookie, body: { user_id: U2.id, role: "member" } });
  const wsView = await call("U2", "GET", `/api/v2/workspaces/${A}`, { cookie: U2.cookie });
  const wsList = await call("U2", "GET", "/api/v2/workspaces", { cookie: U2.cookie });
  const inTeams = (wsView.json?.teams ?? []).filter((t) => t.members.some((m) => m.id === U2.id)).map((t) => t.id);
  check(
    "teams: a person can be in several teams; GET /workspaces/{ws} lists teams (no pods key), GET /workspaces lists my teams",
    multi.status === 200 && inTeams.includes(P1) && inTeams.includes(aliasPod.json?.id) && !("pods" in (wsView.json ?? {})) && wsList.json?.workspaces?.find((w) => w.id === A)?.teams?.length === 2,
    `${multi.status} ${JSON.stringify(inTeams)} ${wsList.text.slice(0, 200)}`,
  );
  await call("U1", "POST", `/api/v2/workspaces/${A}/teams/${aliasPod.json?.id}/members`, { cookie: U1.cookie, body: { user_id: U2.id, role: "lead" } });
  const leadSelf = await call("U2", "DELETE", `/api/v2/workspaces/${A}/teams/${aliasPod.json?.id}/members/${U2.id}`, { cookie: U2.cookie });
  check("teams: a lead removes themselves from the team -> 204", leadSelf.status === 204, `${leadSelf.status} ${leadSelf.text}`);

  // -- goals --
  const CANARY = `CANARY-PRIV-${randomBytes(6).toString("hex")}`;
  const mkGoal = (u, body) => call(u.who, "POST", `/api/v2/workspaces/${A}/goals`, { cookie: u.cookie, body });
  const G1 = (await mkGoal(U1, { title: "Ship onboarding v2", visibility: "workspace", measures: [{ text: "Activation rate", target: "40%" }], anchors: { repos: ["github.com/acme/web"] } })).json;
  const G2 = (await mkGoal(U2, { title: "Platform reliability", visibility: "team", team_id: P1, measures: [{ text: "p99 latency", target: "200ms" }] })).json;
  const GP = (await mkGoal(U2, { title: `${CANARY} secret plan`, visibility: "private", measures: [{ text: `${CANARY} measure`, target: null }] })).json;
  const G3 = (await mkGoal(U3, { title: "Docs refresh", visibility: "workspace" })).json;
  const GB = (await call("U4", "POST", `/api/v2/workspaces/${B}/goals`, { cookie: U4.cookie, body: { title: "B goal" } })).json;
  check("goals: create workspace, team, private and B goals -> g_ ids at version 1", [G1, G2, GP, G3, GB].every((g) => /^g_/.test(g?.id) && g.version === 1), JSON.stringify([G1, G2, GP, G3, GB].map((g) => g?.id ?? g)));
  const viewerGoal = await mkGoal(U4, { title: "Viewer goal" });
  check("rbac: a viewer creating a goal -> 403 read_only", viewerGoal.status === 403 && viewerGoal.json?.error === "read_only", viewerGoal.text);
  const notInPod = await mkGoal(U1, { title: "Owner team goal", visibility: "team", team_id: P1 });
  check("rbac: a team goal from someone outside the team (even the workspace owner) -> 403 not_in_team", notInPod.status === 403 && notInPod.json?.error === "not_in_team", notInPod.text);
  const teamNoId = await mkGoal(U2, { title: "Team goal without a team", visibility: "team" });
  const podVis = await mkGoal(U2, { title: "Old visibility word", visibility: "pod", team_id: P1 });
  const podIdAlias = await mkGoal(U2, { title: "Old key", visibility: "team", pod_id: P1 });
  check("goals: visibility team without team_id -> 400; the old visibility pod and the old pod_id key are not accepted (400)", teamNoId.status === 400 && podVis.status === 400 && podIdAlias.status === 400, `${teamNoId.status} ${podVis.status} ${podIdAlias.status}`);
  check("goals: the wire says team, team_id never pod (visibility team, team {id, name}, level team)", G2.visibility === "team" && G2.team?.id === P1 && G2.team?.name === "Platform team" && G2.level === "team" && !("pod" in G2), JSON.stringify(G2).slice(0, 300));
  const feedOf = async (u) => (await call(u.who, "GET", `/api/v2/workspaces/${A}/goals`, { cookie: u.cookie })).json?.goals?.map((g) => g.id) ?? [];
  const feeds = { U1: await feedOf(U1), U2: await feedOf(U2), U3: await feedOf(U3), U4: await feedOf(U4) };
  check("visibility: the private goal is in its owner's feed only (not the workspace owner's)", feeds.U2.includes(GP.id) && !feeds.U1.includes(GP.id) && !feeds.U3.includes(GP.id) && !feeds.U4.includes(GP.id), JSON.stringify(feeds));
  check("visibility: the team goal reaches team members and the workspace owner, not the viewer outside the team", feeds.U1.includes(G2.id) && feeds.U2.includes(G2.id) && feeds.U3.includes(G2.id) && !feeds.U4.includes(G2.id), JSON.stringify(feeds));
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
      [`/api/v2/workspaces/${B}/teams`, { name: "x" }],
      [`/api/v2/workspaces/${B}/alignments`, { target_goal_id: GB.id, choice: "contribution", session_keys: [] }],
      [`/api/v2/workspaces/${B}/goals/${GB.id}/versions`, { title: "y" }],
    ].map(([p, b]) => call("U1", "POST", p, { cookie: U1.cookie, body: b })),
  );
  check("rbac: a non-member on every workspace B route (GET and POST) -> 404", [...nonMember, ...nonMemberW].every((r) => r.status === 404), [...nonMember, ...nonMemberW].map((r) => r.status).join(","));
  const notOwnerEdit = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${G1.id}/versions`, { cookie: U3.cookie, body: { title: "hijack" } });
  check("rbac: editing someone else's goal -> 403 not_goal_owner", notOwnerEdit.status === 403 && notOwnerEdit.json?.error === "not_goal_owner", notOwnerEdit.text);
  const viewerWrites = await Promise.all([
    call("U4", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U4.cookie, body: { email: "q@example.test", role: "member" } }),
    call("U4", "POST", `/api/v2/workspaces/${A}/teams`, { cookie: U4.cookie, body: { name: "x" } }),
    call("U4", "POST", `/api/v2/workspaces/${A}/alignments`, { cookie: U4.cookie, body: { target_goal_id: G1.id, choice: "contribution", session_keys: [] } }),
  ]);
  check("rbac: viewer writes (invite, team, alignment) -> 403", viewerWrites.every((r) => r.status === 403), viewerWrites.map((r) => `${r.status}:${r.json?.error}`).join(","));
  const bearerOnWeb = await Promise.all([
    call("anon", "GET", "/api/v2/workspaces", { bearer: "alnd_x", cookie: U1.cookie }),
    call("anon", "GET", "/api/v2/auth/get-session", { bearer: "alnd_x", cookie: U1.cookie }),
    call("anon", "POST", `/api/v2/workspaces/${A}/goals`, { bearer: "alnd_x", cookie: U1.cookie, body: { title: "x" } }),
  ]);
  check("web routes refuse a Bearer token (even with a valid cookie) -> 403 bearer_not_allowed", bearerOnWeb.every((r) => r.status === 403 && r.json?.error === "bearer_not_allowed"), bearerOnWeb.map((r) => r.status).join(","));
  const crossSite = await call("U1", "POST", `/api/v2/workspaces/${A}/goals`, { cookie: U1.cookie, headers: { origin: "http://evil.example" }, body: { title: "csrf" } });
  const textPlain = await call("U1", "POST", `/api/v2/workspaces/${A}/goals`, { cookie: U1.cookie, headers: { "content-type": "text/plain" }, raw: JSON.stringify({ title: "csrf" }) });
  check("web writes: a foreign Origin -> 403 cross_site; text/plain -> 415", crossSite.status === 403 && crossSite.json?.error === "cross_site" && textPlain.status === 415, `${crossSite.status} ${textPlain.status}`);
  const otherPorts = await Promise.all([`http://localhost:5555`, `http://127.0.0.1:${PORT + 1}`, "null"].map((o) => call("U1", "POST", `/api/v2/workspaces/${A}/goals`, { cookie: U1.cookie, headers: { origin: o }, body: { title: "csrf" } })));
  const crossSiteFetch = await call("U1", "POST", `/api/v2/workspaces/${A}/goals`, { cookie: U1.cookie, headers: { "sec-fetch-site": "cross-site" }, body: { title: "csrf" } });
  check(
    "web writes (Mode L): another local port, a null Origin, or Sec-Fetch-Site cross-site -> 403 cross_site",
    [...otherPorts, crossSiteFetch].every((r) => r.status === 403 && r.json?.error === "cross_site"),
    [...otherPorts, crossSiteFetch].map((r) => `${r.status}:${r.json?.error}`).join(" "),
  );

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
  // Recent sign-in: approving a device needs a sign-in from the last 15 minutes; looking up and denying do not.
  const U1old = { ...U1, cookie: cookieOf((await call("U1", "POST", "/api/v2/auth/sign-in/email", { headers: { origin: BASE }, body: { email: U1.email, password: "pw-U1-123456" } })).setCookies) };
  const aged = ageSession(U1old.cookie, 20);
  const lookOld = await call("U1", "GET", `/api/v2/device/requests/${auth1.json.user_code}`, { cookie: U1old.cookie });
  const approveOld = await call("U1", "POST", "/api/v2/device/approve", { cookie: U1old.cookie, body: { user_code: auth1.json.user_code, workspace_ids: [A] } });
  const stillPending = withDb((d) => d.prepare("SELECT state FROM v2_device_requests WHERE user_code = ?").get(auth1.json.user_code)?.state);
  check(
    "recent sign-in: a 20-minute-old session approving a device -> 403 reauth_required, nothing approved (looking the code up still works)",
    aged === 1 && lookOld.status === 200 && approveOld.status === 403 && approveOld.json?.error === "reauth_required" && stillPending === "pending",
    `${aged} ${lookOld.status} ${approveOld.status} ${approveOld.text} ${stillPending}`,
  );
  const devPageOld = await call("U1", "GET", `/app/device?code=${auth1.json.user_code}`, { cookie: U1old.cookie });
  const devPageNew = await call("U1", "GET", "/app/device", { cookie: U1.cookie });
  check(
    "ui: /app/device with an old sign-in shows the sign-in-again prompt instead of the code form; a recent one shows the form",
    devPageOld.status === 200 && devPageOld.text.includes("Sign in again to approve a device. Approving needs a sign-in from the last 15 minutes.") && !devPageOld.text.includes("Look up") && devPageNew.text.includes("Look up") && !devPageNew.text.includes("Sign in again to approve"),
    `${devPageOld.status} ${devPageNew.status}`,
  );
  const approveB = await call("U1", "POST", "/api/v2/device/approve", { cookie: U1.cookie, body: { user_code: auth1.json.user_code, workspace_ids: [A, B] } });
  check("device: approving a workspace you are not in (B) -> 404", approveB.status === 404, `${approveB.status}`);
  const approve = await call("U1", "POST", "/api/v2/device/approve", { cookie: U1.cookie, body: { user_code: auth1.json.user_code, workspace_ids: [A] } });
  withDb((d) => d.prepare("UPDATE v2_device_requests SET last_poll_at = NULL WHERE user_code = ?").run(auth1.json.user_code));
  const tok = await poll(auth1.json.device_code);
  check("device: after approval (a recent sign-in), token -> 200 dv_ id, alnd_ access (3600 s), alnr_ refresh, user", approve.status === 200 && tok.status === 200 && /^dv_/.test(tok.json.device_id) && /^alnd_/.test(tok.json.access_token) && tok.json.expires_in === 3600 && /^alnr_/.test(tok.json.refresh_token) && tok.json.user.id === U1.id, tok.text);
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
  const deny = await call("U1", "POST", "/api/v2/device/deny", { cookie: U1old.cookie, body: { user_code: authDen.json.user_code } });
  const denPoll = await poll(authDen.json.device_code);
  check("device: a denied code -> access_denied (denying needs no recent sign-in: this session is 20 minutes old)", deny.status === 200 && denPoll.json?.error === "access_denied", `${deny.status} ${denPoll.text}`);
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

  // -- MCP with a device token (specs/align/mcp.md; scripts/test-oauth.mjs has the rest) --
  const mcpCall = async (who, dev, name, args = {}) => {
    const r = await call(who, "POST", "/api/mcp", { bearer: dev.access, headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    const line = r.text.includes("data:") ? r.text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) : r.text;
    let m = null;
    try {
      m = JSON.parse(line);
    } catch {}
    return { status: r.status, sc: m?.result?.structuredContent ?? null, text: m?.result?.content?.[0]?.text ?? "", isError: !!m?.result?.isError };
  };
  const mcpGoals = await mcpCall("U3", D3, "align_list_goals");
  const feed = (await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access })).json?.goals ?? [];
  const feedGoals = feed.map((g) => g.id);
  check("mcp: a device token reads its one workspace's goals as its person (the same ids as the goals feed)", mcpGoals.status === 200 && mcpGoals.sc?.workspace?.id === A && JSON.stringify(mcpGoals.sc.goals.map((g) => g.id)) === JSON.stringify(feedGoals), `${mcpGoals.status} ${mcpGoals.text.slice(0, 200)}`);
  const wireOf = (g) => JSON.stringify([g.level, g.visibility, g.team?.id ?? null]);
  check(
    "mcp: each goal's level, visibility and team match the goals feed (team, never pod)",
    mcpGoals.sc?.goals?.length === feed.length && mcpGoals.sc.goals.every((g, i) => wireOf(g) === wireOf(feed[i]) && !("pod" in g)) && !/\bpod\b/.test(mcpGoals.text),
    JSON.stringify([mcpGoals.sc?.goals?.map(wireOf), feed.map(wireOf)]),
  );
  const mcpOwner = await mcpCall("U1", D1, "align_list_goals");
  check("mcp: the workspace owner's device doesn't get another member's private goal; titles are marked untrusted_text", mcpOwner.sc && !mcpOwner.sc.goals.some((g) => g.id === GP.id) && mcpOwner.sc.goals.every((g) => typeof g.title?.untrusted_text === "string"), mcpOwner.text.slice(0, 200));
  const mcpTwo = await mcpCall("U4", D4, "align_list_goals");
  const mcpTwoB = await mcpCall("U4", D4, "align_list_goals", { workspace: B });
  check("mcp: a device with two workspaces must name one; naming B reads B", mcpTwo.isError && mcpTwo.text === "Name a workspace: this device can read several" && mcpTwoB.sc?.workspace?.id === B, `${mcpTwo.text} ${mcpTwoB.text.slice(0, 80)}`);
  const mcpRefresh = await call("U1", "POST", "/api/mcp", { bearer: D1.refresh, headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
  const mcpAgent = await call("U1", "POST", "/api/mcp", { bearer: "agt.e30.AAAA", headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
  check("mcp: a device refresh token and an agt. token -> 401", mcpRefresh.status === 401 && mcpAgent.status === 401, `${mcpRefresh.status} ${mcpAgent.status}`);

  // -- connected apps (none yet: test-oauth.mjs connects some) --
  const appsA = await call("U1", "GET", `/api/v2/workspaces/${A}/apps`, { cookie: U1.cookie });
  const appsB = await call("U1", "GET", `/api/v2/workspaces/${B}/apps`, { cookie: U1.cookie });
  const appsDel = await call("U2", "DELETE", `/api/v2/workspaces/${A}/apps/gr_AAAAAAAAAAAAAAAA`, { cookie: U2.cookie });
  const appsBearer = await call("U1", "GET", `/api/v2/workspaces/${A}/apps`, { bearer: D1.access });
  check(
    "apps: GET /apps -> {url: <origin>/api/mcp, apps: []}; a non-member -> 404; DELETE an unknown grant -> 404; a device token -> 403",
    appsA.status === 200 && appsA.json.url === `${BASE}/api/mcp` && Array.isArray(appsA.json.apps) && appsA.json.apps.length === 0 && appsB.status === 404 && appsDel.status === 404 && appsBearer.status === 403,
    `${appsA.text} ${appsB.status} ${appsDel.status} ${appsBearer.status}`,
  );

  // -- goals feed: ETag / 304 / bindable --
  const f1 = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access });
  const etag = f1.headers.get("etag");
  const f2 = await call("U3", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D3.access, headers: { "if-none-match": etag } });
  const bind = Object.fromEntries((f1.json?.goals ?? []).map((g) => [g.id, g.bindable]));
  check("feed: ETag matches the version; If-None-Match -> 304 with no body", f1.status === 200 && etag === `"${f1.json.version}"` && f2.status === 304 && f2.text === "", `${f1.status} ${etag} ${f2.status}`);
  check("feed: bindable = own goal or team goal (U3: G3 yes, G2 yes via team, G1 no)", bind[G3.id] === true && bind[G2.id] === true && bind[G1.id] === false && !(GP.id in bind), JSON.stringify(bind));
  const f1Goal = f1.json.goals.find((g) => g.id === G1.id);
  check("feed: a Goal carries id, version, title, measures (id, text, target), status, level, visibility, owner, team, anchors (no pod key)", f1Goal && f1Goal.measures[0].id && f1Goal.measures[0].target === "40%" && f1Goal.owner.id === U1.id && f1Goal.team === null && f1Goal.level === "team" && f1Goal.visibility === "workspace" && !("pod" in f1Goal) && f1Goal.anchors.repos[0] === "github.com/acme/web" && Array.isArray(f1Goal.anchors.issues), JSON.stringify(f1Goal));

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
  check("epochs: binding to a goal that isn't yours or your team's -> 403 alignment_required", needAl.status === 403 && needAl.json?.error === "alignment_required", needAl.text);
  const privBind = await epoch(D3, S3a, { epoch_id: E1, goal_id: GP.id, starts_at: T0 });
  check("epochs: binding to someone's private goal -> 404", privBind.status === 404, `${privBind.status}`);
  const e1 = await epoch(D3, S3a, { epoch_id: E1, goal_id: G3.id, starts_at: T0 });
  const e1Again = await epoch(D3, S3a, { epoch_id: E1, goal_id: G3.id, starts_at: T0 });
  const e1Conflict = await epoch(D3, S3a, { epoch_id: E1, goal_id: G2.id, starts_at: T0 });
  check("epochs: a first epoch may start at the session's start; the same epoch again is idempotent; same id with other values -> 409", e1.status === 200 && e1.json.starts_at === T0 && e1.json.ends_at === null && e1.json.goal_version_at_start === 1 && e1Again.status === 200 && e1Conflict.status === 409, `${e1.text} ${e1Again.status} ${e1Conflict.status}`);
  const e2 = await epoch(D3, S3a, { epoch_id: E2, goal_id: G2.id, starts_at: at(60), root_turn: "turn-7" });
  const e1Row = withDb((d) => d.prepare("SELECT ends_at FROM v2_epochs WHERE epoch_id = ?").get(E1));
  check("epochs: a team goal binds; opening it closes the previous epoch at its start", e2.status === 200 && e1Row.ends_at === at(60), `${e2.text} ${JSON.stringify(e1Row)}`);
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
  for (const u of users) for (const by of ["goal", "team", "session"]) sp[`${u.who}:${by}`] = await spendOf(u, by);
  check("spend: total = sum of rows + unallocated, for every number, for U1..U4 by goal, team and session", Object.values(sp).every((s) => s && invariantHolds(s)), Object.entries(sp).filter(([, s]) => !s || !invariantHolds(s)).map(([k]) => k).join(" "));
  const g1 = sp["U1:goal"];
  check("spend: 8 requests in total; 2 unallocated; 1 unpriced; basis sums present", g1.total.requests === 8 && g1.unallocated.requests === 2 && g1.unpriced_requests === 1 && g1.total.by_basis.subscription_included.requests >= 4 && g1.total.by_basis.api_usd.requests === 1, JSON.stringify(g1.total).slice(0, 300));
  const privRowU1 = g1.rows.find((r) => r.kind === "private");
  const privRowU2 = sp["U2:goal"].rows.find((r) => r.goal?.id === GP.id);
  check("spend: the private goal's usage is an unnamed private row for others (workspace owner included) and named for its owner", privRowU1 && privRowU1.input === 7777 && !privRowU1.goal && privRowU2 && privRowU2.input === 7777, JSON.stringify(g1.rows.map((r) => r.label)));
  const sessRows = sp["U3:session"].rows;
  check("spend: by session names only the caller's own sessions; everyone else's is one row", sessRows.some((r) => r.kind === "session") && sessRows.filter((r) => r.kind === "others").length === 1 && !sessRows.some((r) => r.kind === "session" && r.label.startsWith("U1")), JSON.stringify(sessRows.map((r) => r.label)));
  const viewerSpend = sp["U4:goal"];
  const teamRows = sp["U1:team"].rows;
  const podAlias = await spendOf(U1, "pod");
  const badBy = await call("U1", "GET", `/api/v2/workspaces/${A}/spend?by=person`, { cookie: U1.cookie });
  check(
    "spend: by=team rows carry team {id, name}; goals with no team are one 'Goals without a team' row; by=pod is the same as by=team; another by -> 400",
    teamRows.some((r) => r.kind === "team" && r.team?.id === P1 && r.label === "Platform team") && teamRows.filter((r) => r.kind === "no_team" && r.label === "Goals without a team").length === 1 && teamRows.every((r) => !("pod" in r) && r.kind !== "pod" && r.kind !== "no_pod") && podAlias.by === "team" && JSON.stringify(podAlias.rows) === JSON.stringify(teamRows) && badBy.status === 400,
    `${JSON.stringify(teamRows.map((r) => [r.kind, r.label]))} ${podAlias.by} ${badBy.status}`,
  );
  check("spend: a viewer may read spend; the team goal it can't see is in the private row", viewerSpend.rows.some((r) => r.kind === "private") && !viewerSpend.rows.some((r) => r.goal?.id === G2.id), JSON.stringify(viewerSpend.rows.map((r) => r.label)));
  const ranged = (await call("U1", "GET", `/api/v2/workspaces/${A}/spend?by=goal&from=${encodeURIComponent(new Date().toISOString())}`, { cookie: U1.cookie })).json;
  check("spend: from/to filter by request time", ranged.total.requests === 0 && invariantHolds(ranged), JSON.stringify(ranged.total).slice(0, 100));

  // -- directives --
  const dirs = async (dev, cursor = 0) => (await call(dev.who, "GET", `/api/v2/directives?cursor=${cursor}`, { bearer: dev.access })).json;
  const before3 = await dirs(D3);
  const v2G2 = await call("U2", "POST", `/api/v2/workspaces/${A}/goals/${G2.id}/versions`, { cookie: U2.cookie, body: { version: 1, title: "Platform reliability (p99)" } });
  const after3 = await dirs(D3, before3.next_cursor);
  const gv = after3.directives.find((d) => d.kind === "goal_version");
  check("directives: a new goal version -> 201 version 2, and a goal_version directive for the session bound to it (its goal snapshot carries team and level)", v2G2.status === 201 && v2G2.json.version === 2 && gv && gv.session_keys.length === 1 && gv.session_keys[0] === S3a && gv.goal.version === 2 && gv.goal.title === "Platform reliability (p99)" && gv.goal.team?.id === P1 && gv.goal.level === "team" && gv.goal.visibility === "team" && !("pod" in gv.goal) && /^dir_/.test(gv.id) && gv.ws === A && gv.binding === null, JSON.stringify(after3));
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
  const reqOf = (v, forId) => v?.requirements?.find((r) => r.for === forId);
  check(
    "alignment (contribution): effects contributes_to only; requirements = the target's set (its owner) and the source's set (the requester, who owns it, already counted)",
    contrib.status === 201 && contrib.json.effects.map((e) => e.kind).join() === "contributes_to" && contrib.json.requirements.length === 2 && reqOf(contrib.json, G1.id)?.approvers.map((a) => a.id).join() === U1.id && reqOf(contrib.json, G1.id)?.approved_by === null && reqOf(contrib.json, G3.id)?.approved_by?.id === U3.id && contrib.json.state === "pending",
    contrib.text,
  );
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
  // A team member may name a team-mate's goal as the source, but linking it under their own goal needs its owner's approval.
  const podMateSource = await al(U3, { target_goal_id: G3.id, source_goal_id: G2.id, choice: "contribution", session_keys: [], note: null });
  const podMateSeen = await getAl(U2, podMateSource.json?.id);
  check("alignment: a team-mate's goal as the source -> pending until its owner approves; the owner can see the request", podMateSource.status === 201 && podMateSource.json.state === "pending" && podMateSource.json.approvers.some((a) => a.id === U2.id) && podMateSeen.status === 200, `${podMateSource.text.slice(0, 300)} ${podMateSeen.status}`);
  await act(U3, podMateSource.json.id, "withdraw", {});

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

  // work_toward for S3a, currently on G2 (U2's team goal): requirements G1 (U1), sessions:U3 (U3), G2 (U2: its owner and the team's lead)
  const wt = await al(U3, { target_goal_id: G1.id, choice: "work_toward", session_keys: [S3a], note: "Moving to onboarding" });
  const expected = [U1.id, U2.id, U3.id].sort().join();
  check(
    "alignment (work_toward): effects contributes_to + governing_goal + allocation_transfer; requirements for the target, sessions:<owner> and the goal the allocation leaves",
    wt.status === 201 && wt.json.effects.map((e) => e.kind).join() === "contributes_to,governing_goal,allocation_transfer" && wt.json.approvers.map((a) => a.id).sort().join() === expected && wt.json.approvers.find((a) => a.id === U3.id).approved === true && reqOf(wt.json, `sessions:${U3.id}`)?.approved_by?.id === U3.id && reqOf(wt.json, G2.id)?.approvers.map((a) => a.id).join() === U2.id && reqOf(wt.json, G1.id)?.approved_by === null,
    wt.text,
  );
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
  check("alignment: the requirement for a goal the approver can't read has for: null (its id is not shown)", privSourceSeen.json?.requirements?.some((r) => r.for === null) && !privSourceSeen.text.includes(GP.id), JSON.stringify(privSourceSeen.json?.requirements));

  // -- company goals --
  const GCo = await mkGoal(U1, { title: "Expand to regulated customers", level: "company" });
  check("company goals: an owner creates one -> 201 level company, team null, visibility workspace", GCo.status === 201 && GCo.json.level === "company" && GCo.json.team === null && GCo.json.visibility === "workspace" && GCo.json.version === 1 && GCo.json.owner.id === U1.id, GCo.text);
  const coMember = await mkGoal(U2, { title: "Member company goal", level: "company" });
  const coTeam = await mkGoal(U1, { title: "x", level: "company", team_id: P1 });
  const coPriv = await mkGoal(U1, { title: "x", level: "company", visibility: "private" });
  const coLevel = await mkGoal(U1, { title: "x", level: "division" });
  check("company goals: a member -> 403 owner_only; with a team or another visibility -> 400; an unknown level -> 400", coMember.status === 403 && coMember.json?.error === "owner_only" && coTeam.status === 400 && coPriv.status === 400 && coLevel.status === 400, `${coMember.status} ${coTeam.status} ${coPriv.status} ${coLevel.status}`);
  const viewerSeesCo = (await call("U4", "GET", `/api/v2/workspaces/${A}/goals`, { cookie: U4.cookie })).json?.goals?.find((g) => g.id === GCo.json.id);
  check("company goals: a viewer reads every company goal", viewerSeesCo?.level === "company", JSON.stringify(viewerSeesCo));
  const mcpCo = await mcpCall("U1", D1, "align_list_goals");
  const coOut = mcpCo.sc?.goals?.find((g) => g.id === GCo.json.id);
  const teamOut = mcpCo.sc?.goals?.find((g) => g.id === G2.id);
  check(
    "mcp: the company goal reads level company, team null, visibility workspace; a team goal reads level team, visibility team and its team",
    coOut?.level === "company" && coOut.team === null && coOut.visibility === "workspace" && teamOut?.level === "team" && teamOut.visibility === "team" && teamOut.team?.id === P1 && mcpCo.text.includes("company goal"),
    JSON.stringify({ coOut, teamOut }).slice(0, 400),
  );

  // -- approval sets: never instant against others; instant when the requester owns every goal --
  const toCo = await al(U3, { target_goal_id: GCo.json.id, source_goal_id: G3.id, choice: "contribution", session_keys: [] });
  check("approval: a member's goal contributing to a company goal -> pending; the company goal's set is the workspace owners", toCo.status === 201 && toCo.json.state === "pending" && reqOf(toCo.json, GCo.json.id)?.approvers.map((a) => a.id).join() === U1.id, toCo.text);
  const toCoOk = await act(U1, toCo.json.id, "approve", { revision: 1 });
  check("approval: one approval from the set satisfies the requirement and records approved_by", toCoOk.json?.state === "approved" && reqOf(toCoOk.json, GCo.json.id)?.approved_by?.id === U1.id, toCoOk.text);
  const own = await al(U1, { target_goal_id: GCo.json.id, source_goal_id: G1.id, choice: "contribution", session_keys: [] });
  const g1Parents = (await call("U1", "GET", `/api/v2/workspaces/${A}/goals/${G1.id}`, { cookie: U1.cookie })).json?.goal?.contributes_to ?? [];
  check("approval: instant when the requester owns both goals; the child lists the parent, reviewed", own.status === 201 && own.json.state === "approved" && g1Parents.some((p) => p.id === GCo.json.id && p.stale === false), `${own.text.slice(0, 200)} ${JSON.stringify(g1Parents)}`);
  // A lead asking against their own team's goal: their request doesn't satisfy it; the goal's owner must approve.
  await call("U1", "POST", `/api/v2/workspaces/${A}/teams/${P1}/members`, { cookie: U1.cookie, body: { user_id: U3.id, role: "lead" } });
  const leadAsks = await al(U3, { target_goal_id: G2.id, source_goal_id: G3.id, choice: "contribution", session_keys: [] });
  check("approval: a team lead requesting against their team's goal does not count; the set is the other people in it", leadAsks.status === 201 && leadAsks.json.state === "pending" && reqOf(leadAsks.json, G2.id)?.approvers.map((a) => a.id).join() === U2.id && reqOf(leadAsks.json, G2.id)?.approved_by === null, leadAsks.text);
  await act(U3, leadAsks.json.id, "withdraw");
  await call("U1", "POST", `/api/v2/workspaces/${A}/teams/${P1}/members`, { cookie: U1.cookie, body: { user_id: U3.id, role: "member" } });

  // -- cycles --
  const backwards = await al(U1, { target_goal_id: G3.id, source_goal_id: GCo.json.id, choice: "contribution", session_keys: [] });
  check("cycles: a contribution whose approval would loop (the source is already above the target) -> 409 cycle at creation", backwards.status === 409 && backwards.json?.error === "cycle", backwards.text);
  const GXa = (await mkGoal(U3, { title: "Loop A", visibility: "workspace" })).json;
  const GYb = (await mkGoal(U2, { title: "Loop B", visibility: "workspace" })).json;
  const xy = await al(U3, { target_goal_id: GYb.id, source_goal_id: GXa.id, choice: "contribution", session_keys: [] });
  const yx = await al(U2, { target_goal_id: GXa.id, source_goal_id: GYb.id, choice: "contribution", session_keys: [] });
  const xyOk = await act(U2, xy.json.id, "approve", { revision: 1 });
  const yxLoop = await act(U3, yx.json.id, "approve", { revision: 1 });
  const yxAfter = await getAl(U3, yx.json.id);
  check(
    "cycles: two pending links in opposite directions; approving the second -> 409 cycle and it stays pending with no approval recorded",
    xy.json?.state === "pending" && yx.json?.state === "pending" && xyOk.json?.state === "approved" && yxLoop.status === 409 && yxLoop.json?.error === "cycle" && /contribute to each other in a loop/.test(yxLoop.json?.message) && yxAfter.json?.state === "pending" && reqOf(yxAfter.json, GXa.id)?.approved_by === null,
    `${xyOk.status} ${yxLoop.text} ${yxAfter.json?.state}`,
  );
  await act(U2, yx.json.id, "withdraw");
  const depAB = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GXa.id}/versions`, { cookie: U3.cookie, body: { version: 1, depends_on: [GYb.id] } });
  const depBA = await call("U2", "POST", `/api/v2/workspaces/${A}/goals/${GYb.id}/versions`, { cookie: U2.cookie, body: { version: 1, depends_on: [GXa.id] } });
  const gybNow = (await call("U2", "GET", `/api/v2/workspaces/${A}/goals/${GYb.id}`, { cookie: U2.cookie })).json?.goal;
  check("cycles: a depends_on change that closes a loop -> 409 cycle and the goal stays at its version", depAB.status === 201 && depBA.status === 409 && depBA.json?.error === "cycle" && /depend on each other in a loop/.test(depBA.json?.message) && gybNow?.version === 1, `${depAB.status} ${depBA.text} ${gybNow?.version}`);

  // -- an alignment stored before requirements (a plain user-id array) --
  const legacy = await al(U3, { target_goal_id: G1.id, source_goal_id: GXa.id, choice: "contribution", session_keys: [] });
  withDb((d) => {
    d.prepare("UPDATE v2_alignment_revisions SET approvers_json = ? WHERE alignment_id = ?").run(JSON.stringify([U1.id, U2.id]), legacy.json.id);
    d.prepare("DELETE FROM v2_alignment_approvals WHERE alignment_id = ?").run(legacy.json.id);
  });
  const legacySeen = await getAl(U1, legacy.json.id);
  const legacy1 = await act(U1, legacy.json.id, "approve", { revision: 1 });
  const legacy2 = await act(U2, legacy.json.id, "approve", { revision: 1 });
  check(
    "requirements: an old row's user-id array reads as singleton sets (for null); it approves once each of them approved",
    legacySeen.json?.requirements?.length === 2 && legacySeen.json.requirements.every((r) => r.for === null && r.approvers.length === 1 && r.approved_by === null) && legacy1.json?.state === "pending" && legacy2.json?.state === "approved" && legacy2.json.requirements.map((r) => r.approved_by?.id).join() === `${U1.id},${U2.id}`,
    `${legacySeen.text.slice(0, 300)} ${legacy1.json?.state} ${legacy2.json?.state}`,
  );

  // -- change requests: a member proposes a new version of a goal they don't own; the goal's approval set decides --
  const crPath = (g) => `/api/v2/workspaces/${A}/goals/${g}/change-requests`;
  const propose = (u, g, body) => call(u.who, "POST", crPath(g), { cookie: u.cookie, body });
  const crAct = (u, g, id, action, body = {}) => call(u.who, "POST", `${crPath(g)}/${id}/${action}`, { cookie: u.cookie, body });
  const crGet = (u, g, id) => call(u.who, "GET", `${crPath(g)}/${id}`, { cookie: u.cookie });
  const crList = (u, q = "") => call(u.who, "GET", `/api/v2/workspaces/${A}/change-requests${q}`, { cookie: u.cookie });
  const drain = async (dev) => {
    for (let c = "0"; ; ) {
      const r = await dirs(dev, c);
      if (!r.directives.length) return c;
      c = r.next_cursor;
    }
  };
  const goalVersionsFor = (list, goalId) => (list?.directives ?? []).filter((d) => d.kind === "goal_version" && d.goal?.id === goalId);
  const auditOf = (action, objectId) => withDb((d) => d.prepare("SELECT actor_id FROM v2_audit WHERE ws_id = ? AND action = ? AND object_id = ?").all(A, action, objectId)).map((r) => r.actor_id);
  // GL: U3's workspace-visible goal in team P1 (lead U2), so its approval set is U3 (owner) and U2 (lead).
  const GL = (await mkGoal(U3, { title: "Pen-test the platform", visibility: "workspace", team_id: P1, measures: [{ text: "Open findings", target: "0" }] })).json;
  const SC = sessionKey(D3, A, "claude-code", "native-cr");
  await put(D3, SC);
  const scBind = await epoch(D3, SC, { epoch_id: epochId(), goal_id: GL.id, starts_at: new Date().toISOString() });
  const mPen = { text: "Pen-test window booked", target: "May" };
  const cr1 = await propose(U1, GL.id, { base_version: 1, changes: { measures: [...GL.measures, mPen] }, reason: "Onboarding needs a pen-test window in May" });
  check(
    "change requests: a member proposes on a goal they don't own -> 201 cr_ pending, revision 1, base_version 1, requester, diff, approvers = the goal's set; audit change_request.created",
    scBind.status === 200 && cr1.status === 201 && /^cr_/.test(cr1.json.id) && cr1.json.state === "pending" && cr1.json.revision === 1 && cr1.json.base_version === 1 && cr1.json.requester.id === U1.id && cr1.json.goal.id === GL.id && cr1.json.diff.before.measures.length === 1 && cr1.json.diff.after.measures.length === 2 && !("title" in cr1.json.diff.after) && cr1.json.approvers.map((a) => a.id).sort().join() === [U2.id, U3.id].sort().join() && auditOf("change_request.created", cr1.json.id).join() === U1.id,
    `${scBind.status} ${cr1.text.slice(0, 400)}`,
  );
  const ownCr = await propose(U3, GL.id, { base_version: 1, changes: { title: "x" }, reason: "mine" });
  const viewerCr = await propose(U4, GL.id, { base_version: 1, changes: { title: "x" }, reason: "viewer" });
  const privCr = await propose(U1, GP.id, { base_version: 1, changes: { title: "x" }, reason: "hidden" });
  const staleCr = await propose(U2, GL.id, { base_version: 2, changes: { title: "x" }, reason: "stale" });
  const againCr = await propose(U1, GL.id, { base_version: 1, changes: { title: "Second try" }, reason: "again" });
  check(
    "change requests: the owner -> 403 own_goal; a viewer -> 403 read_only; a goal you can't read -> 404; an old base_version -> 409 stale_version; a second open one -> 409 already_open",
    ownCr.status === 403 && ownCr.json?.error === "own_goal" && viewerCr.status === 403 && viewerCr.json?.error === "read_only" && privCr.status === 404 && staleCr.status === 409 && staleCr.json?.error === "stale_version" && againCr.status === 409 && againCr.json?.error === "already_open",
    [ownCr, viewerCr, privCr, staleCr, againCr].map((r) => `${r.status} ${r.json?.error}`).join(" "),
  );
  const bad = await Promise.all([
    propose(U2, GL.id, { base_version: 1, changes: { anchors: { repos: ["x"] } }, reason: "anchors" }),
    propose(U2, GL.id, { base_version: 1, changes: {}, reason: "empty" }),
    propose(U2, GL.id, { base_version: 1, changes: "title", reason: "not an object" }),
    propose(U2, GL.id, { base_version: 1, changes: { title: "x" } }),
    propose(U2, GL.id, { base_version: 1, changes: { title: "x" }, reason: "   " }),
    propose(U2, GL.id, { base_version: 1, changes: { title: "x" }, reason: "r".repeat(2001) }),
    propose(U2, GL.id, { base_version: 1, changes: { title: "t".repeat(301) }, reason: "long title" }),
    propose(U2, GL.id, { base_version: 1, changes: { status: "archived" }, reason: "bad status" }),
  ]);
  const noChange = await propose(U2, GL.id, { base_version: 1, changes: { title: GL.title }, reason: "same" });
  const crBig = await call("U2", "POST", crPath(GL.id), { cookie: U2.cookie, raw: JSON.stringify({ base_version: 1, changes: { title: "x" }, reason: "x", pad: "x".repeat(33 * 1024) }) });
  const okLong = await propose(U2, GL.id, { base_version: 1, changes: { title: "Pen-test the platform twice" }, reason: "r".repeat(2000) });
  check(
    "change requests: anchors, an empty or non-object changes, a missing, blank or 2001-character reason, an invalid title or status -> 400; nothing changing -> 409 no_change; over 32 KB -> 413; a 2000-character reason is accepted",
    bad.every((r) => r.status === 400) && noChange.status === 409 && noChange.json?.error === "no_change" && crBig.status === 413 && okLong.status === 201,
    `${bad.map((r) => r.status).join(",")} ${noChange.status} ${crBig.status} ${okLong.status} ${okLong.text.slice(0, 200)}`,
  );
  await crAct(U2, GL.id, okLong.json?.id, "withdraw");
  const cycleCr = await propose(U1, GYb.id, { base_version: 1, changes: { depends_on: [GXa.id] }, reason: "loop" });
  const g3Now = (await call("U1", "GET", `/api/v2/workspaces/${A}/goals/${G3.id}`, { cookie: U1.cookie })).json?.goal;
  const hiddenDep = await propose(U1, G3.id, { base_version: g3Now?.version, changes: { depends_on: [GP.id] }, reason: "hidden dependency" });
  check("change requests: a depends_on that closes a loop -> 409 cycle; a dependency you can't read -> 404", cycleCr.status === 409 && cycleCr.json?.error === "cycle" && hiddenDep.status === 404, `${cycleCr.text} ${hiddenDep.status}`);

  const viewerSees = await crGet(U4, GL.id, cr1.json.id);
  const viewerApprove = await crAct(U4, GL.id, cr1.json.id, "approve", { revision: 1 });
  const selfApprove = await crAct(U1, GL.id, cr1.json.id, "approve", { revision: 1 });
  const wrongGoal = await crGet(U1, G1.id, cr1.json.id);
  const badAction = await crAct(U2, GL.id, cr1.json.id, "merge", {});
  const u2Sees = await crGet(U2, GL.id, cr1.json.id);
  check(
    "change requests: a viewer reads it with every can flag false and approving -> 403 read_only; the requester (not the owner) approving -> 403 not_an_approver; another goal's path or an unknown action -> 404",
    viewerSees.status === 200 && Object.values(viewerSees.json.can).every((v) => v === false) && viewerApprove.status === 403 && viewerApprove.json?.error === "read_only" && selfApprove.status === 403 && selfApprove.json?.error === "not_an_approver" && wrongGoal.status === 404 && badAction.status === 404,
    `${viewerSees.text.slice(0, 200)} ${viewerApprove.status} ${selfApprove.text} ${wrongGoal.status} ${badAction.status}`,
  );
  check(
    "change requests: can flags match the actions: the lead may approve, reject and counter; the requester may withdraw and rebase",
    JSON.stringify(u2Sees.json?.can) === JSON.stringify({ approve: true, reject: true, counter: true, accept_counter: false, withdraw: false, rebase: false }) && cr1.json.can.withdraw === true && cr1.json.can.rebase === true && cr1.json.can.approve === false,
    `${JSON.stringify(u2Sees.json?.can)} ${JSON.stringify(cr1.json.can)}`,
  );
  const crLists = {
    U1: await crList(U1),
    U2: await crList(U2),
    U4: await crList(U4),
  };
  check(
    "change requests: the workspace list splits waiting on me (the lead) / mine (the requester) / others (the viewer)",
    crLists.U2.json?.waiting_on_me.some((c) => c.id === cr1.json.id) && crLists.U1.json?.mine.some((c) => c.id === cr1.json.id) && !crLists.U1.json?.waiting_on_me.some((c) => c.id === cr1.json.id) && crLists.U4.json?.others.some((c) => c.id === cr1.json.id && !c.can.approve),
    JSON.stringify(Object.fromEntries(Object.entries(crLists).map(([k, v]) => [k, v.json && Object.fromEntries(Object.entries(v.json).map(([g, l]) => [g, l.length]))]))),
  );
  const rejectEmpty = await crAct(U2, GL.id, cr1.json.id, "reject", {});
  const afterRejectEmpty = await crGet(U1, GL.id, cr1.json.id);
  check("change requests: reject without a reason -> 400 and the request is unchanged", rejectEmpty.status === 400 && afterRejectEmpty.json?.state === "pending" && afterRejectEmpty.json.revision === 1, `${rejectEmpty.text} ${afterRejectEmpty.json?.state}`);

  let cursor3 = await drain(D3);
  const counterMeasures = [...GL.measures, { text: "Pen-test window booked", target: "April" }];
  const counterNoNote = await crAct(U2, GL.id, cr1.json.id, "counter", { changes: { measures: counterMeasures } });
  const counterAnchors = await crAct(U2, GL.id, cr1.json.id, "counter", { changes: { anchors: { repos: ["x"] } }, note: "anchors" });
  const counter1 = await crAct(U2, GL.id, cr1.json.id, "counter", { revision: 1, changes: { measures: counterMeasures }, note: "April works better for us" });
  const cr_approveCountered = await crAct(U2, GL.id, cr1.json.id, "approve", { revision: 2 });
  const acceptByLead = await crAct(U2, GL.id, cr1.json.id, "accept_counter", {});
  const accept1 = await crAct(U1, GL.id, cr1.json.id, "accept_counter", { revision: 2 });
  const crApproveOld = await crAct(U2, GL.id, cr1.json.id, "approve", { revision: 1 });
  const dirsAfterCounter = await dirs(D3, cursor3);
  check(
    "change requests: a counter needs a note and proposable fields (400); a counter -> countered at revision 2 with the approver's changes; approving it -> 409 wrong_state; only the requester accepts (403 not_requester) -> pending at revision 2; approve naming revision 1 -> 409 stale_revision",
    counter1.status === 200 && counter1.json.state === "countered" && counter1.json.revision === 2 && counter1.json.changes.measures[1].target === "April" && counter1.json.revisions.length === 2 && counter1.json.revisions[1].note === "April works better for us" && counter1.json.revisions[1].author.id === U2.id && counterNoNote.status === 400 && counterAnchors.status === 400 && cr_approveCountered.status === 409 && cr_approveCountered.json?.error === "wrong_state" && acceptByLead.status === 403 && acceptByLead.json?.error === "not_requester" && accept1.json?.state === "pending" && accept1.json.revision === 2 && crApproveOld.status === 409 && crApproveOld.json?.error === "stale_revision",
    `${counter1.text.slice(0, 300)} ${counterNoNote.status} ${cr_approveCountered.text} ${acceptByLead.text} ${accept1.json?.state} ${crApproveOld.text}`,
  );
  const approve1 = await crAct(U2, GL.id, cr1.json.id, "approve", { revision: 2, note: "Agreed for Q3" });
  const dirsAfterApprove = await dirs(D3, cursor3);
  const glV2 = withDb((d) => d.prepare("SELECT version, created_by FROM v2_goal_versions WHERE goal_id = ? ORDER BY version DESC LIMIT 1").get(GL.id));
  const gvCr = goalVersionsFor(dirsAfterApprove, GL.id);
  check(
    "change requests: the lead approves -> approved with approved_by, note and version 2; the goal is at version 2 authored by the approver",
    approve1.status === 200 && approve1.json.state === "approved" && approve1.json.approved_by?.id === U2.id && approve1.json.note === "Agreed for Q3" && approve1.json.decision_note === "Agreed for Q3" && approve1.json.version === 2 && approve1.json.decided_at && glV2.version === 2 && glV2.created_by === U2.id,
    `${approve1.text.slice(0, 300)} ${JSON.stringify(glV2)}`,
  );
  check(
    "change requests (directives): counter and accept_counter write no directive; the approval writes one goal_version directive for the bound session with the new version, and no request text reaches it",
    goalVersionsFor(dirsAfterCounter, GL.id).length === 0 && gvCr.length === 1 && gvCr[0].session_keys.includes(SC) && gvCr[0].goal.version === 2 && gvCr[0].goal.measures.some((m) => m.target === "April") && !JSON.stringify(dirsAfterApprove).includes("Agreed for Q3") && !JSON.stringify(dirsAfterApprove).includes("pen-test window in May") && !JSON.stringify(dirsAfterApprove).includes("April works better"),
    JSON.stringify(dirsAfterApprove.directives.map((d) => [d.kind, d.goal?.id, d.goal?.version])),
  );
  const record = await crGet(U4, GL.id, cr1.json.id);
  check(
    "change requests: the decided request is its decision record: requester, approver, reason, before/after diff from the resulting version, revisions",
    record.status === 200 && record.json.state === "approved" && record.json.requester.id === U1.id && record.json.approved_by.id === U2.id && record.json.reason === "Onboarding needs a pen-test window in May" && record.json.diff.before.measures.length === 1 && record.json.diff.after.measures.length === 2 && record.json.version === 2 && record.json.revisions.length === 2,
    record.text.slice(0, 400),
  );
  const afterDecided = await crAct(U2, GL.id, cr1.json.id, "approve", { revision: 2 });
  check("change requests: a decided request takes no more actions (409 wrong_state)", afterDecided.status === 409 && afterDecided.json?.error === "wrong_state", afterDecided.text);

  // Reject, withdraw and rebase write no directive; stale requests need a rebase before approval.
  cursor3 = await drain(D3);
  const crR = await propose(U1, GL.id, { base_version: 2, changes: { title: "Pen-test everything" }, reason: "Wider scope" });
  const crRbyReq = await crAct(U1, GL.id, crR.json?.id, "reject", { reason: "no" });
  const crRrej = await crAct(U3, GL.id, crR.json?.id, "reject", { reason: "Out of scope this quarter" });
  const crW = await propose(U1, GL.id, { base_version: 2, changes: { title: "Pen-test the API" }, reason: "Narrower" });
  const crWbyLead = await crAct(U2, GL.id, crW.json?.id, "withdraw", {});
  const crWok = await crAct(U1, GL.id, crW.json?.id, "withdraw", {});
  check(
    "change requests: reject by the requester -> 403 not_an_approver; by the owner -> rejected with rejected_by and the reason; withdraw by someone else -> 403 not_requester, by the requester -> withdrawn",
    crRbyReq.status === 403 && crRbyReq.json?.error === "not_an_approver" && crRrej.json?.state === "rejected" && crRrej.json.rejected_by?.id === U3.id && crRrej.json.rejection_reason === "Out of scope this quarter" && crRrej.json.decision_note === "Out of scope this quarter" && crWbyLead.status === 403 && crWbyLead.json?.error === "not_requester" && crWok.json?.state === "withdrawn",
    `${crRbyReq.text} ${crRrej.text.slice(0, 200)} ${crWbyLead.text} ${crWok.json?.state}`,
  );
  const crA = await propose(U1, GL.id, { base_version: 2, changes: { title: "Pen-test the platform and the API" }, reason: "Both" });
  const crB = await propose(U2, GL.id, { base_version: 2, changes: { measures: [{ text: "Critical findings", target: "0" }] }, reason: "Track criticals" });
  const crBapprovers = crB.json?.approvers?.map((a) => a.id).join();
  const approveA = await crAct(U3, GL.id, crA.json?.id, "approve", { revision: 1 });
  const bNow = await crGet(U2, GL.id, crB.json?.id);
  const cr_approveB = await crAct(U3, GL.id, crB.json?.id, "approve", { revision: 1 });
  const rebaseOld = await crAct(U2, GL.id, crB.json?.id, "rebase", { base_version: 2 });
  const rebaseByOther = await crAct(U1, GL.id, crB.json?.id, "rebase", { base_version: 3 });
  const cursorBeforeRebase = await drain(D3);
  const rebaseB = await crAct(U2, GL.id, crB.json?.id, "rebase", { base_version: 3 });
  const dirsAfterRebase = await dirs(D3, cursorBeforeRebase);
  const approveB2 = await crAct(U3, GL.id, crB.json?.id, "approve", { revision: 2 });
  check(
    "change requests: a lead's own request is decided by the rest of the set (the owner); after another request is approved it stays pending, behind, approve -> 409 stale_version",
    crBapprovers === U3.id && approveA.json?.state === "approved" && approveA.json.version === 3 && bNow.json?.state === "pending" && bNow.json.behind === true && bNow.json.can.approve === false && bNow.json.can.rebase === true && cr_approveB.status === 409 && cr_approveB.json?.error === "stale_version",
    `${crBapprovers} ${approveA.text.slice(0, 200)} ${bNow.json?.state} ${cr_approveB.text}`,
  );
  check(
    "change requests: rebase with an old base -> 409 stale_version, by someone else -> 403 not_requester; to the current version -> base 3, revision 2 (no directive), then approve -> version 4",
    rebaseOld.status === 409 && rebaseOld.json?.error === "stale_version" && rebaseByOther.status === 403 && rebaseByOther.json?.error === "not_requester" && rebaseB.json?.base_version === 3 && rebaseB.json.revision === 2 && rebaseB.json.behind === false && goalVersionsFor(dirsAfterRebase, GL.id).length === 0 && approveB2.json?.state === "approved" && approveB2.json.version === 4,
    `${rebaseOld.text} ${rebaseByOther.status} ${rebaseB.text.slice(0, 200)} ${approveB2.text.slice(0, 200)}`,
  );
  const dirsRejWd = await dirs(D3, cursor3);
  check(
    "change requests (directives): only approvals write goal_version directives (two approvals here, none for create, reject, withdraw or rebase)",
    goalVersionsFor(dirsRejWd, GL.id).map((d) => d.goal.version).join() === "3,4",
    JSON.stringify(goalVersionsFor(dirsRejWd, GL.id).map((d) => d.goal.version)),
  );

  // A goal that is dropped supersedes its open requests.
  const crS1 = await propose(U1, GL.id, { base_version: 4, changes: { title: "Pen-test it all" }, reason: "s1" });
  const crS2 = await propose(U2, GL.id, { base_version: 4, changes: { status: "achieved" }, reason: "s2" });
  const crS2c = await crAct(U3, GL.id, crS2.json?.id, "counter", { changes: { status: "achieved", title: "Pen-test done" }, note: "with a new title" });
  const drop = await call("U3", "POST", `/api/v2/workspaces/${A}/goals/${GL.id}/versions`, { cookie: U3.cookie, body: { version: 4, status: "dropped" } });
  const s1 = await crGet(U1, GL.id, crS1.json?.id);
  const s2 = await crGet(U2, GL.id, crS2.json?.id);
  const actSuperseded = await crAct(U1, GL.id, crS1.json?.id, "withdraw", {});
  const onDropped = await propose(U1, GL.id, { base_version: 5, changes: { title: "Revive" }, reason: "revive" });
  check(
    "change requests: the owner drops the goal -> its pending and countered requests become superseded (audit names the owner), take no action (409 wrong_state), and a new one -> 409 goal_not_active",
    crS2c.json?.state === "countered" && drop.status === 201 && s1.json?.state === "superseded" && s2.json?.state === "superseded" && auditOf("change_request.superseded", crS1.json?.id).join() === U3.id && auditOf("change_request.superseded", crS2.json?.id).join() === U3.id && actSuperseded.status === 409 && actSuperseded.json?.error === "wrong_state" && onDropped.status === 409 && onDropped.json?.error === "goal_not_active",
    `${crS2c.json?.state} ${drop.status} ${s1.json?.state} ${s2.json?.state} ${actSuperseded.status} ${onDropped.text}`,
  );
  // An approved request that marks the goal achieved supersedes the others too.
  const GA = (await mkGoal(U3, { title: "Write the runbook", visibility: "workspace" })).json;
  const crX = await propose(U1, GA.id, { base_version: 1, changes: { status: "achieved" }, reason: "It is written" });
  const crY = await propose(U2, GA.id, { base_version: 1, changes: { title: "Write the runbooks" }, reason: "plural" });
  const approveX = await crAct(U3, GA.id, crX.json?.id, "approve", { revision: 1 });
  const y = await crGet(U2, GA.id, crY.json?.id);
  check("change requests: approving a request that marks the goal achieved supersedes the goal's other open requests", approveX.json?.state === "approved" && y.json?.state === "superseded", `${approveX.text.slice(0, 200)} ${y.json?.state}`);

  // Team goals: requests are as visible as their goal.
  const crTeam = await propose(U3, G2.id, { base_version: (await call("U3", "GET", `/api/v2/workspaces/${A}/goals/${G2.id}`, { cookie: U3.cookie })).json.goal.version, changes: { title: "Platform reliability (p99 and p999)" }, reason: "Track tails" });
  const teamHidden = await crGet(U4, G2.id, crTeam.json?.id);
  const u4All = await crList(U4);
  const u4Ids = [...u4All.json.waiting_on_me, ...u4All.json.mine, ...u4All.json.others].map((c) => c.id);
  const byState = await call("U1", "GET", `${crPath(GL.id)}?state=superseded`, { cookie: U1.cookie });
  const badState = await call("U1", "GET", `${crPath(GL.id)}?state=archived`, { cookie: U1.cookie });
  const wsBadState = await crList(U1, "?state=open");
  const wsApproved = await crList(U1, "?state=approved");
  check(
    "change requests: a team goal's request is hidden from someone who can't read the goal (404, not listed); ?state= filters; an unknown state -> 400",
    crTeam.status === 201 && teamHidden.status === 404 && !u4Ids.includes(crTeam.json.id) && u4Ids.includes(cr1.json.id) && byState.status === 200 && byState.json.change_requests.length === 2 && byState.json.change_requests.every((c) => c.state === "superseded") && badState.status === 400 && wsBadState.status === 400 && [...wsApproved.json.waiting_on_me, ...wsApproved.json.mine, ...wsApproved.json.others].every((c) => c.state === "approved"),
    `${crTeam.status} ${teamHidden.status} ${byState.status} ${byState.json?.change_requests?.length} ${badState.status} ${wsBadState.status}`,
  );
  const crAudit = withDb((d) => d.prepare("SELECT action, actor_id FROM v2_audit WHERE ws_id = ? AND action LIKE 'change_request.%'").all(A));
  const crActions = ["created", "approved", "rejected", "countered", "counter_accepted", "withdrawn", "rebased", "superseded"].map((a) => `change_request.${a}`);
  check(
    "change requests: every action is audited with its actor (created, approved, rejected, countered, counter_accepted, withdrawn, rebased, superseded); an approval also writes goal.versioned by the approver",
    crActions.every((a) => crAudit.some((r) => r.action === a)) && crAudit.every((r) => r.actor_id) && auditOf("goal.versioned", GL.id).includes(U2.id) && auditOf("change_request.counter_accepted", cr1.json.id).join() === U1.id,
    JSON.stringify(crAudit.slice(-10)),
  );

  // -- the Northstar sample workspace --
  const s1ws = await call("U2", "POST", "/api/v2/workspaces/sample", { cookie: U2.cookie, body: {} });
  const s2ws = await call("U2", "POST", "/api/v2/workspaces/sample", { cookie: U2.cookie });
  const SW = s1ws.json?.id;
  check("sample: POST /api/v2/workspaces/sample -> 201 {id, name \"Northstar (sample)\", role owner}; twice -> two workspaces", s1ws.status === 201 && /^ws_/.test(SW) && s1ws.json.name === "Northstar (sample)" && s1ws.json.role === "owner" && s2ws.status === 201 && s2ws.json.id !== SW, `${s1ws.text} ${s2ws.text}`);
  const sDetail = (await call("U2", "GET", `/api/v2/workspaces/${SW}`, { cookie: U2.cookie })).json;
  const sFeed = (await call("U2", "GET", `/api/v2/workspaces/${SW}/goals`, { cookie: U2.cookie })).json?.goals ?? [];
  const sByTitle = Object.fromEntries(sFeed.map((g) => [g.title, g]));
  const sCo = sByTitle["Expand to regulated customers"];
  const sOn = sByTitle["Ship self-serve onboarding"];
  const sSec = sByTitle["Pass the security review"];
  check(
    "sample: teams Product and Security with the caller as lead of both; every goal owned by the caller",
    sDetail?.teams?.map((t) => t.name).sort().join() === "Product,Security" && sDetail.teams.every((t) => t.my_role === "lead" && t.members.length === 1 && t.members[0].id === U2.id) && sFeed.length === 3 && sFeed.every((g) => g.owner.id === U2.id),
    JSON.stringify(sDetail?.teams),
  );
  check(
    "sample: a company goal, two workspace-visible team goals (Product, Security) contributing to it (stale false), and onboarding depends on the security review",
    sCo?.level === "company" && sCo.visibility === "workspace" && sOn?.level === "team" && sOn.team?.name === "Product" && sOn.visibility === "workspace" && sSec?.team?.name === "Security" && sSec.visibility === "workspace" && [sOn, sSec].every((g) => g.contributes_to.length === 1 && g.contributes_to[0].id === sCo.id && g.contributes_to[0].stale === false) && sOn.depends_on.join() === sSec.id && sFeed[0].id === sCo.id,
    JSON.stringify(sFeed.map((g) => [g.title, g.level, g.team?.name, g.contributes_to, g.depends_on])),
  );
  const sAligns = (await call("U2", "GET", `/api/v2/workspaces/${SW}/alignments`, { cookie: U2.cookie })).json;
  const sAll = [...(sAligns?.waiting_on_me ?? []), ...(sAligns?.mine ?? []), ...(sAligns?.others ?? [])];
  check("sample: both contributions are approved alignments the caller requested and approved", sAll.length === 2 && sAll.every((a) => a.state === "approved" && a.choice === "contribution" && a.requester.id === U2.id && a.requirements.every((r) => r.approved_by?.id === U2.id)), JSON.stringify(sAll.map((a) => [a.state, a.choice])));
  const sCrs = (await call("U2", "GET", `/api/v2/workspaces/${SW}/change-requests`, { cookie: U2.cookie })).json;
  const sCr = sCrs?.waiting_on_me?.[0];
  check(
    "sample: one pending change request on the security goal, from the caller, explaining why the sample shows it; the caller can approve, counter, reject, withdraw and rebase it",
    sCrs?.waiting_on_me?.length === 1 && sCrs.mine.length === 0 && sCrs.others.length === 0 && sCr.goal.id === sSec.id && sCr.state === "pending" && sCr.requester.id === U2.id && /sample/i.test(sCr.reason) && sCr.diff.after.measures.length === sSec.measures.length + 1 && Object.values(sCr.can).filter(Boolean).length === 5 && !sCr.can.accept_counter,
    JSON.stringify(sCrs).slice(0, 400),
  );
  const sApprove = await call("U2", "POST", `/api/v2/workspaces/${SW}/goals/${sSec.id}/change-requests/${sCr?.id}/approve`, { cookie: U2.cookie, body: { revision: 1 } });
  const sSecNow = (await call("U2", "GET", `/api/v2/workspaces/${SW}/goals/${sSec.id}`, { cookie: U2.cookie })).json?.goal;
  check("sample: approving the sample request -> the security goal is at version 2 and the request approved by the caller", sApprove.json?.state === "approved" && sApprove.json.approved_by?.id === U2.id && sSecNow?.version === 2, `${sApprove.text.slice(0, 200)} ${sSecNow?.version}`);
  const sAudit = withDb((d) => d.prepare("SELECT action, actor_id FROM v2_audit WHERE ws_id = ?").all(SW));
  check("sample: every audit row names the caller", sAudit.length >= 10 && sAudit.every((r) => r.actor_id === U2.id) && ["workspace.created", "team.created", "goal.created", "alignment.approved", "change_request.created"].every((a) => sAudit.some((r) => r.action === a)), JSON.stringify(sAudit.slice(0, 5)));
  const sRename = await call("U2", "PATCH", `/api/v2/workspaces/${s2ws.json?.id}`, { cookie: U2.cookie, body: { name: "Northstar, renamed" } });
  const sDelete = await call("U2", "DELETE", `/api/v2/workspaces/${s2ws.json?.id}`, { cookie: U2.cookie });
  const sAnon = await call("anon", "POST", "/api/v2/workspaces/sample", { body: {} });
  check("sample: it is ordinary data (rename, delete); signed out -> 401", sRename.status === 200 && sDelete.status === 204 && sAnon.status === 401, `${sRename.status} ${sDelete.status} ${sAnon.status}`);
  const U7 = await signUp("U7", "Uri Seven", "u7@example.test");
  const u7ws = [];
  for (let i = 0; i < 9; i++) u7ws.push((await call("U7", "POST", "/api/v2/workspaces", { cookie: U7.cookie, body: { name: `W${i}` } })).status);
  const u7s1 = await call("U7", "POST", "/api/v2/workspaces/sample", { cookie: U7.cookie, body: {} });
  const u7s2 = await call("U7", "POST", "/api/v2/workspaces/sample", { cookie: U7.cookie, body: {} });
  check("sample: it counts toward the workspace-creation limit (9 workspaces + 1 sample, then 429 rate_limited)", u7ws.every((s) => s === 201) && u7s1.status === 201 && u7s2.status === 429 && u7s2.json?.error === "rate_limited", `${u7ws.join(",")} ${u7s1.status} ${u7s2.text}`);

  // -- invites that name a team, member roles, removal, leaving, last owner --
  const U5 = await signUp("U5", "Ugo Five", "u5@example.test");
  const U6 = await signUp("U6", "Ula Six", "u6@example.test");
  const sec = await call("U1", "POST", `/api/v2/workspaces/${A}/teams`, { cookie: U1.cookie, body: { name: "Security" } });
  const P2 = sec.json?.id;
  const inv5 = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: U5.email, role: "member", team_id: P2 } });
  const invBadTeam = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: "nt@example.test", role: "member", team_id: "pod_aaaaaaaaaaaaaaaaaaaaaaaa" } });
  const invBadRole = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: "nt@example.test", role: "member", team_id: P2, team_role: "boss" } });
  const invRoleOnly = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: "nt@example.test", role: "member", team_role: "lead" } });
  check(
    "team invites: an invite may name a team (team_role member by default); an unknown team -> 404, a bad team_role -> 400, team_role without team_id -> 400",
    inv5.status === 201 && inv5.json.team_id === P2 && inv5.json.team_role === "member" && invBadTeam.status === 404 && invBadRole.status === 400 && invRoleOnly.status === 400,
    `${inv5.text} ${invBadTeam.status} ${invBadRole.status} ${invRoleOnly.status}`,
  );
  const prev5 = await call("U5", "GET", `/api/v2/invites/${inv5.json.token}`, { cookie: U5.cookie });
  const acc5 = await call("U5", "POST", `/api/v2/invites/${inv5.json.token}/accept`, { cookie: U5.cookie, body: {} });
  const secTeam = (await call("U1", "GET", `/api/v2/workspaces/${A}`, { cookie: U1.cookie })).json?.teams?.find((t) => t.id === P2);
  check(
    "team invites: the preview names the team; accepting joins the workspace and the team ({workspace_id, role, team_id})",
    prev5.json?.team?.id === P2 && prev5.json.team.name === "Security" && prev5.json.team_role === "member" && acc5.status === 200 && acc5.json.team_id === P2 && secTeam?.members.some((m) => m.id === U5.id && m.role === "member"),
    `${prev5.text} ${acc5.text}`,
  );
  const inv6 = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: U6.email, role: "viewer" } });
  await call("U6", "POST", `/api/v2/invites/${inv6.json.token}/accept`, { cookie: U6.cookie, body: {} });
  const D5 = await pairDevice("U5", U5, [A]);
  const G5 = (await mkGoal(U5, { title: "Pass the security review", visibility: "workspace", team_id: P2 })).json;
  const S5 = sessionKey(D5, A, "claude-code", "native-5");
  await put(D5, S5);
  const e5 = await epoch(D5, S5, { epoch_id: epochId(), goal_id: G5.id, starts_at: T0 });
  await call("U1", "POST", `/api/v2/workspaces/${A}/teams/${P2}/members`, { cookie: U1.cookie, body: { user_id: U2.id, role: "lead" } });
  await call("U1", "POST", `/api/v2/workspaces/${A}/teams/${P2}/members`, { cookie: U1.cookie, body: { user_id: U6.id, role: "lead" } });
  const setBefore = await al(U3, { target_goal_id: G5.id, source_goal_id: G3.id, choice: "contribution", session_keys: [] });
  check(
    "approval: a team goal's set is its owner and the team's leads; a viewer who leads the team is never in it",
    G5?.id && e5.status === 200 && reqOf(setBefore.json, G5.id)?.approvers.map((a) => a.id).sort().join() === [U2.id, U5.id].sort().join(),
    `${e5.status} ${JSON.stringify(setBefore.json?.requirements)}`,
  );
  await act(U3, setBefore.json.id, "withdraw");

  const mem = (u, target, body) => call(u.who, body ? "POST" : "DELETE", `/api/v2/workspaces/${A}/members/${target}`, { cookie: u.cookie, ...(body ? { body } : {}) });
  const roleByMember = await mem(U3, U5.id, { role: "viewer" });
  const roleByViewer = await mem(U4, U5.id, { role: "viewer" });
  const roleUnknown = await mem(U1, "u_aaaaaaaaaaaaaaaaaaaaaaaa", { role: "viewer" });
  const roleBad = await mem(U1, U5.id, { role: "admin" });
  const roleOk = await mem(U1, U5.id, { role: "viewer" });
  const roleBack = await mem(U1, U5.id, { role: "member" });
  check(
    "members: an owner changes a role ({user_id, role}); a member -> 403 owner_only, a viewer -> 403 read_only, an unknown person -> 404, a bad role -> 400",
    roleByMember.status === 403 && roleByMember.json?.error === "owner_only" && roleByViewer.status === 403 && roleByViewer.json?.error === "read_only" && roleUnknown.status === 404 && roleBad.status === 400 && roleOk.status === 200 && roleOk.json.role === "viewer" && roleOk.json.user_id === U5.id && roleBack.json?.role === "member",
    `${roleByMember.status} ${roleByViewer.status} ${roleUnknown.status} ${roleBad.status} ${roleOk.text} ${roleBack.text}`,
  );
  const lastLeave = await mem(U1, U1.id);
  const lastDemote = await mem(U1, U1.id, { role: "member" });
  const stillOwner = (await call("U1", "GET", `/api/v2/workspaces/${A}`, { cookie: U1.cookie })).json?.role;
  check("last owner: the only owner leaving or demoting themselves -> 409 last_owner and nothing changes", lastLeave.status === 409 && lastLeave.json?.error === "last_owner" && lastDemote.status === 409 && lastDemote.json?.error === "last_owner" && stillOwner === "owner", `${lastLeave.text} ${lastDemote.text} ${stillOwner}`);
  const twoOwners = await mem(U1, U2.id, { role: "owner" });
  const selfDemote = await mem(U2, U2.id, { role: "member" });
  check("last owner: with a second owner, an owner may demote themselves", twoOwners.json?.role === "owner" && selfDemote.status === 200 && selfDemote.json.role === "member", `${twoOwners.text} ${selfDemote.text}`);
  const memberRemoves = await mem(U3, U5.id);
  check("members: a member removing someone else -> 403 owner_only", memberRemoves.status === 403 && memberRemoves.json?.error === "owner_only", memberRemoves.text);
  const d5Before = await call("U5", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D5.access });
  const removed = await mem(U1, U5.id);
  const d5After = await call("U5", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D5.access });
  const d5Me = await call("U5", "GET", "/api/v2/me", { bearer: D5.access });
  const afterRemoval = withDb((d) => ({
    grants: d.prepare("SELECT COUNT(*) AS n FROM v2_device_grants WHERE device_id = ?").get(D5.id).n,
    teams: d.prepare("SELECT COUNT(*) AS n FROM v2_pod_members WHERE user_id = ? AND ws_id = ?").get(U5.id, A).n,
    session: d.prepare("SELECT user_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?").get(A, S5)?.user_id,
    revoked: d.prepare("SELECT revoked_at FROM v2_devices WHERE id = ?").get(D5.id).revoked_at,
  }));
  const g5Seen = (await call("U1", "GET", `/api/v2/workspaces/${A}/goals/${G5.id}`, { cookie: U1.cookie })).json?.goal;
  const u5Gone = await call("U5", "GET", `/api/v2/workspaces/${A}`, { cookie: U5.cookie });
  check(
    "members: removal -> 204; their team places and device grants for the workspace end (the device stays paired); goals and sessions stay under their name",
    d5Before.status === 200 && removed.status === 204 && d5After.status === 404 && d5Me.status === 200 && d5Me.json.workspaces.length === 0 && afterRemoval.grants === 0 && afterRemoval.teams === 0 && afterRemoval.session === U5.id && !afterRemoval.revoked && g5Seen?.owner?.name === "Ugo Five" && u5Gone.status === 404,
    `${d5Before.status} ${removed.status} ${d5After.status} ${JSON.stringify(afterRemoval)} ${JSON.stringify(g5Seen?.owner)} ${u5Gone.status}`,
  );
  const setAfter = await al(U3, { target_goal_id: G5.id, source_goal_id: G3.id, choice: "contribution", session_keys: [] });
  const fallback = await al(U2, { target_goal_id: G5.id, source_goal_id: G2.id, choice: "contribution", session_keys: [] });
  check(
    "approval: a former owner is never in a set (the lead remains); when the requester is the only one left, the workspace owners decide",
    reqOf(setAfter.json, G5.id)?.approvers.map((a) => a.id).join() === U2.id && reqOf(fallback.json, G5.id)?.approvers.map((a) => a.id).join() === U1.id && fallback.json.state === "pending",
    `${JSON.stringify(setAfter.json?.requirements)} ${JSON.stringify(fallback.json?.requirements)}`,
  );
  await act(U3, setAfter.json.id, "withdraw");
  await act(U2, fallback.json.id, "withdraw");
  const leave6 = await mem(U6, U6.id);
  const u6Gone = await call("U6", "GET", `/api/v2/workspaces/${A}`, { cookie: U6.cookie });
  check("members: a viewer leaves (DELETE their own id) -> 204, then the workspace is 404 for them", leave6.status === 204 && u6Gone.status === 404, `${leave6.status} ${leave6.text} ${u6Gone.status}`);
  const inv5b = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: U5.email, role: "member" } });
  const rejoin = await call("U5", "POST", `/api/v2/invites/${inv5b.json?.token}/accept`, { cookie: U5.cookie, body: {} });
  check("members: a removed person can be invited back", inv5b.status === 201 && rejoin.status === 200, `${inv5b.status} ${rejoin.text}`);
  const invW = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1.cookie, body: { email: "withdrawn@example.test", role: "member" } });
  await call("U1", "DELETE", `/api/v2/workspaces/${A}/invites/${invW.json.id}`, { cookie: U1.cookie });

  // -- workspace rename --
  const renByMember = await call("U3", "PATCH", `/api/v2/workspaces/${A}`, { cookie: U3.cookie, body: { name: "Hijacked" } });
  const renByViewer = await call("U4", "PATCH", `/api/v2/workspaces/${A}`, { cookie: U4.cookie, body: { name: "Hijacked" } });
  const ren = await call("U1", "PATCH", `/api/v2/workspaces/${A}`, { cookie: U1.cookie, body: { name: "Workspace A renamed" } });
  check("workspaces: an owner renames (PATCH -> {id, name}); a member -> 403 owner_only, a viewer -> 403 read_only", ren.status === 200 && ren.json.id === A && ren.json.name === "Workspace A renamed" && renByMember.json?.error === "owner_only" && renByViewer.json?.error === "read_only", `${ren.text} ${renByMember.text} ${renByViewer.text}`);

  // -- audit trail --
  withDb((d) => d.prepare("INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at) VALUES (?, ?, 'pod.created', 'pod_legacyrowxxxxxxxxxxxxxx', ?)").run(A, U1.id, new Date().toISOString()));
  const aud = await call("U1", "GET", `/api/v2/workspaces/${A}/audit`, { cookie: U1.cookie });
  const audMember = await call("U3", "GET", `/api/v2/workspaces/${A}/audit`, { cookie: U3.cookie });
  const audViewer = await call("U4", "GET", `/api/v2/workspaces/${A}/audit`, { cookie: U4.cookie });
  const audRows = withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM v2_audit WHERE ws_id = ?").get(A).n);
  const rows = aud.json?.audit ?? [];
  const has = (action, actor) => rows.some((r) => r.action === action && r.actor?.id === actor);
  check(
    "audit: owners only (member 403 owner_only, viewer 403 read_only); newest first, at most 200 rows, each {at, actor:{id,name}, action, object_id}",
    aud.status === 200 && audMember.json?.error === "owner_only" && audViewer.json?.error === "read_only" && rows.length === Math.min(200, audRows) && audRows > 0 && rows.every((r, i) => i === 0 || r.at <= rows[i - 1].at) && rows.every((r) => "object_id" in r && (r.actor === null || r.actor.name)),
    `${aud.status} ${audMember.status} ${audViewer.status} ${rows.length}/${audRows}`,
  );
  check(
    "audit: changes name their actor (renamed, member removed, member left, invite withdrawn, role changed); old pod.* rows show as team.*",
    has("workspace.renamed", U1.id) && has("member.removed", U1.id) && has("member.left", U6.id) && has("invite.withdrawn", U1.id) && has("member.role_changed", U2.id) && rows.some((r) => r.action === "team.created" && r.object_id === "pod_legacyrowxxxxxxxxxxxxxx") && !rows.some((r) => r.action.startsWith("pod.")) && rows.every((r) => r.actor !== null),
    JSON.stringify(rows.slice(0, 8).map((r) => [r.action, r.actor?.name])),
  );
  const allAudit = withDb((d) => d.prepare("SELECT ws_id, actor_id, action FROM v2_audit WHERE ws_id = ? OR action LIKE 'device.%' OR action LIKE 'team.%'").all(A));
  check(
    "audit: team actions are written as team.*; a person revoking a device is its actor; only refresh-token reuse has no actor",
    allAudit.some((r) => r.action === "team.member_set" && r.actor_id === U2.id) && allAudit.some((r) => r.action === "team.member_removed") && allAudit.some((r) => r.action === "device.revoked" && r.actor_id === U3.id) && allAudit.filter((r) => r.actor_id === null).length >= 1 && allAudit.filter((r) => r.actor_id === null).every((r) => r.action === "device.revoked"),
    JSON.stringify(allAudit.filter((r) => r.actor_id === null)),
  );

  // -- deleting a workspace: B (owned by U4) with a team, invite, goals, an alignment, a shared session with usage and activity --
  const tB = await call("U4", "POST", `/api/v2/workspaces/${B}/teams`, { cookie: U4.cookie, body: { name: "B team" } });
  await call("U4", "POST", `/api/v2/workspaces/${B}/invites`, { cookie: U4.cookie, body: { email: "bq@example.test", role: "member", team_id: tB.json.id } });
  const GB2 = (await call("U4", "POST", `/api/v2/workspaces/${B}/goals`, { cookie: U4.cookie, body: { title: "B company", level: "company" } })).json;
  const alB = await call("U4", "POST", `/api/v2/workspaces/${B}/alignments`, { cookie: U4.cookie, body: { target_goal_id: GB2.id, source_goal_id: GB.id, choice: "contribution", session_keys: [] } });
  const SB = sessionKey(D4, B, "claude-code", "native-b");
  await call("U4", "PUT", `/api/v2/workspaces/${B}/sessions/${SB}`, { bearer: D4.access, body: { harness: "claude-code", repo_key: repoKey(D4, B, "/src/b"), started_at: T0, title: null } });
  const EB = epochId();
  await call("U4", "POST", `/api/v2/workspaces/${B}/sessions/${SB}/epochs`, { bearer: D4.access, body: { epoch_id: EB, goal_id: GB.id, starts_at: T0, root_turn: null, cause: "manual" } });
  const upB = await call("U4", "POST", `/api/v2/workspaces/${B}/sessions/${SB}/usage`, { bearer: D4.access, body: { rows: [usageRow(D4, "b-1", EB)] } });
  await call("U4", "POST", `/api/v2/workspaces/${B}/activity`, { bearer: D4.access, body: { items: [{ session_key: SB, kind: "edit", at: new Date().toISOString(), repo_id: "f".repeat(32), path_hash: "e".repeat(32) }] } });
  await call("U4", "POST", `/api/v2/workspaces/${B}/sessions/${SB}/stop`, { cookie: U4.cookie, body: {} });
  const delByOther = await call("U1", "DELETE", `/api/v2/workspaces/${B}`, { cookie: U1.cookie });
  const delA = await call("U3", "DELETE", `/api/v2/workspaces/${A}`, { cookie: U3.cookie });
  const delB = await call("U4", "DELETE", `/api/v2/workspaces/${B}`, { cookie: U4.cookie });
  const bGone = await call("U4", "GET", `/api/v2/workspaces/${B}`, { cookie: U4.cookie });
  const d4OnAStill = await call("U4", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D4.access });
  const bLeft = withDb((d) => {
    const out = {};
    for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'v2_%'").all()) {
      const cols = d.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
      let n = 0;
      for (const row of d.prepare(`SELECT * FROM ${name}`).all()) if (cols.some((c) => typeof row[c] === "string" && row[c].includes(B))) n++;
      if (n) out[name] = n;
    }
    return out;
  });
  check(
    "workspaces: only an owner deletes (a non-member -> 404, a member -> 403 owner_only); delete -> 204, then 404, and no v2 row anywhere mentions it; the device keeps its other workspace",
    alB.json?.state === "approved" && upB.json?.accepted === 1 && delByOther.status === 404 && delA.status === 403 && delA.json?.error === "owner_only" && delB.status === 204 && bGone.status === 404 && d4OnAStill.status === 200 && Object.keys(bLeft).length === 0,
    `${alB.status} ${upB.text} ${delByOther.status} ${delA.status} ${delB.status} ${bGone.status} ${d4OnAStill.status} ${JSON.stringify(bLeft)}`,
  );

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
  const pagePaths = ["/app", "/app/account", "/app/device", "/app/devices", `/app/w/${A}`, `/app/w/${A}/goals/${G1.id}`, `/app/w/${A}/people`, `/app/w/${A}/sessions`, `/app/w/${A}/alignments`, `/app/w/${A}/requests`, `/app/w/${A}/spend`, `/app/w/${A}/apps`, `/app/invite/${"x".repeat(43)}`];
  const anonPages = await Promise.all(pagePaths.map((p) => call("anon", "GET", p)));
  check("ui: every /app page without a session sends you to /app/sign-in", anonPages.every((r) => (r.status === 307 && /\/app\/sign-in/.test(r.headers.get("location") || "")) || (r.status === 200 && r.text.includes("/app/sign-in?next="))), anonPages.map((r) => r.status).join(","));
  const userPages = await Promise.all(pagePaths.map((p) => call("U1", "GET", p, { cookie: U1.cookie })));
  check("ui: every /app page renders for a signed-in user (200, no error page)", userPages.every((r) => r.status === 200 && !/Application error|Internal Server Error/.test(r.text)), userPages.map((r) => r.status).join(","));
  const signInPage = await call("anon", "GET", "/app/sign-in");
  check("ui: the sign-in page offers the email code and the test sign-in (no Google or GitHub configured here)", signInPage.status === 200 && signInPage.text.includes("Test sign-in") && signInPage.text.includes("Send code") && !signInPage.text.includes("Continue with Google") && !signInPage.text.includes("Continue with GitHub"), `${signInPage.status}`);
  const accountPage = await call("U1", "GET", "/app/account", { cookie: U1.cookie });
  check("ui: /app/account shows the person and \"Ways you can sign in\", with no Link buttons when no provider is configured", accountPage.status === 200 && accountPage.text.includes("Your account") && accountPage.text.includes("Ways you can sign in") && accountPage.text.includes(U1.email) && !accountPage.text.includes("Link Google") && !accountPage.text.includes("Link GitHub"), `${accountPage.status}`);
  const nexts = [
    ["/oauth/authorize?client_id=c1&response_type=code", "/oauth/authorize?client_id=c1&response_type=code"],
    ["/app/w/x/people?tab=1", "/app/w/x/people?tab=1"],
    ["https://evil.example/", "/app"],
    ["//evil.example/app", "/app"],
    ["/apple", "/app"],
    ["/app\\@evil.example", "/app"],
    ["/oauth/authorize", "/app"],
    ["/app/w/x\tpeople", "/app"],
  ];
  const nextRes = await Promise.all(nexts.map(([n]) => call("U1", "GET", `/app/sign-in?next=${encodeURIComponent(n)}`, { cookie: U1.cookie })));
  check(
    "sign-in: next may be an /app path or an /oauth/authorize URL; anything else returns to /app",
    nextRes.every((r, i) => redirectTarget(r) === nexts[i][1]),
    nextRes.map((r) => `${r.status} ${redirectTarget(r)}`).join(" | "),
  );
  const reauthPage = await call("U1", "GET", "/app/sign-in?reauth=1&next=%2Fapp%2Fdevice", { cookie: U1.cookie });
  check("sign-in: reauth=1 shows the form even to someone signed in", reauthPage.status === 200 && reauthPage.text.includes("Send code"), `${reauthPage.status}`);
  if (existsSync(CHROME)) {
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // Email code: Send code, read the printed code, Sign in (the button waits for 6 digits), land on next.
      await page.goto(`${BASE}/app/sign-in?next=/app/account`, { waitUntil: "networkidle0" });
      await page.type('#email-code input[type="email"]', "chrome@example.test");
      await page.evaluate(() => [...document.querySelectorAll("#email-code button")].find((b) => b.textContent === "Send code")?.click());
      await page.waitForFunction(() => document.body.innerText.includes("a 6-digit code is on its way") && document.body.innerText.includes("npm run sign-in-link"), { timeout: 15000 });
      const chromeCode = codeIn(signInLine(onDir));
      const disabledAt5 = await (async () => {
        await page.type('#email-code input[name="code"]', chromeCode.slice(0, 5));
        return page.evaluate(() => [...document.querySelectorAll("#email-code button")].find((b) => b.textContent === "Sign in")?.disabled);
      })();
      await page.type('#email-code input[name="code"]', chromeCode.slice(5));
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("#email-code button")].find((b) => b.textContent === "Sign in")?.click())]);
      await page.waitForFunction(() => document.body.innerText.includes("Your account") && document.body.innerText.includes("Email code"), { timeout: 15000 });
      check("ui (Chrome): email code sign-in (Send code, the printed code, Sign in enabled only at 6 digits) lands on next (/app/account)", disabledAt5 === true && new URL(page.url()).pathname === "/app/account", `${disabledAt5} ${page.url()}`);
      // Recent sign-in prompt: an aged session on /app/device gets Sign in again, which signs out and comes back.
      const chromeCookie = (await page.cookies()).find((c) => c.name === "align_v2.session_token");
      ageSession(`align_v2.session_token=${chromeCookie?.value}`, 20);
      await page.goto(`${BASE}/app/device?code=BCDF-GHJK`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Sign in again to approve a device"), { timeout: 15000 });
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Sign in again")?.click())]);
      const back = new URL(page.url());
      const signedOut = (await page.cookies()).every((c) => c.name !== "align_v2.session_token" || !c.value);
      check(
        "ui (Chrome): Sign in again signs out and opens /app/sign-in?next=<the device page with its code>&email=<their email>",
        back.pathname === "/app/sign-in" && back.searchParams.get("next") === "/app/device?code=BCDF-GHJK" && back.searchParams.get("email") === "chrome@example.test" && signedOut,
        `${page.url()} signedOut=${signedOut}`,
      );
      await page.goto(`${BASE}/app/sign-in?next=/app`, { waitUntil: "networkidle0" });
      await page.evaluate(() => [...document.querySelectorAll("#test-idp button")].find((b) => b.textContent?.includes("Create a test account"))?.click());
      await page.waitForSelector('#test-idp input[autocomplete="name"]');
      await page.type('#test-idp input[autocomplete="name"]', "Browser User");
      await page.type('#test-idp input[type="email"]', "ui@example.test");
      await page.type('#test-idp input[type="password"]', "browser-pass-1");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => document.querySelector("#test-idp button[type=submit]")?.click())]);
      await page.waitForFunction(() => document.body.innerText.includes("Your workspaces") && document.body.innerText.includes("Create the Northstar sample"), { timeout: 15000 });
      // First run: the sample, then its pending change request approved from the Requests tab.
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Create the Northstar sample")?.click())]);
      await page.waitForFunction(() => document.body.innerText.includes("Expand to regulated customers") && document.body.innerText.includes("Pass the security review"), { timeout: 15000 });
      const sampleUrl = page.url();
      await page.goto(`${sampleUrl}/requests`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Waiting on you") && document.body.innerText.includes("waiting for approval") && document.body.innerText.includes("Pen test window booked"), { timeout: 15000 });
      const requestsText = await page.evaluate(() => document.body.innerText);
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Approve")?.click());
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Approve as version 2"), { timeout: 15000 });
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Approve as version 2")?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Approved by") && document.body.innerText.includes("It became version 2"), { timeout: 15000 });
      const sampleGoal = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent === "Pass the security review")?.getAttribute("href"));
      await page.goto(`${BASE}${sampleGoal}`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Change requests") && document.body.innerText.includes("approved") && document.body.innerText.includes("version 2"), { timeout: 15000 });
      const ownGoalText = await page.evaluate(() => document.body.innerText);
      check("ui (Chrome): first run offers the Northstar sample; its request is approved from the Requests tab; the owner's goal page lists it without Propose a change", !ownGoalText.includes("Propose a change") && /Your requests/.test(requestsText), "");
      await page.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Northstar (sample)") && !document.body.innerText.includes("Create the Northstar sample"), { timeout: 15000 });
      await page.type("main form input", "UI workspace");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Create")?.click())]);
      await page.waitForFunction(() => document.body.innerText.includes("New goal") && document.body.innerText.includes("Level"), { timeout: 15000 });
      await page.type('main form input:not([aria-label])', "Browser goal");
      await page.type('input[aria-label="Measure 1"]', "Browser measure");
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Create goal")?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Browser goal") && document.body.innerText.includes("Browser measure"), { timeout: 15000 });
      const wsUrl = page.url();
      await page.goto(`${wsUrl}/spend`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Estimated list cost") && document.body.innerText.includes("Total"), { timeout: 15000 });
      const spendText = await page.evaluate(() => document.body.innerText);
      await page.goto(`${wsUrl}/people`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => ["Invite someone", "Teams", "No teams yet.", "Leave workspace", "Create team"].every((x) => document.body.innerText.includes(x)), { timeout: 15000 });
      const peopleText = await page.evaluate(() => document.body.innerText);
      for (const t of ["sessions", "alignments", "requests"]) {
        await page.goto(`${wsUrl}/${t}`, { waitUntil: "networkidle0" });
        await page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 15000 }, t === "sessions" ? "Shared sessions" : t === "requests" ? "You have not proposed a change" : "Waiting on you");
      }
      await page.goto(`${wsUrl}/apps`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("No AI apps are connected to this workspace.") && document.body.innerText.includes("/api/mcp"), { timeout: 15000 });
      await page.goto(`${BASE}/app/devices`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.body.innerText.includes("Your devices"), { timeout: 15000 });
      const allText = spendText + peopleText + (await page.evaluate(() => document.body.innerText));
      check("ui (Chrome): test sign-up, create a workspace and a goal (an owner is offered the Level choice), then spend, people (teams, leave), sessions, alignments, apps and devices render without page errors", errors.length === 0 && /estimate/i.test(spendText), errors.join(" | "));
      check("ui (Chrome): the People and Spend tabs say team, never pod", !/\bpods?\b/i.test(peopleText + spendText), "pod found");
      check("ui (Chrome): no em dashes in rendered copy", !allText.includes("\u2014"), "em dash found");
    } catch (e) {
      check("ui (Chrome) run", false, e?.stack ?? e);
    } finally {
      await browser.close();
    }
  } else check("ui (Chrome) available", false, `no Chrome at ${CHROME}`);

  // -- Mode L ignores ALIGN_CREATION=closed, every cap (1 here) and the Turnstile keys --
  const U9 = await signUp("U9", "Una Nine", "u9@example.test");
  const u9ws = [];
  for (const n of ["Nine A", "Nine B"]) u9ws.push(await call("U9", "POST", "/api/v2/workspaces", { cookie: U9.cookie, body: { name: n } }));
  const u9sample = await call("U9", "POST", "/api/v2/workspaces/sample", { cookie: U9.cookie, body: {} });
  const u9inv = await Promise.all(["x1@example.test", "x2@example.test"].map((email) => call("U9", "POST", `/api/v2/workspaces/${u9ws[0].json?.id}/invites`, { cookie: U9.cookie, body: { email, role: "member" } })));
  const u9home = await call("U9", "GET", "/app", { cookie: U9.cookie });
  const u9signIn = await call("anon", "GET", "/app/sign-in");
  check(
    "local: Mode L ignores ALIGN_CREATION=closed, the caps and the Turnstile keys: one person creates 2 workspaces and the sample with no code or check, and invites past a cap of 1; no page shows a code field, a bot check or a request-access link",
    u9ws.every((r) => r.status === 201) && u9sample.status === 201 && u9inv.every((r) => r.status === 201) && u9home.status === 200 && !u9home.text.includes('name="creation_code"') && !u9home.text.includes("data-turnstile-sitekey") && !u9signIn.text.includes("data-turnstile-sitekey") && !u9signIn.text.includes("/app/request-access"),
    `${u9ws.map((r) => r.status)} ${u9sample.status} ${u9inv.map((r) => r.status)} ${u9sample.text}`,
  );
  // -- the operator script's workspace commands: list without people, and delete by the app's own deletion path --
  const opOn = { ALIGN_DATA_DIR: onDir };
  const delWs = u9ws[1].json.id;
  const delInv = await call("U9", "POST", `/api/v2/workspaces/${delWs}/invites`, { cookie: U9.cookie, body: { email: U1.email, role: "member" } });
  await call("U1", "POST", `/api/v2/invites/${delInv.json?.token}/accept`, { cookie: U1.cookie, body: {} });
  const opWsList = admin(["workspaces", "list"], opOn);
  const delLine = opWsList.out.split("\n").find((l) => l.startsWith(delWs)) ?? "";
  check(
    "align-admin: workspaces list shows each workspace's id, name, created date, member and owner counts, and no names or emails of people",
    opWsList.status === 0 && /^id\s+name\s+created\s+members\s+owners/.test(opWsList.out) && /Nine B\s+\d{4}-\d{2}-\d{2}\s+2\s+1\s*$/.test(delLine) && !opWsList.out.includes("@") && !opWsList.out.includes("Una Nine"),
    opWsList.out + opWsList.err,
  );
  const delNoYes = admin(["workspaces", "delete", delWs], opOn);
  check("align-admin: workspaces delete without --yes deletes nothing and exits 1, asking for --yes", delNoYes.status === 1 && /--yes/.test(delNoYes.err) && withDb((d) => !!d.prepare("SELECT 1 FROM v2_workspaces WHERE id = ?").get(delWs)), delNoYes.err);
  const delYes = admin(["workspaces", "delete", delWs, "--yes"], opOn);
  const delGone = await call("U1", "GET", `/api/v2/workspaces/${delWs}`, { cookie: U1.cookie });
  const delLeft = withDb((d) => ["v2_members", "v2_invites", "v2_audit"].map((t) => d.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ws_id = ?`).get(delWs).n));
  check(
    "align-admin: workspaces delete <id> --yes removes it by the app's deletion path (members, invites and audit rows gone; the running server answers 404 for it); an unknown id exits 1",
    delYes.status === 0 && delGone.status === 404 && delLeft.every((n) => n === 0) && admin(["workspaces", "delete", delWs, "--yes"], opOn).status === 1,
    `${delYes.status} ${delYes.err} ${delGone.status} ${delLeft}`,
  );

  // -- the private-goal canary never reached anyone but its owner --
  const leaks = seen.filter((s) => s.who !== "U2" && s.text.includes(CANARY));
  const ownerSaw = seen.some((s) => s.who === "U2" && s.text.includes(CANARY));
  check(`canary: the private goal's text appears in none of ${seen.filter((s) => s.who !== "U2").length} responses to anyone but its owner (workspace owner included); its owner sees it`, leaks.length === 0 && ownerSaw, leaks.map((l) => `${l.who} ${l.p}`).join(" | "));
  await stopServer();

  // ======== phase hosted: v2 startup refusals, then v2 behind the hosted checks ========
  const hostedDir = path.join(tmpRoot, "hosted");
  const good = {
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "t".repeat(48),
    ALIGN_DATA_DIR: hostedDir,
    BETTER_AUTH_SECRET: "b".repeat(40),
    GOOGLE_CLIENT_ID: "test-google-id",
    GOOGLE_CLIENT_SECRET: "test-google-secret",
    GITHUB_CLIENT_ID: "test-github-id",
    GITHUB_CLIENT_SECRET: "test-github-secret",
    ALIGN_PUBLIC_ORIGIN: `https://${HOSTED_HOST}`,
  };
  const noProviders = { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GITHUB_CLIENT_ID: undefined, GITHUB_CLIENT_SECRET: undefined };
  // Every hosted startup check (lib/config.ts hostedProblems and lib/v2/config.ts v2Problems), each on its own server.
  const refusals = [
    ["no ALIGN_HOSTS", { ALIGN_HOSTS: undefined }, "ALIGN_HOSTS must list"],
    ["a loopback name in ALIGN_HOSTS", { ALIGN_HOSTS: `${HOSTED_HOST},localhost` }, "ALIGN_HOSTS must not include loopback names"],
    ["no ALIGN_SECRET", { ALIGN_SECRET: undefined }, "ALIGN_SECRET must be set (32+ characters)"],
    ["a short ALIGN_SECRET", { ALIGN_SECRET: "s".repeat(20) }, "ALIGN_SECRET must be set (32+ characters)"],
    ["a relative ALIGN_DATA_DIR", { ALIGN_DATA_DIR: "data/hosted" }, "ALIGN_DATA_DIR must be an absolute path"],
    ["an ALIGN_DATA_DIR inside the app", { ALIGN_DATA_DIR: path.join(ROOT, "data", "hosted-inside") }, "ALIGN_DATA_DIR must be outside the app directory"],
    ["ALIGN_PUBLIC=1", { ALIGN_PUBLIC: "1" }, "Public mode is not supported"],
    ["no BETTER_AUTH_SECRET", { BETTER_AUTH_SECRET: undefined }, "BETTER_AUTH_SECRET must be set"],
    ["a short BETTER_AUTH_SECRET", { BETTER_AUTH_SECRET: "short" }, "BETTER_AUTH_SECRET must be set"],
    ["no ALIGN_PUBLIC_ORIGIN", { ALIGN_PUBLIC_ORIGIN: undefined }, "ALIGN_PUBLIC_ORIGIN must be an https origin"],
    ["an http ALIGN_PUBLIC_ORIGIN", { ALIGN_PUBLIC_ORIGIN: `http://${HOSTED_HOST}` }, "ALIGN_PUBLIC_ORIGIN must be an https origin"],
    ["an ALIGN_PUBLIC_ORIGIN outside ALIGN_HOSTS", { ALIGN_PUBLIC_ORIGIN: "https://other.example" }, "must be listed in ALIGN_HOSTS"],
    ["no way to sign in (no email settings, no Google, no GitHub)", noProviders, "Sign-in needs the email settings"],
    ["only some of the email settings", { ...noProviders, ALIGN_EMAIL_API_URL: "https://mail.example/emails", ALIGN_EMAIL_API_KEY: "k".repeat(20) }, "Set all of ALIGN_EMAIL_API_URL, ALIGN_EMAIL_API_KEY, ALIGN_EMAIL_FROM or none (missing ALIGN_EMAIL_FROM)"],
    ["an http ALIGN_EMAIL_API_URL", { ALIGN_EMAIL_API_URL: "http://mail.example/emails", ALIGN_EMAIL_API_KEY: "k".repeat(20), ALIGN_EMAIL_FROM: "Align <a@mail.example>" }, "ALIGN_EMAIL_API_URL must be an https URL"],
    ["a Google id without its secret", { GOOGLE_CLIENT_SECRET: undefined }, "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together"],
    ["ALIGN_TEST_IDP", { ALIGN_TEST_IDP: "1" }, "ALIGN_TEST_IDP is not allowed when hosted"],
    ["ALIGN_LOCAL_OWNER_EMAIL", { ALIGN_LOCAL_OWNER_EMAIL: "me@example.test" }, "ALIGN_LOCAL_OWNER_EMAIL is not allowed when hosted"],
    ["an unknown ALIGN_CREATION", { ALIGN_CREATION: "invite-only" }, "ALIGN_CREATION must be codes, open or closed"],
    ["a cap that is not a positive whole number", { ALIGN_MAX_MEMBERS: "0" }, "ALIGN_MAX_MEMBERS must be a positive whole number"],
    ["a Turnstile site key without its secret key", { ALIGN_TURNSTILE_SITE_KEY: "site" }, "ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY must be set together"],
    ["an http ALIGN_TURNSTILE_VERIFY_URL", { ALIGN_TURNSTILE_SITE_KEY: "site", ALIGN_TURNSTILE_SECRET_KEY: "secret", ALIGN_TURNSTILE_VERIFY_URL: "http://127.0.0.1:1/siteverify" }, "ALIGN_TURNSTILE_VERIFY_URL must be an https URL"],
  ];
  for (const [what, delta, needle] of refusals) {
    const env = { ...good, ...delta };
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    const r = await startServer(env);
    check(`hosted: refuses to serve with ${what}`, !r.started && (r.exited || r.last === 503) && r.stderr().includes(needle), r.started ? "it started" : `exited=${r.exited} last=${r.last} ${r.stderr().slice(-300)}`);
    await stopServer();
  }
  // The retired v1 settings are neither required (good has no passcodes or signup codes) nor refused.
  const v1Env = { ALIGN_SIGNUP_CODES: "x", ALIGN_PRODUCT_PASSCODE: "product-demo", AI_GATEWAY_API_KEY: "sk-test", ANTHROPIC_API_KEY: "sk-test", ALIGN_CAPTURE: "1", ALIGN_MCP_TOKEN: "t".repeat(32), ALIGN_GOAL_SESSIONS: "0" };
  const withV1 = await startServer({ ...good, ...v1Env });
  check("hosted: starts without v1's passcodes or signup codes, and ignores v1-era settings (signup codes, default passcodes, AI keys, capture, ALIGN_MCP_TOKEN, ALIGN_GOAL_SESSIONS)", withV1.started, withV1.stderr().slice(-300));
  const v1Off = await Promise.all([hosted("GET", "/api/v2/me"), hosted("GET", "/api/mcp", { headers: { authorization: `Bearer ${v1Env.ALIGN_MCP_TOKEN}` } })]);
  check("hosted: with ALIGN_GOAL_SESSIONS=0 v2 is still on, and ALIGN_MCP_TOKEN is no credential (/api/mcp -> 401)", v1Off[0].status === 401 && v1Off[1].status === 401, v1Off.map((r) => r.status).join(","));
  await stopServer();
  const goodRun = await mustStart(good);
  await sleep(300);
  const turnstileWarnings = (goodRun.stderr() + goodRun.stdout()).split("\n").filter((l) => l.includes("ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY are not set"));
  check("hosted: without Turnstile keys the server starts and logs one warning that there is no bot check", turnstileWarnings.length === 1, (goodRun.stderr() + goodRun.stdout()).slice(-400));
  // -- the hosted route allowlist: / -> /app; /app*, /api/v2/*, /api/mcp, /oauth/*, /.well-known/*, /api/oauth/* and static assets; else 404 --
  const hRoot = await hosted("GET", "/");
  check("hosted: / redirects to https://<host>/app (307)", hRoot.status === 307 && hRoot.headers.location === `https://${HOSTED_HOST}/app`, `${hRoot.status} ${hRoot.headers.location}`);
  const outside = [
    ["GET", "/api/state"],
    ["POST", "/api/sessions/events"],
    ["GET", "/setup"],
    ["GET", "/new"],
    ["GET", "/w/x"],
    ["POST", "/api/session"],
    ["GET", "/api/workspaces/config"],
    ["GET", "/api/policy/security"],
    ["GET", "/apps"],
    ["GET", "/api/v2x"],
    ["GET", "/oauthx"],
    ["GET", "/file.svg"],
  ];
  const outsideR = await Promise.all(outside.map(([m, p]) => hosted(m, p, m === "POST" ? { body: {}, headers: { origin: `https://${HOSTED_HOST}` } } : {})));
  check(
    `hosted: every path outside the allowlist -> 404 {"error":"Not found"} (${outside.map(([m, p]) => `${m} ${p}`).join(", ")})`,
    outsideR.every((r) => r.status === 404 && r.json?.error === "Not found"),
    outsideR.map((r, i) => `${outside[i][1]}:${r.status}`).join(" "),
  );
  const inside = await Promise.all([
    hosted("GET", "/app"),
    hosted("GET", "/api/mcp"),
    hosted("GET", "/.well-known/oauth-authorization-server"),
    hosted("GET", "/.well-known/oauth-protected-resource/api/mcp"),
    hosted("POST", "/oauth/register", { body: {} }),
    hosted("POST", "/api/oauth/approve", { body: {}, headers: { origin: `https://${HOSTED_HOST}` } }),
    hosted("GET", "/favicon.ico"),
  ]);
  check(
    "hosted: allowlisted paths reach their routes (/app, /api/mcp 401, /.well-known/* 200, /oauth/register 400, /api/oauth/approve, /favicon.ico 200)",
    inside.every((r) => r.status !== 404 || r.json?.error !== "Not found") && inside[1].status === 401 && inside[2].status === 200 && inside[3].status === 200 && inside[4].status === 400 && inside[6].status === 200,
    inside.map((r) => `${r.status}`).join(" "),
  );
  const hMe = await hosted("GET", "/api/v2/me");
  const hSignIn = await hosted("GET", "/app/sign-in");
  const hSession = await hosted("GET", "/api/v2/auth/get-session");
  check("hosted: v2 routes are served (/api/v2/me 401, /app/sign-in 200, Better Auth answers)", hMe.status === 401 && hSignIn.status === 200 && hSession.status === 200, `${hMe.status} ${hSignIn.status} ${hSession.status}`);
  check("hosted: the sign-in page offers Google and GitHub, never the test sign-in; without email settings, no email code", hSignIn.text.includes("Continue with Google") && hSignIn.text.includes("Continue with GitHub") && !hSignIn.text.includes("Test sign-in") && !hSignIn.text.includes("Send code"), "");
  dbFile = path.join(hostedDir, "v2", "align.sqlite");
  const hNoEmail = await hosted("POST", SEND, { body: { email: "x@example.test", type: "sign-in" }, headers: { origin: `https://${HOSTED_HOST}` } });
  check("hosted: without the email settings a request to send a code is refused (404) and nothing is sent", hNoEmail.status === 404 && !existsSync(path.join(hostedDir, "v2", "sign-in.txt")), `${hNoEmail.status}`);
  check("hosted: no local owner is made", withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM ba_user").get().n) === 0, "");
  const hSignUp = await hosted("POST", "/api/v2/auth/sign-up/email", { body: { name: "x", email: "x@example.test", password: "password-123" }, headers: { origin: `https://${HOSTED_HOST}` } });
  check("hosted: email + password sign-up is off", hSignUp.status !== 200, `${hSignUp.status} ${hSignUp.text.slice(0, 100)}`);
  const hHttp = await hosted("GET", "/api/v2/me", { headers: { "x-forwarded-proto": "http" } });
  const hNoEdge = await hosted("GET", "/api/v2/me", { headers: { "fly-client-ip": undefined } });
  const hForeign = await new Promise((resolve) => {
    http.get({ host: "127.0.0.1", port: PORT, path: "/api/v2/me", headers: { host: "evil.example", "x-forwarded-proto": "https", "fly-client-ip": "1.2.3.4" } }, (res) => resolve(res.statusCode));
  });
  check("hosted: v2 routes pass the same checks (http -> 403, no Fly-Client-IP -> 403, foreign Host -> 421)", hHttp.status === 403 && hNoEdge.status === 403 && hForeign === 421, `${hHttp.status} ${hNoEdge.status} ${hForeign}`);
  // Hosted cookie writes: Origin is required and must be exactly https://<Host> (as lib/http.ts). The site
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
  const hDev = await hosted("POST", "/api/v2/device/authorize", { body: { device_name: "x", public_key: newDeviceKeys().pub } });
  check("hosted: the device verification URI is the public origin", hDev.status === 200 && hDev.json.verification_uri === `https://${HOSTED_HOST}/app/device`, hDev.text);
  await stopServer();

  // ======== no closing date: a hosted server never shuts itself down (a leftover ALIGN_DELETE_BY is ignored) ========
  const leftover = await startServer({ ...good, ALIGN_DELETE_BY: "2020-01-01" });
  const leftoverMe = leftover.started ? await hosted("GET", "/app") : { status: 0 };
  check(
    "no closing date: a hosted server with a past ALIGN_DELETE_BY still starts and serves (no 410)",
    leftover.started && leftoverMe.status !== 410 && leftoverMe.status < 500,
    `${leftover.last} ${leftoverMe.status} ${leftover.stderr().slice(-200)}`,
  );
  await stopServer();

  // ======== hosted email codes, through a fake Resend-compatible HTTPS email API ========
  const ssl = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(tmpRoot, "tls-key.pem"), "-out", path.join(tmpRoot, "tls-cert.pem"), "-days", "2", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { encoding: "utf8" });
  if (ssl.status !== 0) throw new Error(`openssl: ${ssl.stderr}`);
  const caFile = path.join(tmpRoot, "ca.pem");
  writeFileSync(caFile, (process.env.NODE_EXTRA_CA_CERTS && existsSync(process.env.NODE_EXTRA_CA_CERTS) ? readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8") + "\n" : "") + readFileSync(path.join(tmpRoot, "tls-cert.pem"), "utf8"));
  const mails = [];
  const mailApi = https.createServer({ key: readFileSync(path.join(tmpRoot, "tls-key.pem")), cert: readFileSync(path.join(tmpRoot, "tls-cert.pem")) }, (req, res) => {
    let t = "";
    req.on("data", (c) => (t += c));
    req.on("end", () => {
      let body = null;
      try {
        body = JSON.parse(t);
      } catch {}
      mails.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers["content-type"], body });
      const fail = body?.to === "fail@example.test";
      res.writeHead(fail ? 500 : 200, { "content-type": "application/json" });
      res.end(fail ? '{"error":"down"}' : `{"id":"${randomBytes(6).toString("hex")}"}`);
    });
  });
  await new Promise((r) => mailApi.listen(0, "127.0.0.1", r));
  const MAIL_KEY = `re_${randomBytes(12).toString("hex")}`;
  const emailDir = path.join(tmpRoot, "hosted-email");
  const emailEnv = { ...good, ...noProviders, ALIGN_DATA_DIR: emailDir, ALIGN_EMAIL_API_URL: `https://127.0.0.1:${mailApi.address().port}/emails`, ALIGN_EMAIL_API_KEY: MAIL_KEY, ALIGN_EMAIL_FROM: "Align <signin@align.test>", ALIGN_FIRST_OWNER_EMAIL: "Ops@Example.test", NODE_EXTRA_CA_CERTS: caFile };
  for (const k of Object.keys(emailEnv)) if (emailEnv[k] === undefined) delete emailEnv[k];
  const eRun = await startServer(emailEnv);
  check("hosted email: starts with only the three email settings (no Google, no GitHub)", eRun.started, eRun.stderr().slice(-400));
  dbFile = path.join(emailDir, "v2", "align.sqlite");
  const hOrigin = { origin: `https://${HOSTED_HOST}` };
  // Each send from its own client address: hosted, Better Auth allows 3 sends per client per minute (durably).
  let sendIp = 0;
  const hSend = (email) => hosted("POST", SEND, { body: { email, type: "sign-in" }, headers: { ...hOrigin, "fly-client-ip": `203.0.113.${++sendIp}` } });
  const hCodeSignIn = (email, otp) => hosted("POST", OTP_SIGN_IN, { body: { email, otp }, headers: hOrigin });
  const hCookie = (r) => cookieOf([].concat(r.headers["set-cookie"] ?? []));
  const mailCode = (to) => /code is (\d{6})/.exec(mails.filter((m) => m.body?.to === to).pop()?.body?.text ?? "")?.[1] ?? "";
  const ePage = await hosted("GET", "/app/sign-in?email=ops%40example.test&code=123456");
  check("hosted email: the sign-in page offers the email code only (no provider buttons); the link fills the form without the Mode L hint", ePage.status === 200 && ePage.text.includes('value="123456"') && !ePage.text.includes("Continue with") && !ePage.text.includes("npm run sign-in-link") && !ePage.text.includes("Test sign-in"), `${ePage.status}`);
  const opsSend = await hSend("ops@example.test");
  const m0 = mails[0];
  const opsCode = mailCode("ops@example.test");
  check(
    "hosted email: a code is one HTTPS POST of {from, to, subject, text} with the Bearer key; subject \"Your Align sign-in code\"; the text has the code, the public-origin link and the 5-minute expiry",
    opsSend.status === 200 && mails.length === 1 && m0.method === "POST" && m0.url === "/emails" && m0.auth === `Bearer ${MAIL_KEY}` && /application\/json/.test(m0.type) && Object.keys(m0.body).sort().join() === "from,subject,text,to" && m0.body.from === "Align <signin@align.test>" && m0.body.to === "ops@example.test" && m0.body.subject === "Your Align sign-in code" && /^\d{6}$/.test(opsCode) && m0.body.text.includes(`https://${HOSTED_HOST}/app/sign-in?email=ops%40example.test&code=${opsCode}`) && m0.body.text.includes("5 minutes"),
    `${opsSend.status} ${JSON.stringify(mails)}`,
  );
  const unknownSend = await hSend("nobody@example.test");
  check("hosted email: the send answer for an address with no account and no invite is the same as for any other (no disclosure)", unknownSend.status === opsSend.status && unknownSend.text === opsSend.text, `${unknownSend.status} ${unknownSend.text} | ${opsSend.text}`);
  const nobodyIn = await hCodeSignIn("nobody@example.test", mailCode("nobody@example.test"));
  check(
    "hosted email: a valid code for an address with no account and no pending invite -> 403 \"This email can't sign in here yet. Ask a workspace owner to invite you.\"; no account, no session",
    nobodyIn.status === 403 && nobodyIn.json?.message === "This email can't sign in here yet. Ask a workspace owner to invite you." && !hCookie(nobodyIn) && !withDb((d) => d.prepare("SELECT 1 FROM ba_user WHERE email = ?").get("nobody@example.test")),
    `${nobodyIn.status} ${nobodyIn.text}`,
  );
  const opsIn = await hCodeSignIn("ops@example.test", opsCode);
  const OPS = { cookie: hCookie(opsIn) };
  const opsRow = withDb((d) => d.prepare("SELECT emailVerified FROM ba_user WHERE email = ?").get("ops@example.test"));
  check("hosted email: ALIGN_FIRST_OWNER_EMAIL (any case) is the first account: its code creates it (verified) and signs in with the __Secure- cookie", opsIn.status === 200 && OPS.cookie.includes("__Secure-align_v2.session_token") && opsRow?.emailVerified === 1, `${opsIn.status} ${opsIn.text}`);
  const eWs = await hosted("POST", "/api/v2/workspaces", { body: { name: "Hosted email" }, cookie: OPS.cookie, headers: hOrigin });
  const eInv = await hosted("POST", `/api/v2/workspaces/${eWs.json?.id}/invites`, { body: { email: "Invitee@Example.test", role: "member" }, cookie: OPS.cookie, headers: hOrigin });
  await hSend("invitee@example.test");
  const invIn = await hCodeSignIn("invitee@example.test", mailCode("invitee@example.test"));
  const invAccept = await hosted("POST", `/api/v2/invites/${eInv.json?.token}/accept`, { body: {}, cookie: hCookie(invIn), headers: hOrigin });
  check("hosted email: an address with a pending invite gets an account from its code, then accepts the invite", eWs.status === 201 && eInv.status === 201 && invIn.status === 200 && invAccept.status === 200 && invAccept.json?.role === "member", `${eWs.status} ${eInv.status} ${invIn.status} ${invIn.text} ${invAccept.status} ${invAccept.text}`);
  const mailsBefore = mails.length;
  const failSend = await hSend("fail@example.test");
  await sleep(300);
  const failLog = eRun.stderr() + eRun.stdout();
  check(
    "hosted email: an email API failure fails the send (5xx), the code is deleted, and the log names only the status (never the address, code or key)",
    failSend.status >= 500 && mails.length === mailsBefore + 1 && !withDb((d) => d.prepare("SELECT 1 FROM ba_verification WHERE identifier = ?").get("sign-in-otp-fail@example.test")) && failLog.includes("Sign-in email failed: HTTP 500") && !failLog.includes("fail@example.test") && !failLog.includes(MAIL_KEY),
    `${failSend.status} ${failSend.text} ${failLog.slice(-300)}`,
  );
  const codes = mails.map((m) => /code is (\d{6})/.exec(m.body?.text ?? "")?.[1]).filter(Boolean);
  check("hosted email: no code is ever printed or logged, and no sign-in.txt is written", codes.length >= 3 && codes.every((c) => !failLog.includes(c)) && !existsSync(path.join(emailDir, "v2", "sign-in.txt")), `${codes.length}`);
  await stopServer();
  const lateRun = await startServer({ ...emailEnv, ALIGN_FIRST_OWNER_EMAIL: "late@example.test" });
  await hSend("late@example.test");
  const lateIn = await hCodeSignIn("late@example.test", mailCode("late@example.test"));
  check("hosted email: ALIGN_FIRST_OWNER_EMAIL gets no exception once any account exists (403)", lateRun.started && lateIn.status === 403 && !withDb((d) => d.prepare("SELECT 1 FROM ba_user WHERE email = ?").get("late@example.test")), `${lateIn.status} ${lateIn.text}`);
  await stopServer();

  // ======== hosted gate: creation codes, request access, Turnstile through a fake verify API, durable limits, caps ========
  const verifies = [];
  const verifyApi = https.createServer({ key: readFileSync(path.join(tmpRoot, "tls-key.pem")), cert: readFileSync(path.join(tmpRoot, "tls-cert.pem")) }, (req, res) => {
    let t = "";
    req.on("data", (c) => (t += c));
    req.on("end", () => {
      let body = null;
      try {
        body = JSON.parse(t);
      } catch {}
      verifies.push({ url: req.url, body });
      const tok = String(body?.response ?? "");
      if (tok === "down") {
        res.writeHead(500, { "content-type": "application/json" });
        return res.end("{}");
      }
      const ok = tok.startsWith("ok") && body?.secret === "turnstile-secret";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(ok ? { success: true, hostname: tok === "ok-elsewhere" ? "elsewhere.example" : HOSTED_HOST, action: "" } : { success: false, "error-codes": ["invalid-input-response"] }));
    });
  });
  await new Promise((r) => verifyApi.listen(0, "127.0.0.1", r));
  const gateDir = path.join(tmpRoot, "hosted-gate");
  const gateEnv = {
    ...emailEnv,
    ALIGN_DATA_DIR: gateDir,
    ALIGN_FIRST_OWNER_EMAIL: "ops@example.test",
    ALIGN_TURNSTILE_SITE_KEY: "turnstile-site",
    ALIGN_TURNSTILE_SECRET_KEY: "turnstile-secret",
    ALIGN_TURNSTILE_VERIFY_URL: `https://127.0.0.1:${verifyApi.address().port}/siteverify`,
    ALIGN_MAX_WORKSPACES: "4",
    ALIGN_MAX_MEMBERS: "3",
    ALIGN_MAX_SESSIONS_PER_DEVICE_DAY: "2",
  };
  const gRun = await startServer(gateEnv);
  dbFile = path.join(gateDir, "v2", "align.sqlite");
  check("gate: a hosted server with Turnstile keys, an https verify URL and caps starts, with no bot-check warning", gRun.started && !(gRun.stderr() + gRun.stdout()).includes("no bot check"), gRun.stderr().slice(-300));
  let gIp = 0;
  const nextIp = () => `198.18.0.${++gIp}`;
  const bot = (tok = "ok") => (tok === null ? {} : { "x-captcha-response": tok });
  const gSend = (email, tok = "ok", ip = nextIp()) => hosted("POST", SEND, { body: { email, type: "sign-in" }, headers: { ...hOrigin, ...bot(tok), "fly-client-ip": ip } });
  const gCodeIn = (email, otp, tok = "ok") => hosted("POST", OTP_SIGN_IN, { body: { email, otp }, headers: { ...hOrigin, ...bot(tok), "fly-client-ip": nextIp() } });
  const gSignIn = async (email) => {
    await gSend(email);
    const r = await gCodeIn(email, mailCode(email));
    return { status: r.status, text: r.text, cookie: hCookie(r), email };
  };
  const gPost = (p, body, who, tok = "ok") => hosted("POST", p, { body, cookie: who?.cookie, headers: { ...hOrigin, ...bot(tok) } });
  const gCreate = (who, name, code, tok = "ok") => gPost("/api/v2/workspaces", code === undefined ? { name } : { name, creation_code: code }, who, tok);
  const gAccess = (body, tok = "ok") => hosted("POST", "/api/v2/access-requests", { body, headers: { ...hOrigin, ...bot(tok), "fly-client-ip": nextIp() } });
  const opGate = { HOSTED: "1", ALIGN_DATA_DIR: gateDir, ALIGN_SECRET: good.ALIGN_SECRET, ALIGN_PUBLIC_ORIGIN: good.ALIGN_PUBLIC_ORIGIN, ALIGN_EMAIL_API_URL: emailEnv.ALIGN_EMAIL_API_URL, ALIGN_EMAIL_API_KEY: MAIL_KEY, ALIGN_EMAIL_FROM: emailEnv.ALIGN_EMAIL_FROM, NODE_EXTRA_CA_CERTS: caFile };

  // -- pages: the widget, and links to request access --
  const gSignInPage = await hosted("GET", "/app/sign-in");
  const gRaPage = await hosted("GET", "/app/request-access");
  check(
    "gate: the sign-in and request-access pages render the Turnstile widget with the site key, and sign-in links to /app/request-access while creation needs a code",
    gSignInPage.status === 200 && gSignInPage.text.includes('data-turnstile-sitekey="turnstile-site"') && gSignInPage.text.includes('href="/app/request-access"') && gRaPage.status === 200 && gRaPage.text.includes('data-turnstile-sitekey="turnstile-site"') && !gRaPage.text.includes("without a code"),
    `${gSignInPage.status} ${gRaPage.status}`,
  );
  // -- Turnstile on the email-code send and sign-in routes (Better Auth's captcha plugin) --
  const mailsAt = mails.length;
  const noTok = await gSend("ops@example.test", null);
  const badTok = await gSend("ops@example.test", "bad");
  const elsewhere = await gSend("ops@example.test", "ok-elsewhere");
  check(
    "gate: sending a code without a token -> 400 MISSING_RESPONSE, with a rejected token or one solved on another host -> 403 VERIFICATION_FAILED; nothing is sent",
    noTok.status === 400 && noTok.json?.code === "MISSING_RESPONSE" && badTok.status === 403 && badTok.json?.code === "VERIFICATION_FAILED" && elsewhere.status === 403 && mails.length === mailsAt,
    `${noTok.status} ${noTok.text} ${badTok.status} ${elsewhere.status}`,
  );
  const vAt = verifies.length;
  const okSend = await gSend("ops@example.test", "ok", "198.18.9.9");
  const v = verifies[vAt];
  check(
    "gate: with a passing token the code is sent; the server posted {secret, response, remoteip} to ALIGN_TURNSTILE_VERIFY_URL",
    okSend.status === 200 && mails.length === mailsAt + 1 && v?.url === "/siteverify" && v.body.secret === "turnstile-secret" && v.body.response === "ok" && v.body.remoteip === "198.18.9.9",
    `${okSend.status} ${JSON.stringify(v)}`,
  );
  const opsCodeG = mailCode("ops@example.test");
  const inNoTok = await gCodeIn("ops@example.test", opsCodeG, null);
  const opsInG = await gCodeIn("ops@example.test", opsCodeG);
  const OPSG = { cookie: hCookie(opsInG) };
  check("gate: signing in with a code needs a token too (400 without, and the code still works); with one, the first owner signs in", inNoTok.status === 400 && opsInG.status === 200 && !!OPSG.cookie, `${inNoTok.status} ${opsInG.status} ${opsInG.text}`);
  // -- the first owner's first workspace needs no code; every create needs the token --
  const opsHome = await hosted("GET", "/app", { cookie: OPSG.cookie });
  check("gate: /app for the first owner on an empty server has the widget and no creation code field", opsHome.status === 200 && opsHome.text.includes('data-turnstile-sitekey="turnstile-site"') && !opsHome.text.includes('name="creation_code"'), `${opsHome.status}`);
  const cNoTok = await gCreate(OPSG, "Ops One", undefined, null);
  const cBadTok = await gCreate(OPSG, "Ops One", undefined, "bad");
  const cDown = await gCreate(OPSG, "Ops One", undefined, "down");
  const W1 = await gCreate(OPSG, "Ops One");
  check(
    "gate: creating needs the token (none -> 400 captcha_required, rejected -> 403 captcha_failed, verify API down -> 503 captcha_unavailable); ALIGN_FIRST_OWNER_EMAIL's first workspace on an empty server needs no code (201)",
    cNoTok.status === 400 && cNoTok.json?.error === "captcha_required" && cBadTok.status === 403 && cBadTok.json?.error === "captcha_failed" && cDown.status === 503 && cDown.json?.error === "captcha_unavailable" && W1.status === 201,
    `${cNoTok.status} ${cBadTok.status} ${cDown.status} ${W1.status} ${W1.text}`,
  );
  const opsSecond = await gCreate(OPSG, "Ops Two");
  const opsSample = await gPost("/api/v2/workspaces/sample", {}, OPSG);
  const opsHome2 = await hosted("GET", "/app", { cookie: OPSG.cookie });
  check(
    "gate: after that a create without a code -> 403 creation_code_required (the sample too); /app now asks for a creation code and links to /app/request-access",
    opsSecond.status === 403 && opsSecond.json?.error === "creation_code_required" && /Request access/.test(opsSecond.json?.message) && opsSample.status === 403 && opsSample.json?.error === "creation_code_required" && opsHome2.text.includes('name="creation_code"') && opsHome2.text.includes('href="/app/request-access"'),
    `${opsSecond.status} ${opsSecond.text} ${opsSample.status}`,
  );
  // -- request access (hosted: token required, disposable domains refused) --
  const reqBody = { email: "alice@example.test", name: "Alice Able", company: "Able Co", team_size: "11-50", use_case: "Goals for our agent fleet", interest: "evaluate" };
  const aNoTok = await gAccess(reqBody, null);
  const aDisp = await gAccess({ ...reqBody, email: "temp@mailinator.com" });
  const aDispSub = await gAccess({ ...reqBody, email: "temp@x.mailinator.com" });
  const aOk = await gAccess(reqBody);
  const aliceReq = withDb((d) => d.prepare("SELECT * FROM v2_access_requests WHERE email = ?").get("alice@example.test"));
  check(
    "gate: an access request needs the token (400 captcha_required); a disposable address or a subdomain of one -> 403 disposable_email; a good one -> 201, stored pending",
    aNoTok.status === 400 && aNoTok.json?.error === "captcha_required" && aDisp.status === 403 && aDisp.json?.error === "disposable_email" && aDispSub.status === 403 && aOk.status === 201 && aliceReq?.status === "pending" && aliceReq.interest === "evaluate" && withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM v2_access_requests").get().n) === 1,
    `${aNoTok.status} ${aDisp.status} ${aDispSub.status} ${aOk.status}`,
  );
  // -- the operator approves: an email-bound code, emailed, never printed --
  const noSecret = admin(["requests", "approve", aliceReq.id], { ...opGate, ALIGN_SECRET: undefined });
  const mailsBeforeApprove = mails.length;
  const approveG = await adminAsync(["requests", "approve", aliceReq.id], opGate);
  const aliceMail = mails.slice(mailsBeforeApprove).find((m) => m.body?.to === "alice@example.test");
  const aliceCode = codesIn(aliceMail?.body?.text ?? "")[0] ?? "";
  check(
    "align-admin (hosted): requests approve refuses without ALIGN_SECRET; with it, emails the code through the email API (subject, sign-in link, the code, its address and expiry) and prints only the code's id, never the code",
    noSecret.status === 1 && /ALIGN_SECRET/.test(noSecret.err) && approveG.status === 0 && /emailed a creation code \(cc_/.test(approveG.out) && aliceMail?.auth === `Bearer ${MAIL_KEY}` && aliceMail.body.subject === "Your Align workspace creation code" && aliceMail.body.text.includes(`https://${HOSTED_HOST}/app/sign-in?email=alice%40example.test`) && aliceCode && aliceMail.body.text.includes("only for alice@example.test") && codesIn(approveG.out + approveG.err).length === 0 && dbFilesLack(dbFile, aliceCode),
    `${noSecret.status} ${noSecret.err} | ${approveG.status} ${approveG.out} ${approveG.err} ${JSON.stringify(aliceMail?.body)}`,
  );
  // -- the approved person can sign in by email code (no invite needed) and spends the code once --
  const ALICE = await gSignIn("alice@example.test");
  const aBadFormat = await gCreate(ALICE, "Alice One", "alc_nope");
  const W2 = await gCreate(ALICE, "Alice One", aliceCode);
  const aReuse = await gCreate(ALICE, "Alice Two", aliceCode);
  const aliceCodeRow = withDb((d) => d.prepare("SELECT c.* FROM v2_creation_codes c JOIN v2_access_requests r ON r.code_id = c.id WHERE r.id = ?").get(aliceReq.id));
  check(
    "gate: an approved address signs in by email code with no invite; a malformed code -> 403 creation_code_invalid; its code creates one workspace (201) and is spent with it; using it again -> 403 creation_code_invalid",
    ALICE.status === 200 && aBadFormat.status === 403 && aBadFormat.json?.error === "creation_code_invalid" && W2.status === 201 && aReuse.status === 403 && aReuse.json?.error === "creation_code_invalid" && aliceCodeRow?.ws_id === W2.json?.id && aliceCodeRow.redeemed_at && aliceCodeRow.redeemed_by,
    `${ALICE.status} ${ALICE.text} ${aBadFormat.status} ${W2.status} ${W2.text} ${aReuse.status}`,
  );
  // -- codes made by the operator: revoked, expired and bound to someone else don't work; a disposable address can't create --
  const gMade = admin(["codes", "create", "--count", "4"], opGate);
  const [U1c, U2c, revC, expC] = codesIn(gMade.out);
  const gIds = [...gMade.out.matchAll(/\((cc_[a-z2-7]{24}),/g)].map((m) => m[1]);
  const bobMade = admin(["codes", "create", "--email", "Bob@Example.test"], opGate);
  const bobC = codesIn(bobMade.out)[0];
  admin(["codes", "revoke", gIds[2]], opGate);
  withDb((d) => d.prepare("UPDATE v2_creation_codes SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), gIds[3]));
  const useRevoked = await gCreate(ALICE, "Alice Two", revC);
  const useExpired = await gCreate(ALICE, "Alice Two", expC);
  const useBobs = await gCreate(ALICE, "Alice Two", bobC);
  check(
    "gate: a revoked code, an expired code, and a code bound to another address -> 403 creation_code_invalid, and none of them is spent",
    gMade.status === 0 && bobMade.status === 0 && [useRevoked, useExpired, useBobs].every((r) => r.status === 403 && r.json?.error === "creation_code_invalid") && withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM v2_creation_codes WHERE redeemed_at IS NOT NULL").get().n) === 1,
    `${useRevoked.status} ${useExpired.status} ${useBobs.status} ${gMade.err}`,
  );
  const tmpInv = await gPost(`/api/v2/workspaces/${W2.json?.id}/invites`, { email: "temp@mailinator.com", role: "member" }, ALICE);
  const TEMP = await gSignIn("temp@mailinator.com");
  const tempCreate = await gCreate(TEMP, "Temp", U2c);
  check(
    "gate: a disposable address is not blocked at sign-in (an invited one signs in), but can't create a workspace (403 disposable_email, code not spent)",
    tmpInv.status === 201 && TEMP.status === 200 && tempCreate.status === 403 && tempCreate.json?.error === "disposable_email" && withDb((d) => d.prepare("SELECT redeemed_at FROM v2_creation_codes WHERE id = ?").get(gIds[1]).redeemed_at) === null,
    `${tmpInv.status} ${TEMP.status} ${TEMP.text} ${tempCreate.status} ${tempCreate.text}`,
  );
  // -- members per workspace (3 here), pending invites counted --
  const W1id = W1.json?.id;
  const bobInv = await gPost(`/api/v2/workspaces/${W1id}/invites`, { email: "bob@example.test", role: "member" }, OPSG);
  const carolInv = await gPost(`/api/v2/workspaces/${W1id}/invites`, { email: "carol@example.test", role: "member" }, OPSG);
  const daveInv = await gPost(`/api/v2/workspaces/${W1id}/invites`, { email: "dave@example.test", role: "member" }, OPSG);
  check(
    "caps: members per workspace (ALIGN_MAX_MEMBERS=3) count open invites: owner + 2 invites fills it, a 3rd invite -> 403 member_cap with a message to contact the operator",
    bobInv.status === 201 && carolInv.status === 201 && daveInv.status === 403 && daveInv.json?.error === "member_cap" && /Contact the operator/.test(daveInv.json?.message),
    `${bobInv.status} ${carolInv.status} ${daveInv.status} ${daveInv.text}`,
  );
  const BOB = await gSignIn("bob@example.test");
  const bobAccept = await gPost(`/api/v2/invites/${bobInv.json?.token}/accept`, {}, BOB);
  check("caps: accepting an open invite within the cap works (it was already counted)", BOB.status === 200 && bobAccept.status === 200, `${BOB.status} ${bobAccept.status} ${bobAccept.text}`);
  // -- workspaces per account (2 by default) and on the server (4 here) --
  const W3 = await gCreate(OPSG, "Ops Two", U1c);
  const opsThird = await gCreate(OPSG, "Ops Three", U2c);
  const W4 = await gCreate(BOB, "Bob One", bobC);
  const bobSecond = await gCreate(BOB, "Bob Two", U2c);
  check(
    "caps: an account owning 2 workspaces (the default ALIGN_MAX_OWNED_WORKSPACES) -> 403 owned_workspace_cap; at 4 on the server (ALIGN_MAX_WORKSPACES) -> 403 workspace_cap; both say to contact the operator and spend no code",
    W3.status === 201 && opsThird.status === 403 && opsThird.json?.error === "owned_workspace_cap" && /Contact the operator/.test(opsThird.json?.message) && W4.status === 201 && bobSecond.status === 403 && bobSecond.json?.error === "workspace_cap" && /Contact the operator/.test(bobSecond.json?.message) && withDb((d) => d.prepare("SELECT redeemed_at FROM v2_creation_codes WHERE id = ?").get(gIds[1]).redeemed_at) === null,
    `${W3.status} ${opsThird.status} ${opsThird.text} ${W4.status} ${W4.text} ${bobSecond.status} ${bobSecond.text}`,
  );
  // -- new shared sessions per device per day (2 here) --
  const gKeys = newDeviceKeys();
  const gAuth = await hosted("POST", "/api/v2/device/authorize", { body: { device_name: "ops laptop", public_key: gKeys.pub } });
  const gAppr = await gPost("/api/v2/device/approve", { user_code: gAuth.json?.user_code, workspace_ids: [W1id] }, OPSG, null);
  const gTok = await hosted("POST", "/api/v2/device/token", { body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: gAuth.json?.device_code } });
  const gDev = { ...gKeys };
  const share = (n) =>
    hosted("PUT", `/api/v2/workspaces/${W1id}/sessions/${sessionKey(gDev, W1id, "claude-code", n)}`, {
      body: { harness: "claude-code", repo_key: repoKey(gDev, W1id, "repo"), started_at: new Date(Date.now() - 60_000).toISOString() },
      headers: { authorization: `Bearer ${gTok.json?.access_token}` },
    });
  const shares = [await share("s1"), await share("s2"), await share("s3"), await share("s1")];
  check(
    "caps: a device shares at most ALIGN_MAX_SESSIONS_PER_DEVICE_DAY (2) new sessions in 24 hours: the 3rd -> 403 session_cap (contact the operator); updating a session it already shares still works",
    gTok.status === 200 && gAppr.status === 200 && shares[0].status === 200 && shares[1].status === 200 && shares[2].status === 403 && shares[2].json?.error === "session_cap" && /Contact the operator/.test(shares[2].json?.message) && shares[3].status === 200,
    `${gAppr.status} ${gTok.status} ${shares.map((r) => `${r.status} ${r.text.slice(0, 80)}`).join(" | ")}`,
  );
  // -- durable limits: per-address code sends (5 an hour, hosted) and Better Auth's per-client limit survive a restart --
  const rl = [];
  for (let i = 0; i < 4; i++) rl.push(await gSend("rl@example.test"));
  const ipSends = [];
  for (let i = 0; i < 4; i++) ipSends.push(await gSend(`ip${i}@example.test`, "ok", "198.18.200.1"));
  const baRows = withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM ba_rate_limit").get().n);
  check(
    "limits: hosted, 3 sends per address in 10 minutes (then 429), and Better Auth allows 3 code sends per client per minute (the 4th -> 429), its counters in the ba_rate_limit table",
    rl.slice(0, 3).every((r) => r.status === 200) && rl[3].status === 429 && ipSends.slice(0, 3).every((r) => r.status === 200) && ipSends[3].status === 429 && baRows > 0,
    `${rl.map((r) => r.status)} ${ipSends.map((r) => r.status)} ${baRows}`,
  );
  await stopServer();
  // ======== the kill switch (ALIGN_CREATION=closed), on a restart that keeps the durable limits ========
  const closedRun = await startServer({ ...gateEnv, ALIGN_CREATION: "closed" });
  const ipAfter = await gSend("ip9@example.test", "ok", "198.18.200.1");
  const rlAfter = [await gSend("rl@example.test"), await gSend("rl@example.test"), await gSend("rl@example.test")];
  const hitKeys = withDb((d) => d.prepare("SELECT key FROM v2_rate_hits").all().map((r) => r.key));
  check(
    "limits: after a restart Better Auth's per-client send limit still holds (429), and an address that had 3 sends gets 2 more and then 429 (5 per hour, durable); the stored keys hold no email address",
    closedRun.started && ipAfter.status === 429 && rlAfter[0].status === 200 && rlAfter[1].status === 200 && rlAfter[2].status === 429 && hitKeys.some((k) => k.startsWith("otp-email-hour:")) && !hitKeys.some((k) => k.includes("@")),
    `${ipAfter.status} ${rlAfter.map((r) => r.status)} ${hitKeys.slice(0, 3)}`,
  );
  const OPSC = await gSignIn("ops@example.test");
  const closedCreate = await gCreate(OPSC, "Closed", U2c);
  const closedHome = await hosted("GET", "/app", { cookie: OPSC.cookie });
  check(
    "gate: ALIGN_CREATION=closed refuses every create (403 creation_closed, code not spent) and /app says creation is closed",
    closedCreate.status === 403 && closedCreate.json?.error === "creation_closed" && closedHome.text.includes("be created on this server right now") && !closedHome.text.includes('name="creation_code"') && withDb((d) => d.prepare("SELECT redeemed_at FROM v2_creation_codes WHERE id = ?").get(gIds[1]).redeemed_at) === null,
    `${closedCreate.status} ${closedCreate.text}`,
  );
  await stopServer();
  const openRun = await startServer({ ...gateEnv, ALIGN_CREATION: "open", ALIGN_MAX_WORKSPACES: "10" });
  const CAROL = await gSignIn("carol@example.test");
  const carolHome = await hosted("GET", "/app", { cookie: CAROL.cookie });
  const carolCreate = await gCreate(CAROL, "Carol One");
  const carolNoTok = await gCreate(CAROL, "Carol Two", undefined, null);
  const noLinkSignIn = await hosted("GET", "/app/sign-in");
  check(
    "gate: ALIGN_CREATION=open lets any signed-in person create without a code (the token is still required), and no page asks for a code or links to request access",
    openRun.started && CAROL.status === 200 && carolCreate.status === 201 && carolNoTok.status === 400 && !carolHome.text.includes('name="creation_code"') && !noLinkSignIn.text.includes("/app/request-access"),
    `${CAROL.status} ${carolCreate.status} ${carolCreate.text} ${carolNoTok.status}`,
  );
  verifyApi.close();
  mailApi.close();
} catch (e) {
  check("v2 run", false, e?.stack ?? e);
} finally {
  await stopServer();
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
