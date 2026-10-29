#!/usr/bin/env node
// The intake interview on /new (lib/interview.ts, app/api/workspaces/interview). Never reaches Anthropic: every
// server here preloads scripts/interview-test-net.mjs, which answers api.anthropic.com locally and logs each request.
// Builds once (skip with --no-build), then runs on production servers on <port>:
//   phase "off":    Mode L, no interview key            -> the route is absent (404), config says interview: false
//   phase "local":  Mode L, a shared signup code, a key -> gating, caps, cleaning, refusals, the request sent
//   phase "hosted": HOSTED=1 as Fly runs it, invites    -> Origin, invites never spent, and two startup refusals
// Usage: node scripts/test-interview.mjs <port> [--no-build]   (from a worktree root; refuses 3100 and the main checkout)

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.argv[2]);
const BUILD = !process.argv.includes("--no-build");
if (!Number.isInteger(PORT) || PORT === 3100) {
  console.error("usage: node scripts/test-interview.mjs <port> [--no-build] (not 3100)");
  process.exit(2);
}
const ROOT = process.cwd();
if (path.resolve(ROOT) === path.join(os.homedir(), "liminal/align")) {
  console.error(`test-interview: refusing the main checkout ${ROOT}; run from a worktree`);
  process.exit(2);
}
if (spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]).status === 0) {
  console.error(`test-interview: port ${PORT} is already in use`);
  process.exit(2);
}
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "data/scenarios/example-custom.json"), "utf8"));
const HOSTED_HOST = "align.test";
const KEY = "sk-ant-test-interview-key-0001";

