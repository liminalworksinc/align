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
//                                         hosted gate settings are set and ignored; align-admin workspaces (list, soft
//                                         delete, purge)
//   retention Mode L, ALIGN_TEST_IDP=1 -> account deletion, workspace soft delete and restore, removal with "delete
//                                         their sessions now", and the retention job (align-admin retention run, and
//                                         its alias scripts/retention.mjs) with ALIGN_TEST_NOW as its clock (codes,
//                                         invites, former members, purge, audit, spend roll-ups), the web UI for them,
//                                         and the job's run at server startup
//   events  Mode L, ALIGN_TEST_IDP=1    -> product events (PRESEED-007): each recorded once where it is a first, no
//                                         content in any row, the operator report's counts against this phase's
//                                         actions, LOIs (loi_signed needs --verified-original), and events under
//                                         account deletion, purging and the retention job
//   hosted  HOSTED=1                    -> startup refusals, then the hosted host/https/edge checks and the route
//                                         allowlist (/ -> /app, everything else 404); no closing date (a leftover
//                                         ALIGN_DELETE_BY in the past is ignored); then email codes through a fake HTTPS
//                                         email API (first owner, invites, unknown addresses, API failure); then the
//                                         creation gate: Turnstile through a fake HTTPS verify API, creation codes and
//                                         access requests with the operator script (align-admin), disposable domains,
//                                         the caps, durable limits across a restart, and ALIGN_CREATION closed and open
//   trust   (no server; then local and hosted) -> the security pack (docs/trust): the subprocessor list names every
//                                         external host the server code can call, no model provider is called, the
//                                         Markdown reader drops HTML and unsafe links; /privacy and /trust are served in
//                                         Mode L and hosted, linked from sign-in and request access, and nothing else new
//                                         is open when hosted
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
import { pathToFileURL } from "node:url";

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
/** The schema version the code expects (lib/v2/core.mts), which lib/v2/db.ts checks against its migrations. */
const SCHEMA_VERSION = Number(/export const SCHEMA_VERSION = (\d+);/.exec(readFileSync(path.join(ROOT, "lib/v2/core.mts"), "utf8"))?.[1]);
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

/** The keyed hash that stands for a person in v2_events (lib/v2/core.mts eventActor). */
const eventActor = (secret, userId) => createHmac("sha256", secret).update(`ale.${userId}`).digest("base64url");

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

/** A paired device written straight into the database, with a live access token (the device-pairing limit, 10 per
 *  client per hour, is spent by the time the account tests run). */