let pass = 0;
let fail = 0;
let phaseName = "";
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  [${phaseName}] ${name}${ok ? "" : `  ${String(detail).slice(0, 300)}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let HOSTED = false;
function req(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { host: HOSTED ? HOSTED_HOST : `127.0.0.1:${PORT}`, ...(HOSTED ? { "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.7" } : {}) };
    let data;
    if (body !== undefined) {
      data = JSON.stringify(body);
      h["content-type"] = "application/json";
      h["content-length"] = Buffer.byteLength(data);
    }
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
        resolve({ status: res.statusCode, text: t, json });
      });
    });
    r.on("error", reject);
    if (data !== undefined) r.write(data);
    r.end();
  });
}
const site = () => ({ origin: HOSTED ? `https://${HOSTED_HOST}` : `http://127.0.0.1:${PORT}` });
const say = (...texts) => texts.map((text, i) => ({ role: i % 2 ? "assistant" : "user", text }));
const turn = (messages, code, headers = site()) => req("POST", "/api/workspaces/interview", { body: { messages, ...(code === undefined ? {} : { signup_code: code }) }, headers });

// ---- server ----
let server = null;
let serverErr = "";
async function start(env, { expectUp = true } = {}) {
  rmSync(path.join(ROOT, "data/state.json"), { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^(ALIGN_|HOSTED$|AI_GATEWAY_API_KEY$|ANTHROPIC_)/.test(k)) delete clean[k];
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  serverErr = "";
  server.stderr.on("data", (c) => (serverErr += c));
  server.stdout.on("data", (c) => (serverErr += c));
  let exited = false;
  server.on("exit", () => (exited = true));
  for (let i = 0; i < 90; i++) {
    if (exited) return { up: false };
    try {
      const r = await req("GET", "/api/workspaces/config");
      if (r.status === 200) return { up: true };
      if (!expectUp && r.status === 503) return { up: false, refused503: true };
    } catch {}
    await sleep(1000);
  }
  if (expectUp) throw new Error(`server did not start: ${serverErr.slice(-400)}`);
  return { up: false };
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

const readLog = (file) => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

// ---- phases ----
async function phaseOff(net) {
  phaseName = "off";
  HOSTED = false;
  await start({ ...net, ALIGN_ALLOW_OPEN_CREATE: "1" });
  const cfg = await req("GET", "/api/workspaces/config");
  check("config says interview: false without a key", cfg.json?.interview === false, cfg.text);
  const r = await turn(say("hello"), undefined);
  check("the interview route is absent (404) without a key", r.status === 404, `${r.status} ${r.text}`);
  check("nothing was sent to Anthropic", readLog(net.ALIGN_TEST_INTERVIEW_LOG).length === 0, "log not empty");
  await stop();
}

async function phaseLocal(net, dataDir) {
  phaseName = "local";
  HOSTED = false;
  const CODE = "local-signup-code-1";
  await start({ ...net, ALIGN_DATA_DIR: dataDir, ALIGN_SIGNUP_CODE: CODE, ALIGN_INTERVIEW_API_KEY: KEY });
  const log = net.ALIGN_TEST_INTERVIEW_LOG;
  const cfg = await req("GET", "/api/workspaces/config");
  check("config says interview: true with a key", cfg.json?.interview === true, cfg.text);

  // Gating: the same code rule as creating a workspace, checked before any model call.
  const none = await turn(say("Our mobile team needs design to change a goal"), undefined);
  const wrong = await turn(say("Our mobile team needs design to change a goal"), "wrong-code-123456");
  check("no code -> 403, and nothing sent to Anthropic", none.status === 403 && readLog(log).length === 0, `${none.status} ${none.text}`);
  check("wrong code -> 403", wrong.status === 403 && readLog(log).length === 0, `${wrong.status}`);

  // A good turn: the reply, the draft, and exactly what was sent.
  const first = await turn(say("Our mobile team needs design to change a goal"), CODE);
  check("a turn with the code -> 200 with reply, draft and done", first.status === 200 && typeof first.json?.reply === "string" && first.json?.draft?.company === "Stubfield Labs" && first.json?.done === false, `${first.status} ${first.text}`);
  const sent = readLog(log).at(-1);
  // SDK v1 sends an API key as Authorization: Bearer (node_modules/@anthropic-ai/sdk/client.js apiKeyAuth).
  check("the request went to /v1/messages with exactly the interview key and no other credential", sent?.url === "https://api.anthropic.com/v1/messages" && sent?.auth === `Bearer ${KEY}` && !sent?.key, JSON.stringify({ url: sent?.url, key: !!sent?.key, auth: sent?.auth === `Bearer ${KEY}` }));
  check("model claude-opus-5-5, effort low, a structured-output schema", sent?.body?.model === "claude-opus-5-5" && sent?.body?.output_config?.effort === "low" && sent?.body?.output_config?.format?.type === "json_schema", JSON.stringify(sent?.body?.output_config ?? {}).slice(0, 200));
  check("refusal fallback on: fallbacks 'default' with its beta header", sent?.body?.fallbacks === "default" && /server-side-fallback-2026-07-01/.test(sent?.beta ?? ""), `${sent?.body?.fallbacks} ${sent?.beta}`);
  check("the system prompt is sent and the person's words go as user content", typeof sent?.body?.system === "string" && sent.body.system.includes("intake interviewer") && sent.body.messages?.[0]?.role === "user", "");
  check("the signup code is never sent to the model", !JSON.stringify(sent ?? {}).includes(CODE), "code found in the request");
  const cfg2 = await req("GET", "/api/workspaces/config");
  check("an interview never uses up creation (workspace count unchanged, still not max)", cfg2.json?.max_reached === false, cfg2.text);

  // A multi-turn conversation, ending done.
  const done = await turn(say("Mobile needs Design", "Which team owns it?", "Design owns it. DONE"), CODE);
  check("a later turn can finish: done true with a plan in the draft", done.status === 200 && done.json?.done === true && done.json?.draft?.plan.length >= 20, done.text);

  // The server cleans the draft: no control or bidi characters, the form's length limits.
  const dirty = await turn(say("DIRTY please"), CODE);
  const dj = dirty.json ?? {};
  check("draft and reply are cleaned of control, bidi and zero-width characters", dirty.status === 200 && dj.draft?.company === "BadCo" && !/[\u0000-\u001F​-‏‪-‮]/.test(dj.reply ?? "x"), dirty.text.slice(0, 200));
  check("draft fields are capped at the form's limit (300)", dj.draft?.dependency?.length === 300, `${dj.draft?.dependency?.length}`);

  // The conversation's shape and size.
  const shapes = await Promise.all([
    turn([{ role: "assistant", text: "hi" }, { role: "user", text: "x" }], CODE),
    turn(say("a", "b"), CODE), // ends with the assistant
    turn([{ role: "user", text: "a" }, { role: "user", text: "b" }], CODE),
    turn(Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: "x" })), CODE),
    turn([{ role: "user", text: "a", extra: 1 }], CODE),
    turn([], CODE),
  ]);
  check("bad shapes -> 400 (starts with assistant, ends with assistant, not alternating, 31 messages, unknown field, empty)", shapes.every((s) => s.status === 400), shapes.map((s) => s.status).join(","));
  const long = await turn(say("y".repeat(2001)), CODE);
  check("a message over 2000 characters -> 413", long.status === 413, `${long.status}`);
  const huge = await req("POST", "/api/workspaces/interview", { body: { messages: say("z"), signup_code: CODE, pad: "p".repeat(60_000) }, headers: site() });
  check("a body over 48 KB -> 413", huge.status === 413, `${huge.status}`);

  // The model can't help, or answers badly: 502 with a plain message, and the log never carries what was said.
  const refuse = await turn(say("SECRETMARK REFUSE"), CODE);
  const bad = await turn(say("SECRETMARK BADJSON"), CODE);
  check("a refusal -> 502 with a plain message", refuse.status === 502 && /couldn.t answer/.test(refuse.json?.error ?? ""), `${refuse.status} ${refuse.text}`);
  check("an unparseable answer -> 502", bad.status === 502, `${bad.status} ${bad.text}`);
  await sleep(300);
  check("server logs never carry what the person wrote", !serverErr.includes("SECRETMARK"), "SECRETMARK in the server log");

  // Per-client limit: 40 turns per 30 minutes (this phase has used a few already).
  let status = 200;
  let n = 0;
  while (status === 200 && n < 60) {
    status = (await turn(say("hello"), CODE)).status;
    n++;
  }
  check("per-client limit: turns are refused with 429 within 40", status === 429 && n <= 40, `status ${status} after ${n}`);
  await stop();
}