function insertDevice(userId, name) {
  const id = `dv_${randomBytes(15).toString("hex").slice(0, 24).replace(/[01089]/g, "a")}`;
  const access = `alnd_${randomBytes(32).toString("base64url")}`;
  const at = new Date().toISOString();
  withDb((d) => {
    d.prepare("INSERT INTO v2_devices (id, user_id, name, public_key, created_at) VALUES (?, ?, ?, ?, ?)").run(id, userId, name, newDeviceKeys().pub, at);
    d.prepare("INSERT INTO v2_device_tokens (token_hash, device_id, kind, created_at, expires_at) VALUES (?, ?, 'access', ?, ?)").run(sha256hex(access), id, at, new Date(Date.now() + 3_600_000).toISOString());
  });
  return { id, access };
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

// ======== trust: the security pack's claims that the code can check (PRESEED-008) ========
{
  // Every https host in the server's source (comment lines aside), in fly.toml (its own host aside), and in Better Auth's
  // code for each sign-in provider lib/v2/auth.ts turns on, must be named in docs/trust/subprocessors.md.
  const sources = [path.join(ROOT, "proxy.ts"), path.join(ROOT, "instrumentation.ts")];
  const walkSrc = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkSrc(p);
      else if (/\.(?:ts|tsx|mts)$/.test(e.name) && !e.name.endsWith(".d.ts")) sources.push(p);
    }
  };
  walkSrc(path.join(ROOT, "app"));
  walkSrc(path.join(ROOT, "lib"));
  const code = (text, comment) => text.split("\n").filter((l) => !comment.test(l.trim())).join("\n");
  const hostsIn = (text) => [...text.matchAll(/https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map((m) => m[1].toLowerCase());
  const found = new Map();
  for (const f of sources) for (const h of hostsIn(code(readFileSync(f, "utf8"), /^(?:\/\/|\/\*|\*)/))) found.set(h, path.relative(ROOT, f));
  const fly = readFileSync(path.join(ROOT, "fly.toml"), "utf8");
  for (const h of hostsIn(code(fly, /^#/))) found.set(h, "fly.toml");
  const authSrc = readFileSync(path.join(ROOT, "lib/v2/auth.ts"), "utf8");
  const providers = [...authSrc.matchAll(/social\.(\w+) = /g)].map((m) => m[1]);
  for (const prov of providers) {
    for (const h of hostsIn(readFileSync(path.join(ROOT, "node_modules/@better-auth/core/dist/social-providers", `${prov}.mjs`), "utf8"))) found.set(h, `Better Auth ${prov}`);
  }
  for (const h of (/^\s*ALIGN_HOSTS\s*=\s*"([^"]*)"/m.exec(fly)?.[1] ?? "").split(",")) found.delete(h.trim().toLowerCase());
  const subprocessors = readFileSync(path.join(ROOT, "docs/trust/subprocessors.md"), "utf8");
  const missing = [...found].filter(([h]) => !subprocessors.includes(`\`${h}\``));
  check(
    `trust: docs/trust/subprocessors.md names every external host the server can call (${[...found.keys()].join(", ")})`,
    providers.length === 2 && found.has("api.resend.com") && found.has("challenges.cloudflare.com") && found.size >= 7 && missing.length === 0,
    `missing: ${missing.map(([h, w]) => `${h} (${w})`).join(", ")}; providers: ${providers.join(",")}`,
  );
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const modelHost = /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.|ai-gateway\.vercel/i;
  const callers = sources.filter((f) => modelHost.test(readFileSync(f, "utf8")) || /from "(?:@anthropic-ai\/|openai|@ai-sdk\/|ai")/.test(readFileSync(f, "utf8")));
  const modelDeps = deps.filter((d) => /^(?:@anthropic-ai\/|openai$|@ai-sdk\/|ai$|@google\/generative-ai|@mistralai\/|cohere-ai)/.test(d));
  check(
    "trust: the server calls no AI model provider (no model API host or SDK in app/, lib/, proxy.ts or package.json), so the subprocessor list rightly has none",
    callers.length === 0 && modelDeps.length === 0 && /calls no AI model/.test(subprocessors),
    `${callers.map((f) => path.relative(ROOT, f)).join(" ")} ${modelDeps.join(" ")}`,
  );
  const legal = ["privacy-policy.md", "dpa.md"].map((f) => readFileSync(path.join(ROOT, "docs/trust", f), "utf8"));
  const pack = ["privacy-policy.md", "dpa.md", "subprocessors.md", "security-overview.md", "questionnaire.md"].map((f) => readFileSync(path.join(ROOT, "docs/trust", f), "utf8")).join("\n");
  check(
    "trust: the privacy policy and DPA open with 'Draft for counsel review'; the pack uses the [LEGAL ENTITY], [ADDRESS] and [PRIVACY CONTACT EMAIL] placeholders, and no PRESEED marker is left in docs/trust or SECURITY.md (every package is merged and its claims checked)",
    legal.every((t) => t.split("\n").slice(0, 4).join(" ").includes("Draft for counsel review")) &&
      ["[LEGAL ENTITY]", "[ADDRESS]", "[PRIVACY CONTACT EMAIL]"].every((t) => pack.includes(t)) &&
      !/PRESEED-\d/.test(readdirSync(path.join(ROOT, "docs/trust")).map((f) => readFileSync(path.join(ROOT, "docs/trust", f), "utf8")).join("\n") + readFileSync(path.join(ROOT, "SECURITY.md"), "utf8")) &&
      existsSync(path.join(ROOT, "SECURITY.md")),
    "",
  );
  // The Markdown reader the pages use: HTML is text, comments go, only safe links keep their target.
  const md = await import(pathToFileURL(path.join(ROOT, "lib/trust/markdown.mts")).href);
  const opts = { prefix: "t", resolve: (p) => (p === "../RETENTION.md" ? { page: "/trust", prefix: "retention" } : null), fill: { "[PRIVACY CONTACT EMAIL]": "privacy@example.com" } };
  const blocks = md.parseMarkdown("# Hi <b>x</b>\n<!-- secret note -->\nA <script>alert(1)</script> [js](javascript:alert) [d](data:text/html,x) [r](../RETENTION.md#the-schedule) [x](../../lib/v2/auth.ts) [w](https://example.com) at [PRIVACY CONTACT EMAIL]. <!-- PRESEED-006 -->\n", opts);
  const flat = JSON.stringify(blocks);
  const links = [];
  const walkInl = (c) => c.forEach((x) => (x.t === "link" ? links.push(x.href) : x.c && walkInl(x.c)));
  for (const b of blocks) if (b.c) walkInl(b.c);
  check(
    "trust: the Markdown reader keeps raw HTML as text, drops comments, drops javascript:/data:/unknown relative links, maps trust-document links to their page, and fills placeholders",
    blocks[0].t === "heading" && blocks[0].id === "t-hi-bxb" && flat.includes("<script>alert(1)</script>") && !flat.includes("secret note") && !flat.includes("PRESEED") &&
      JSON.stringify(links) === JSON.stringify(["/trust#retention-the-schedule", "https://example.com", "mailto:privacy@example.com"]),
    `${flat.slice(0, 300)} links=${JSON.stringify(links)}`,
  );
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
  // -- the public trust pages (PRESEED-008), built from docs/trust --
  const lPrivacy = await call("anon", "GET", "/privacy");
  const lTrust = await call("anon", "GET", "/trust");
  const lSignIn = await call("anon", "GET", "/app/sign-in");
  const lRequest = await call("anon", "GET", "/app/request-access");
  check(
    "local: /privacy and /trust are served signed out from docs/trust (privacy policy; security overview, subprocessors, retention, DPA, questionnaire, contact), with no source comments and no raw HTML from the documents",
    lPrivacy.status === 200 && lPrivacy.text.includes("Privacy policy") && lPrivacy.text.includes("Our two roles") && lPrivacy.text.includes("Draft for counsel review") &&
      lTrust.status === 200 && ["Security overview", "Subprocessors", "How long Align keeps data", "Data processing agreement", "Security questionnaire answers", 'id="contact"', 'href="/trust#retention"', 'href="/privacy"'].every((t) => lTrust.text.includes(t)) &&
      ![lPrivacy, lTrust].some((r) => /PRESEED-00|lib\/v2\/auth\.ts|<!-- (?:fly|lib|Counsel)/.test(r.text)),
    `${lPrivacy.status} ${lTrust.status}`,
  );
  check(
    "local: the sign-in and request-access pages link to /privacy and /trust",
    [lSignIn, lRequest].every((r) => r.status === 200 && r.text.includes('href="/privacy"') && r.text.includes('href="/trust"')),
    `${lSignIn.status} ${lRequest.status}`,
  );
  const rebound = await Promise.all(["/", "/app", "/privacy", "/api/v2/me", "/api/v2/auth/get-session"].map((p) => rawGet(p, { host: "evil.example" })));
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
  // A loopback OAuth 2.0 provider (ALIGN_TEST_OAUTH_URL, honoured only with ALIGN_TEST_IDP=1): it issues known tokens,
  // so the test can see how Align stores what a provider gives it.
  const OAUTH_AT = "align-test-access-token-7f3c9a1e5b";
  const OAUTH_RT = "align-test-refresh-token-2d8e6b4c0a";
  const oauthUser = { sub: "tp-1", email: "oli.auth@example.test", name: "Oli Auth" };
  const oauthStub = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const json = (o) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (u.pathname === "/authorize") {
      const to = new URL(u.searchParams.get("redirect_uri"));
      to.searchParams.set("code", "stub-code");
      to.searchParams.set("state", u.searchParams.get("state") ?? "");
      res.writeHead(302, { location: to.href });
      return res.end();
    }
    if (u.pathname === "/token") {
      req.resume();
      return req.on("end", () => json({ access_token: OAUTH_AT, refresh_token: OAUTH_RT, token_type: "Bearer", expires_in: 3600, scope: "email" }));
    }
    // A plain OAuth 2.0 profile (no OpenID Connect): its account id is `id`, as GitHub's is.
    if (u.pathname === "/userinfo") return json({ id: oauthUser.sub, email: oauthUser.email, name: oauthUser.name, email_verified: true });
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => oauthStub.listen(0, "127.0.0.1", r));
  await mustStart({ ALIGN_DATA_DIR: onDir, ALIGN_TEST_IDP: "1", ALIGN_TEST_OAUTH_URL: `http://127.0.0.1:${oauthStub.address().port}`, ...ignoredInModeL });
  dbFile = path.join(onDir, "v2", "align.sqlite");
  const mode = (p) => (statSync(p).mode & 0o777).toString(8);
  check("storage: v2 directory 0700 and database file 0600", mode(path.join(onDir, "v2")) === "700" && mode(dbFile) === "600", `${mode(path.join(onDir, "v2"))} ${mode(dbFile)}`);
  const pragmas = withDb((d) => ({ jm: d.prepare("PRAGMA journal_mode").get().journal_mode, uv: d.prepare("PRAGMA user_version").get().user_version, tables: d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name) }));
  const limitCols = withDb((d) => ["v2_goals", "v2_goal_versions"].map((t) => d.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === "limits_json")));
  check(`storage: WAL, migrated (user_version ${SCHEMA_VERSION} = 11, lib/v2/core.mts SCHEMA_VERSION), v2_ tables (connected-app grants, change requests and their evidence, spend roll-ups, former members, passkey use, creation codes, access requests, durable limits, product events, asks and their mentions, and value reports included), limits on goals and goal versions, and Better Auth tables (passkeys included)`, SCHEMA_VERSION === 11 && pragmas.jm === "wal" && pragmas.uv === SCHEMA_VERSION && ["v2_usage", "v2_activity", "v2_goal_acks", "v2_oauth_grants", "v2_change_requests", "v2_change_request_revisions", "v2_change_request_evidence", "v2_spend_rollups", "v2_former_members", "v2_passkey_use", "v2_passkey_prompt_dismissed", "v2_creation_codes", "v2_access_requests", "v2_rate_hits", "v2_events", "v2_asks", "v2_ask_mentions", "v2_value_reports", "ba_user", "ba_passkey"].every((t) => pragmas.tables.includes(t)) && limitCols.every(Boolean), `${JSON.stringify(pragmas)} ${limitCols}`);

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
  const SCe = epochId();
  const scStart = new Date().toISOString();
  const scBind = await epoch(D3, SC, { epoch_id: SCe, goal_id: GL.id, starts_at: scStart });
  // Usage under GL for the snapshot: two models in the last 30 days, and one request 40 days ago (outside the window).
  await upload(D3, SC, [usageRow(D3, "cr-a", SCe), usageRow(D3, "cr-b", SCe, { model: "claude-opus-4-1", est_list_usd_micros: 50_000 }), usageRow(D3, "cr-old", SCe, { ts: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString() })]);
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
    JSON.stringify(u2Sees.json?.can) === JSON.stringify({ approve: true, reject: true, counter: true, accept_counter: false, withdraw: false, rebase: false, add_evidence: true }) && cr1.json.can.withdraw === true && cr1.json.can.rebase === true && cr1.json.can.approve === false && cr1.json.can.add_evidence === true,
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
  // -- evidence on change requests (PRESEED-006): the Align snapshot and typed links per revision --
  const snap1 = cr1.json.revisions[0]?.snapshot;
  check(
    "evidence: revision 1 carries the snapshot Align recorded: the goal's spend over the last 30 days (total and by model, the old request left out), 1 bound session, last activity",
    snap1?.revision === 1 && snap1.recorded_by === "align" && snap1.window.days === 30 && snap1.spend_hidden === false && snap1.spend.total.requests === 2 && snap1.spend.total.est_list_usd_micros === 62_345 && snap1.spend.by_model.map((m) => m.model).join() === "claude-opus-4-1,claude-sonnet-4-5" && snap1.spend.by_model[0].est_list_usd_micros === 50_000 && snap1.bound_sessions === 1 && snap1.last_activity_at === scStart && cr1.json.evidence_count === 0 && cr1.json.approved_without_evidence === null,
    JSON.stringify(snap1),
  );
  const forged = await propose(U2, GL.id, { base_version: 1, changes: { title: "Forged snapshot" }, reason: "x", snapshot: { bound_sessions: 99 } });
  check("evidence: a snapshot sent by a client is never stored (Align computes its own)", forged.status === 201 && forged.json.revisions[0].snapshot.bound_sessions === 1, forged.text.slice(0, 200));
  await crAct(U2, GL.id, forged.json?.id, "withdraw");
  const evPath = (g, id) => `${crPath(g)}/${id}/evidence`;
  const addEv = (u, g, id, body) => call(u.who, "POST", evPath(g, id), { cookie: u.cookie, body });
  const PR = "https://github.com/acme/platform/pull/42";
  const ev1 = await addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: PR, label: "Pen-test scope PR", revision: 1 });
  const evDev = await call("U1", "POST", evPath(GL.id, cr1.json.id), { bearer: D1.access, body: { kind: "ci_run", url: "https://ci.example.com/runs/7", label: "Scan run" } });
  const evLead = await addEv(U2, GL.id, cr1.json.id, { kind: "dashboard", url: "https://grafana.example.com/d/pen", label: "Findings board" });
  check(
    "evidence: the requester adds a link from the web (201, source person, self-reported), from their device (source agent, agent-reported), and an approver adds their own; each names who added it; audit change_request.evidence_added",
    ev1.status === 201 && ev1.json.evidence.kind === "pr" && ev1.json.evidence.url === PR && ev1.json.evidence.revision === 1 && ev1.json.evidence.source === "person" && ev1.json.evidence.reported_as === "self-reported" && ev1.json.evidence.added_by.id === U1.id && ev1.json.evidence.can_remove === true && evDev.status === 201 && evDev.json.evidence.source === "agent" && evDev.json.evidence.reported_as === "agent-reported" && evLead.status === 201 && evLead.json.evidence.added_by.id === U2.id && evLead.json.change_request.evidence_count === 3 && auditOf("change_request.evidence_added", cr1.json.id).sort().join() === [U1.id, U1.id, U2.id].sort().join(),
    `${ev1.text.slice(0, 300)} ${evDev.text.slice(0, 200)} ${evLead.status}`,
  );
  const evBad = await Promise.all([
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: "http://github.com/acme/platform/pull/1", label: "plain http" }),
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: "javascript:alert(1)", label: "script" }),
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: "https://user:secret@github.com/x", label: "with a password" }),
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: `https://example.com/${"a".repeat(2040)}`, label: "too long" }),
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: "not a url", label: "nonsense" }),
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: "https://example.com/1", label: "l".repeat(121) }),
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: "https://example.com/2", label: "  " }),
    addEv(U1, GL.id, cr1.json.id, { kind: "pr", url: "https://example.com/3" }),
    addEv(U1, GL.id, cr1.json.id, { kind: "test_report", url: "https://example.com/4", label: "unknown kind" }),
  ]);
  const evViewer = await addEv(U4, GL.id, cr1.json.id, { kind: "doc", url: "https://example.com/v", label: "viewer" });
  const evDup = await addEv(U2, GL.id, cr1.json.id, { kind: "pr", url: PR, label: "same PR again" });
  const evStale = await addEv(U1, GL.id, cr1.json.id, { kind: "doc", url: "https://example.com/s", label: "stale", revision: 2 });
  const evBig = await call("U1", "POST", evPath(GL.id, cr1.json.id), { cookie: U1.cookie, raw: JSON.stringify({ kind: "doc", url: "https://example.com/big", label: "big", pad: "x".repeat(9 * 1024) }) });
  const evLabel120 = await addEv(U1, GL.id, cr1.json.id, { kind: "other", url: "https://example.com/120", label: "l".repeat(120) });
  check(
    "evidence: a non-https, javascript:, credentialed, over-2048 or unparsable url, a 121-character, blank or missing label, or an unknown kind -> 400; a viewer -> 403 read_only; the same url twice -> 409 duplicate_evidence; another revision -> 409 stale_revision; over 8 KB -> 413; a 120-character label is accepted",
    evBad.every((r) => r.status === 400) && evViewer.status === 403 && evViewer.json?.error === "read_only" && evDup.status === 409 && evDup.json?.error === "duplicate_evidence" && evStale.status === 409 && evStale.json?.error === "stale_revision" && evBig.status === 413 && evLabel120.status === 201,
    `${evBad.map((r) => r.status).join(",")} ${evViewer.status} ${evDup.text} ${evStale.text} ${evBig.status} ${evLabel120.status}`,
  );
  const fill = [];
  for (let i = 0; i < 6; i++) fill.push(await addEv(U1, GL.id, cr1.json.id, { kind: "doc", url: `https://docs.example.com/${i}`, label: `Doc ${i}` }));
  const evEleventh = await addEv(U2, GL.id, cr1.json.id, { kind: "doc", url: "https://docs.example.com/11", label: "eleventh" });
  check("evidence: at most 10 links per revision (the 11th -> 409 too_much_evidence)", fill.every((r) => r.status === 201) && fill[5].json.change_request.evidence_count === 10 && evEleventh.status === 409 && evEleventh.json?.error === "too_much_evidence", `${fill.map((r) => r.status).join(",")} ${evEleventh.text}`);
  const delEv = (u, g, id, evId) => call(u.who, "DELETE", `${evPath(g, id)}/${evId}`, { cookie: u.cookie });
  const evDelOther = await delEv(U2, GL.id, cr1.json.id, ev1.json.evidence.id);
  const evDelViewer = await delEv(U4, GL.id, cr1.json.id, ev1.json.evidence.id);
  const evDelOwn = await delEv(U1, GL.id, cr1.json.id, fill[5].json?.evidence?.id);
  const evDelGone = await delEv(U1, GL.id, cr1.json.id, fill[5].json?.evidence?.id);
  const evDelWrongGoal = await delEv(U1, G1.id, cr1.json.id, ev1.json.evidence.id);
  check(
    "evidence: removing someone else's link -> 403 not_evidence_author, a viewer -> 403 read_only; the author removes their own (200, audit change_request.evidence_removed); a removed or mismatched one -> 404",
    evDelOther.status === 403 && evDelOther.json?.error === "not_evidence_author" && evDelViewer.status === 403 && evDelOwn.status === 200 && evDelOwn.json.evidence_count === 9 && auditOf("change_request.evidence_removed", cr1.json.id).join() === U1.id && evDelGone.status === 404 && evDelWrongGoal.status === 404,
    `${evDelOther.text} ${evDelViewer.status} ${evDelOwn.status} ${evDelGone.status} ${evDelWrongGoal.status}`,
  );
  const evViewerRead = await crGet(U4, GL.id, cr1.json.id);
  const evU2Read = await crGet(U2, GL.id, cr1.json.id);
  const rev1Ev = evViewerRead.json?.revisions?.[0]?.evidence ?? [];
  check(
    "evidence: everyone who reads the request sees each link with kind, url, label, who added it and how it was reported (never verified); a viewer can't add or remove; an approver can remove only their own",
    evViewerRead.status === 200 && rev1Ev.length === 9 && rev1Ev.every((e) => ["self-reported", "agent-reported"].includes(e.reported_as) && e.added_by.name && !e.can_remove) && evViewerRead.json.can.add_evidence === false && !JSON.stringify(evViewerRead.json).includes('"verified"') && evU2Read.json.revisions[0].evidence.filter((e) => e.can_remove).map((e) => e.added_by.id).every((id) => id === U2.id) && evU2Read.json.revisions[0].evidence.some((e) => e.can_remove),
    JSON.stringify(rev1Ev.slice(0, 2)),
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
  const crCountered = await crGet(U1, GL.id, cr1.json.id);
  const delFrozen = await delEv(U1, GL.id, cr1.json.id, ev1.json.evidence.id);
  check(
    "evidence: a counter writes revision 2 with its own snapshot; revision 1's links stay, frozen (can_remove false, removing -> 409 evidence_frozen), and revision 2 starts with none",
    crCountered.json?.revision === 2 && crCountered.json.revisions[1].snapshot?.revision === 2 && crCountered.json.revisions[1].snapshot.bound_sessions === 1 && crCountered.json.revisions[0].evidence.length === 9 && crCountered.json.revisions[0].evidence.every((e) => !e.can_remove) && crCountered.json.revisions[1].evidence.length === 0 && crCountered.json.evidence_count === 0 && delFrozen.status === 409 && delFrozen.json?.error === "evidence_frozen",
    `${crCountered.json?.revision} ${JSON.stringify(crCountered.json?.revisions?.[1]?.snapshot)} ${delFrozen.text}`,
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
  const evDecided = await addEv(U1, GL.id, cr1.json.id, { kind: "doc", url: "https://example.com/late", label: "late" });
  const delDecided = await delEv(U2, GL.id, cr1.json.id, evLead.json.evidence.id);
  check(
    "evidence: approving a revision with no links -> approved_without_evidence true on the decision record, audit change_request.approved and change_request.approved_without_evidence by the approver; then adding -> 409 wrong_state and removing -> 409 evidence_frozen",
    approve1.json?.approved_without_evidence === true && record.json.approved_without_evidence === true && auditOf("change_request.approved", cr1.json.id).join() === U2.id && auditOf("change_request.approved_without_evidence", cr1.json.id).join() === U2.id && evDecided.status === 409 && evDecided.json?.error === "wrong_state" && delDecided.status === 409 && delDecided.json?.error === "evidence_frozen",
    `${approve1.json?.approved_without_evidence} ${record.json.approved_without_evidence} ${evDecided.text} ${delDecided.text}`,
  );
  const mcpRecord = await mcpCall("U4", D4, "align_get_decision_record", { change_request_id: cr1.json.id, workspace: A });
  const mrec = mcpRecord.sc?.record;
  check(
    "evidence (mcp): the decision record says approved without evidence, lists the frozen revision-1 links (agent-reported ones labelled so) and the snapshot Align recorded at revision 2",
    mcpRecord.sc?.decided === true && mrec?.approved_without_evidence === true && mrec.evidence.length === 9 && mrec.evidence.some((e) => e.source === "agent" && e.reported_as === "agent-reported") && mrec.evidence.every((e) => e.revision === 1) && mrec.snapshot?.revision === 2 && /Approved without evidence\./.test(mcpRecord.text) && /agent-reported/.test(mcpRecord.text),
    mcpRecord.text.slice(0, 400),
  );

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
  const evA = await addEv(U1, GL.id, crA.json?.id, { kind: "incident", url: "https://status.example.com/incidents/12", label: "API incident that motivates this" });
  const evNotInvolved = await addEv(U1, GL.id, crB.json?.id, { kind: "doc", url: "https://example.com/n", label: "not mine" });
  // A device token on MCP reads only (no changes:evidence scope): the evidence tool isn't listed, and calling it gets
  // 403 insufficient_scope. The device adds an agent-reported link through the v2 route instead.
  const devTools = await call("U1", "POST", "/api/mcp", { bearer: D1.access, headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
  const mcpEv = await call("U1", "POST", "/api/mcp", { bearer: D1.access, headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "align_add_change_request_evidence", arguments: { change_request_id: crA.json?.id, kind: "doc", url: "https://example.com/mcp", label: "via mcp" } } } });
  const devEv = await call("U1", "POST", evPath(GL.id, crA.json?.id), { bearer: D1.access, body: { kind: "ci_run", url: "https://ci.example.com/runs/8", label: "Green run on main" } });
  const mcpList = await mcpCall("U1", D1, "align_list_change_requests", { state: "pending" });
  const mcpA = mcpList.sc?.change_requests?.find((c) => c.id === crA.json?.id);
  check(
    "evidence: someone neither the requester nor an approver -> 403 not_involved; a device token's MCP tools/list has no align_add_change_request_evidence and calling it -> 403 insufficient_scope (nothing added); the device adds an agent-reported link through the v2 route",
    evA.status === 201 && evNotInvolved.status === 403 && evNotInvolved.json?.error === "not_involved" && devTools.status === 200 && !devTools.text.includes("align_add_change_request_evidence") && devTools.text.includes("align_list_change_requests") && mcpEv.status === 403 && /insufficient_scope/.test(mcpEv.headers.get("www-authenticate") ?? "") && /changes:evidence/.test(mcpEv.headers.get("www-authenticate") ?? "") && devEv.status === 201 && devEv.json.evidence.source === "agent" && devEv.json.evidence.reported_as === "agent-reported" && devEv.json.change_request.evidence_count === 2,
    `${evA.status} ${evNotInvolved.text} ${mcpEv.status} ${mcpEv.headers.get("www-authenticate")} ${devEv.text.slice(0, 200)}`,
  );
  check(
    "evidence (mcp): align_list_change_requests returns each request's links (with revision and how they were reported) and the snapshot Align recorded at its current revision",
    mcpA?.evidence?.length === 2 && mcpA.evidence.map((e) => e.reported_as).sort().join() === "agent-reported,self-reported" && mcpA.evidence.every((e) => e.revision === 1 && typeof e.added_by.name.untrusted_text === "string") && mcpA.snapshot?.revision === 1 && mcpA.snapshot.recorded_by === "align" && typeof mcpA.snapshot.spend?.total?.est_list_usd_micros === "number" && /Recorded by Align at revision 1/.test(mcpList.text),
    JSON.stringify(mcpA).slice(0, 400),
  );
  const evEventText = withDb((d) => d.prepare("SELECT * FROM v2_events").all()).map((r) => Object.values(r).join(" ")).join("\n");
  const evRowsAll = withDb((d) => d.prepare("SELECT url, label FROM v2_change_request_evidence").all());
  check(
    "evidence and product events: no product event holds an evidence link's url or label (events stay content-free)",
    evRowsAll.length > 0 && evRowsAll.every((e) => !evEventText.includes(e.url) && !evEventText.includes(e.label)) && !evEventText.includes("https://"),
    `${evRowsAll.length}`,
  );
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
    crBapprovers === U3.id && approveA.json?.state === "approved" && approveA.json.approved_without_evidence === false && auditOf("change_request.approved_without_evidence", crA.json?.id).length === 0 && approveA.json.version === 3 && bNow.json?.state === "pending" && bNow.json.behind === true && bNow.json.can.approve === false && bNow.json.can.rebase === true && cr_approveB.status === 409 && cr_approveB.json?.error === "stale_version",
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
    "sample: one pending change request on the security goal, from the caller, explaining why the sample shows it; the caller can approve, counter, reject, withdraw and rebase it and add evidence; its revision carries an Align snapshot",
    sCrs?.waiting_on_me?.length === 1 && sCrs.mine.length === 0 && sCrs.others.length === 0 && sCr.goal.id === sSec.id && sCr.state === "pending" && sCr.requester.id === U2.id && /sample/i.test(sCr.reason) && sCr.diff.after.measures.length === sSec.measures.length + 1 && Object.values(sCr.can).filter(Boolean).length === 6 && !sCr.can.accept_counter && sCr.can.add_evidence && sCr.revisions[0].snapshot?.recorded_by === "align" && sCr.revisions[0].snapshot.revision === 1,
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
  // Recent sign-in: an owner's sensitive member and workspace actions need a sign-in from the last 15 minutes.
  const staleOf = async (u) => {
    const c = cookieOf((await call(u.who, "POST", "/api/v2/auth/sign-in/email", { headers: { origin: BASE }, body: { email: u.email, password: `pw-${u.who}-123456` } })).setCookies);
    ageSession(c, 20);
    return { ...u, cookie: c };
  };
  const U1stale = await staleOf(U1);
  const U3stale = await staleOf(U3);
  const staleRole = await mem(U1stale, U5.id, { role: "viewer" });
  const staleOwner = await mem(U1stale, U3.id, { role: "owner" });
  const staleRemove = await mem(U1stale, U5.id);
  const staleOwnerInvite = await call("U1", "POST", `/api/v2/workspaces/${A}/invites`, { cookie: U1stale.cookie, body: { email: "new-owner@example.test", role: "owner" } });
  const staleDeleteWs = await call("U1", "DELETE", `/api/v2/workspaces/${A}`, { cookie: U1stale.cookie });
  const staleByMember = await mem(U3stale, U5.id, { role: "viewer" });
  const staleRoles = withDb((d) => d.prepare("SELECT user_id, role FROM v2_members WHERE ws_id = ? AND user_id IN (?, ?)").all(A, U3.id, U5.id).map((r) => `${r.user_id === U3.id ? "U3" : "U5"}:${r.role}`).sort().join());
  const staleOwnerInviteRow = withDb((d) => d.prepare("SELECT 1 AS x FROM v2_invites WHERE ws_id = ? AND email = ?").get(A, "new-owner@example.test"));
  check(
    "recent sign-in: with a 20-minute-old session an owner's role change, ownership grant, member removal, owner invite and workspace deletion -> 403 reauth_required (\"Sign in again to ...\"), nothing changes; a member's old session still gets owner_only",
    [staleRole, staleOwner, staleRemove, staleOwnerInvite, staleDeleteWs].every((r) => r.status === 403 && r.json?.error === "reauth_required" && /^Sign in again to .+ This needs a sign-in from the last 15 minutes\.$/.test(r.json?.message)) &&
      staleByMember.status === 403 && staleByMember.json?.error === "owner_only" && staleRoles === "U3:member,U5:member" && !staleOwnerInviteRow &&
      (await call("U1", "GET", `/api/v2/workspaces/${A}`, { cookie: U1.cookie })).status === 200,
    `${[staleRole, staleOwner, staleRemove, staleOwnerInvite, staleDeleteWs, staleByMember].map((r) => `${r.status} ${r.json?.error}`).join(" | ")} ${staleRoles}`,
  );
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
  const d4OnB = await call("U4", "GET", `/api/v2/workspaces/${B}/goals`, { bearer: D4.access });
  const d4OnAStill = await call("U4", "GET", `/api/v2/workspaces/${A}/goals`, { bearer: D4.access });
  const u4List = (await call("U4", "GET", "/api/v2/workspaces", { cookie: U4.cookie })).json;
  const bRow = withDb((d) => d.prepare("SELECT deleted_at FROM v2_workspaces WHERE id = ?").get(B));
  check(
    "workspaces: only an owner deletes (a non-member -> 404, a member -> 403 owner_only); delete -> 204, then 404 on the web and to its devices, gone from the list and kept as deleted (restorable, purged later by the retention job); the device keeps its other workspace",
    alB.json?.state === "approved" && upB.json?.accepted === 1 && delByOther.status === 404 && delA.status === 403 && delA.json?.error === "owner_only" && delB.status === 204 && bGone.status === 404 && d4OnB.status === 404 && d4OnAStill.status === 200 && !u4List.workspaces.some((w) => w.id === B) && u4List.deleted.some((w) => w.id === B) && !!bRow?.deleted_at,
    `${alB.status} ${upB.text} ${delByOther.status} ${delA.status} ${delB.status} ${bGone.status} ${d4OnB.status} ${d4OnAStill.status} ${JSON.stringify(u4List)} ${JSON.stringify(bRow)}`,
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
  // -- provider sign-in and linking (the test OAuth provider, through the same Better Auth routes as Google and GitHub):
  //    the access and refresh tokens a provider issues are stored encrypted, and Better Auth can still read them --
  const oauthFlow = async (p, body, cookie) => {
    const start = await call("OA", "POST", p, { cookie, headers: { origin: BASE }, body });
    const atStub = start.json?.url ? await fetch(start.json.url, { redirect: "manual" }) : null;
    const back = atStub?.headers.get("location") ? new URL(atStub.headers.get("location")) : null;
    const jar = [cookie, cookieOf(start.setCookies)].filter(Boolean).join("; ");
    const cb = back ? await call("OA", "GET", back.pathname + back.search, { cookie: jar }) : null;
    return { start, cb, target: cb ? redirectTarget(cb) ?? "" : "" };
  };
  const oaIn = await oauthFlow("/api/v2/auth/sign-in/social", { provider: "align-test", callbackURL: "/app" });
  const oaCookie = cookieOf(oaIn.cb?.setCookies ?? []);
  const oaMe = await call("OA", "GET", "/api/v2/me", { cookie: oaCookie });
  const oaRow = withDb((d) => d.prepare("SELECT a.id, a.accessToken, a.refreshToken FROM ba_account a JOIN ba_user u ON u.id = a.userId WHERE a.providerId = 'align-test' AND u.email = ?").get(oauthUser.email));
  // Decrypted with Better Auth's own helper and this server's key (Mode L: <data>/v2/.auth-secret), no app route needed.
  const { symmetricDecrypt } = await import("better-auth/crypto");
  const authKey = readFileSync(path.join(onDir, "v2", ".auth-secret"), "utf8").trim();
  const opened = async (t) => (typeof t === "string" ? await symmetricDecrypt({ key: authKey, data: t }).catch(() => null) : null);
  const oaPlain = [await opened(oaRow?.accessToken), await opened(oaRow?.refreshToken)];
  const sealed = (t, plain) => typeof t === "string" && t.length > plain.length && !t.includes(plain) && (t.startsWith("$ba$") || /^[0-9a-f]+$/i.test(t));
  // Better Auth's routes that would hand out, refresh or describe provider tokens, or unlink a provider, are off.
  const oaOff = await Promise.all([
    call("OA", "POST", "/api/v2/auth/get-access-token", { cookie: oaCookie, headers: { origin: BASE }, body: { accountId: oaRow?.id ?? "" } }),
    call("OA", "POST", "/api/v2/auth/refresh-token", { cookie: oaCookie, headers: { origin: BASE }, body: { accountId: oaRow?.id ?? "" } }),
    call("OA", "GET", `/api/v2/auth/account-info?accountId=${oaRow?.id ?? ""}`, { cookie: oaCookie }),
    call("OA", "POST", "/api/v2/auth/unlink-account", { cookie: oaCookie, headers: { origin: BASE }, body: { providerId: "align-test" } }),
  ]);
  check(
    "provider tokens: a sign-in through an OAuth provider works (session, /api/v2/me) and its access and refresh tokens are stored encrypted in ba_account, never as issued (not in the database file either); Better Auth's decrypt helper with the server's key opens them",
    oaIn.cb?.status === 302 && oaIn.target.endsWith("/app") && oaMe.status === 200 && oaMe.json?.user?.email === oauthUser.email &&
      sealed(oaRow?.accessToken, OAUTH_AT) && sealed(oaRow?.refreshToken, OAUTH_RT) && dbFilesLack(dbFile, OAUTH_AT) && dbFilesLack(dbFile, OAUTH_RT) && oaPlain[0] === OAUTH_AT && oaPlain[1] === OAUTH_RT,
    `${oaIn.start.status} ${oaIn.start.text.slice(0, 160)} ${oaIn.cb?.status} ${oaIn.target} ${oaMe.status} ${JSON.stringify(oaRow)} ${JSON.stringify(oaPlain)}`,
  );
  check(
    "provider tokens: Better Auth's get-access-token, refresh-token, account-info and unlink-account routes are off (404) for a signed-in person, and the provider stays linked",
    oaOff.every((r) => r.status === 404) && withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM ba_account WHERE id = ?").get(oaRow?.id ?? "").n) === 1,
    oaOff.map((r) => `${r.status} ${r.text.slice(0, 80)}`).join(" | "),
  );
  // Linking stays explicit: the same provider with an existing account's email doesn't sign in or link on its own,
  // and linking it from that (recently signed-in) account works, its tokens encrypted too.
  const UL = await signUp("UL", "Lin Kay", "lin.kay@example.test");
  Object.assign(oauthUser, { sub: "tp-2", email: UL.email, name: "Lin Kay" });
  const oaImplicit = await oauthFlow("/api/v2/auth/sign-in/social", { provider: "align-test", callbackURL: "/app" });
  const ulAccountsBefore = withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM ba_account WHERE userId = ? AND providerId = 'align-test'").get(UL.id).n);
  const oaLink = await oauthFlow("/api/v2/auth/link-social", { provider: "align-test", callbackURL: "/app/account" }, UL.cookie);
  const ulRow = withDb((d) => d.prepare("SELECT accessToken, refreshToken FROM ba_account WHERE userId = ? AND providerId = 'align-test'").get(UL.id));
  const ulList = await call("UL", "GET", "/api/v2/auth/list-accounts", { cookie: UL.cookie });
  check(
    "provider tokens: account linking still works and is explicit only: a provider sign-in with an existing account's email is refused (no link made); /link-social from that account links it, the linked tokens are encrypted too, and list-accounts shows it",
    /error=/.test(oaImplicit.target) && cookieOf(oaImplicit.cb?.setCookies ?? []).indexOf("align_v2.session_token=") === -1 && ulAccountsBefore === 0 &&
      oaLink.start.status === 200 && oaLink.cb?.status === 302 && oaLink.target.endsWith("/app/account") && sealed(ulRow?.accessToken, OAUTH_AT) && sealed(ulRow?.refreshToken, OAUTH_RT) &&
      Array.isArray(ulList.json) && ulList.json.some((a) => a.providerId === "align-test"),
    `${oaImplicit.target} ${ulAccountsBefore} ${oaLink.start.status} ${oaLink.start.text.slice(0, 160)} ${oaLink.cb?.status} ${oaLink.target} ${JSON.stringify(ulRow)} ${ulList.text.slice(0, 200)}`,
  );

  // -- sessions: 7 days rolling, a 30-day absolute cap (ALIGN_SESSION_MAX_DAYS) --
  const S9 = await signUp("U9", "Sol Nine", "u9@example.test");
  const signIn9 = async () => cookieOf((await call("U9", "POST", "/api/v2/auth/sign-in/email", { headers: { origin: BASE }, body: { email: S9.email, password: "pw-U9-123456" } })).setCookies);
  const tokenOf = (cookie) => decodeURIComponent(/align_v2\.session_token=([^;]+)/.exec(cookie)?.[1] ?? "").split(".")[0];
  const old31 = await signIn9();
  ageSession(old31, 31 * 24 * 60);
  const capGet = await call("U9", "GET", "/api/v2/auth/get-session", { cookie: old31 });
  const capMe = await call("U9", "GET", "/api/v2/me", { cookie: old31 });
  const capPage = await call("U9", "GET", "/app/account", { cookie: old31 });
  const capRow = withDb((d) => d.prepare("SELECT 1 AS x FROM ba_session WHERE token = ?").get(tokenOf(old31)));
  check(
    "sessions: a session signed in 31 days ago is invalid everywhere (get-session null, /api/v2/me 401, /app pages send to sign-in) and its row is deleted, however recently it was used",
    capGet.status === 200 && capGet.json === null && capMe.status === 401 && (redirectTarget(capPage) ?? "").startsWith("/app/sign-in") && !capRow,
    `${capGet.text} ${capMe.status} ${redirectTarget(capPage)} ${!!capRow}`,
  );
  const old29 = await signIn9();
  const t29 = tokenOf(old29);
  withDb((d) => d.prepare("UPDATE ba_session SET createdAt = ?, expiresAt = ? WHERE token = ?").run(new Date(Date.now() - 29 * 86_400_000).toISOString(), new Date(Date.now() + 5 * 86_400_000).toISOString(), t29));
  const get29 = await call("U9", "GET", "/api/v2/auth/get-session", { cookie: old29 });
  const row29 = withDb((d) => d.prepare("SELECT createdAt, expiresAt FROM ba_session WHERE token = ?").get(t29));
  const fresh9 = withDb((d) => d.prepare("SELECT createdAt, expiresAt FROM ba_session WHERE userId = ? ORDER BY createdAt DESC LIMIT 1").get(S9.id));
  check(
    "sessions: a 29-day-old session still works and is extended on use, but only to 30 days after its sign-in; a new one lasts 7 days",
    get29.json?.user?.id === S9.id && Date.parse(row29.expiresAt) === Date.parse(row29.createdAt) + 30 * 86_400_000 && Math.abs(Date.parse(fresh9.expiresAt) - Date.parse(fresh9.createdAt) - 7 * 86_400_000) < 5000,
    `${get29.status} ${JSON.stringify(row29)} ${JSON.stringify(fresh9)}`,
  );

  // -- passkeys (API): list, prompt, recent sign-in for adding and deleting, Better Auth's own management routes off --
  const S9stale = { ...S9, cookie: await signIn9() };
  ageSession(S9stale.cookie, 20);
  const pkList = await call("U9", "GET", "/api/v2/account/passkeys", { cookie: S9.cookie });
  const promptPage = await call("U9", "GET", "/app", { cookie: S9.cookie });
  const dismiss = await call("U9", "DELETE", "/api/v2/account/passkey-prompt", { cookie: S9.cookie });
  const pkList2 = await call("U9", "GET", "/api/v2/account/passkeys", { cookie: S9.cookie });
  const promptPage2 = await call("U9", "GET", "/app", { cookie: S9.cookie });
  check(
    "passkeys: GET /api/v2/account/passkeys -> {passkeys: [], prompt: true} and /app shows the add-a-passkey prompt; Not now (DELETE /api/v2/account/passkey-prompt -> 204) is remembered: prompt false, no prompt on /app",
    pkList.status === 200 && JSON.stringify(pkList.json) === '{"passkeys":[],"prompt":true}' && promptPage.text.includes("Add a passkey to sign in with your fingerprint") && dismiss.status === 204 && pkList2.json?.prompt === false && !promptPage2.text.includes("Add a passkey to sign in with your fingerprint"),
    `${pkList.text} ${dismiss.status} ${pkList2.text}`,
  );
  const regStale = await call("U9", "GET", "/api/v2/auth/passkey/generate-register-options", { cookie: S9stale.cookie });
  const regFresh = await call("U9", "GET", "/api/v2/auth/passkey/generate-register-options", { cookie: S9.cookie });
  const linkStale = await call("U9", "POST", "/api/v2/auth/link-social", { cookie: S9stale.cookie, headers: { origin: BASE }, body: { provider: "github", callbackURL: "/app/account" } });
  const PK_FAKE = "a".repeat(32);
  const delStale = await call("U9", "DELETE", `/api/v2/account/passkeys/${PK_FAKE}`, { cookie: S9stale.cookie });
  const delUnknown = await call("U9", "DELETE", `/api/v2/account/passkeys/${PK_FAKE}`, { cookie: S9.cookie });
  const renUnknown = await call("U9", "PATCH", `/api/v2/account/passkeys/${PK_FAKE}`, { cookie: S9.cookie, body: { name: "x" } });
  const delBadId = await call("U9", "DELETE", "/api/v2/account/passkeys/not-an-id", { cookie: S9.cookie });
  check(
    "passkeys: adding (generate-register-options) and linking an account with a 20-minute-old session -> 403 reauth_required; a fresh one gets options for rp localhost (resident key required); deleting with an old session -> 403 reauth_required, an unknown or malformed id -> 404",
    regStale.status === 403 && regStale.json?.code === "reauth_required" && regStale.json?.message === "Sign in again to add a passkey. This needs a sign-in from the last 15 minutes." &&
      regFresh.status === 200 && regFresh.json?.rp?.id === "localhost" && regFresh.json?.rp?.name === "Align" && regFresh.json?.authenticatorSelection?.residentKey === "required" &&
      linkStale.status === 403 && linkStale.json?.code === "reauth_required" &&
      delStale.status === 403 && delStale.json?.error === "reauth_required" && delUnknown.status === 404 && renUnknown.status === 404 && delBadId.status === 404,
    `${regStale.status} ${regStale.text} ${regFresh.status} ${linkStale.status} ${linkStale.text} ${delStale.status} ${delUnknown.status} ${renUnknown.status} ${delBadId.status}`,
  );
  const offPaths = await Promise.all([
    call("U9", "POST", "/api/v2/auth/revoke-sessions", { cookie: S9.cookie, headers: { origin: BASE }, body: {} }),
    call("U9", "POST", "/api/v2/auth/revoke-other-sessions", { cookie: S9.cookie, headers: { origin: BASE }, body: {} }),
    call("U9", "POST", "/api/v2/auth/revoke-session", { cookie: S9.cookie, headers: { origin: BASE }, body: { token: "x" } }),
    call("U9", "GET", "/api/v2/auth/passkey/list-user-passkeys", { cookie: S9.cookie }),
    call("U9", "POST", "/api/v2/auth/passkey/delete-passkey", { cookie: S9.cookie, headers: { origin: BASE }, body: { id: PK_FAKE } }),
    call("U9", "POST", "/api/v2/auth/passkey/update-passkey", { cookie: S9.cookie, headers: { origin: BASE }, body: { id: PK_FAKE, name: "x" } }),
  ]);
  check("passkeys: Better Auth's own session-revocation and passkey list, rename and delete routes are off (404); Align's are under /api/v2/account", offPaths.every((r) => r.status === 404), offPaths.map((r) => r.status).join(","));

  // -- sign out everywhere --
  const W9 = await call("U9", "POST", "/api/v2/workspaces", { cookie: S9.cookie, body: { name: "Sol's workspace" } });
  const D9 = insertDevice(S9.id, "Sol's laptop");
  const S9b = await signIn9();
  withDb((d) =>
    d.prepare("INSERT INTO v2_oauth_grants (id, ws_id, user_id, client_id, client_name, redirect_host, created_at, refresh_hash, refresh_exp, kid) VALUES (?, ?, ?, 'c', 'Old app', 'x.example', ?, 'h', ?, 'old-kid')").run("gr_AAAAAAAAAAAAAAA9", W9.json.id, S9.id, new Date().toISOString(), Date.now() + 86_400_000),
  );
  const soeStale = await call("U9", "POST", "/api/v2/account/sign-out-everywhere", { cookie: S9stale.cookie, body: { devices: true, apps: true } });
  const soeBad = await call("U9", "POST", "/api/v2/account/sign-out-everywhere", { cookie: S9.cookie, body: { devices: "yes" } });
  const stillIn = await call("U9", "GET", "/api/v2/me", { cookie: S9b });
  const soe = await call("U9", "POST", "/api/v2/account/sign-out-everywhere", { cookie: S9.cookie, body: { devices: true, apps: true } });
  const afterSoe = await Promise.all([S9.cookie, S9b, S9stale.cookie].map((c) => call("U9", "GET", "/api/v2/me", { cookie: c })));
  const devAfter = await call("U9", "GET", "/api/v2/me", { bearer: D9.access });
  const soeDb = withDb((d) => ({
    sessions: d.prepare("SELECT COUNT(*) AS n FROM ba_session WHERE userId = ?").get(S9.id).n,
    reason: d.prepare("SELECT revoked_reason FROM v2_devices WHERE id = ?").get(D9.id)?.revoked_reason,
    grants: d.prepare("SELECT COUNT(*) AS n FROM v2_oauth_grants WHERE user_id = ?").get(S9.id).n,
    audit: d.prepare("SELECT ws_id, actor_id, action, object_id FROM v2_audit WHERE actor_id = ? AND action IN ('account.signed_out_everywhere', 'device.revoked')").all(S9.id),
  }));
  check(
    "sign out everywhere: an old session -> 403 reauth_required and nothing ends; a non-boolean option -> 400; with devices and apps -> 200 {sessions, devices: 1, apps} and a cleared cookie: every session of the person (this one included) is gone, the device is revoked (reason signed_out_everywhere), every app grant is deleted, and the audit (no workspace) records account.signed_out_everywhere and device.revoked with the person as actor",
    soeStale.status === 403 && soeStale.json?.error === "reauth_required" && soeBad.status === 400 && stillIn.status === 200 &&
      soe.status === 200 && soe.json?.sessions >= 3 && soe.json?.devices === 1 && soe.json?.apps === 0 && /align_v2\.session_token=;.*Max-Age=0/i.test(soe.headers.get("set-cookie") ?? "") &&
      afterSoe.every((r) => r.status === 401) && devAfter.status === 401 && soeDb.sessions === 0 && soeDb.reason === "signed_out_everywhere" && soeDb.grants === 0 &&
      soeDb.audit.some((r) => r.action === "account.signed_out_everywhere" && r.ws_id === null && r.object_id === S9.id) && soeDb.audit.some((r) => r.action === "device.revoked" && r.object_id === D9.id && r.ws_id === null),
    `${soeStale.status} ${soeBad.status} ${stillIn.status} ${soe.status} ${soe.text} ${afterSoe.map((r) => r.status)} ${devAfter.status} ${JSON.stringify(soeDb)}`,
  );
  const S9c = await signIn9();
  const D9b = insertDevice(S9.id, "Sol's desktop");
  const soePlain = await call("U9", "POST", "/api/v2/account/sign-out-everywhere", { cookie: S9c, body: {} });
  const dev9b = await call("U9", "GET", "/api/v2/me", { bearer: D9b.access });
  check("sign out everywhere: without the options only web sessions end; paired devices keep working", soePlain.status === 200 && soePlain.json?.devices === 0 && soePlain.json?.apps === 0 && dev9b.status === 200, `${soePlain.text} ${dev9b.status}`);

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
      // With no evidence, Approve asks first ("Approve without evidence?"); then evidence is added and it approves plainly.
      const clickButton = (label) => page.evaluate((t) => [...document.querySelectorAll("button")].find((b) => b.textContent === t)?.click(), label);
      await clickButton("Approve");
      await page.waitForFunction(() => document.body.innerText.includes("Approve without evidence?") && [...document.querySelectorAll("button")].some((b) => b.textContent === "Approve without evidence as version 2"), { timeout: 15000 });
      await clickButton("Approve");
      await clickButton("Add evidence");
      await page.waitForSelector('input[type="url"]');
      await page.type('input[type="url"]', "https://github.com/northstar/security/pull/7");
      await page.type('input[maxlength="120"]', "Pen-test vendor contract");
      await clickButton("Add link");
      await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => a.textContent === "Pen-test vendor contract"), { timeout: 15000 });
      const evLink = await page.evaluate(() => {
        const a = [...document.querySelectorAll("a")].find((x) => x.textContent === "Pen-test vendor contract");
        return { href: a?.getAttribute("href"), target: a?.getAttribute("target"), rel: a?.getAttribute("rel"), text: document.body.innerText };
      });
      check(
        "ui (Chrome): approving a request with no evidence asks \"Approve without evidence?\"; an added link shows its kind, label, host, who added it and \"self-reported\", opens in a new tab with rel noopener noreferrer, beside \"Recorded by Align at revision 1\"",
        evLink.href === "https://github.com/northstar/security/pull/7" && evLink.target === "_blank" && evLink.rel === "noopener noreferrer" && /self-reported/.test(evLink.text) && /Pull request/.test(evLink.text) && /github\.com/.test(evLink.text) && /by you/.test(evLink.text) && /Recorded by Align at revision 1/.test(evLink.text) && !/\bverified\b/.test(evLink.text),
        JSON.stringify({ ...evLink, text: evLink.text.slice(0, 300) }),
      );
      await clickButton("Approve");
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Approve as version 2"), { timeout: 15000 });
      await clickButton("Approve as version 2");
      await page.waitForFunction(() => document.body.innerText.includes("Approved by") && document.body.innerText.includes("It became version 2") && document.body.innerText.includes("Approved with 1 evidence link, none verified."), { timeout: 15000 });
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

      // -- passkeys in Chrome, on localhost (WebAuthn needs a domain name), with a virtual authenticator --
      const LB = `http://localhost:${PORT}`;
      const pctx = await browser.createBrowserContext();
      const pk = await pctx.newPage();
      const pkErrors = [];
      pk.on("pageerror", (e) => pkErrors.push(e.message));
      pk.on("dialog", (d) => void d.accept());
      const pkNavs = [];
      pk.on("framenavigated", (f) => f === pk.mainFrame() && pkNavs.push(f.url()));
      const cdp = await pk.createCDPSession();
      await cdp.send("WebAuthn.enable");
      const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
      });
      const pkText = () => pk.evaluate(() => document.body.innerText);
      const pkClick = (label, root = "button") => pk.evaluate((l, r) => [...document.querySelectorAll(r)].find((b) => b.textContent?.trim() === l)?.click(), label, root);
      const pkCookie = async () => `align_v2.session_token=${(await pk.cookies()).find((c) => c.name === "align_v2.session_token")?.value ?? ""}`;
      const pkUser = () => withDb((d) => d.prepare("SELECT id FROM ba_user WHERE email = ?").get("pk@example.test")?.id);
      await pk.goto(`${BASE}/app/sign-in?next=/app`, { waitUntil: "networkidle0" });
      const loopText = await pkText();
      await pk.goto(`${LB}/app/sign-in?next=/app`, { waitUntil: "networkidle0" });
      const lhHasButton = (await pkText()).includes("Sign in with a passkey");
      const emailAuto = await pk.evaluate(() => document.querySelector('#email-code input[type="email"]')?.getAttribute("autocomplete"));
      check(
        "ui (Chrome): at 127.0.0.1 the sign-in page says passkeys work only at http://localhost:<port> and has no passkey button; at localhost it has Sign in with a passkey and the email field offers passkeys (autocomplete \"email webauthn\")",
        loopText.includes(`Passkeys work only at http://localhost:${PORT}`) && !loopText.includes("Sign in with a passkey") && lhHasButton && emailAuto === "email webauthn",
        `${loopText.slice(0, 300)} | ${lhHasButton} ${emailAuto}`,
      );
      await pk.evaluate(() => [...document.querySelectorAll("#test-idp button")].find((b) => b.textContent?.includes("Create a test account"))?.click());
      await pk.waitForSelector('#test-idp input[autocomplete="name"]');
      await pk.type('#test-idp input[autocomplete="name"]', "Pat Key");
      await pk.type('#test-idp input[type="email"]', "pk@example.test");
      await pk.type('#test-idp input[type="password"]', "browser-pass-2");
      await Promise.all([pk.waitForNavigation({ waitUntil: "networkidle0" }), pk.evaluate(() => document.querySelector("#test-idp button[type=submit]")?.click())]);
      await pk.waitForFunction(() => document.body.innerText.includes("Your workspaces"), { timeout: 15000 });
      const promptText = await pkText();
      await pkClick("Add a passkey", "#passkey-prompt a");
      await pk.waitForFunction(() => document.body.innerText.includes("No passkeys yet.") && [...document.querySelectorAll("button")].some((b) => b.textContent === "Add a passkey"), { timeout: 15000 });
      const accountNoPrompt = !(await pkText()).includes("A passkey can't be phished");
      await pk.type('main input[maxlength="100"]:not([aria-label])', "MacBook passkey");
      await pkClick("Add a passkey");
      await pk.waitForFunction(() => document.body.innerText.includes("MacBook passkey") && document.body.innerText.includes("not used yet"), { timeout: 15000 });
      const creds = (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials;
      const pkRow = withDb((d) => d.prepare("SELECT id, name FROM ba_passkey WHERE userId = ?").all(pkUser()));
      const pkAdded = withDb((d) => d.prepare("SELECT ws_id, actor_id FROM v2_audit WHERE action = 'passkey.added' AND object_id = ?").get(pkRow[0]?.id));
      check(
        "ui (Chrome): after sign-in without a passkey /app shows the add-a-passkey prompt; it leads to /app/account (no prompt there), where Add a passkey registers a discoverable credential for rp localhost labelled with the email, lists it by name (\"not used yet\") and audits passkey.added with no workspace",
        promptText.includes("Add a passkey to sign in with your fingerprint, face or device PIN instead of an email code.") && accountNoPrompt &&
          creds.length === 1 && creds[0].rpId === "localhost" && creds[0].isResidentCredential && creds[0].userName === "pk@example.test" &&
          pkRow.length === 1 && pkRow[0].name === "MacBook passkey" && pkAdded?.ws_id === null && pkAdded?.actor_id === pkUser(),
        `${accountNoPrompt} ${JSON.stringify(creds.map((c) => [c.rpId, c.userName]))} ${JSON.stringify(pkRow)} ${JSON.stringify(pkAdded)}`,
      );
      ageSession(await pkCookie(), 20);
      await pkClick("Add a passkey");
      await pk.waitForFunction(() => document.body.innerText.includes("Sign in again to add a passkey. This needs a sign-in from the last 15 minutes."), { timeout: 15000 });
      const credsStale = (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials.length;
      const navsBefore = pkNavs.length;
      await pkClick("Sign in again");
      // The email field's autofill (conditional mediation): the virtual authenticator answers it, so the page signs in.
      for (let i = 0; i < 150 && !pkNavs.slice(navsBefore).some((u) => u.startsWith(`${LB}/app/sign-in`)); i++) await sleep(100);
      for (let i = 0; i < 150 && !(pkNavs.at(-1) ?? "").startsWith(`${LB}/app/account`); i++) await sleep(100);
      await pk.waitForFunction(() => document.body.innerText.includes("last used"), { timeout: 15000 });
      const pkUse = withDb((d) => d.prepare("SELECT last_used_at FROM v2_passkey_use WHERE passkey_id = ?").get(pkRow[0]?.id));
      check(
        "ui (Chrome): with an old sign-in Add a passkey shows Sign in again (nothing registered), which signs out to /app/sign-in?next=/app/account; there the email field's passkey autofill signs in and returns to /app/account, and the passkey shows when it was last used",
        credsStale === 1 && pkNavs.slice(navsBefore).some((u) => { const x = new URL(u); return x.pathname === "/app/sign-in" && x.searchParams.get("next") === "/app/account" && x.searchParams.get("email") === "pk@example.test"; }) && !!pkUse?.last_used_at,
        `${credsStale} ${pkNavs.slice(navsBefore).join(" ")} ${JSON.stringify(pkUse)}`,
      );
      // A passkey sign-in is a fresh sign-in: this session passes the recent-sign-in checks at once.
      const pkWs = await call("PK", "POST", "/api/v2/workspaces", { cookie: await pkCookie(), body: { name: "Passkey workspace" } });
      const pkFresh = await Promise.all([
        call("PK", "GET", "/api/v2/auth/passkey/generate-register-options", { cookie: await pkCookie() }),
        call("PK", "DELETE", `/api/v2/account/passkeys/${"b".repeat(32)}`, { cookie: await pkCookie() }),
        call("PK", "POST", `/api/v2/workspaces/${pkWs.json?.id}/invites`, { cookie: await pkCookie(), body: { email: "owner2@example.test", role: "owner" } }),
      ]);
      check(
        "recent sign-in: a passkey sign-in counts as a fresh sign-in (adding a passkey, deleting one (unknown: 404) and an owner invite pass the check)",
        pkWs.status === 201 && pkFresh[0].status === 200 && pkFresh[1].status === 404 && pkFresh[2].status === 201,
        pkFresh.map((r) => `${r.status} ${r.text.slice(0, 80)}`).join(" | "),
      );
      insertDevice(pkUser(), "Pat's laptop");
      // The button, on the code step (where no autofill runs). Cookies are cleared rather than signing out, so the
      // sign-in page's autofill can't sign straight back in first.
      await cdp.send("Network.clearBrowserCookies");
      await pk.goto(`${LB}/app/sign-in?next=/app/devices&email=pk%40example.test&code=123456`, { waitUntil: "networkidle0" });
      await Promise.all([pk.waitForNavigation({ waitUntil: "networkidle0" }), pkClick("Sign in with a passkey")]);
      await pk.waitForFunction(() => document.body.innerText.includes("Your devices"), { timeout: 15000 });
      check("ui (Chrome): Sign in with a passkey signs in and lands on next (/app/devices)", new URL(pk.url()).pathname === "/app/devices", pk.url());
      // People tab: an owner invite with an old sign-in gets Sign in again, which comes back to the People tab.
      ageSession(await pkCookie(), 20);
      await pk.goto(`${LB}/app/w/${pkWs.json?.id}/people`, { waitUntil: "networkidle0" });
      await pk.waitForFunction(() => document.body.innerText.includes("Invite someone"), { timeout: 15000 });
      await pk.type('main input[type="email"]', "second-owner@example.test");
      await pk.evaluate(() => [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent === "Viewer (read only)"))?.setAttribute("id", "invite-role"));
      await pk.select("#invite-role", "owner");
      await pkClick("Create invite link");
      await pk.waitForFunction(() => document.body.innerText.includes("Sign in again to invite an owner. This needs a sign-in from the last 15 minutes."), { timeout: 15000 });
      await Promise.all([pk.waitForNavigation({ waitUntil: "networkidle0" }), pkClick("Sign in again")]);
      await pk.waitForFunction((w) => location.pathname === `/app/w/${w}/people`, { timeout: 15000 }, pkWs.json?.id);
      check("ui (Chrome): People tab: an owner invite with an old sign-in shows \"Sign in again to invite an owner.\"; Sign in again (here by passkey autofill) returns to the People tab", new URL(pk.url()).pathname === `/app/w/${pkWs.json?.id}/people`, pk.url());
      // Rename and delete.
      await pk.goto(`${LB}/app/account`, { waitUntil: "networkidle0" });
      await pk.waitForFunction(() => document.body.innerText.includes("MacBook passkey"), { timeout: 15000 });
      await pkClick("Rename");
      await pk.waitForSelector('input[aria-label="Passkey name"]');
      await pk.click('input[aria-label="Passkey name"]', { clickCount: 3 });
      await pk.type('input[aria-label="Passkey name"]', "Work laptop");
      await pkClick("Save");
      await pk.waitForFunction(() => document.body.innerText.includes("Work laptop") && !document.body.innerText.includes("MacBook passkey"), { timeout: 15000 });
      await pkClick("Delete");
      await pk.waitForFunction(() => document.body.innerText.includes("No passkeys yet."), { timeout: 15000 });
      const pkGone = withDb((d) => ({
        rows: d.prepare("SELECT COUNT(*) AS n FROM ba_passkey WHERE userId = ?").get(pkUser()).n,
        use: d.prepare("SELECT COUNT(*) AS n FROM v2_passkey_use WHERE passkey_id = ?").get(pkRow[0]?.id).n,
        audit: d.prepare("SELECT actor_id FROM v2_audit WHERE action = 'passkey.deleted' AND object_id = ?").get(pkRow[0]?.id)?.actor_id,
      }));
      check("ui (Chrome): Rename names the passkey; Delete (confirmed) removes it and its use record, and audits passkey.deleted", pkGone.rows === 0 && pkGone.use === 0 && pkGone.audit === pkUser(), JSON.stringify(pkGone));
      // Sign out everywhere, also unpairing devices.
      await pk.evaluate(() => document.querySelector('input[name="devices"]')?.click());
      await Promise.all([pk.waitForNavigation({ waitUntil: "networkidle0" }), pkClick("Sign out everywhere")]);
      const soeUi = withDb((d) => ({
        sessions: d.prepare("SELECT COUNT(*) AS n FROM ba_session WHERE userId = ?").get(pkUser()).n,
        devices: d.prepare("SELECT COUNT(*) AS n FROM v2_devices WHERE user_id = ? AND revoked_reason = 'signed_out_everywhere'").get(pkUser()).n,
      }));
      check("ui (Chrome): Sign out everywhere (with Also unpair all my devices) ends every session, revokes the device and lands on /app/sign-in", new URL(pk.url()).pathname === "/app/sign-in" && soeUi.sessions === 0 && soeUi.devices === 1, `${pk.url()} ${JSON.stringify(soeUi)}`);
      check("ui (Chrome): the passkey, account and People pages render without page errors", pkErrors.length === 0, pkErrors.join(" | "));
      await pctx.close();
    } catch (e) {
      check("ui (Chrome) run", false, e?.stack ?? e);
    } finally {
      await browser.close();
    }
  } else check("ui (Chrome) available", false, `no Chrome at ${CHROME}`);

  // -- Mode L ignores ALIGN_CREATION=closed, every cap (1 here) and the Turnstile keys --
  const U9 = await signUp("U9A", "Una Nine", "una9@example.test");
  const u9ws = [];
  for (const n of ["Nine A", "Nine B"]) u9ws.push(await call("U9A", "POST", "/api/v2/workspaces", { cookie: U9.cookie, body: { name: n } }));
  const u9sample = await call("U9A", "POST", "/api/v2/workspaces/sample", { cookie: U9.cookie, body: {} });
  const u9inv = await Promise.all(["x1@example.test", "x2@example.test"].map((email) => call("U9A", "POST", `/api/v2/workspaces/${u9ws[0].json?.id}/invites`, { cookie: U9.cookie, body: { email, role: "member" } })));
  const u9home = await call("U9A", "GET", "/app", { cookie: U9.cookie });
  const u9signIn = await call("anon", "GET", "/app/sign-in");
  check(
    "local: Mode L ignores ALIGN_CREATION=closed, the caps and the Turnstile keys: one person creates 2 workspaces and the sample with no code or check, and invites past a cap of 1; no page shows a code field, a bot check or a request-access link",
    u9ws.every((r) => r.status === 201) && u9sample.status === 201 && u9inv.every((r) => r.status === 201) && u9home.status === 200 && !u9home.text.includes('name="creation_code"') && !u9home.text.includes("data-turnstile-sitekey") && !u9signIn.text.includes("data-turnstile-sitekey") && !u9signIn.text.includes("/app/request-access"),
    `${u9ws.map((r) => r.status)} ${u9sample.status} ${u9inv.map((r) => r.status)} ${u9sample.text}`,
  );
  // -- the operator script's workspace commands: list without people; delete by the app's own (soft) deletion path,
  //    restorable; --purge erases at once through the retention job's purge --
  const opOn = { ALIGN_DATA_DIR: onDir };
  const delWs = u9ws[1].json.id;
  const delInv = await call("U9A", "POST", `/api/v2/workspaces/${delWs}/invites`, { cookie: U9.cookie, body: { email: U1.email, role: "member" } });
  await call("U1", "POST", `/api/v2/invites/${delInv.json?.token}/accept`, { cookie: U1.cookie, body: {} });
  const opWsList = admin(["workspaces", "list"], opOn);
  const delLine = opWsList.out.split("\n").find((l) => l.startsWith(delWs)) ?? "";
  check(
    "align-admin: workspaces list shows each workspace's id, name, created date, deleted (- when live), member and owner counts, and no names or emails of people",
    opWsList.status === 0 && /^id\s+name\s+created\s+deleted\s+members\s+owners/.test(opWsList.out) && /Nine B\s+\d{4}-\d{2}-\d{2}\s+-\s+2\s+1\s*$/.test(delLine) && !opWsList.out.includes("@") && !opWsList.out.includes("Una Nine"),
    opWsList.out + opWsList.err,
  );
  const delNoYes = admin(["workspaces", "delete", delWs], opOn);
  check("align-admin: workspaces delete without --yes deletes nothing and exits 1, asking for --yes", delNoYes.status === 1 && /--yes/.test(delNoYes.err) && withDb((d) => !d.prepare("SELECT deleted_at FROM v2_workspaces WHERE id = ?").get(delWs).deleted_at), delNoYes.err);
  const delYes = admin(["workspaces", "delete", delWs, "--yes"], opOn);
  const delGone = await call("U1", "GET", `/api/v2/workspaces/${delWs}`, { cookie: U1.cookie });
  const delOwnerList = (await call("U9A", "GET", "/api/v2/workspaces", { cookie: U9.cookie })).json;
  const delKept = withDb((d) => ({
    deleted_at: d.prepare("SELECT deleted_at FROM v2_workspaces WHERE id = ?").get(delWs)?.deleted_at,
    rows: ["v2_members", "v2_invites"].map((t) => d.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ws_id = ?`).get(delWs).n),
    audit: d.prepare("SELECT actor_id FROM v2_audit WHERE ws_id = ? AND action = 'workspace.deleted'").all(delWs),
  }));
  const delListed = admin(["workspaces", "list"], opOn).out.split("\n").find((l) => l.startsWith(delWs)) ?? "";
  const delAgain = admin(["workspaces", "delete", delWs, "--yes"], opOn);
  check(
    "align-admin: workspaces delete <id> --yes is the app's soft delete: the running server answers 404 for it at once, its rows stay, the audit records workspace.deleted with no actor (the operator), its owner sees it under deleted (restorable), workspaces list shows when it was deleted, and deleting it again exits 1 pointing at --purge",
    delYes.status === 0 && /restore/.test(delYes.out) && delGone.status === 404 && !!delKept.deleted_at && delKept.rows.every((n) => n > 0) && delKept.audit.length === 1 && delKept.audit[0].actor_id === null &&
      delOwnerList?.deleted?.some((w) => w.id === delWs) && delListed.includes(delKept.deleted_at) && delAgain.status === 1 && /--purge/.test(delAgain.err),
    `${delYes.status} ${delYes.out} ${delYes.err} ${delGone.status} ${JSON.stringify(delKept)} ${delListed} ${delAgain.err}`,
  );
  const purgeNoYes = admin(["workspaces", "delete", delWs, "--purge"], opOn);
  const purged = admin(["workspaces", "delete", delWs, "--purge", "--yes"], opOn);
  const purgeLeft = withDb((d) => ["v2_members", "v2_invites", "v2_audit"].map((t) => d.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ws_id = ?`).get(delWs).n).concat(d.prepare("SELECT COUNT(*) AS n FROM v2_workspaces WHERE id = ?").get(delWs).n));
  check(
    "align-admin: workspaces delete <id> --purge needs --yes too (else nothing changes, exit 1); with it every row of the workspace (members, invites, audit, the workspace) is gone at once; an unknown id exits 1",
    purgeNoYes.status === 1 && /--purge --yes/.test(purgeNoYes.err) && purged.status === 0 && purgeLeft.every((n) => n === 0) && admin(["workspaces", "delete", delWs, "--purge", "--yes"], opOn).status === 1,
    `${purgeNoYes.status} ${purgeNoYes.err} ${purged.status} ${purged.err} ${purgeLeft}`,
  );

  // Each port package fills its own block below (PORT-002 limits, PORT-003 asks and activity, PORT-004 value), so the
  // packages never edit the same lines. They run before the canary check, which covers their responses too.
  // ==== port:limits ====
  // ==== end port:limits ====

  // ==== port:asks ====
  // ==== end port:asks ====

  // ==== port:activity ====
  // ==== end port:activity ====

  // ==== port:value ====
  // The decision value card (PORT-004): GET/POST .../change-requests/{id}/value, value reports (D6), the content-free
  // value events, access requests from the card (via), the report's Decision value section, the follow-up link rules,
  // and the strict-Host origin in Mode L. Its own workspace, people and device, so nothing earlier in the phase matters.
  {
    const vc = await import(pathToFileURL(path.join(ROOT, "lib/v2/value-core.mts")).href);
    // -- the plain rules (lib/v2/value-core.mts), as v1's test-funnel.mjs checked them --
    check("value rules: an https URL or a mailto: with one address and only a subject may be the follow-up link", vc.loiUrlOk("https://example.com/loi") && vc.loiUrlOk("mailto:founder@example.com?subject=LOI") && vc.safeFollowUpUrl("https://loi.example.org:443/x") === "https://loi.example.org/x");
    const badLoi = ["http://example.com/loi", "javascript:alert(1)", "data:text/html,x", "https://u:p@example.com/", "https://user@example.com/loi", "https://example.com:8443/loi", "mailto:a@b.co,c@d.co", "mailto:nobody", "mailto:a@b.co?bcc=x@y.co", "mailto:a@b.co?body=hi", "mailto:a@b.co?subject=LOI&cc=x@y.co", "mailto:%E0%A4%A@example.com", ""];
    let threw = "";
    for (const u of badLoi)
      try {
        if (vc.loiUrlOk(u)) threw += ` allowed:${u}`;
      } catch (e) {
        threw += ` threw:${u}:${e?.name}`;
      }
    check("value rules: http, javascript:, data:, credentials, a non-default port, two addresses, a bad address, bcc/cc/body and a malformed percent-escape are hidden, and the check never throws", threw === "", threw);
    check(
      "value rules: the follow-up link is ALIGN_FOLLOW_UP_URL when safe (hidden, with a startup warning, when not); unset, hosted defaults to <public origin>/app/request-access?interest=evaluate&via=value_card and Mode L shows none",
      vc.followUpUrl({}) === null &&
        vc.followUpUrl({ HOSTED: "1", ALIGN_PUBLIC_ORIGIN: "https://align.test" }) === "https://align.test/app/request-access?interest=evaluate&via=value_card" &&
        vc.followUpUrl({ ALIGN_FOLLOW_UP_URL: "mailto:hi@example.com?subject=Align" }) === "mailto:hi@example.com?subject=Align" &&
        vc.followUpUrl({ HOSTED: "1", ALIGN_PUBLIC_ORIGIN: "https://align.test", ALIGN_FOLLOW_UP_URL: "javascript:alert(1)" }) === null &&
        /ALIGN_FOLLOW_UP_URL/.test(vc.followUpProblem({ ALIGN_FOLLOW_UP_URL: "http://x.example" }) ?? "") &&
        vc.followUpProblem({ ALIGN_FOLLOW_UP_URL: "https://x.example/f" }) === null,
      "",
    );
    check(
      "value rules: measured spans read 45 seconds, 14 minutes, 2 hours 5 minutes, 3 days 4 hours; a negative span is empty; the note loses control, bidi and zero-width characters; the five answers in order",
      vc.spanWords(45_000) === "45 seconds" && vc.spanWords(14 * 60_000 + 10_000) === "14 minutes" && vc.spanWords(125 * 60_000) === "2 hours 5 minutes" && vc.spanWords((76 * 60) * 60_000) === "3 days 4 hours" && vc.spanWords(-1) === "" &&
        vc.cleanValueText(" a\u0000b‮c​d \n\t e\u0085؜ ") === "abcd e" && vc.ESTIMATE_WORDS.map((e) => e.id).join() === "same_day,two_to_three_days,about_a_week,longer,would_not_be_decided",
      JSON.stringify(vc.cleanValueText(" a\u0000b‮c​d \n\t e\u0085؜ ")),
    );

    // -- a workspace: owner V1, requester V2, team lead V3 (owns the goal), viewer V4, member V5 outside the team, V6 --
    const Vs = [];
    for (const [who, name] of [["V1", "Vera One"], ["V2", "Vic Two"], ["V3", "Val Three"], ["V4", "Vin Four"], ["V5", "Vee Five"], ["V6", "Vik Six"], ["V7", "Vo Outside"]]) Vs.push(await signUp(who, name, `${who.toLowerCase()}@value.test`));
    const [V1, V2, V3, V4, V5, V6, V7] = Vs;
    const W = (await call("V1", "POST", "/api/v2/workspaces", { cookie: V1.cookie, body: { name: "Value WS" } })).json?.id;
    for (const [u, role] of [[V2, "member"], [V3, "member"], [V4, "viewer"], [V5, "member"], [V6, "member"]]) {
      const iv = await call("V1", "POST", `/api/v2/workspaces/${W}/invites`, { cookie: V1.cookie, body: { email: u.email, role } });
      await call(u.who, "POST", `/api/v2/invites/${iv.json?.token}/accept`, { cookie: u.cookie, body: {} });
    }
    const TV = (await call("V1", "POST", `/api/v2/workspaces/${W}/teams`, { cookie: V1.cookie, body: { name: "Value team" } })).json?.id;
    await call("V1", "POST", `/api/v2/workspaces/${W}/teams/${TV}/members`, { cookie: V1.cookie, body: { user_id: V3.id, role: "lead" } });
    const goalIn = (u, body) => call(u.who, "POST", `/api/v2/workspaces/${W}/goals`, { cookie: u.cookie, body });
    const GPar = (await goalIn(V1, { title: "Win regulated customers", level: "company" })).json;
    const GV = (await goalIn(V3, { title: "Pass the pen test", visibility: "workspace", team_id: TV, measures: [{ text: "Open findings", target: "0" }] })).json;
    const GTeam = (await goalIn(V3, { title: "Rotate keys", visibility: "team", team_id: TV })).json;
    const GDep = (await goalIn(V5, { title: "Launch in the EU", visibility: "workspace", depends_on: [GV.id] })).json;
    const alV = await call("V3", "POST", `/api/v2/workspaces/${W}/alignments`, { cookie: V3.cookie, body: { target_goal_id: GPar.id, source_goal_id: GV.id, choice: "contribution", session_keys: [] } });
    const alOk = await call("V1", "POST", `/api/v2/workspaces/${W}/alignments/${alV.json?.id}/approve`, { cookie: V1.cookie, body: { revision: 1 } });
    // V3's device (written straight in: the pairing limit is spent by now), a session bound to the goal.
    const DV = { ...insertDevice(V3.id, "Val's laptop"), who: "V3", secret: randomBytes(32) };
    withDb((d) => d.prepare("INSERT INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)").run(DV.id, W));
    const SV = sessionKey(DV, W, "claude-code", "value-session");
    const svPut = await call("V3", "PUT", `/api/v2/workspaces/${W}/sessions/${SV}`, { bearer: DV.access, body: { harness: "claude-code", repo_key: repoKey(DV, W, "/src/v"), repo_alias: "v-repo", started_at: new Date(Date.now() - 3600_000).toISOString(), title: "value session" } });
    const svBind = await call("V3", "POST", `/api/v2/workspaces/${W}/sessions/${SV}/epochs`, { bearer: DV.access, body: { epoch_id: epochId(), goal_id: GV.id, starts_at: new Date().toISOString(), root_turn: null, cause: "manual" } });
    check("value setup: a workspace, a team, four goals, an approved contribution and a session bound to the goal", !!W && !!TV && [GPar, GV, GTeam, GDep].every((g) => /^g_/.test(g?.id)) && alOk.json?.state === "approved" && svPut.status === 200 && svBind.status === 200, `${alV.text} ${alOk.text} ${svPut.text} ${svBind.text}`);

    const crBaseV = (g) => `/api/v2/workspaces/${W}/goals/${g}/change-requests`;
    const valuePath = (g, id) => `${crBaseV(g)}/${id}/value`;
    const vGet = (u, g, id) => call(u.who, "GET", valuePath(g, id), { cookie: u.cookie });
    const vPost = (u, g, id, body) => call(u.who, "POST", valuePath(g, id), { cookie: u.cookie, body });
    const eventsIn = (name) => withDb((d) => d.prepare("SELECT actor, props FROM v2_events WHERE name = ? AND ws_id = ?").all(name, W));
    const NOTE_CANARY = `NOTE-CANARY-${randomBytes(4).toString("hex")}`;
    const REASON = `Value reason ${randomBytes(4).toString("hex")}`;
    const crP = await call("V2", "POST", crBaseV(GV.id), { cookie: V2.cookie, body: { base_version: 1, changes: { title: "Pass the pen test by June" }, reason: REASON } });
    const pendGet = await vGet(V2, GV.id, crP.json?.id);
    const pendPost = await vPost(V2, GV.id, crP.json?.id, { action: "viewed" });
    check("value: a pending request -> GET and POST 409 not_approved, and no event is recorded", crP.status === 201 && pendGet.status === 409 && pendGet.json?.error === "not_approved" && pendPost.status === 409 && pendPost.json?.error === "not_approved" && eventsIn("value_card_viewed").length === 0, `${crP.status} ${pendGet.text} ${pendPost.text}`);
    const apV = await call("V3", "POST", `${crBaseV(GV.id)}/${crP.json?.id}/approve`, { cookie: V3.cookie, body: { revision: 1 } });
    const v1 = await vGet(V2, GV.id, crP.json?.id);
    const vv = v1.json;
    check(
      "value: an approved request -> the card: the title diff, approver, the version it became and its team, the goal it contributes to and the goal depending on it, delivery {1 session, 0 received, 0 applied}, proposal to approval measured, no first context yet, no follow-up link in Mode L",
      apV.json?.state === "approved" && v1.status === 200 && vv.change_request_id === crP.json?.id && vv.diff?.title?.after === "Pass the pen test by June" && vv.approved_by?.id === V3.id && vv.goal?.version === 2 && vv.goal.team?.id === TV &&
        vv.affected.parents.some((g) => g.id === GPar.id) && vv.affected.dependents.some((g) => g.id === GDep.id) && JSON.stringify(vv.delivery) === JSON.stringify({ sessions: 1, received: 0, applied: 0 }) &&
        /^\d+ seconds?$|minute/.test(vv.measured.proposal_to_decision) && vv.measured.decision_to_first_applied === null && vv.follow_up_url === null && vv.my_report === null && vv.sees_all_reports === true,
      `${apV.status} ${v1.text.slice(0, 600)}`,
    );
    const dirV = withDb((d) => d.prepare("SELECT id FROM v2_directives WHERE ws_id = ? AND goal_id = ? AND kind = 'goal_version' ORDER BY seq DESC LIMIT 1").get(W, GV.id))?.id;
    const rcv = (state) => call("V3", "POST", `/api/v2/directives/${dirV}/receipts`, { bearer: DV.access, body: { session_key: SV, state, at: new Date().toISOString() } });
    await rcv("received");
    const vRecv = (await vGet(V2, GV.id, crP.json?.id)).json;
    await rcv("applied");
    const vAppl = (await vGet(V2, GV.id, crP.json?.id)).json;
    check(
      "value: delivery follows the directive's receipts: {1, 1, 0} after received, {1, 1, 1} after applied, and approval to first agent context is then measured",
      JSON.stringify(vRecv?.delivery) === JSON.stringify({ sessions: 1, received: 1, applied: 0 }) && JSON.stringify(vAppl?.delivery) === JSON.stringify({ sessions: 1, received: 1, applied: 1 }) && typeof vAppl.measured.decision_to_first_applied === "string" && vAppl.measured.decision_to_first_applied.length > 0,
      `${JSON.stringify(vRecv?.delivery)} ${JSON.stringify(vAppl?.delivery)} ${JSON.stringify(vAppl?.measured)}`,
    );

    // -- events and reports --
    const view1 = await vPost(V2, GV.id, crP.json?.id, { action: "viewed" });
    const view2 = await vPost(V2, GV.id, crP.json?.id, { action: "viewed" });
    check("value: viewed twice -> recorded true, then false; one value_card_viewed for the person, with no props", view1.json?.recorded === true && view2.json?.recorded === false && eventsIn("value_card_viewed").length === 1 && eventsIn("value_card_viewed")[0].props === "{}", `${view1.text} ${view2.text}`);
    const badEst = await vPost(V2, GV.id, crP.json?.id, { action: "reported", estimate: "forever" });
    const longNote = await vPost(V2, GV.id, crP.json?.id, { action: "reported", estimate: "same_day", note: "n".repeat(501) });
    const badAction = await vPost(V2, GV.id, crP.json?.id, { action: "approved" });
    const badNote = await vPost(V2, GV.id, crP.json?.id, { action: "reported", estimate: "same_day", note: 7 });
    check("value: an unknown estimate, a note over 500 characters, a note that isn't text, or an unknown action -> 400, and nothing is stored", [badEst, longNote, badAction, badNote].every((r) => r.status === 400) && withDb((d) => d.prepare("SELECT COUNT(*) AS n FROM v2_value_reports WHERE ws_id = ?").get(W).n) === 0, [badEst, longNote, badAction, badNote].map((r) => `${r.status} ${r.json?.error}`).join(" "));
    const rep1 = await vPost(V2, GV.id, crP.json?.id, { action: "reported", estimate: "about_a_week", note: ` Saved us\u0000 a week​ ${NOTE_CANARY} ` });
    const rep2 = await vPost(V2, GV.id, crP.json?.id, { action: "reported", estimate: "same_day", note: `Changed my mind ${NOTE_CANARY}` });
    const reportedEv = eventsIn("value_reported");
    const vrRows = withDb((d) => d.prepare("SELECT * FROM v2_value_reports WHERE ws_id = ?").all(W));
    check(
      "value: a report is saved (note cleaned), records value_reported with the estimate only; reporting again within 7 days edits the same report (recorded false) and the event keeps the first estimate",
      rep1.status === 200 && rep1.json.recorded === true && rep1.json.report?.estimate === "about_a_week" && rep1.json.report.note === `Saved us a week ${NOTE_CANARY}` && rep1.json.report.can_edit === true && /^vr_/.test(rep1.json.report.id) &&
        rep2.json?.recorded === false && rep2.json.report?.estimate === "same_day" && rep2.json.report.id === rep1.json.report.id && vrRows.length === 1 && vrRows[0].person_id === V2.id && vrRows[0].change_request_id === crP.json?.id &&
        reportedEv.length === 1 && reportedEv[0].props === JSON.stringify({ estimate: "about_a_week" }),
      `${rep1.text} ${rep2.text} ${JSON.stringify(reportedEv)}`,
    );
    withDb((d) => d.prepare("UPDATE v2_value_reports SET created_at = ? WHERE id = ?").run(new Date(Date.now() - 8 * 24 * 3600_000).toISOString(), rep1.json?.report?.id));
    const rep3 = await vPost(V2, GV.id, crP.json?.id, { action: "reported", estimate: "longer" });
    const mineOld = (await vGet(V2, GV.id, crP.json?.id)).json?.my_report;
    check("value: 7 days after it was saved a report can't be changed (409 edit_closed, can_edit false) and stays as it was", rep3.status === 409 && rep3.json?.error === "edit_closed" && mineOld?.estimate === "same_day" && mineOld.can_edit === false, `${rep3.text} ${JSON.stringify(mineOld)}`);
    const fu = await vPost(V2, GV.id, crP.json?.id, { action: "follow_up" });
    const fu2 = await vPost(V2, GV.id, crP.json?.id, { action: "follow_up" });
    check("value: follow_up -> follow_up_clicked recorded once per person", fu.json?.recorded === true && fu2.json?.recorded === false && eventsIn("follow_up_clicked").length === 1, `${fu.text} ${fu2.text}`);
    const vView = await vGet(V4, GV.id, crP.json?.id);
    const vViewed = await vPost(V4, GV.id, crP.json?.id, { action: "viewed" });
    const vRep = await vPost(V4, GV.id, crP.json?.id, { action: "reported", estimate: "longer", note: "From a viewer" });
    check("value: a viewer who reads the request sees the card, records viewed and may report (their own)", vView.status === 200 && vViewed.json?.recorded === true && vRep.json?.recorded === true && eventsIn("value_card_viewed").length === 2, `${vView.status} ${vViewed.text} ${vRep.text}`);
    const seeV5 = (await vGet(V5, GV.id, crP.json?.id)).json;
    const seeV1 = (await vGet(V1, GV.id, crP.json?.id)).json;
    const seeV3 = (await vGet(V3, GV.id, crP.json?.id)).json;
    const seeV4 = (await vGet(V4, GV.id, crP.json?.id)).json;
    const people = (v) => (v?.reports ?? []).map((r) => r.person.id).sort().join();
    check(
      "value: every report is shown to the requester, the approver and a workspace owner; a reader outside them (a member, the viewer) sees only their own",
      people((await vGet(V2, GV.id, crP.json?.id)).json) === [V2.id, V4.id].sort().join() && people(seeV3) === [V2.id, V4.id].sort().join() && people(seeV1) === [V2.id, V4.id].sort().join() && seeV1.sees_all_reports === true &&
        seeV5?.reports?.length === 0 && seeV5.sees_all_reports === false && people(seeV4) === V4.id && seeV4.my_report?.note === "From a viewer",
      `${people(seeV5)} | ${people(seeV4)} | ${people(seeV1)}`,
    );
    // An unreadable request, another goal's path, a non-member.
    const crT = await call("V1", "POST", crBaseV(GTeam.id), { cookie: V1.cookie, body: { base_version: 1, changes: { title: "Rotate keys monthly" }, reason: "team" } });
    await call("V3", "POST", `${crBaseV(GTeam.id)}/${crT.json?.id}/approve`, { cookie: V3.cookie, body: { revision: 1 } });
    const hiddenV = await vGet(V5, GTeam.id, crT.json?.id);
    const hiddenPost = await vPost(V5, GTeam.id, crT.json?.id, { action: "viewed" });
    const wrongGoalV = await vGet(V2, GDep.id, crP.json?.id);
    const outsiderV = await vGet(V7, GV.id, crP.json?.id);
    const crossSiteV = await call("V2", "POST", valuePath(GV.id, crP.json?.id), { cookie: V2.cookie, headers: { origin: "http://evil.example" }, body: { action: "viewed" } });
    check("value: a request on a goal the person can't read, another goal's path or a non-member -> 404; a cross-site POST -> 403", hiddenV.status === 404 && hiddenPost.status === 404 && wrongGoalV.status === 404 && outsiderV.status === 404 && crossSiteV.status === 403, `${hiddenV.status} ${hiddenPost.status} ${wrongGoalV.status} ${outsiderV.status} ${crossSiteV.status}`);
    const eventRows = JSON.stringify(withDb((d) => d.prepare("SELECT * FROM v2_events WHERE ws_id = ?").all(W)));
    check("value: no event row holds the note, the reason, a goal title, a change request id or a person's id", !eventRows.includes(NOTE_CANARY) && !eventRows.includes("From a viewer") && !eventRows.includes(REASON) && !eventRows.includes("Pass the pen test") && !eventRows.includes(crP.json?.id) && !Vs.some((u) => eventRows.includes(u.id)), eventRows.slice(0, 300));
    // Account deletion: the person's events lose their actor, their report no longer names them, and another person may
    // still report.
    const v6rep = await vPost(V6, GV.id, crP.json?.id, { action: "reported", estimate: "two_to_three_days" });
    const v6del = await call("V6", "DELETE", "/api/v2/me", { cookie: V6.cookie, headers: { origin: BASE }, body: { email: V6.email } });
    const after6 = withDb((d) => ({
      named: d.prepare("SELECT COUNT(*) AS n FROM v2_value_reports WHERE person_id = ?").get(V6.id).n,
      reports: d.prepare("SELECT COUNT(*) AS n FROM v2_value_reports WHERE ws_id = ?").get(W).n,
      nullActor: d.prepare("SELECT COUNT(*) AS n FROM v2_events WHERE ws_id = ? AND name = 'value_reported' AND actor IS NULL").get(W).n,
    }));
    const v5rep = await vPost(V5, GV.id, crP.json?.id, { action: "reported", estimate: "two_to_three_days" });
    check(
      "value: account deletion clears the person's actor on their value event and no value report names them (kept, pseudonymised); another person then reports the same estimate and it is recorded",
      v6rep.json?.recorded === true && (v6del.status === 200 || v6del.status === 204) && after6.named === 0 && after6.reports === 3 && after6.nullActor === 1 && v5rep.json?.recorded === true && eventsIn("value_reported").length === 4,
      `${v6rep.text} ${v6del.status} ${v6del.text} ${JSON.stringify(after6)} ${v5rep.text}`,
    );

    // -- access requests from the card: via value_card, the page preselects evaluate --
    const arCard = await call("anon", "POST", "/api/v2/access-requests", { headers: { origin: BASE }, body: { email: "card@value.test", name: "Card Person", use_case: "Evaluate it", interest: "evaluate", via: "value_card" } });
    const arForm = await call("anon", "POST", "/api/v2/access-requests", { headers: { origin: BASE }, body: { email: "form@value.test", name: "Form Person", use_case: "Try it", interest: "try" } });
    const arBad = await call("anon", "POST", "/api/v2/access-requests", { headers: { origin: BASE }, body: { email: "bad@value.test", name: "Bad Via", use_case: "x", interest: "try", via: "email" } });
    const arEvents = withDb((d) => d.prepare("SELECT props FROM v2_events WHERE name = 'access_requested' ORDER BY at").all()).map((r) => r.props);
    check(
      "access requests: via value_card is kept on access_requested (with the interest), the default is via form, and any other via -> 400",
      arCard.status === 201 && arForm.status === 201 && arBad.status === 400 && arEvents.includes(JSON.stringify({ interest: "evaluate", via: "value_card" })) && arEvents.includes(JSON.stringify({ interest: "try", via: "form" })),
      `${arCard.status} ${arForm.status} ${arBad.status} ${JSON.stringify(arEvents)}`,
    );
    const raEval = await call("anon", "GET", "/app/request-access?interest=evaluate&via=value_card");
    const raPlain = await call("anon", "GET", "/app/request-access?interest=nonsense");
    const checkedOf = (html) => (html.match(/<input[^>]*name="interest"[^>]*>/g) ?? []).filter((t) => /\bchecked=""/.test(t)).map((t) => /value="(\w+)"/.exec(t)?.[1]).join();
    check("request access page: ?interest=evaluate preselects Evaluate; any other value preselects Try", raEval.status === 200 && checkedOf(raEval.text) === "evaluate" && checkedOf(raPlain.text) === "try", `${checkedOf(raEval.text)} ${checkedOf(raPlain.text)} ${(raEval.text.match(/<input[^>]*name="interest"[^>]*>/g) ?? []).join(" ")}`);

    // -- the operator report's Decision value section --
    const repV = admin(["report", "--json"], opOn);
    let rv = null;
    try {
      rv = JSON.parse(repV.out).value;
    } catch {}
    const sampleWs = withDb((d) => d.prepare("SELECT ws_id FROM v2_events WHERE name = 'workspace_created' AND json_extract(props, '$.kind') = 'sample'").all().map((r) => r.ws_id));
    const evCount = (name, extra = "") => withDb((d) => d.prepare(`SELECT COUNT(*) AS n FROM v2_events WHERE name = ? AND ws_id IS NOT NULL AND ws_id NOT IN (${sampleWs.map(() => "?").join(",") || "''"}) ${extra}`).get(name, ...sampleWs).n);
    const repText = admin(["report"], opOn).out;
    check(
      "report: the value section matches the events (viewed people and workspaces, reported by estimate, follow-up clicks, access from the card by interest, first ask and first limit) and counts the workspace with an approved request; the text table reads Decision value",
      repV.status === 0 && rv && rv.viewed.people === evCount("value_card_viewed") && rv.viewed.workspaces >= 1 && rv.reported.people === evCount("value_reported") && rv.reported.by_estimate.about_a_week >= 1 && rv.reported.by_estimate.two_to_three_days >= 2 &&
        rv.follow_up_clicked === evCount("follow_up_clicked") && rv.access_from_value_card.evaluate === 1 && rv.access_from_value_card.try === 0 && rv.first_ask === evCount("first_ask") && rv.first_limit === evCount("first_limit") && rv.workspaces_with_approved_request >= 1 &&
        repText.includes("Decision value") && !repText.includes("@") && !repText.includes(NOTE_CANARY),
      `${repV.status} ${repV.err} ${JSON.stringify(rv)}`,
    );

    // -- strict Host (Mode L): a Host with more than a port passes the loopback-name edge, and gives no usable origin --
    const hostOk = await rawGet(`/api/v2/workspaces/${W}/apps`, { host: `127.0.0.1:${PORT}`, cookie: V1.cookie });
    const hostBad = await rawGet(`/api/v2/workspaces/${W}/apps`, { host: `127.0.0.1:${PORT};touch\${IFS}x`, cookie: V1.cookie });
    const BAD_HOST = `127.0.0.1:${PORT};touch\${IFS}x`;
    const metaBad = await rawGet("/.well-known/oauth-authorization-server", { host: BAD_HOST });
    const prmBad = await rawGet("/.well-known/oauth-protected-resource/api/mcp", { host: BAD_HOST });
    const mcpBad = await new Promise((resolve) => {
      const r = http.request({ host: "127.0.0.1", port: PORT, method: "POST", path: "/api/mcp", headers: { host: BAD_HOST, "content-type": "application/json", accept: "application/json, text/event-stream" } }, (res) => {
        res.resume();
        resolve({ status: res.statusCode, challenge: res.headers["www-authenticate"] ?? "" });
      });
      r.on("error", () => resolve({ status: 0, challenge: "" }));
      r.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    });
    let issuerBad = null;
    let resourceBad = null;
    try {
      issuerBad = JSON.parse(metaBad.text).issuer;
      resourceBad = JSON.parse(prmBad.text).resource;
    } catch {}
    check(
      "strict Host (Mode L): Host 127.0.0.1:<port>;touch${IFS}x passes the loopback-name edge, but every origin from it is http://invalid.invalid (the OAuth issuer, the protected resource, the MCP 401 challenge) and the Apps route makes no URL from it (sign-in itself refuses that Host); Host 127.0.0.1:<port> gives the real URL",
      JSON.parse(hostOk.text || "{}").url === `http://127.0.0.1:${PORT}/api/mcp` && metaBad.status === 200 && issuerBad === "http://invalid.invalid" && resourceBad === "http://invalid.invalid/api/mcp" &&
        mcpBad.status === 401 && mcpBad.challenge.includes("http://invalid.invalid/.well-known/oauth-protected-resource/api/mcp") && !hostBad.text.includes("touch") && !metaBad.text.includes("touch") && !mcpBad.challenge.includes("touch"),
      `${hostOk.status} ${hostOk.text.slice(0, 120)} | ${hostBad.status} ${hostBad.text.slice(0, 200)} | ${metaBad.text.slice(0, 120)} | ${prmBad.text.slice(0, 120)} | ${JSON.stringify(mcpBad)}`,
    );

    // -- the web UI (Chrome): the card on the goal page, viewed only once at least half of it is on screen; the Apps
    //    tab's terminal lines --
    if (existsSync(CHROME)) {
      const { default: puppeteer } = await import("puppeteer-core");
      const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setViewport({ width: 1000, height: 420 });
        const [name, ...v] = V1.cookie.split("; ").find((c) => c.startsWith("align_v2.session_token=")).split("=");
        await page.setCookie({ name, value: v.join("="), url: BASE });
        const before = eventsIn("value_card_viewed").length;
        await page.goto(`${BASE}/app/w/${W}/goals/${GV.id}`, { waitUntil: "networkidle0" });
        await page.waitForSelector(`[data-value-card="${crP.json?.id}"]`, { timeout: 15000 });
        const card = await page.$eval(`[data-value-card="${crP.json?.id}"]`, (el) => ({ top: el.getBoundingClientRect().top, vh: window.innerHeight, text: el.innerText }));
        await sleep(1500);
        const belowFold = eventsIn("value_card_viewed").length;
        await page.$eval(`[data-value-card="${crP.json?.id}"]`, (el) => el.scrollIntoView({ block: "start" }));
        let seenAfter = belowFold;
        for (let i = 0; i < 30 && seenAfter === belowFold; i++) {
          await sleep(200);
          seenAfter = eventsIn("value_card_viewed").length;
        }
        check(
          "ui (Chrome): an approved request's card shows the accepted change, the approver, 1 of 1 shared session with the new version in context, the measured spans and the reports of others; below the fold it records nothing, scrolled into view it records value_card_viewed once",
          card.top > card.vh && /What this decision gave you/i.test(card.text) && /Who approved/i.test(card.text) && /1 of 1 shared session has it in context/.test(card.text) && /Proposal to approval/.test(card.text) && /What others said/i.test(card.text) && /Vic Two/.test(card.text) &&
            belowFold === before && seenAfter === before + 1 && errors.length === 0,
          `${JSON.stringify({ top: card.top, vh: card.vh, before, belowFold, seenAfter })} ${card.text.slice(0, 300)} ${errors.join(" | ")}`,
        );
        await page.setViewport({ width: 1000, height: 900 });
        await page.goto(`${BASE}/app/w/${W}/apps`, { waitUntil: "networkidle0" });
        await page.waitForFunction(() => document.body.innerText.includes("claude mcp add"), { timeout: 15000 });
        const lines = await page.$$eval("[data-paste-line] code", (els) => els.map((e) => e.textContent));
        check(
          "ui (Chrome): the Apps tab shows the Claude Code and Codex lines, single-quoted, each with Copy, and the sh/bash/zsh note",
          lines[0] === `claude mcp add --transport http --scope user align 'http://127.0.0.1:${PORT}/api/mcp'; claude mcp login align` && lines[1] === `codex mcp add align --url 'http://127.0.0.1:${PORT}/api/mcp'` && (await page.evaluate(() => document.body.innerText.includes("sh, bash or zsh"))) && errors.length === 0,
          `${JSON.stringify(lines)} ${errors.join(" | ")}`,
        );
      } catch (e) {
        check("ui (Chrome) value card run", false, e?.stack ?? e);
      } finally {
        await browser.close();
      }
    } else check("ui (Chrome) available for the value card", false, `no Chrome at ${CHROME}`);
  }
  // ==== end port:value ====

  // -- the private-goal canary never reached anyone but its owner --
  const leaks = seen.filter((s) => s.who !== "U2" && s.text.includes(CANARY));
  const ownerSaw = seen.some((s) => s.who === "U2" && s.text.includes(CANARY));
  check(`canary: the private goal's text appears in none of ${seen.filter((s) => s.who !== "U2").length} responses to anyone but its owner (workspace owner included); its owner sees it`, leaks.length === 0 && ownerSaw, leaks.map((l) => `${l.who} ${l.p}`).join(" | "));
  await stopServer();
  oauthStub.close();

  // ======== phase retention: account deletion, workspace soft delete and restore, and the retention job ========
  // Mode L with the test IdP on a fresh data directory. The job runs as the operator runs it, node scripts/retention.mjs
  // against the live database, with ALIGN_TEST_NOW (honoured only with ALIGN_TEST_IDP=1) as its clock.
  const retDir = path.join(tmpRoot, "retention");
  await mustStart({ ALIGN_DATA_DIR: retDir, ALIGN_TEST_IDP: "1" });
  dbFile = path.join(retDir, "v2", "align.sqlite");
  {
    const DAY = 24 * 3600 * 1000;
    const later = (ms) => new Date(Date.now() + ms).toISOString();
    const monthsLater = (m, days = 0) => {
      const d = new Date(Date.now() + days * DAY);
      d.setUTCMonth(d.getUTCMonth() + m);
      return d.toISOString();
    };
    const scriptEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SETTING.test(k)));
    const retention = (now, { dryRun = false, testIdp = true } = {}) => {
      const r = spawnSync("node", ["scripts/retention.mjs", ...(dryRun ? ["--dry-run"] : [])], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...scriptEnv, ALIGN_DATA_DIR: retDir, ...(testIdp ? { ALIGN_TEST_IDP: "1" } : {}), ...(now ? { ALIGN_TEST_NOW: now } : {}) },
      });
      let counts = null;
      try {
        counts = JSON.parse(r.stdout.trim().split("\n").pop());
      } catch {}
      return { status: r.status, out: `${r.stdout}${r.stderr}`.slice(-600), counts: counts ?? {} };
    };
    const signIn = async (u) => {
      const r = await call(u.who, "POST", "/api/v2/auth/sign-in/email", { headers: { origin: BASE }, body: { email: u.email, password: `pw-${u.who}-123456` } });
      u.cookie = cookieOf(r.setCookies);
      return r.status;
    };
    const ws = (u, method, w, p = "", body) => call(u.who, method, `/api/v2/workspaces/${w}${p}`, { cookie: u.cookie, ...(body ? { body } : {}) });
    const newWs = async (u, name) => (await call(u.who, "POST", "/api/v2/workspaces", { cookie: u.cookie, body: { name } })).json.id;
    const join = async (owner, w, u, role = "member") => {
      const i = await ws(owner, "POST", w, "/invites", { email: u.email, role });
      return call(u.who, "POST", `/api/v2/invites/${i.json.token}/accept`, { cookie: u.cookie, body: {} });
    };
    const goal = async (u, w, title) => (await ws(u, "POST", w, "/goals", { title, visibility: "workspace" })).json;
    const share = async (dev, w, native, goalId, n) => {
      const key = sessionKey(dev, w, "claude-code", native);
      const start = new Date(Date.now() - 3600 * 1000).toISOString();
      await call(dev.who, "PUT", `/api/v2/workspaces/${w}/sessions/${key}`, { bearer: dev.access, body: { harness: "claude-code", repo_key: repoKey(dev, w, "/src/r"), started_at: start, title: null } });
      const ep = epochId();
      await call(dev.who, "POST", `/api/v2/workspaces/${w}/sessions/${key}/epochs`, { bearer: dev.access, body: { epoch_id: ep, goal_id: goalId, starts_at: start, root_turn: null, cause: "manual" } });
      const up = await call(dev.who, "POST", `/api/v2/workspaces/${w}/sessions/${key}/usage`, { bearer: dev.access, body: { rows: Array.from({ length: n }, (_, i) => usageRow(dev, `${native}-${i}`, ep)) } });
      return { key, accepted: up.json?.accepted };
    };
    /** Rows in every table (Better Auth's included) holding `needle` in any text column; `wsOnly` limits to one workspace's rows. */
    const mentions = (needle, wsOnly = null) =>
      withDb((d) => {
        const out = {};
        for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
          const cols = d.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name);
          if (wsOnly && !cols.includes("ws_id")) continue;
          const rows = wsOnly ? d.prepare(`SELECT * FROM "${name}" WHERE ws_id = ?`).all(wsOnly) : d.prepare(`SELECT * FROM "${name}"`).all();
          const n = rows.filter((row) => cols.some((c) => typeof row[c] === "string" && row[c].toLowerCase().includes(needle.toLowerCase()))).length;
          if (n) out[name] = n;
        }
        return out;
      });
    const q = (sql, ...a) => withDb((d) => d.prepare(sql).all(...a));
    const q1 = (sql, ...a) => withDb((d) => d.prepare(sql).get(...a));

    const Rs = {};
    for (const [who, name] of [
      ["R1", "Rita One"],
      ["R2", "Rob Two"],
      ["R3", "Rae Three"],
      ["R4", "Ron Four"],
      ["R5", "Rex Five"],
      ["R6", "Ria Six"],
    ])
      Rs[who] = await signUp(who, name, `${who.toLowerCase()}@example.test`);
    const { R1: r1, R2: r2, R3: r3, R4: r4, R5: r5, R6: r6 } = Rs;
    const W1 = await newWs(r1, "Retention A");
    for (const u of [r2, r3, r5]) await join(r1, W1, u);
    const D2 = await pairDevice("R2", r2, [W1]);
    const D3 = await pairDevice("R3", r3, [W1]);
    const D5 = await pairDevice("R5", r5, [W1]);
    const G1 = await goal(r1, W1, "Rita's goal");
    const G2 = await goal(r2, W1, "Rob's goal");
    const G3 = await goal(r3, W1, "Rae's goal");
    const G5 = await goal(r5, W1, "Rex's goal");
    const S2 = await share(D2, W1, "r2", G2.id, 2);
    const S3 = await share(D3, W1, "r3", G3.id, 3);
    const S5 = await share(D5, W1, "r5", G5.id, 1);
    const act3 = await call("R3", "POST", `/api/v2/workspaces/${W1}/activity`, { bearer: D3.access, body: { items: [{ session_key: S3.key, kind: "edit", at: new Date().toISOString(), repo_id: "f".repeat(32), path_hash: "e".repeat(32) }] } });
    const cr = await ws(r2, "POST", W1, `/goals/${G1.id}/change-requests`, { base_version: 1, changes: { title: "Rita's goal, sharper" }, reason: "clearer" });
    const W4 = await newWs(r4, "Solo");
    // Rae also has a workspace of her own, so her events there show that only W1's lose her actor hash later.
    const W3x = await newWs(r3, "Rae's own");
    const G4 = await goal(r4, W4, "Ron's goal");
    const spend0 = (await ws(r1, "GET", W1, "/spend?by=goal")).json;
    check(
      "retention setup: a workspace with three members' goals, shared sessions with usage (6 requests) and a change request; a one-person workspace",
      G1?.id && G2?.id && G3?.id && G5?.id && G4?.id && S2.accepted === 2 && S3.accepted === 3 && S5.accepted === 1 && cr.status === 201 && spend0?.total?.requests === 6,
      `${S2.accepted} ${S3.accepted} ${S5.accepted} ${cr.status} ${cr.text} ${spend0?.total?.requests}`,
    );

    // -- account deletion --
    const lastOwner = await call("R1", "DELETE", "/api/v2/me", { cookie: r1.cookie, body: { email: r1.email } });
    check(
      "account deletion: the only owner of a workspace with other members -> 409 last_owner naming it, and nothing changes",
      lastOwner.status === 409 && lastOwner.json?.error === "last_owner" && lastOwner.json.message.includes("Retention A") && !!q1("SELECT 1 AS x FROM ba_user WHERE id = ?", r1.id),
      lastOwner.text,
    );
    ageSession(r4.cookie, 20);
    const stale4 = await call("R4", "DELETE", "/api/v2/me", { cookie: r4.cookie, body: { email: r4.email } });
    await signIn(r4);
    const wrong4 = await call("R4", "DELETE", "/api/v2/me", { cookie: r4.cookie, body: { email: "someone@example.test" } });
    const cross4 = await call("R4", "DELETE", "/api/v2/me", { cookie: r4.cookie, headers: { origin: "http://evil.example" }, body: { email: r4.email } });
    const bearer4 = await call("R4", "DELETE", "/api/v2/me", { bearer: D2.access, body: { email: r4.email } });
    check(
      "account deletion: a sign-in older than 15 minutes -> 403 reauth_required; a mistyped email -> 400; a cross-site write -> 403; a device token -> 403",
      stale4.status === 403 && stale4.json?.error === "reauth_required" && wrong4.status === 400 && cross4.status === 403 && bearer4.status === 403 && !!q1("SELECT 1 AS x FROM ba_user WHERE id = ?", r4.id),
      `${stale4.text} ${wrong4.text} ${cross4.status} ${bearer4.status}`,
    );
    // Before deleting: they signed out everywhere once (audited with their id), and they have a passkey with a last use
    // (inserted here: the web UI test below registers a real one) and said "Not now" to the passkey prompt.
    const soe4 = await call("R4", "POST", "/api/v2/account/sign-out-everywhere", { cookie: r4.cookie, body: { devices: true, apps: true } });
    await signIn(r4);
    const pk4 = `pk4${randomBytes(8).toString("hex")}`;
    withDb((d) => {
      d.prepare("INSERT INTO ba_passkey (id, name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt) VALUES (?, ?, ?, ?, ?, 0, 'singleDevice', 0, 'internal', ?)").run(pk4, "Ron's key", "cHVibGljLWtleQ", r4.id, `cred-${pk4}`, new Date().toISOString());
      d.prepare("INSERT INTO v2_passkey_use (passkey_id, last_used_at) VALUES (?, ?)").run(pk4, new Date().toISOString());
    });
    const dismiss4 = await call("R4", "DELETE", "/api/v2/account/passkey-prompt", { cookie: r4.cookie });
    // And hosted-access rows naming them: an access request (with its email-keyed rate-limit counter), an unused
    // creation code bound to their email, and a used one they redeemed.
    const ar4 = await call("anon", "POST", "/api/v2/access-requests", { headers: { origin: BASE }, body: { email: r4.email, name: "Ron Four", use_case: "Try it", interest: "try" } });
    const code4 = admin(["codes", "create", "--email", r4.email], { ALIGN_DATA_DIR: retDir });
    withDb((d) =>
      d
        .prepare("INSERT INTO v2_creation_codes (id, code_hash, email, created_at, expires_at, redeemed_at, redeemed_by, ws_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(`cc_used${randomBytes(6).toString("hex")}`, randomBytes(16).toString("hex"), r4.email, new Date().toISOString(), later(DAY), new Date().toISOString(), r4.id, W4),
    );
    const accessKey4 = `access-email:${createHmac("sha256", readFileSync(path.join(retDir, ".secret"), "utf8").trim()).update(`ala.${r4.email}`).digest("base64url")}`;
    const hits4 = () => q1("SELECT COUNT(*) AS n FROM v2_rate_hits WHERE key = ?", accessKey4).n;
    const before4 = { requests: q1("SELECT COUNT(*) AS n FROM v2_access_requests WHERE email = ?", r4.email).n, codes: q1("SELECT COUNT(*) AS n FROM v2_creation_codes WHERE email = ?", r4.email).n, hits: hits4() };
    const pkList4 = (await call("R4", "GET", "/api/v2/account/passkeys", { cookie: r4.cookie })).json;
    const del4 = await call("R4", "DELETE", "/api/v2/me", { cookie: r4.cookie, body: { email: r4.email.toUpperCase() } });
    const me4 = await call("R4", "GET", "/api/v2/me", { cookie: r4.cookie });
    const w4Row = q1("SELECT deleted_at FROM v2_workspaces WHERE id = ?", W4);
    const g4Owner = q1("SELECT owner_id FROM v2_goals WHERE id = ?", G4.id)?.owner_id;
    const r4Left = { ...mentions(r4.email), ...mentions(r4.id) };
    const accountAudit = q("SELECT ws_id, actor_id, object_id FROM v2_audit WHERE action = 'account.deleted'");
    check(
      "account deletion: the email typed in any case -> 204; signed out (401); their one-person workspace is deleted with it (restorable by nobody, purged later); no row anywhere holds their id or email; one audit row with no workspace, actor or email",
      del4.status === 204 && me4.status === 401 && !!w4Row?.deleted_at && g4Owner === "fm_1" && Object.keys(r4Left).length === 0 && accountAudit.length === 1 && accountAudit.every((a) => a.ws_id === null && a.actor_id === null && a.object_id === null),
      `${del4.status} ${del4.text} ${me4.status} ${JSON.stringify(w4Row)} ${g4Owner} ${JSON.stringify(r4Left)} ${JSON.stringify(accountAudit)}`,
    );
    const pkLeft4 = {
      passkeys: q1("SELECT COUNT(*) AS n FROM ba_passkey WHERE userId = ? OR id = ?", r4.id, pk4).n,
      use: q1("SELECT COUNT(*) AS n FROM v2_passkey_use WHERE passkey_id = ?", pk4).n,
      dismissed: q1("SELECT COUNT(*) AS n FROM v2_passkey_prompt_dismissed WHERE user_id = ?", r4.id).n,
      soeAudit: q("SELECT actor_id, object_id FROM v2_audit WHERE action = 'account.signed_out_everywhere'"),
    };
    const access4 = {
      requests: q1("SELECT COUNT(*) AS n FROM v2_access_requests WHERE lower(email) = ?", r4.email).n,
      codes: q("SELECT email, redeemed_by, ws_id FROM v2_creation_codes"),
      hits: hits4(),
    };
    check(
      "account deletion: their access request and its email-keyed rate-limit counter are deleted; an unused creation code bound to their email is deleted; a used one stays as the record of what created a workspace, with no email or redeemer",
      ar4.status === 201 && code4.status === 0 && before4.requests === 1 && before4.codes === 2 && before4.hits === 1 &&
        access4.requests === 0 && access4.hits === 0 && access4.codes.length === 1 && access4.codes[0].email === null && access4.codes[0].redeemed_by === null && access4.codes[0].ws_id === W4,
      `${ar4.status} ${code4.err} ${JSON.stringify(before4)} ${JSON.stringify(access4)}`,
    );
    check(
      "account deletion after signing out everywhere, with a passkey: their passkey, its last use and their \"Not now\" on the passkey prompt are deleted too, and the sign-out-everywhere audit row keeps no actor or object",
      soe4.status === 200 && dismiss4.status === 204 && pkList4?.passkeys?.length === 1 && !!pkList4.passkeys[0].last_used_at && pkList4.prompt === false &&
        pkLeft4.passkeys === 0 && pkLeft4.use === 0 && pkLeft4.dismissed === 0 && pkLeft4.soeAudit.length === 1 && pkLeft4.soeAudit.every((a) => a.actor_id === null && a.object_id === null),
      `${soe4.status} ${soe4.text} ${dismiss4.status} ${JSON.stringify(pkList4)} ${JSON.stringify(pkLeft4)}`,
    );
    // Evidence they added to their change request, from the web and from their device, stays as the former member's.
    const crEv = (body, auth) => call("R2", "POST", `/api/v2/workspaces/${W1}/goals/${G1.id}/change-requests/${cr.json?.id}/evidence`, { ...auth, body });
    const ev2 = [await crEv({ kind: "pr", url: "https://github.com/acme/r/pull/2", label: "Rob's PR" }, { cookie: r2.cookie }), await crEv({ kind: "ci_run", url: "https://ci.example.com/r/2", label: "Rob's CI run" }, { bearer: D2.access })];
    const del2 = await call("R2", "DELETE", "/api/v2/me", { cookie: r2.cookie, body: { email: r2.email } });
    const d2Me = await call("R2", "GET", "/api/v2/me", { bearer: D2.access });
    const g2Seen = (await ws(r1, "GET", W1, `/goals/${G2.id}`)).json?.goal;
    const crSeen = (await ws(r1, "GET", W1, `/goals/${G1.id}/change-requests/${cr.json?.id}`)).json;
    const crReq = (crSeen?.change_request ?? crSeen)?.requester;
    const spend1 = (await ws(r1, "GET", W1, "/spend?by=goal")).json;
    const s2Row = q1("SELECT user_id, device_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W1, S2.key);
    const r2Left = { ...mentions(r2.email), ...mentions(r2.id) };
    const ev2Rows = q("SELECT added_by, source FROM v2_change_request_evidence WHERE change_request_id = ?", cr.json?.id);
    check(
      "account deletion: evidence links they added (from the web and from their device) stay on the change request, added by \"Former member #1\"",
      ev2.every((r) => r.status === 201) && ev2Rows.length === 2 && ev2Rows.every((e) => e.added_by === "fm_1") && ev2Rows.map((e) => e.source).sort().join() === "agent,person",
      `${ev2.map((r) => `${r.status} ${r.text.slice(0, 120)}`).join(" | ")} ${JSON.stringify(ev2Rows)}`,
    );
    const w1Audit = (await ws(r1, "GET", W1, "/audit")).json?.audit ?? [];
    check(
      "account deletion: a member's goals, change requests and session spend stay for the others as \"Former member #1\" (no device on the session); their device is unpaired; no row anywhere holds their id or email; the workspace audit shows member.account_deleted by the former member",
      del2.status === 204 && d2Me.status === 401 && g2Seen?.owner?.id === "fm_1" && g2Seen.owner.name === "Former member #1" && crReq?.name === "Former member #1" && spend1?.total?.requests === 6 && s2Row?.user_id === "fm_1" && s2Row.device_id === null && Object.keys(r2Left).length === 0 && w1Audit.some((a) => a.action === "member.account_deleted" && a.actor?.name === "Former member #1"),
      `${del2.status} ${d2Me.status} ${JSON.stringify(g2Seen?.owner)} ${JSON.stringify(crReq)} ${spend1?.total?.requests} ${JSON.stringify(s2Row)} ${JSON.stringify(r2Left)}`,
    );

    // -- removal: "delete their sessions now", and the 30-day former-member rule --
    const rm5 = await call("R1", "DELETE", `/api/v2/workspaces/${W1}/members/${r5.id}?delete_sessions=1`, { cookie: r1.cookie });
    const s5Left = q1("SELECT COUNT(*) AS n FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W1, S5.key).n;
    const spend2 = (await ws(r1, "GET", W1, "/spend?by=goal")).json;
    const rm3 = await call("R1", "DELETE", `/api/v2/workspaces/${W1}/members/${r3.id}`, { cookie: r1.cookie });
    const g3Now = (await ws(r1, "GET", W1, `/goals/${G3.id}`)).json?.goal;
    check(
      "removal: ?delete_sessions=1 deletes the person's shared sessions in the workspace at once (spend drops by theirs); without it their sessions and goals stay under their name",
      rm5.status === 204 && s5Left === 0 && spend2?.total?.requests === 5 && invariantHolds(spend2) && rm3.status === 204 && g3Now?.owner?.name === "Rae Three" && q1("SELECT user_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W1, S3.key)?.user_id === r3.id,
      `${rm5.status} ${s5Left} ${spend2?.total?.requests} ${rm3.status} ${JSON.stringify(g3Now?.owner)}`,
    );

    // -- workspace soft delete and restore --
    const W6 = await newWs(r1, "Retention B");
    await join(r1, W6, r6);
    const D1 = await pairDevice("R1", r1, [W1, W6]);
    // A change request with evidence in it, so the purge 31 days on has evidence to erase.
    const G6 = await goal(r1, W6, "Rita's B goal");
    const cr6 = await ws(r6, "POST", W6, `/goals/${G6.id}/change-requests`, { base_version: 1, changes: { title: "Rita's B goal, sharper" }, reason: "clearer" });
    const ev6 = await ws(r6, "POST", W6, `/goals/${G6.id}/change-requests/${cr6.json?.id}/evidence`, { kind: "doc", url: "https://docs.example.com/b", label: "Design note" });
    const del6 = await ws(r1, "DELETE", W6);
    const r6Get = await ws(r6, "GET", W6);
    const r1Get = await ws(r1, "GET", W6);
    const d1Get = await call("R1", "GET", `/api/v2/workspaces/${W6}/goals`, { bearer: D1.access });
    const d1Me = await call("R1", "GET", "/api/v2/me", { bearer: D1.access });
    const r1List = (await call("R1", "GET", "/api/v2/workspaces", { cookie: r1.cookie })).json;
    const r6List = (await call("R6", "GET", "/api/v2/workspaces", { cookie: r6.cookie })).json;
    const listed = r1List?.deleted?.find((w) => w.id === W6);
    check(
      "soft delete: everyone gets 404 at once (owner, member, the owner's device); it leaves every list; its owner sees it under deleted with restore_until 30 days on; a member doesn't",
      del6.status === 204 && r6Get.status === 404 && r1Get.status === 404 && d1Get.status === 404 && !d1Me.json.workspaces.some((w) => w.id === W6) && !r1List.workspaces.some((w) => w.id === W6) && !!listed && Math.abs(Date.parse(listed.restore_until) - Date.parse(listed.deleted_at) - 30 * DAY) < 1000 && listed.name === "Retention B" && r6List.deleted.length === 0,
      `${del6.status} ${r6Get.status} ${r1Get.status} ${d1Get.status} ${JSON.stringify(r1List)} ${JSON.stringify(r6List)}`,
    );
    const r6Restore = await ws(r6, "POST", W6, "/restore", {});
    ageSession(r1.cookie, 20);
    const staleRestore = await ws(r1, "POST", W6, "/restore", {});
    await signIn(r1);
    const restored = await ws(r1, "POST", W6, "/restore", {});
    const again = await ws(r1, "POST", W6, "/restore", {});
    const r6Back = await ws(r6, "GET", W6);
    const d1Back = await call("R1", "GET", `/api/v2/workspaces/${W6}/goals`, { bearer: D1.access });
    const w6Audit = (await ws(r1, "GET", W6, "/audit")).json?.audit ?? [];
    check(
      "restore: a member -> 404; an owner with an old sign-in -> 403 reauth_required; with a fresh one -> 200 {id, name, role}; everyone and the device reach it again; restoring a live workspace -> 409 not_deleted; the audit has workspace.deleted and workspace.restored",
      r6Restore.status === 404 && staleRestore.status === 403 && staleRestore.json?.error === "reauth_required" && restored.status === 200 && restored.json.id === W6 && restored.json.role === "owner" && again.status === 409 && again.json?.error === "not_deleted" && r6Back.status === 200 && d1Back.status === 200 && ["workspace.deleted", "workspace.restored"].every((a) => w6Audit.some((r) => r.action === a)),
      `${r6Restore.status} ${staleRestore.text} ${restored.text} ${again.text} ${r6Back.status} ${d1Back.status}`,
    );
    await ws(r1, "DELETE", W6);

    // -- the job: codes, invites, former members, purge, audit, roll-up --
    await ws(r1, "POST", W1, "/invites", { email: "pending@example.test", role: "member" });
    await sendCode("R1", r1.email);
    const codes = () => q1("SELECT COUNT(*) AS n FROM ba_verification").n;
    const pendingInv = () => q1("SELECT COUNT(*) AS n FROM v2_invites WHERE email = 'pending@example.test'").n;
    const w6Exists = () => !!q1("SELECT 1 AS x FROM v2_workspaces WHERE id = ?", W6);
    const codesBefore = codes();
    // Access requests: one stays pending, one is declined now, one approved (its decision recorded 60 days on).
    for (const who of ["pend", "decl", "appr"]) {
      await call("anon", "POST", "/api/v2/access-requests", { headers: { origin: BASE }, body: { email: `${who}@requests.example.test`, name: who, use_case: "Try it", interest: "try" } });
    }
    const reqId = (who) => q1("SELECT id FROM v2_access_requests WHERE email = ?", `${who}@requests.example.test`)?.id;
    const reqDecided = [admin(["requests", "decline", reqId("decl")], { ALIGN_DATA_DIR: retDir }), admin(["requests", "approve", reqId("appr"), "--print"], { ALIGN_DATA_DIR: retDir })];
    withDb((d) => d.prepare("UPDATE v2_access_requests SET decided_at = ? WHERE email = ?").run(later(60 * DAY), "appr@requests.example.test"));
    const reqsLeft = () => q("SELECT email FROM v2_access_requests WHERE email LIKE '%@requests.example.test' ORDER BY email").map((r) => r.email.split("@")[0]).join();
    const runA = retention(later(13 * DAY));
    check(
      "retention (+13 days): expired email codes, sign-in sessions and activity signals are deleted; an invite 6 days past its expiry stays; a workspace deleted 13 days ago stays restorable; a member removed 13 days ago keeps their name",
      runA.status === 0 && codesBefore > 0 && codes() === 0 && runA.counts.codes_deleted >= 1 && runA.counts.sign_in_sessions_deleted >= 1 && act3.json?.accepted === 1 && runA.counts.activity_deleted === 1 && q1("SELECT COUNT(*) AS n FROM v2_activity").n === 0 && pendingInv() === 1 && w6Exists() && runA.counts.workspaces_purged === 0 && runA.counts.former_members_pseudonymised === 0,
      `${runA.status} ${codesBefore} ${codes()} ${pendingInv()} ${runA.out}`,
    );
    const runB = retention(later(15 * DAY));
    check("retention (+15 days): a pending invite 7 days past its expiry is deleted", runB.status === 0 && runB.counts.invites_deleted === 1 && pendingInv() === 0, runB.out);
    const dry = retention(later(31 * DAY), { dryRun: true });
    check(
      "retention: --dry-run prints what it would do (purge 2 workspaces, pseudonymise 2 former members) and changes nothing",
      dry.status === 0 && dry.counts.dry_run === true && /^Would \(as of /.test(dry.out) && dry.counts.workspaces_purged === 2 && dry.counts.former_members_pseudonymised === 2 && w6Exists() && q1("SELECT user_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W1, S3.key)?.user_id === r3.id,
      dry.out,
    );
    const noIdp = retention(later(31 * DAY), { testIdp: false });
    check(
      "retention: ALIGN_TEST_NOW is ignored without ALIGN_TEST_IDP=1 (the job runs at the real time, so nothing is due)",
      noIdp.status === 0 && Math.abs(Date.parse(noIdp.counts.now) - Date.now()) < 60_000 && noIdp.counts.workspaces_purged === 0 && noIdp.counts.former_members_pseudonymised === 0 && w6Exists(),
      noIdp.out,
    );
    const actor3 = eventActor(readFileSync(path.join(retDir, ".secret"), "utf8").trim(), r3.id);
    const ev3 = (w) => q1("SELECT COUNT(*) AS n FROM v2_events WHERE ws_id = ? AND actor = ?", w, actor3).n;
    const ev3Before = { w1: ev3(W1), own: ev3(W3x), total: q1("SELECT COUNT(*) AS n FROM v2_events").n };
    const runE = retention(later(31 * DAY));
    const ev3After = { w1: ev3(W1), own: ev3(W3x), total: q1("SELECT COUNT(*) AS n FROM v2_events").n };
    check(
      "retention (+31 days): making someone \"Former member #n\" in a workspace clears their actor hash from that workspace's product events (the events stay); their events in a workspace they are still in keep it",
      ev3Before.w1 > 0 && ev3Before.own > 0 && ev3After.w1 === 0 && ev3After.own === ev3Before.own && ev3After.total === ev3Before.total,
      `${JSON.stringify(ev3Before)} ${JSON.stringify(ev3After)}`,
    );
    await signIn(r1);
    const g3Later = (await ws(r1, "GET", W1, `/goals/${G3.id}`)).json?.goal;
    const s3Row = q1("SELECT user_id, device_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W1, S3.key);
    const r3InW1 = { ...mentions(r3.id, W1), ...mentions(r3.email, W1) };
    const w6Left = mentions(W6);
    check(
      "retention (+31 days): workspaces deleted 31 days ago (by their owner, or with an account) are purged (no row anywhere mentions them, change-request evidence included) and can't be restored",
      runE.status === 0 && runE.counts.workspaces_purged === 2 && Object.keys(w6Left).length === 0 && Object.keys(mentions(W4)).length === 0 && (await ws(r1, "POST", W6, "/restore", {})).status === 404 &&
        cr6.status === 201 && ev6.status === 201 && q1("SELECT COUNT(*) AS n FROM v2_change_request_evidence WHERE id = ?", ev6.json?.evidence?.id).n === 0,
      `${runE.out} ${JSON.stringify(w6Left)}`,
    );
    check(
      "retention (+31 days): removed members become \"Former member #n\" in the order they left (numbers stable per workspace); their sessions lose the device; no row of that workspace holds their id or email; their account itself stays",
      runE.counts.former_members_pseudonymised === 2 && g3Later?.owner?.id === "fm_3" && g3Later.owner.name === "Former member #3" && s3Row?.user_id === "fm_3" && s3Row.device_id === null && Object.keys(r3InW1).length === 0 && !!q1("SELECT 1 AS x FROM ba_user WHERE id = ?", r3.id) && q1("SELECT owner_id FROM v2_goals WHERE id = ?", G5.id)?.owner_id === "fm_2",
      `${JSON.stringify(g3Later?.owner)} ${JSON.stringify(s3Row)} ${JSON.stringify(r3InW1)}`,
    );
    const runE2 = retention(later(31 * DAY));
    check("retention: running it again with the same clock changes nothing (idempotent)", runE2.status === 0 && ["workspaces_purged", "sessions_rolled_up", "former_members_pseudonymised", "audit_rows_deleted", "invites_deleted"].every((k) => runE2.counts[k] === 0), runE2.out);
    const auditN = () => q1("SELECT COUNT(*) AS n FROM v2_audit WHERE ws_id = ?", W1).n;
    const runF = retention(monthsLater(11));
    check("retention (+11 months): the audit log and raw session rows are kept", runF.status === 0 && runF.counts.audit_rows_deleted === 0 && runF.counts.sessions_rolled_up === 0 && auditN() > 0, runF.out);
    const runG = retention(monthsLater(12, 2));
    const rawSessions = () => q1("SELECT COUNT(*) AS n FROM v2_sessions WHERE ws_id = ?", W1).n;
    check("retention (1 year + 2 days): audit rows older than a year are deleted; session rows (13 months) are not yet", runG.status === 0 && runG.counts.audit_rows_deleted > 0 && auditN() === 0 && runG.counts.sessions_rolled_up === 0 && rawSessions() === 2, runG.out);
    const reqsAtYear = reqsLeft();
    const runH = retention(monthsLater(13, 2));
    const reqsAt13 = reqsLeft();
    await signIn(r1);
    const spendH = (await ws(r1, "GET", W1, "/spend?by=goal")).json;
    const spendHs = (await ws(r1, "GET", W1, "/spend?by=session")).json;
    const spendLaterFrom = (await ws(r1, "GET", W1, `/spend?by=goal&from=${encodeURIComponent(later(2 * DAY))}`)).json;
    const rollCols = withDb((d) => d.prepare("PRAGMA table_info(v2_spend_rollups)").all().map((c) => c.name));
    const usageLeft = q1("SELECT COUNT(*) AS n FROM v2_usage WHERE ws_id = ?", W1).n;
    check(
      "retention (13 months + 2 days): sessions are rolled up into per-goal, per-day, per-model totals with no person or session, and their raw rows (sessions, epochs, usage) are deleted",
      runH.status === 0 && runH.counts.sessions_rolled_up === 2 && runH.counts.usage_rows_rolled_up === 5 && rawSessions() === 0 && usageLeft === 0 && q1("SELECT COUNT(*) AS n FROM v2_spend_rollups WHERE ws_id = ?", W1).n > 0 && !rollCols.some((c) => /user|session|owner|device/.test(c)),
      `${runH.out} ${rawSessions()} ${usageLeft} ${rollCols}`,
    );
    const g2Row = spendH?.rows?.find((r) => r.goal?.id === G2.id);
    check(
      "spend: rolled-up totals still report by goal (the same totals as before, invariant holds); by=session they are one \"Older sessions (rolled up)\" row; a from after their day leaves them out",
      spendH?.total?.requests === 5 && invariantHolds(spendH) && g2Row?.requests === 2 && g2Row.est_list_usd_micros === 2 * 12_345 && spendHs?.rows?.length === 1 && spendHs.rows[0].kind === "rolled_up" && spendHs.rows[0].label === "Older sessions (rolled up)" && spendHs.rows[0].requests === 5 && invariantHolds(spendHs) && spendLaterFrom?.total?.requests === 0,
      `${JSON.stringify(spendH?.total?.requests)} ${JSON.stringify(spendHs?.rows)} ${spendLaterFrom?.total?.requests}`,
    );
    const runReq = retention(monthsLater(15));
    check(
      "retention: access requests go 13 months after their decision, or after the request while pending: at 1 year + 2 days all 3 stay; at 13 months + 2 days the pending and the declined ones go and the one approved 60 days later stays; it goes by 15 months",
      reqDecided.every((r) => r.status === 0) && reqsAtYear === "appr,decl,pend" && runH.counts.access_requests_deleted === 2 && reqsAt13 === "appr" && runReq.status === 0 && runReq.counts.access_requests_deleted === 1 && reqsLeft() === "",
      `${reqDecided.map((r) => r.err).join(" ")} ${reqsAtYear} ${runH.counts.access_requests_deleted} ${reqsAt13} ${runReq.out}`,
    );
    const runH2 = retention(monthsLater(13, 2));
    await signIn(r1);
    const spendH2 = (await ws(r1, "GET", W1, "/spend?by=goal")).json;
    check("retention: a second roll-up run adds nothing (totals unchanged)", runH2.status === 0 && runH2.counts.sessions_rolled_up === 0 && spendH2?.total?.requests === 5, runH2.out);

    // -- the operator's run reads ALIGN_SESSION_MAX_DAYS as the server does: a 2-day-old session with days left on its
    //    rolling expiry is past a cap of 1 day, not past the default 30 --
    const R9 = await signUp("R9", "Ria Nine", "r9@example.test");
    withDb((d) => d.prepare("UPDATE ba_session SET createdAt = ? WHERE userId = ?").run(new Date(Date.now() - 2 * DAY).toISOString(), R9.id));
    const capRun = (env) => {
      const r = admin(["retention", "run", "--dry-run"], { ALIGN_DATA_DIR: retDir, ...env });
      let c = {};
      try {
        c = JSON.parse(r.out.trim().split("\n").pop());
      } catch {}
      return { status: r.status, out: r.out + r.err, n: c.sign_in_sessions_deleted };
    };
    const capDefault = capRun({});
    const capOne = capRun({ ALIGN_SESSION_MAX_DAYS: "1" });
    check(
      "align-admin retention run --dry-run reads ALIGN_SESSION_MAX_DAYS as the server does: with 1 it would also delete a 2-day-old session the default 30 keeps, and changes nothing",
      capDefault.status === 0 && capOne.status === 0 && capOne.n === capDefault.n + 1 && q1("SELECT COUNT(*) AS n FROM ba_session WHERE userId = ?", R9.id).n === 1,
      `${capDefault.out} | ${capOne.out}`,
    );

    // -- the web UI: restore from /app, the remove panel's checkbox, and deleting an account --
    await signIn(r1);
    const W8 = await newWs(r1, "Retention UI");
    const R7 = await signUp("R7", "Rhea Seven", "r7@example.test");
    await join(r1, W8, R7);
    const D7 = await pairDevice("R7", R7, [W8]);
    const G7 = await goal(R7, W8, "Rhea's goal");
    const S7 = await share(D7, W8, "r7", G7.id, 1);
    await ws(r1, "DELETE", W8);
    const R8 = await signUp("R8", "Rory Eight", "r8@example.test");
    if (existsSync(CHROME)) {
      const { default: puppeteer } = await import("puppeteer-core");
      const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
      const asUser = async (page, u) => {
        await page.deleteCookie(...(await page.cookies(BASE)));
        const [name, ...v] = u.cookie.split("; ").find((c) => c.startsWith("align_v2.session_token=")).split("=");
        await page.setCookie({ name, value: v.join("="), url: BASE });
      };
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("dialog", (d) => void d.accept());
        await asUser(page, r1);
        await page.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
        await page.waitForFunction(() => document.body.innerText.includes("Deleted workspaces") && document.body.innerText.includes("Retention UI"), { timeout: 15000 });
        // Each of restore, removal, workspace deletion and account deletion first with a sign-in older than 15 minutes:
        // Sign in again shows, nothing changes, and it signs out to sign-in with next= back to the page.
        const signInAgainTo = async (u, nextPath) => {
          await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Sign in again")?.click())]);
          const at = new URL(page.url());
          const ok = at.pathname === "/app/sign-in" && at.searchParams.get("next") === nextPath && at.searchParams.get("email") === u.email;
          await signIn(u);
          await asUser(page, u);
          await page.goto(`${BASE}${nextPath}`, { waitUntil: "networkidle0" });
          return ok;
        };
        ageSession(r1.cookie, 20);
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Restore")?.click());
        await page.waitForFunction(() => document.body.innerText.includes("Sign in again to restore a workspace. This needs a sign-in from the last 15 minutes."), { timeout: 15000 });
        const staleRestoreUi = !!q1("SELECT deleted_at FROM v2_workspaces WHERE id = ?", W8)?.deleted_at;
        const restoreBack = await signInAgainTo(r1, "/app");
        check("ui (Chrome): Restore with an old sign-in shows \"Sign in again to restore a workspace.\" and restores nothing; Sign in again signs out to /app/sign-in?next=/app", staleRestoreUi && restoreBack, page.url());
        await page.waitForFunction(() => document.body.innerText.includes("Deleted workspaces") && document.body.innerText.includes("Retention UI"), { timeout: 15000 });
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Restore")?.click());
        await page.waitForFunction((w) => !!document.querySelector(`a[href="/app/w/${w}"]`) && !document.body.innerText.includes("Deleted workspaces"), { timeout: 15000 }, W8);
        check("ui (Chrome): /app lists deleted workspaces with Restore; restoring brings the workspace back into the list", true);
        await page.goto(`${BASE}/app/w/${W8}/people`, { waitUntil: "networkidle0" });
        await page.waitForFunction(() => document.body.innerText.includes("Delete this workspace") && document.body.innerText.includes("Rhea Seven"), { timeout: 15000 });
        ageSession(r1.cookie, 20);
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Remove")?.click());
        await page.waitForFunction(() => document.body.innerText.includes("Also delete their shared sessions in this workspace now"), { timeout: 15000 });
        await page.click('[role="group"] input[type="checkbox"]');
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Remove Rhea Seven")?.click());
        await page.waitForFunction(() => document.body.innerText.includes("Sign in again to remove a member. This needs a sign-in from the last 15 minutes."), { timeout: 15000 });
        const panelStays = await page.evaluate(() => !!document.querySelector('[role="group"] input[type="checkbox"]')?.checked);
        const staleRemoveUi = !!q1("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", W8, R7.id) && q1("SELECT COUNT(*) AS n FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W8, S7.key).n === 1;
        const removeBack = await signInAgainTo(r1, `/app/w/${W8}/people`);
        check("ui (Chrome): the remove panel with an old sign-in shows \"Sign in again to remove a member.\" (the panel stays open, ticked; nobody is removed, no session deleted); Sign in again comes back to People", panelStays && staleRemoveUi && removeBack, page.url());
        await page.waitForFunction(() => document.body.innerText.includes("Delete this workspace") && document.body.innerText.includes("Rhea Seven"), { timeout: 15000 });
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Remove")?.click());
        await page.waitForFunction(() => document.body.innerText.includes("Also delete their shared sessions in this workspace now"), { timeout: 15000 });
        await page.click('[role="group"] input[type="checkbox"]');
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Remove Rhea Seven")?.click());
        await page.waitForFunction(() => !document.body.innerText.includes("Rhea Seven"), { timeout: 15000 });
        const s7Left = q1("SELECT COUNT(*) AS n FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W8, S7.key).n;
        check("ui (Chrome): People's Remove opens a panel with \"Also delete their shared sessions in this workspace now\"; ticked, the member and their sessions go", s7Left === 0 && S7.accepted === 1, `${s7Left}`);
        ageSession(r1.cookie, 20);
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Delete workspace")?.click());
        await page.waitForFunction(() => document.body.innerText.includes("Sign in again to delete this workspace. This needs a sign-in from the last 15 minutes."), { timeout: 15000 });
        const staleDeleteUi = !q1("SELECT deleted_at FROM v2_workspaces WHERE id = ?", W8)?.deleted_at;
        const deleteBack = await signInAgainTo(r1, `/app/w/${W8}/people`);
        check("ui (Chrome): Delete workspace with an old sign-in shows \"Sign in again to delete this workspace.\" and deletes nothing; Sign in again comes back to People", staleDeleteUi && deleteBack, page.url());
        await page.waitForFunction(() => document.body.innerText.includes("Delete this workspace"), { timeout: 15000 });
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Delete workspace")?.click());
        await page.waitForFunction(() => location.pathname === "/app" && document.body.innerText.includes("Deleted workspaces"), { timeout: 15000 });
        check("ui (Chrome): People's Delete workspace (confirmed) deletes it and the workspace shows under Deleted workspaces", !!q1("SELECT deleted_at FROM v2_workspaces WHERE id = ?", W8)?.deleted_at);
        // Account deletion, on localhost (passkeys need a domain name) with a virtual authenticator: R8 adds a passkey,
        // says "Not now" to the prompt, comes back with an old sign-in (Sign in again; the passkey autofill signs in),
        // then deletes the account. Nothing that names them is left, passkey tables included.
        const LB = `http://localhost:${PORT}`;
        const pctx = await browser.createBrowserContext();
        const pk = await pctx.newPage();
        pk.on("pageerror", (e) => errors.push(e.message));
        pk.on("dialog", (d) => void d.accept());
        const cdp = await pk.createCDPSession();
        await cdp.send("WebAuthn.enable");
        await cdp.send("WebAuthn.addVirtualAuthenticator", {
          options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
        });
        const pkText = () => pk.evaluate(() => document.body.innerText);
        const pkClick = (label) => pk.evaluate((l) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === l)?.click(), label);
        const pkCookie = async () => `align_v2.session_token=${(await pk.cookies()).find((c) => c.name === "align_v2.session_token")?.value ?? ""}`;
        {
          const [name, ...v] = R8.cookie.split("; ").find((c) => c.startsWith("align_v2.session_token=")).split("=");
          await pk.setCookie({ name, value: v.join("="), url: LB });
        }
        await pk.goto(`${LB}/app/account`, { waitUntil: "networkidle0" });
        await pk.waitForFunction(() => document.body.innerText.includes("No passkeys yet.") && document.body.innerText.includes("Delete your account"), { timeout: 15000 });
        await pk.type('main input[maxlength="100"]:not([aria-label])', "Rory's passkey");
        await pkClick("Add a passkey");
        await pk.waitForFunction(() => document.body.innerText.includes("Rory's passkey"), { timeout: 15000 });
        await pk.evaluate(() => fetch("/api/v2/account/passkey-prompt", { method: "DELETE", credentials: "same-origin" }));
        const pk8 = q1("SELECT id FROM ba_passkey WHERE userId = ?", R8.id)?.id;
        ageSession(await pkCookie(), 20);
        await pk.goto(`${LB}/app/account`, { waitUntil: "networkidle0" });
        await pk.waitForFunction(() => document.body.innerText.includes("Sign in again to delete your account."), { timeout: 15000 });
        const staleForm = (await pkText()).includes("Delete my account");
        await pkClick("Sign in again");
        // The sign-in page's passkey autofill answers at once and comes back to /app/account.
        await pk.waitForFunction(() => location.pathname === "/app/account" && document.body.innerText.includes("last used"), { timeout: 20000 });
        const before8 = {
          passkeys: q1("SELECT COUNT(*) AS n FROM ba_passkey WHERE userId = ?", R8.id).n,
          use: q1("SELECT COUNT(*) AS n FROM v2_passkey_use WHERE passkey_id = ?", pk8 ?? "").n,
          dismissed: q1("SELECT COUNT(*) AS n FROM v2_passkey_prompt_dismissed WHERE user_id = ?", R8.id).n,
        };
        await pk.waitForFunction(() => document.body.innerText.includes("Delete your account"), { timeout: 15000 });
        const disabledBefore = await pk.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Delete my account")?.disabled);
        await pk.type('input[aria-label="Your email, to confirm"]', R8.email);
        await Promise.all([pk.waitForNavigation({ waitUntil: "networkidle0" }), pkClick("Delete my account")]);
        const after8 = {
          passkeys: q1("SELECT COUNT(*) AS n FROM ba_passkey WHERE userId = ? OR id = ?", R8.id, pk8 ?? "").n,
          use: q1("SELECT COUNT(*) AS n FROM v2_passkey_use WHERE passkey_id = ?", pk8 ?? "").n,
          dismissed: q1("SELECT COUNT(*) AS n FROM v2_passkey_prompt_dismissed WHERE user_id = ?", R8.id).n,
          left: { ...mentions(R8.id), ...mentions(R8.email) },
        };
        check(
          "ui (Chrome): /app/account with an old sign-in shows \"Sign in again to delete your account.\" instead of the form; Sign in again (here by passkey) comes back to it",
          !staleForm && before8.passkeys === 1 && before8.use === 1 && before8.dismissed === 1,
          `${staleForm} ${JSON.stringify(before8)}`,
        );
        check(
          "ui (Chrome): /app/account's Delete my account stays disabled until the email is typed, then deletes the account and opens sign-in; their passkey, its last use and their \"Not now\" are gone and no row anywhere holds their id or email",
          disabledBefore === true && new URL(pk.url()).pathname === "/app/sign-in" && !q1("SELECT 1 AS x FROM ba_user WHERE id = ?", R8.id) &&
            after8.passkeys === 0 && after8.use === 0 && after8.dismissed === 0 && Object.keys(after8.left).length === 0 && errors.length === 0,
          `${disabledBefore} ${pk.url()} ${JSON.stringify(after8)} ${errors.join(" | ")}`,
        );
        await pctx.close();
      } catch (e) {
        check("ui (Chrome) retention run", false, e?.stack ?? e);
      } finally {
        await browser.close();
      }
    } else check("ui (Chrome) available", false, `no Chrome at ${CHROME}`);

    // PORT-003 fills this block: asks, mentions and value reports under account deletion, former members, purge and
    // the 13-month rule for closed asks.
    // ==== port:retention ====
    // ==== end port:retention ====

    // -- the server runs the job at startup --
    await signIn(r1);
    const W9 = await newWs(r1, "Retention startup");
    await ws(r1, "DELETE", W9);
    await stopServer();
    const boot = await mustStart({ ALIGN_DATA_DIR: retDir, ALIGN_TEST_IDP: "1", ALIGN_TEST_NOW: later(31 * DAY) });
    await sleep(500);
    check(
      "retention: the server runs the job at startup (it logs counts only) and purges a workspace deleted 31 days before its clock",
      !q1("SELECT 1 AS x FROM v2_workspaces WHERE id = ?", W9) && /Align retention: workspaces purged [1-9]/.test(boot.stdout()) && !boot.stdout().includes("@example.test"),
      boot.stdout().slice(-400),
    );
  }
  await stopServer();

  // ======== phase events: product events (PRESEED-007) and the operator's report ========
  // Mode L with the test IdP on a fresh data directory: a scripted set of actions, so every funnel count is known.
  const evDir = path.join(tmpRoot, "events");
  await mustStart({ ALIGN_DATA_DIR: evDir, ALIGN_TEST_IDP: "1" });
  dbFile = path.join(evDir, "v2", "align.sqlite");
  {
    const evEnv = { ALIGN_DATA_DIR: evDir, ALIGN_TEST_IDP: "1" };
    const q = (sql, ...a) => withDb((d) => d.prepare(sql).all(...a));
    const ev = (name, w = null) => (w ? q("SELECT * FROM v2_events WHERE name = ? AND ws_id = ?", name, w) : q("SELECT * FROM v2_events WHERE name = ?", name));
    const ws = (u, method, w, p = "", body) => call(u.who, method, `/api/v2/workspaces/${w}${p}`, { cookie: u.cookie, ...(body ? { body } : {}) });
    const E = {};
    for (const [who, name] of [
      ["E1", "Evelyn Funnelton"],
      ["E2", "Edgar Quillfeather"],
      ["E3", "Esme Lonelyworth"],
    ])
      E[who] = await signUp(who, name, `${who.toLowerCase()}-funnel@example.test`);
    const { E1: e1, E2: e2, E3: e3 } = E;
    const WS_NAME = "Zanzibar Secret Project";
    const W = (await call("E1", "POST", "/api/v2/workspaces", { cookie: e1.cookie, body: { name: WS_NAME } })).json?.id;
    const WQ = (await call("E3", "POST", "/api/v2/workspaces", { cookie: e3.cookie, body: { name: "Quiet Kestrel Workspace" } })).json?.id;
    const WS_SAMPLE = (await call("E1", "POST", "/api/v2/workspaces/sample", { cookie: e1.cookie, body: {} })).json?.id;
    const inv = await ws(e1, "POST", W, "/invites", { email: e2.email, role: "member" });
    await ws(e1, "POST", W, "/invites", { email: "dormant-invitee@example.test", role: "viewer" });
    const acc = await call("E2", "POST", `/api/v2/invites/${inv.json?.token}/accept`, { cookie: e2.cookie, body: {} });
    const DE1 = await pairDevice("E1", e1, [W], "Evelyn's Marigold laptop");
    const DE2 = await pairDevice("E2", e2, [W], "Edgar's Thistle laptop");
    const GOAL_TITLE = "Launch the Periwinkle initiative";
    const G = (await ws(e1, "POST", W, "/goals", { title: GOAL_TITLE, visibility: "workspace" })).json;
    const shareS = async (dev, native, goalId, n, alias) => {
      const key = sessionKey(dev, W, "claude-code", native);
      const start = new Date(Date.now() - 3600 * 1000).toISOString();
      const put = await call(dev.who, "PUT", `/api/v2/workspaces/${W}/sessions/${key}`, { bearer: dev.access, body: { harness: "claude-code", repo_key: repoKey(dev, W, "/src/r"), repo_alias: alias, started_at: start, title: "Refactor the Gooseberry module" } });
      const ep = epochId();
      const epoch = await call(dev.who, "POST", `/api/v2/workspaces/${W}/sessions/${key}/epochs`, { bearer: dev.access, body: { epoch_id: ep, goal_id: goalId, starts_at: start, root_turn: null, cause: "manual" } });
      const up = n ? await call(dev.who, "POST", `/api/v2/workspaces/${W}/sessions/${key}/usage`, { bearer: dev.access, body: { rows: Array.from({ length: n }, (_, i) => usageRow(dev, `${native}-${i}`, ep)) } }) : null;
      return { key, ok: put.status === 200 && epoch.status < 300 && (!up || up.json?.accepted === n) };
    };
    const S1 = await shareS(DE1, "e1-a", G?.id, 2, "pomegranate-repo");
    const S2 = await shareS(DE1, "e1-b", null, 0, "pomegranate-repo");
    const S3 = await shareS(DE2, "e2-a", null, 1, "quince-repo");
    const ep2 = await call("E1", "POST", `/api/v2/workspaces/${W}/sessions/${S2.key}/epochs`, { bearer: DE1.access, body: { epoch_id: epochId(), goal_id: G?.id, starts_at: new Date(Date.now() - 1000).toISOString(), root_turn: null, cause: "manual" } });
    const CR_REASON = "Because the Tangerine audit asked for it";
    const cr1 = await ws(e2, "POST", W, `/goals/${G?.id}/change-requests`, { base_version: 1, changes: { title: "Launch the Periwinkle initiative sooner" }, reason: CR_REASON });
    const crOk = await ws(e1, "POST", W, `/goals/${G?.id}/change-requests/${cr1.json?.id}/approve`, { revision: 1, note: "Approved after the Saffron review" });
    const cr2 = await ws(e2, "POST", W, `/goals/${G?.id}/change-requests`, { base_version: 2, changes: { title: "Launch the Periwinkle initiative later" }, reason: "second thoughts" });
    const stopS3 = await ws(e1, "POST", W, `/sessions/${S3.key}/stop`, {});
    const mcp1 = await mcpCall("E1", DE1, "align_list_goals");
    const mcp2 = await mcpCall("E2", DE2, "align_list_goals");
    await sleep(200);
    check(
      "events setup: two workspaces and a sample; an invite accepted and one pending; two paired devices; three sessions (one bound to a goal at once, one later, one never); a change request approved and another made; an agent stopped; two MCP reads",
      W && WQ && WS_SAMPLE && acc.status === 200 && G?.id && S1.ok && S2.ok && S3.ok && ep2.status < 300 && cr1.status === 201 && crOk.status === 200 && cr2.status === 201 && stopS3.status === 200 && mcp1.status === 200 && !mcp1.isError && mcp2.status === 200 && !mcp2.isError,
      `${acc.status} ${S1.ok} ${S2.ok} ${S3.ok} ${ep2.status} ${cr1.status} ${crOk.status} ${crOk.text} ${cr2.status} ${cr2.text} ${stopS3.status} ${mcp1.status} ${mcp2.status}`,
    );

    // -- each event once where it is a first, by the right code point --
    const once = (name, w = W) => ev(name, w).length === 1;
    const props = (name, w = W) => JSON.parse(ev(name, w)[0]?.props ?? "null");
    check(
      "events: workspace_created once per workspace (kind blank, or sample for the sample); invite_sent per invite with its role; invite_accepted and second_member_joined once; device_paired per device for its workspace",
      once("workspace_created") && once("workspace_created", WQ) && props("workspace_created").kind === "blank" && props("workspace_created", WS_SAMPLE)?.kind === "sample" &&
        ev("invite_sent", W).length === 2 && ev("invite_sent", W).map((e) => JSON.parse(e.props).role).sort().join() === "member,viewer" && once("invite_accepted") && once("second_member_joined") &&
        ev("device_paired", W).length === 2 && JSON.parse(ev("device_paired", W)[0].props).workspaces === 1 && ev("code_redeemed").length === 0,
      JSON.stringify(q("SELECT name, ws_id, props FROM v2_events")),
    );
    check(
      "events: three sessions shared -> first_session_captured once for the workspace and member_first_session_captured once per person (2), with the harness only; first_session_bound once (two sessions bound), harness and authority own",
      once("first_session_captured") && props("first_session_captured").harness === "claude-code" && ev("member_first_session_captured", W).length === 2 && new Set(ev("member_first_session_captured", W).map((e) => e.actor)).size === 2 &&
        once("first_session_bound") && props("first_session_bound").authority === "own" && props("first_session_bound").harness === "claude-code",
      JSON.stringify([ev("first_session_captured"), ev("member_first_session_captured"), ev("first_session_bound")]),
    );
    check(
      "events: first_change_request once (two requests), first_approval once, first_directive once (the approval's goal_version reached the bound sessions; the stop came later), first_mcp_read once (two reads) with the client kind; the sample's seeded request records nothing",
      once("first_change_request") && once("first_approval") && once("first_directive") && props("first_directive").kind === "goal_version" && once("first_mcp_read") && props("first_mcp_read").client === "device" &&
        ev("first_change_request", WS_SAMPLE).length === 0 && q("SELECT COUNT(*) AS n FROM v2_directives WHERE ws_id = ?", W)[0].n >= 2,
      JSON.stringify(q("SELECT name, ws_id, props FROM v2_events WHERE name LIKE 'first_%'")),
    );
    const dupes = q("SELECT name, ws_id, COUNT(*) AS n FROM v2_events WHERE ws_id IS NOT NULL AND (name LIKE 'first_%' OR name IN ('workspace_created', 'code_redeemed', 'second_member_joined')) GROUP BY name, ws_id HAVING n > 1");
    let dupInsert = "";
    let appendOnly = "";
    withDb((d) => {
      try {
        d.prepare("INSERT INTO v2_events (name, ws_id, at, props) VALUES ('first_approval', ?, ?, '{}')").run(W, new Date().toISOString());
      } catch (e) {
        dupInsert = String(e.message);
      }
      try {
        d.prepare("UPDATE v2_events SET props = '{\"x\":1}' WHERE name = 'workspace_created'").run();
      } catch (e) {
        appendOnly = String(e.message);
      }
    });
    check(
      "events: no first-time event appears twice for a workspace, a second one is refused by the database's unique index, and the table is append-only (changing an event's props is refused)",
      dupes.length === 0 && /UNIQUE/.test(dupInsert) && /append-only/.test(appendOnly),
      `${JSON.stringify(dupes)} ${dupInsert} ${appendOnly}`,
    );

    // -- access requests and codes through the operator script --
    const arE = (body) => call("anon", "POST", "/api/v2/access-requests", { headers: { origin: BASE }, body });
    const ar1 = await arE({ email: "hopeful-applicant@example.test", name: "Horatio Hopeful", company: "Wobblegong Ltd", use_case: "Steer the Wobblegong agents", interest: "try" });
    const ar1b = await arE({ email: "hopeful-applicant@example.test", name: "Horatio Hopeful", company: "Wobblegong Ltd", use_case: "Steer the Wobblegong agents, again", interest: "try" });
    const ar2 = await arE({ email: "keen-evaluator@example.test", name: "Kerensa Keen", use_case: "Evaluate for the Marmalade team", interest: "evaluate" });
    const reqIds = q("SELECT id, email FROM v2_access_requests ORDER BY created_at");
    const apr = admin(["requests", "approve", reqIds.find((r) => r.email.startsWith("hopeful"))?.id ?? "", "--print"], evEnv);
    const dec = admin(["requests", "decline", reqIds.find((r) => r.email.startsWith("keen"))?.id ?? ""], evEnv);
    const opCodes = admin(["codes", "create", "--count", "2"], evEnv);
    check(
      "events: access_requested once per request (sending again updates it and records nothing), with its interest; approving records access_approved and code_created (source request), declining access_declined, codes create code_created (source operator) per code; none has a workspace or actor",
      ar1.status === 201 && ar1b.status === 201 && ar2.status === 201 && apr.status === 0 && dec.status === 0 && opCodes.status === 0 &&
        ev("access_requested").length === 2 && ev("access_requested").map((e) => JSON.parse(e.props).interest).sort().join() === "evaluate,try" && ev("access_approved").length === 1 && ev("access_declined").length === 1 &&
        ev("code_created").map((e) => JSON.parse(e.props).source).sort().join() === "operator,operator,request" &&
        [...ev("access_requested"), ...ev("access_approved"), ...ev("access_declined"), ...ev("code_created")].every((e) => e.ws_id === null && e.actor === null),
      `${ar1.status} ${ar2.status} ${apr.status} ${apr.err} ${dec.status} ${JSON.stringify(q("SELECT name, props FROM v2_events WHERE ws_id IS NULL"))}`,
    );

    // -- LOIs: operator-recorded only; signed needs --verified-original --
    const loiSent = admin(["events", "record", "loi_sent", "--workspace", W, "--note-ref", "LOI-2026-007"], evEnv);
    const loiNoVerify = admin(["events", "record", "loi_signed", "--workspace", W], evEnv);
    const afterNoVerify = ev("loi_signed").length;
    const loiBadRef = admin(["events", "record", "loi_signed", "--workspace", W, "--verified-original", "--note-ref", "https://docs.example.test/loi"], evEnv);
    const loiEmailRef = admin(["events", "record", "loi_sent", "--workspace", WQ, "--note-ref", "someone@example.test"], evEnv);
    const loiSentVerify = admin(["events", "record", "loi_sent", "--workspace", WQ, "--verified-original"], evEnv);
    const loiUnknownWs = admin(["events", "record", "loi_sent", "--workspace", "ws_aaaaaaaaaaaaaaaaaaaaaaaa"], evEnv);
    const loiOther = admin(["events", "record", "first_approval", "--workspace", W], evEnv);
    const loiSigned = admin(["events", "record", "loi_signed", "--workspace", W, "--verified-original", "--note-ref", "LOI-2026-007"], evEnv);
    const loiAgain = admin(["events", "record", "loi_signed", "--workspace", W, "--verified-original"], evEnv);
    check(
      "align-admin events record: loi_sent records once with the note ref; loi_signed without --verified-original exits 2, says a form or claim is not a signature, and records nothing; a ref that is a URL or email, --verified-original on loi_sent or any other event name exits 2; an unknown workspace exits 1; with --verified-original it records (verified_original yes), and a second time exits 1",
      loiSent.status === 0 && loiNoVerify.status === 2 && /--verified-original/.test(loiNoVerify.err) && /not a signature/.test(loiNoVerify.err) && afterNoVerify === 0 &&
        loiBadRef.status === 2 && loiEmailRef.status === 2 && loiSentVerify.status === 2 && loiOther.status === 2 && loiUnknownWs.status === 1 &&
        loiSigned.status === 0 && /verified original/.test(loiSigned.out) && loiAgain.status === 1 && ev("loi_sent").length === 1 && props("loi_sent").note_ref === "LOI-2026-007" && ev("loi_signed").length === 1 && props("loi_signed").verified_original === "yes" && ev("loi_signed")[0].actor === null,
      `${loiSent.status} ${loiSent.err} | ${loiNoVerify.status} ${loiNoVerify.err} | ${loiBadRef.status} ${loiEmailRef.status} ${loiSentVerify.status} ${loiOther.status} ${loiUnknownWs.status} ${loiSigned.status} ${loiSigned.out} ${loiAgain.status}`,
    );

    // -- no content in any event row --
    const fixtures = [
      ...Object.values(E).flatMap((u) => [u.email, u.name, u.id]),
      WS_NAME, "Quiet Kestrel", "Northstar", GOAL_TITLE, "Periwinkle", CR_REASON, "Tangerine", "Saffron", "pomegranate", "quince", "Gooseberry", "Marigold", "Thistle",
      "hopeful-applicant", "Horatio", "Wobblegong", "Kerensa", "Marmalade", "dormant-invitee", "@", "http", "alc_", "alnd_", "alnr_", DE1.access, DE1.id, "ba_", "cr_",
    ];
    const rowsText = q("SELECT * FROM v2_events").map((r) => Object.values(r).join(" ")).join("\n");
    const found = fixtures.filter((f) => f && rowsText.toLowerCase().includes(String(f).toLowerCase()));
    const ALLOWED = {
      access_requested: ["interest", "via"], access_approved: [], access_declined: [], code_created: ["source"], code_redeemed: [], workspace_created: ["kind"], invite_sent: ["role"], invite_accepted: ["role"],
      device_paired: ["workspaces"], first_session_captured: ["harness"], member_first_session_captured: ["harness"], first_session_bound: ["harness", "authority"], second_member_joined: [],
      first_change_request: [], first_approval: [], first_directive: ["kind"], first_mcp_read: ["client"], loi_sent: ["note_ref"], loi_signed: ["note_ref", "verified_original"],
      first_ask: [], first_limit: [], value_card_viewed: [], value_reported: ["estimate"], follow_up_clicked: [],
    };
    const offList = q("SELECT name, props FROM v2_events").filter((r) => !ALLOWED[r.name] || Object.keys(JSON.parse(r.props)).some((k) => !ALLOWED[r.name].includes(k)));
    check(
      "events: no event row holds an email, name, user id, workspace name, goal title, change request text, repo alias, session title, device name, URL, code or token from this phase, and every props key is on its event's allowlist",
      q("SELECT COUNT(*) AS n FROM v2_events")[0].n > 20 && found.length === 0 && offList.length === 0,
      `${found.join(", ")} ${JSON.stringify(offList)}`,
    );

    // -- the report --
    const repJ = admin(["report", "--json"], evEnv);
    let rep = null;
    try {
      rep = JSON.parse(repJ.out);
    } catch {}
    const step = (s) => rep?.funnel?.find((f) => f.step === s)?.workspaces;
    check(
      "align-admin report --json: access 2 requested (1 try, 1 evaluate), 1 approved, 1 declined, 3 codes (1 from requests), 0 redeemed; the funnel over the 2 non-sample workspaces: created 2, device paired 1, first session 1, bound 1, second member 1, change request 1, approval or directive 1, MCP read 1 (of previous 50%); 1 sample, 2 invites sent, 1 accepted, 2 people with a first session",
      repJ.status === 0 && rep && rep.access.requested === 2 && rep.access.requested_try === 1 && rep.access.requested_evaluate === 1 && rep.access.approved === 1 && rep.access.declined === 1 && rep.access.codes_created === 3 && rep.access.codes_from_requests === 1 && rep.access.codes_redeemed === 0 &&
        step("workspace created") === 2 && step("device paired") === 1 && step("first session captured") === 1 && step("first session bound to a goal") === 1 && step("second member joined") === 1 &&
        step("first change request") === 1 && step("first approval or directive") === 1 && step("first MCP read") === 1 && rep.funnel[1].of_previous === 0.5 &&
        rep.other.sample_workspaces_created === 1 && rep.other.invites_sent === 2 && rep.other.invites_accepted === 1 && rep.other.people_with_a_first_session === 2,
      `${repJ.status} ${repJ.err} ${JSON.stringify(rep?.access)} ${JSON.stringify(rep?.funnel)} ${JSON.stringify(rep?.other)}`,
    );
    const ttfv = rep?.time_to_first_value;
    const waw = rep?.weekly_active_workspaces ?? [];
    check(
      "align-admin report --json: time to first value from workspace created over 1 workspace (median = p75, a few minutes at most), none from a code; 8 weeks of active workspaces ending with this week's 2 (the sample left out); this week's cohort of 2 with week 1 and week 4 not yet known",
      ttfv?.from_workspace_created.workspaces === 1 && ttfv.from_workspace_created.median_minutes !== null && ttfv.from_workspace_created.median_minutes === ttfv.from_workspace_created.p75_minutes && ttfv.from_workspace_created.median_minutes < 10 &&
        ttfv.from_code_redeemed.workspaces === 0 && ttfv.from_code_redeemed.median_minutes === null &&
        waw.length === 8 && waw[7].active === 2 && waw[7].complete === false && waw.slice(0, 7).every((w) => w.active === 0) && rep.retention.length === 1 && rep.retention[0].workspaces === 2 && rep.retention[0].week1 === null && rep.retention[0].week4 === null,
      `${JSON.stringify(ttfv)} ${JSON.stringify(waw)} ${JSON.stringify(rep?.retention)}`,
    );
    const gb = rep?.goal_binding;
    check(
      "align-admin report --json: goal binding from the session and usage tables: 2 of 3 sessions bound, 2 of 3 requests and 24,690 of 37,035 estimated micro-dollars on goals; LOIs 1 sent and 1 signed for the workspace",
      gb?.sessions === 3 && gb.bound_sessions === 2 && gb.requests === 3 && gb.bound_requests === 2 && gb.est_list_usd_micros === 37035 && gb.bound_est_list_usd_micros === 24690 && gb.spend_share === 0.6667 &&
        rep.lois.sent === 1 && rep.lois.signed === 1 && rep.lois.workspaces.length === 1 && rep.lois.workspaces[0].ws_id === W && rep.lois.workspaces[0].signed_at,
      `${JSON.stringify(gb)} ${JSON.stringify(rep?.lois)}`,
    );
    const repT = admin(["report"], evEnv);
    const repFuture = admin(["report", "--since", "2999-01-01", "--json"], evEnv);
    const repBad = admin(["report", "--since", "last week"], evEnv);
    let future = null;
    try {
      future = JSON.parse(repFuture.out);
    } catch {}
    check(
      "align-admin report: plain text tables (access, workspace funnel, time to first value, weekly active workspaces, retention, bound to goals, LOIs) with no name or email; --since filters (a future date counts nothing); a bad --since exits 2",
      repT.status === 0 && ["Access", "Workspace funnel", "Time to first value", "Weekly active workspaces", "Retention by creation week", "Bound to goals", "LOIs (operator-recorded): 1 sent, 1 signed"].every((h) => repT.out.includes(h)) &&
        /first session bound to a goal\s+1\s+100%\s+50%/.test(repT.out) && !repT.out.includes("@") && !repT.out.includes("Evelyn") && !repT.out.includes(WS_NAME) &&
        repFuture.status === 0 && future?.access.requested === 0 && future.funnel[0].workspaces === 0 && future.lois.sent === 0 && repBad.status === 2,
      `${repT.status} ${repT.out.slice(0, 1500)} ${repT.err} | ${repFuture.status} ${repBad.status}`,
    );

    // -- account deletion clears the person's actor; purging re-keys the workspace; retention keeps 13 months --
    const secretE = readFileSync(path.join(evDir, ".secret"), "utf8").trim();
    const e2Actor = eventActor(secretE, e2.id);
    const e2Before = q("SELECT COUNT(*) AS n FROM v2_events WHERE actor = ?", e2Actor)[0].n;
    const totalBefore = q("SELECT COUNT(*) AS n FROM v2_events")[0].n;
    const delE2 = await call("E2", "DELETE", "/api/v2/me", { cookie: e2.cookie, body: { email: e2.email } });
    check(
      "events and account deletion: a person's events carry the keyed hash of their id (HMAC under the server secret); deleting their account clears it from every event, keeps the events (the funnel is unchanged), and their account is gone",
      e2Before >= 4 && delE2.status === 204 && q("SELECT COUNT(*) AS n FROM v2_events WHERE actor = ?", e2Actor)[0].n === 0 && q("SELECT COUNT(*) AS n FROM v2_events")[0].n === totalBefore &&
        q("SELECT COUNT(*) AS n FROM v2_events WHERE actor = ?", eventActor(secretE, e1.id))[0].n > 0 && !q("SELECT 1 AS x FROM ba_user WHERE id = ?", e2.id).length,
      `${e2Before} ${delE2.status} ${delE2.text} ${totalBefore}`,
    );
    const purge = admin(["workspaces", "delete", WQ, "--purge", "--yes"], evEnv);
    const rekeyed = q("SELECT ws_id FROM v2_events WHERE name = 'workspace_created' AND ws_id LIKE 'wsx_%'");
    const repAfter = JSON.parse(admin(["report", "--json"], evEnv).out || "null");
    check(
      "events and purging: a purged workspace's events stay under a random wsx_ id, so no row names it and the report still counts it as created",
      purge.status === 0 && ev("workspace_created", WQ).length === 0 && q("SELECT COUNT(*) AS n FROM v2_events WHERE ws_id = ?", WQ)[0].n === 0 && rekeyed.length === 1 && /^wsx_[a-z2-7]{24}$/.test(rekeyed[0].ws_id) && repAfter?.funnel[0].workspaces === 2,
      `${purge.status} ${purge.err} ${JSON.stringify(rekeyed)} ${JSON.stringify(repAfter?.funnel?.[0])}`,
    );
    const monthsAgo = (m) => {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - m);
      return d.toISOString();
    };
    withDb((d) => {
      d.prepare("INSERT INTO v2_events (name, ws_id, at, props) VALUES ('invite_sent', ?, ?, '{\"role\":\"member\"}')").run(W, monthsAgo(14));
      d.prepare("INSERT INTO v2_events (name, ws_id, at, props) VALUES ('invite_sent', ?, ?, '{\"role\":\"viewer\"}')").run(W, monthsAgo(12));
    });
    const retE = admin(["retention", "run"], evEnv);
    let retCounts = {};
    try {
      retCounts = JSON.parse(retE.out.trim().split("\n").pop());
    } catch {}
    check(
      "events and retention: the job deletes events older than 13 months (events_deleted 1) and keeps a 12-month-old one",
      retE.status === 0 && retCounts.events_deleted === 1 && q("SELECT COUNT(*) AS n FROM v2_events WHERE at < ?", monthsAgo(13))[0].n === 0 && q("SELECT COUNT(*) AS n FROM v2_events WHERE at < ?", monthsAgo(11))[0].n === 1,
      `${retE.status} ${retE.out} ${retE.err}`,
    );
  }
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
    ["ALIGN_TEST_NOW (the retention job's test clock)", { ALIGN_TEST_NOW: "2030-01-01T00:00:00Z" }, "ALIGN_TEST_NOW is not allowed when hosted"],
    ["ALIGN_TEST_OAUTH_URL (the test OAuth provider)", { ALIGN_TEST_OAUTH_URL: "http://127.0.0.1:1" }, "ALIGN_TEST_OAUTH_URL is not allowed when hosted"],
    ["ALIGN_LOCAL_OWNER_EMAIL", { ALIGN_LOCAL_OWNER_EMAIL: "me@example.test" }, "ALIGN_LOCAL_OWNER_EMAIL is not allowed when hosted"],
    ["a bad ALIGN_SESSION_MAX_DAYS", { ALIGN_SESSION_MAX_DAYS: "0" }, "ALIGN_SESSION_MAX_DAYS must be a whole number of days from 1 to 365"],
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
    ["GET", "/privacy/x"],
    ["GET", "/trust/security"],
    ["GET", "/trustx"],
    ["GET", "/privacy-policy"],
    ["GET", "/security"],
    ["GET", "/SECURITY.md"],
    ["GET", "/docs/trust/privacy-policy.md"],
    ["GET", "/_trust/doc"],
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
  const hTrustPages = await Promise.all([hosted("GET", "/privacy"), hosted("GET", "/trust")]);
  check(
    "hosted: /privacy and /trust are served (200, the privacy policy and the trust page); nothing under them is",
    hTrustPages[0].status === 200 && hTrustPages[0].text.includes("Our two roles") && hTrustPages[1].status === 200 && hTrustPages[1].text.includes("Subprocessors"),
    hTrustPages.map((r) => r.status).join(" "),
  );
  const hMe = await hosted("GET", "/api/v2/me");
  const hSignIn = await hosted("GET", "/app/sign-in");
  const hSession = await hosted("GET", "/api/v2/auth/get-session");
  check("hosted: v2 routes are served (/api/v2/me 401, /app/sign-in 200, Better Auth answers)", hMe.status === 401 && hSignIn.status === 200 && hSession.status === 200, `${hMe.status} ${hSignIn.status} ${hSession.status}`);
  check("hosted: the sign-in page offers Google and GitHub, never the test sign-in; without email settings, no email code", hSignIn.text.includes("Continue with Google") && hSignIn.text.includes("Continue with GitHub") && !hSignIn.text.includes("Test sign-in") && !hSignIn.text.includes("Send code"), "");
  check("hosted: the sign-in page links to /privacy and /trust", hSignIn.text.includes('href="/privacy"') && hSignIn.text.includes('href="/trust"'), "");
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
  const emailEnv = { ...good, ...noProviders, ALIGN_DATA_DIR: emailDir, ALIGN_EMAIL_API_URL: `https://127.0.0.1:${mailApi.address().port}/emails`, ALIGN_EMAIL_API_KEY: MAIL_KEY, ALIGN_EMAIL_FROM: "Align <signin@align.test>", ALIGN_FIRST_OWNER_EMAIL: "Ops@Example.test", NODE_EXTRA_CA_CERTS: caFile, ALIGN_SESSION_MAX_DAYS: "3" };
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
  const opsSession = withDb((d) => d.prepare("SELECT s.createdAt, s.expiresAt FROM ba_session s JOIN ba_user u ON u.id = s.userId WHERE u.email = ?").get("ops@example.test"));
  const hReg = await hosted("GET", "/api/v2/auth/passkey/generate-register-options", { cookie: OPS.cookie });
  check(
    "hosted: ALIGN_SESSION_MAX_DAYS=3 caps a new session at 3 days after sign-in (under the 7-day rolling expiry); passkeys use the public host as relying party",
    Date.parse(opsSession?.expiresAt) === Date.parse(opsSession?.createdAt) + 3 * 86_400_000 && hReg.status === 200 && hReg.json?.rp?.id === HOSTED_HOST,
    `${JSON.stringify(opsSession)} ${hReg.status} ${hReg.text.slice(0, 200)}`,
  );
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
  // -- product events (PRESEED-007) on the hosted path: the request, its approval and code, the redemption --
  const gEv = (name, ws = null) => withDb((d) => (ws ? d.prepare("SELECT * FROM v2_events WHERE name = ? AND ws_id = ?").all(name, ws) : d.prepare("SELECT * FROM v2_events WHERE name = ?").all(name)));
  const evApproved0 = gEv("access_approved").length;
  const evCodes0 = gEv("code_created").length;
  const failReq = await gAccess({ ...reqBody, email: "fail@example.test", interest: "try" });
  const failReqRow = withDb((d) => d.prepare("SELECT * FROM v2_access_requests WHERE email = ?").get("fail@example.test"));
  const failApprove = await adminAsync(["requests", "approve", failReqRow?.id ?? "ar_none"], opGate);
  const failAfter = withDb((d) => d.prepare("SELECT status, code_id FROM v2_access_requests WHERE id = ?").get(failReqRow?.id ?? ""));
  check(
    "events (hosted): each access request records access_requested with its interest only; an approval records access_approved and code_created (source request); when the approval's email fails, the request stays pending and both events are taken back",
    failReq.status === 201 && gEv("access_requested").length === 2 && gEv("access_requested").map((e) => JSON.parse(e.props).interest).sort().join() === "evaluate,try" &&
      evApproved0 === 1 && evCodes0 === 1 && JSON.parse(gEv("code_created")[0].props).source === "request" && gEv("access_requested").every((e) => e.ws_id === null && e.actor === null) &&
      failApprove.status === 1 && failAfter?.status === "pending" && failAfter.code_id === null && gEv("access_approved").length === 1 && gEv("code_created").length === 1,
    `${failReq.status} ${JSON.stringify(gEv("access_requested"))} ${evApproved0} ${evCodes0} ${failApprove.status} ${failApprove.err} ${JSON.stringify(failAfter)} ${gEv("access_approved").length} ${gEv("code_created").length}`,
  );
  const redeemedEv = gEv("code_redeemed");
  check(
    "events (hosted): spending a creation code records code_redeemed for the workspace it made, by a keyed hash of the person (not their id); the first owner's code-free workspace records workspace_created and no code_redeemed",
    redeemedEv.length === 1 && redeemedEv[0].ws_id === W2.json?.id && redeemedEv[0].actor === eventActor(good.ALIGN_SECRET, withDb((d) => d.prepare("SELECT id FROM ba_user WHERE email = ?").get("alice@example.test")?.id)) &&
      gEv("workspace_created", W1.json?.id).length === 1 && gEv("code_redeemed", W1.json?.id).length === 0 && gEv("workspace_created", W2.json?.id).length === 1,
    JSON.stringify(redeemedEv),
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
  // -- the workspace caps count live workspaces: a deleted one (restorable for 30 days) frees its place, and restoring
  //    it must fit under both caps again (409) --
  const W3id = W3.json?.id;
  const gDel = (who, ws) => hosted("DELETE", `/api/v2/workspaces/${ws}`, { cookie: who.cookie, headers: hOrigin });
  const gRestore = (who, ws) => hosted("POST", `/api/v2/workspaces/${ws}/restore`, { body: {}, cookie: who.cookie, headers: hOrigin });
  const capC = codesIn(admin(["codes", "create"], opGate).out)[0];
  const delW3 = await gDel(OPSG, W3id);
  const opsAgain = await gCreate(OPSG, "Ops Three", capC);
  const restoreFull = await gRestore(OPSG, W3id);
  const delW4 = await gDel(BOB, W4.json?.id);
  const restoreOwned = await gRestore(OPSG, W3id);
  const delOps3 = await gDel(OPSG, opsAgain.json?.id);
  const restoreOk = await gRestore(OPSG, W3id);
  check(
    "caps and soft delete: deleting a workspace frees its place at once (the owner creates another at the owned cap of 2 and the server cap of 4); restoring the deleted one then -> 409 workspace_cap (server full), and with room on the server but 2 owned -> 409 owned_workspace_cap; with room under both it is restored (200)",
    delW3.status === 204 && opsAgain.status === 201 && restoreFull.status === 409 && restoreFull.json?.error === "workspace_cap" && /Contact the operator/.test(restoreFull.json?.message) &&
      delW4.status === 204 && restoreOwned.status === 409 && restoreOwned.json?.error === "owned_workspace_cap" && delOps3.status === 204 && restoreOk.status === 200 && restoreOk.json?.id === W3id,
    `${delW3.status} ${opsAgain.status} ${opsAgain.text} ${restoreFull.status} ${restoreFull.text} ${delW4.status} ${delW4.text} ${restoreOwned.status} ${restoreOwned.text} ${delOps3.status} ${restoreOk.status} ${restoreOk.text}`,
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