async function phaseHosted(net, dataDir) {
  phaseName = "hosted";
  HOSTED = true;
  const invites = ["interview-invite-0001", "interview-invite-0002"];
  const env = {
    ...net,
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "i".repeat(48),
    ALIGN_DATA_DIR: dataDir,
    ALIGN_SIGNUP_CODES: invites.join(","),
    ALIGN_DELETE_BY: "2026-11-13",
    ALIGN_PRODUCT_PASSCODE: "product-strong-pass-1",
    ALIGN_SECURITY_PASSCODE: "security-strong-pass-1",
    ALIGN_LEADERSHIP_PASSCODE: "leadership-strong-pass-1",
    ALIGN_INTERVIEW_API_KEY: KEY,
  };

  // Startup refusals: the SDK's own credentials would be picked up silently, so they must be unset when hosted.
  for (const [k, v] of [["ANTHROPIC_API_KEY", "sk-ant-should-not-be-here-000"], ["ANTHROPIC_BASE_URL", "http://127.0.0.1:9"], ["ALIGN_INTERVIEW", "1"]]) {
    const s = await start({ ...env, [k]: v }, { expectUp: false });
    check(`${k} set when hosted -> the server refuses to serve`, !s.up, serverErr.slice(-200));
    await stop();
  }

  await start(env);
  const cfg = await req("GET", "/api/workspaces/config");
  check("config says interview: true", cfg.json?.interview === true, cfg.text);
  const noOrigin = await turn(say("hi"), invites[0], {});
  const httpOrigin = await turn(say("hi"), invites[0], { origin: `http://${HOSTED_HOST}` });
  check("hosted: a turn without the site's exact https Origin -> 403", noOrigin.status === 403 && httpOrigin.status === 403, `${noOrigin.status} ${httpOrigin.status}`);
  const ok = await turn(say("Our data team needs finance to change a goal"), invites[0]);
  check("hosted: a turn with an unspent invite -> 200", ok.status === 200 && ok.json?.draft, `${ok.status} ${ok.text}`);
  const again = await turn(say("Our data team needs finance to change a goal"), invites[0]);
  check("hosted: an invite isn't spent by interviewing (a second turn with it -> 200)", again.status === 200, `${again.status}`);
  const created = await req("POST", "/api/workspaces", { body: { ...FIXTURE, signup_code: invites[0] }, headers: site() });
  check("hosted: the same invite still creates the workspace afterwards (201)", created.status === 201, `${created.status} ${created.text}`);
  const spent = await turn(say("one more"), invites[0]);
  check("hosted: once that invite is spent, the interview refuses it (403)", spent.status === 403, `${spent.status}`);

  // Per-code cap: one valid code used from many addresses still stops at 60 turns a day (spend is bounded by codes).
  let codeStatus = 200;
  let codeTurns = 0;
  while (codeStatus === 200 && codeTurns < 70) {
    const r = await turn(say("hello"), invites[1], { ...site(), "fly-client-ip": `203.0.113.${codeTurns + 1}` });
    codeStatus = r.status;
    codeTurns++;
    if (codeStatus === 429) check("hosted: per-code cap -> 429 within 60 turns, across 60+ client addresses", codeTurns <= 61 && /limit for today/.test(r.json?.error ?? ""), `${codeTurns} ${r.text}`);
  }
  if (codeStatus !== 429) check("hosted: per-code cap -> 429 within 60 turns, across 60+ client addresses", false, `status ${codeStatus} after ${codeTurns}`);

  // Host header: only an allowed name with an optional numeric port; anything else after it is refused.
  const portOk = await req("GET", "/api/workspaces/config", { headers: { host: `${HOSTED_HOST}:443` } });
  const junk = await req("GET", "/api/workspaces/config", { headers: { host: `${HOSTED_HOST}:443;touch\${IFS}/tmp/pwn;` } });
  check("hosted: Host with a numeric port is served; Host with anything else after the name is refused", portOk.status === 200 && junk.status !== 200 && !junk.text.includes("pwn"), `${portOk.status} ${junk.status} ${junk.text.slice(0, 80)}`);
  await stop();
}

// ---- run ----
if (BUILD) {
  const b = spawnSync("npx", ["next", "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  if (b.status !== 0) process.exit(1);
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "align-interview-"));
try {
  const net = (name) => ({ NODE_OPTIONS: `--import ${pathToFileURL(path.join(ROOT, "scripts/interview-test-net.mjs")).href}`, ALIGN_TEST_INTERVIEW_LOG: path.join(tmp, `${name}.log`) });
  await phaseOff({ ...net("off"), ALIGN_DATA_DIR: path.join(tmp, "off") });
  await phaseLocal(net("local"), path.join(tmp, "local"));
  await phaseHosted(net("hosted"), path.join(tmp, "hosted"));
} catch (e) {
  fail++;
  console.log(`FAIL  [${phaseName}] stopped: ${e.message}`);
} finally {
  await stop();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\ntest-interview: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
