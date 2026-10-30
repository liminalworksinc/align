#!/usr/bin/env node
// Connected AI apps: Align's OAuth server and the OAuth-only MCP endpoint (lib/oauth, app/oauth, app/api/mcp).
// Builds once (skip with --no-build), then runs the same checks on two production servers on <port>:
//   phase "local":  Mode L, open create, workspaces in a temp ALIGN_DATA_DIR
//   phase "hosted": HOSTED=1 as Fly runs it (Host align.test, X-Forwarded-Proto https, Fly-Client-IP), invite codes
// Usage: node scripts/test-oauth.mjs <port> [--no-build]   (from a worktree root; refuses 3100 and the main checkout)

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.argv[2]);
const BUILD = !process.argv.includes("--no-build");
if (!Number.isInteger(PORT) || PORT === 3100) {
  console.error("usage: node scripts/test-oauth.mjs <port> [--no-build] (not 3100)");
  process.exit(2);
}
const ROOT = process.cwd();
if (path.resolve(ROOT) === path.join(os.homedir(), "liminal/align")) {
  console.error(`test-oauth: refusing the main checkout ${ROOT}; run from a worktree`);
  process.exit(2);
}
if (spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]).status === 0) {
  console.error(`test-oauth: port ${PORT} is already in use`);
  process.exit(2);
}
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "data/scenarios/example-custom.json"), "utf8"));
const HOSTED_HOST = "align.test";
const REDIRECT = "http://127.0.0.1:33418/callback";

let pass = 0;
let fail = 0;
let phaseName = "";
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  [${phaseName}] ${name}${ok ? "" : `  ${String(detail).slice(0, 300)}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- HTTP: node:http, so Host and Origin are exactly what a test says ----
let HOSTED = false;
function req(method, p, { body, form, raw, headers = {}, cookie, host } = {}) {
  return new Promise((resolve, reject) => {
    let data;
    const h = { host: host ?? (HOSTED ? HOSTED_HOST : `127.0.0.1:${PORT}`), ...(HOSTED ? { "x-forwarded-proto": "https", "fly-client-ip": "198.51.100.9" } : {}) };
    if (body !== undefined) {
      data = JSON.stringify(body);
      h["content-type"] = "application/json";
    } else if (form !== undefined) {
      data = new URLSearchParams(form).toString();
      h["content-type"] = "application/x-www-form-urlencoded";
    } else if (raw !== undefined) data = raw;
    if (data !== undefined) h["content-length"] = Buffer.byteLength(data);
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
        const sc = res.headers["set-cookie"] ?? [];
        resolve({ status: res.statusCode, headers: res.headers, text: t, json, cookie: (sc[0] || "").split(";")[0] });
      });
    });
    r.on("error", reject);
    if (data !== undefined) r.write(data);
    r.end();
  });
}
const origin = () => (HOSTED ? `https://${HOSTED_HOST}` : `http://127.0.0.1:${PORT}`);
/** A browser on this site: its Origin on every write. */
const site = () => ({ origin: origin() });

// ---- server ----
let server = null;
async function start(env) {
  rmSync(path.join(ROOT, "data/state.json"), { force: true });
  rmSync(path.join(ROOT, "data/.secret"), { force: true });
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^(ALIGN_|HOSTED$|AI_GATEWAY_API_KEY$)/.test(k)) delete clean[k];
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env: { ...clean, ...env }, stdio: ["ignore", "ignore", "pipe"], detached: true });
  let err = "";
  server.stderr.on("data", (c) => (err += c));
  for (let i = 0; i < 90; i++) {
    try {
      const r = await req("GET", "/api/workspaces/config");
      if (r.status === 200) return;
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

// ---- OAuth helpers ----
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
function authParams(clientId, challenge, extra = {}) {
  return { response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "st-123", resource: `${origin()}/api/mcp`, ...extra };
}
async function approve(params, who, headers = site()) {
  return req("POST", "/api/oauth/approve", { body: { params, decision: "approve", ...who }, headers, cookie: who.cookie });
}
const codeFrom = (r) => (r.json?.redirect ? new URL(r.json.redirect).searchParams.get("code") : null);
async function token(form) {
  return req("POST", "/oauth/token", { form });
}
/** A whole sign-in: approve as `who`, exchange the code. Returns the token response. */
async function connect(clientId, who) {
  const { verifier, challenge } = pkce();
  const code = codeFrom(await approve(authParams(clientId, challenge), who));
  const t = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${origin()}/api/mcp` });
  return t.json;
}
async function mcp(tokenValue, name = "align_list_goals", { headers = {}, host } = {}) {
  return req("POST", "/api/mcp", {
    body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } },
    headers: { accept: "application/json, text/event-stream", ...(tokenValue ? { authorization: `Bearer ${tokenValue}` } : {}), ...headers },
    host,
  });
}
/** structuredContent of a tools/call answer (JSON or one SSE event). */
function structured(r) {
  const text = r.text.includes("data:") ? r.text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) : r.text;
  try {
    return JSON.parse(text).result?.structuredContent ?? null;
  } catch {
    return null;
  }
}

async function makeWorkspace(company, invite) {
  const r = await req("POST", "/api/workspaces", { body: { ...FIXTURE, company, ...(invite ? { signup_code: invite } : {}) }, headers: site() });
  if (r.status !== 200 && r.status !== 201) throw new Error(`create ${company}: ${r.status} ${r.text}`);
  return { id: r.json.workspace.id, passcodes: r.json.passcodes, company };
}
async function signIn(ws, role) {
  const r = await req("POST", "/api/session", { body: { workspace: ws.id, role, passcode: ws.passcodes[role] }, headers: site() });
  if (r.status !== 200) throw new Error(`sign in ${role}: ${r.status} ${r.text}`);
  return r.cookie;
}

// ---- a client-document host: scripts/oauth-test-net.mjs, preloaded into the server, sends pub*.addr.align-test here ----
// /doc answers at once with a document that names its app "Claude"; anything else drips one byte a second for 12 s.
// `open` and `max` count the fetches in flight, so a test can see how many the server makes at once.
const docServer = { open: 0, max: 0, srv: null };
async function startDocServer(dir) {
  const [key, cert] = [path.join(dir, "doc-key.pem"), path.join(dir, "doc-cert.pem")];
  const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=align-test"], { stdio: "ignore" });
  if (made.status !== 0) throw new Error("openssl could not make the test certificate");
  docServer.srv = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (rq, rs) => {
    docServer.max = Math.max(docServer.max, ++docServer.open);
    rs.on("close", () => docServer.open--);
    rs.writeHead(200, { "content-type": "application/json" });
    if (rq.url === "/doc") return rs.end(JSON.stringify({ client_id: `https://${rq.headers.host}/doc`, client_name: "Claude", redirect_uris: [REDIRECT] }));
    let n = 0;
    const drip = setInterval(() => (++n > 12 ? (clearInterval(drip), rs.end()) : rs.write(" ")), 1000);
    rs.on("close", () => clearInterval(drip));
  });
  await new Promise((r) => docServer.srv.listen(0, "127.0.0.1", r));
  return docServer.srv.address().port;
}
/** React splits text with empty comments; page text as a person reads it. */
const plain = (t) => t.replace(/<!-- -->/g, "");

// ---- the checks, run once per phase ----
async function phase(name, env, invites = []) {
  phaseName = name;
  HOSTED = env.HOSTED === "1";
  await start(env);
  const dataDir = env.ALIGN_DATA_DIR;

  // metadata
  const as = await req("GET", "/.well-known/oauth-authorization-server");
  check(
    "authorization server metadata: issuer is this origin, S256 only, CIMD and DCR",
    as.status === 200 && as.json?.issuer === origin() && JSON.stringify(as.json.code_challenge_methods_supported) === '["S256"]' && as.json.client_id_metadata_document_supported === true && !!as.json.registration_endpoint,
    as.text,
  );
  const prm = await req("GET", "/.well-known/oauth-protected-resource/api/mcp");
  const prmRoot = await req("GET", "/.well-known/oauth-protected-resource");
  check(
    "protected resource metadata (both paths): resource is this origin's /api/mcp, served by this origin's authorization server",
    prm.json?.resource === `${origin()}/api/mcp` && prm.json?.authorization_servers?.[0] === origin() && prmRoot.text === prm.text,
    prm.text,
  );
  const anon = await mcp(null);
  check(
    "MCP without a token -> 401, challenge names the path-suffixed metadata",
    anon.status === 401 && (anon.headers["www-authenticate"] ?? "").includes(`${origin()}/.well-known/oauth-protected-resource/api/mcp`),
    `${anon.status} ${anon.headers["www-authenticate"]}`,
  );

  const A = await makeWorkspace("Harbor Alpha", invites[0]);
  const B = await makeWorkspace("Harbor Beta", invites[1]);

  // registration
  const reg = await req("POST", "/oauth/register", { body: { client_name: "Test\nCLI\u0007", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" } });
  const clientId = reg.json?.client_id;
  check("DCR registers a public client with a loopback redirect (201); the name loses control characters", reg.status === 201 && /^dcr_/.test(clientId ?? "") && reg.json.client_name === "Test CLI", reg.text);
  const regBad = await Promise.all([
    req("POST", "/oauth/register", { body: { redirect_uris: ["http://evil.example/cb"] } }),
    req("POST", "/oauth/register", { body: { redirect_uris: ["https://ok.example/cb#frag"] } }),
    req("POST", "/oauth/register", { body: { redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" } }),
  ]);
  check("DCR refuses an http redirect off loopback, a fragment, and a confidential client (400)", regBad.every((r) => r.status === 400), regBad.map((r) => r.status).join(","));
  const bidi = await req("POST", "/oauth/register", { body: { client_name: "Clau\u202Ede\u200B\uFEFF App\u2066", redirect_uris: [REDIRECT] } });
  check("L3 an app's name loses bidi and zero-width characters", bidi.status === 201 && bidi.json.client_name === "Claude App", bidi.text);
  const blank = await req("POST", "/oauth/register", { body: { client_name: "Cl\u115Fau\u3164de\u034F\u1160\uFFA0\u2800\u17B4\u17B5", redirect_uris: [REDIRECT] } });
  check("I4 an app's name loses blank letters (Hangul fillers, combining grapheme joiner, blank Braille, Khmer vowels)", blank.status === 201 && blank.json.client_name === "Claude", JSON.stringify(blank.json?.client_name));

  // the consent page
  const { challenge } = pkce();
  const q = (o) => `/oauth/authorize?${new URLSearchParams(o)}`;
  const page = await req("GET", q(authParams(clientId, challenge)));
  check(
    "consent page renders for a valid request, framed by nobody, not cached",
    page.status === 200 && page.text.includes("Connect") && page.text.includes("Test CLI") && page.headers["x-frame-options"] === "DENY" && /frame-ancestors 'none'/.test(page.headers["content-security-policy"] ?? "") && /no-store/.test(page.headers["cache-control"] ?? ""),
    `${page.status} ${page.headers["x-frame-options"]}`,
  );
  const badRedirect = await req("GET", q(authParams(clientId, challenge, { redirect_uri: "https://evil.example/cb" })));
  check("an unregistered redirect is refused on Align's page, never redirected to", badRedirect.status === 200 && badRedirect.text.includes("didn’t register") && !badRedirect.text.includes("evil.example/cb?"), badRedirect.status);
  const unknown = await req("GET", q(authParams("dcr_AAAAAAAAAAAAAAAAAAAAAA", challenge)));
  const cimdLocal = await req("GET", q(authParams("https://localhost/client.json", challenge)));
  check("unknown client id, and a client metadata document on a private address, are refused", unknown.text.includes("doesn’t recognize") && cimdLocal.text.includes("doesn’t recognize"), `${unknown.status} ${cimdLocal.status}`);
  // A client document that can't be fetched (.invalid never resolves) is a temporary problem: say so, and don't
  // remember it, so the same app works once its host answers.
  const unreachable = await req("GET", q(authParams("https://align-test.invalid/client.json", challenge)));
  check("a client document that can't be fetched -> 'try again', not 'remove it'", unreachable.text.includes("couldn’t reach") && !unreachable.text.includes("doesn’t recognize"), unreachable.status);
  if (HOSTED) {
    // Client documents (review L4, L5, M2). The consent page views below come from their own client addresses.
    const named = await req("GET", q(authParams("https://pub-named.addr.align-test/doc", challenge)), { headers: { "fly-client-ip": "198.51.100.30" } });
    check("L4 a client document can name its app anything: the page says it named itself", plain(named.text).includes("Connect Claude to Align") && plain(named.text).includes("This app named itself"), plain(named.text).match(/<h1[^>]*>[^<]*/)?.[0]);
    const kinds = ["mapped", "compat", "sixtofour", "teredo", "nat64", "ula", "linklocal", "doc4"];
    const through = [];
    for (const k of kinds) {
      const r = await req("GET", q(authParams(`https://${k}.addr.align-test/client.json`, challenge)), { headers: { "fly-client-ip": "198.51.100.31" } });
      if (!r.text.includes("doesn’t recognize")) through.push(k);
    }
    check("L5 a client document on a private address in disguise (hex v4-mapped, v4-compatible, 6to4, Teredo, NAT64, ULA, link-local, TEST-NET) is refused", through.length === 0, `fetched: ${through.join(",")}`);
    const views = [];
    for (let i = 0; i < 31; i++) views.push(plain((await req("GET", q(authParams(clientId, challenge)), { headers: { "fly-client-ip": "198.51.100.32" } })).text));
    check("M2 the consent page allows 30 views a minute per client, then says too many requests", views.slice(0, 30).every((v) => v.includes("Connect Test CLI")) && views[30].includes("Too many requests"), views[30].slice(0, 200));
    const t0 = Date.now();
    const slow = await req("GET", q(authParams("https://pub-slow.addr.align-test/slow", challenge)), { headers: { "fly-client-ip": "198.51.100.33" } });
    const ms = Date.now() - t0;
    check("M2 a client document that drips a byte a second is cut off at 3 s in all ('try again'), not held open", ms < 5000 && slow.text.includes("couldn’t reach"), `${ms} ms`);
    docServer.max = 0;
    const t1 = Date.now();
    const many = await Promise.all(Array.from({ length: 12 }, (_, i) => req("GET", q(authParams(`https://pub-c${i}.addr.align-test/slow`, challenge)), { headers: { "fly-client-ip": `198.51.100.${40 + i}` } })));
    const ms2 = Date.now() - t1;
    check("M2 at most 8 client documents are fetched at once across the server; the rest are told to try again", docServer.max >= 1 && docServer.max <= 8 && many.every((r) => r.text.includes("couldn’t reach")) && ms2 < 6000, `max ${docServer.max} at once, ${ms2} ms`);
    // I2: two more IPv6 forms that carry or stand for a private address.
    const more = [];
    for (const k of ["siit", "discard"]) {
      const r = await req("GET", q(authParams(`https://${k}.addr.align-test/client.json`, challenge)), { headers: { "fly-client-ip": "198.51.100.34" } });
      if (!r.text.includes("doesn’t recognize")) more.push(k);
    }
    check("I2 a client document on IPv4-translated ::ffff:0:a.b.c.d or discard 100::/64 is refused", more.length === 0, `fetched: ${more.join(",")}`);
    // N1: 8 stalled documents fill the cap. An app seen before (its cached document now stale) and an app whose
    // document is on Anthropic's or OpenAI's own site must still get the consent page, not 'try again'.
    const seen = "https://pub-seen.addr.align-test/doc";
    const warm = await req("GET", q(authParams(seen, challenge)), { headers: { "fly-client-ip": "198.51.100.60" } });
    await req("GET", q(authParams("https://clock.addr.align-test/client.json", challenge)), { headers: { "fly-client-ip": "198.51.100.61" } });
    const stalled = Promise.all(Array.from({ length: 8 }, (_, i) => req("GET", q(authParams(`https://pub-n${i}.addr.align-test/slow`, challenge)), { headers: { "fly-client-ip": `198.51.100.${70 + i}` } })));
    await sleep(800);
    const full = docServer.open;
    const [again, provider, stranger] = await Promise.all([
      req("GET", q(authParams(seen, challenge)), { headers: { "fly-client-ip": "198.51.100.62" } }),
      req("GET", q(authParams("https://align-test.claude.ai/doc", challenge)), { headers: { "fly-client-ip": "198.51.100.63" } }),
      req("GET", q(authParams("https://pub-new.addr.align-test/doc", challenge)), { headers: { "fly-client-ip": "198.51.100.64" } }),
    ]);
    await stalled;
    check("N1 the cap still holds: a new app off those sites, while it is full, is told to try again", full >= 8 && stranger.text.includes("couldn’t reach"), `${full} stalled; ${plain(stranger.text).match(/<h1[^>]*>[^<]*/)?.[0]}`);
    check("N1 with the cap full of stalled documents, an app seen before still connects (its last good document)", plain(warm.text).includes("Connect Claude") && full >= 8 && plain(again.text).includes("Connect Claude"), `${full} stalled; ${plain(again.text).match(/<h1[^>]*>[^<]*/)?.[0]}`);
    check("N1 with the cap full of stalled documents, an app on Anthropic's or OpenAI's own site still connects", full >= 8 && plain(provider.text).includes("Connect Claude") && !plain(provider.text).includes("This app named itself"), `${full} stalled; ${plain(provider.text).match(/<h1[^>]*>[^<]*/)?.[0]}`);
  }
  const noPkce = await approve(authParams(clientId, challenge, { code_challenge_method: "plain" }), { workspace: A.id, role: "security", passcode: A.passcodes.security });
  check("plain PKCE -> the app gets invalid_request, no code", noPkce.status === 200 && /error=invalid_request/.test(noPkce.json?.redirect ?? "") && !/code=/.test(noPkce.json.redirect), noPkce.text);
  const wrongRes = await approve(authParams(clientId, challenge, { resource: "https://other.example/api/mcp" }), { workspace: A.id, role: "security", passcode: A.passcodes.security });
  check("another resource -> invalid_target", /error=invalid_target/.test(wrongRes.json?.redirect ?? ""), wrongRes.text);

  // approve: CSRF, passcodes, workspaces
  const csrf = await approve(authParams(clientId, challenge), { workspace: A.id, role: "security", passcode: A.passcodes.security }, { origin: "https://evil.example" });
  const csrfNone = HOSTED ? await approve(authParams(clientId, challenge), { workspace: A.id, role: "security", passcode: A.passcodes.security }, {}) : { status: 403 };
  check("approve from another site's Origin -> 403 (hosted: no Origin too)", csrf.status === 403 && csrfNone.status === 403, `${csrf.status} ${csrfNone.status}`);
  const wrongPass = await approve(authParams(clientId, challenge), { workspace: A.id, role: "security", passcode: "nope-nope-nope" });
  const crossPass = await approve(authParams(clientId, challenge), { workspace: B.id, role: "security", passcode: A.passcodes.security });
  check("wrong passcode, and A's passcode for B -> 401, no code", wrongPass.status === 401 && crossPass.status === 401, `${wrongPass.status} ${crossPass.status}`);
  const deny = await req("POST", "/api/oauth/approve", { body: { params: authParams(clientId, challenge), decision: "deny" }, headers: site() });
  check("Cancel sends the app access_denied with its state and iss", /error=access_denied/.test(deny.json?.redirect ?? "") && /state=st-123/.test(deny.json.redirect) && deny.json.redirect.includes(`iss=${encodeURIComponent(origin())}`), deny.text);

  // codes
  const p1 = pkce();
  const ok1 = await approve(authParams(clientId, p1.challenge), { workspace: `${origin()}/w/${A.id}`, role: "security", passcode: A.passcodes.security });
  const code1 = codeFrom(ok1);
  check("approve with the workspace link and Security's passcode -> the app's redirect with a code, state and iss", !!code1 && ok1.json.redirect.startsWith(REDIRECT) && /state=st-123/.test(ok1.json.redirect) && ok1.json.redirect.includes("iss="), ok1.text);
  const badVerifier = await token({ grant_type: "authorization_code", code: code1, redirect_uri: REDIRECT, client_id: clientId, code_verifier: pkce().verifier });
  const otherClient = await token({ grant_type: "authorization_code", code: code1, redirect_uri: REDIRECT, client_id: "dcr_BBBBBBBBBBBBBBBBBBBBBB", code_verifier: p1.verifier });
  check("token: wrong PKCE verifier, or another client -> invalid_grant", badVerifier.json?.error === "invalid_grant" && otherClient.json?.error === "invalid_grant", `${badVerifier.text} ${otherClient.text}`);
  const t1 = await token({ grant_type: "authorization_code", code: code1, redirect_uri: REDIRECT, client_id: clientId, code_verifier: p1.verifier });
  check(
    "token: the right verifier -> alm. access token (1 h), alr. refresh token, no-store",
    t1.status === 200 && /^alm\./.test(t1.json?.access_token ?? "") && /^alr\./.test(t1.json?.refresh_token ?? "") && t1.json.expires_in === 3600 && /no-store/.test(t1.headers["cache-control"] ?? ""),
    t1.text,
  );
  const r1 = await mcp(t1.json.access_token);
  check("MCP with that token reads workspace A", r1.status === 200 && structured(r1)?.org === "Harbor Alpha", `${r1.status} ${r1.text.slice(0, 200)}`);
  const replay = await token({ grant_type: "authorization_code", code: code1, redirect_uri: REDIRECT, client_id: clientId, code_verifier: p1.verifier });
  const afterReplay = await mcp(t1.json.access_token);
  check("a code used twice -> invalid_grant, and the token it gave stops working (401)", replay.json?.error === "invalid_grant" && afterReplay.status === 401, `${replay.text} ${afterReplay.status}`);

  // a token reads one workspace, for one resource
  const t2 = await connect(clientId, { workspace: A.id, role: "security", passcode: A.passcodes.security });
  const goals = structured(await mcp(t2.access_token));
  check("an A token sees A's goals only, never B's", goals?.org === "Harbor Alpha" && !JSON.stringify(goals).includes("Harbor Beta"), JSON.stringify(goals).slice(0, 200));
  const tools = ["align_get_accepted_plan", "align_get_work_map", "align_get_decision_record", "align_get_directives"];
  const rest = await Promise.all(tools.map((t) => mcp(t2.access_token, t)));
  check("every read-only tool answers for a connected app", rest.every((r) => r.status === 200 && structured(r)), rest.map((r) => r.status).join(","));
  // What the app is shown: no Northstar argument (a chat app displayed it as "Team: security"), and no internal
  // team id in what the tools say. This workspace calls that team by its own name.
  const toolList = await req("POST", "/api/mcp", { body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, headers: { accept: "application/json, text/event-stream", authorization: `Bearer ${t2.access_token}` } });
  const listed = JSON.parse(toolList.text.includes("data:") ? toolList.text.split("\n").find((l) => l.startsWith("data:")).slice(5) : toolList.text).result?.tools ?? [];
  const planTool = listed.find((t) => t.name === "align_get_accepted_plan");
  const said = rest.map((r) => r.text).join(" ") + toolList.text;
  check("a connected app sees no internal team ids: the accepted plan takes no team, and no tool calls a team 'security' (ids like g-security-v1 aside)", !!planTool && !planTool.inputSchema?.properties?.team && !/(?<![-\w])security(?![-\w])/i.test(said), JSON.stringify(planTool?.inputSchema) + " " + (said.match(/.{60}(?<![-\w])security(?![-\w]).{60}/i)?.[0] ?? ""));
  const otherHost = HOSTED ? { status: 421 } : await mcp(t2.access_token, "align_list_goals", { host: `localhost:${PORT}` });
  check("a token is bound to its resource: the same token at another origin -> 401 (hosted: other hosts are 421)", HOSTED || otherHost.status === 401, otherHost.status);
  const withOrigin = await mcp(t2.access_token, "align_list_goals", { headers: { origin: origin() } });
  check("MCP from a browser (any Origin, even this server's) -> 403, in every mode", withOrigin.status === 403, withOrigin.status);
  if (HOSTED) {
    const agt = await mcp("agt.e30.AAAA");
    check("hosted: an agent token or a static token is never accepted (401)", agt.status === 401, agt.status);
  }
  const forged = t2.access_token.replace(/\.([^.]+)$/, ".AAAA");
  check("a token with a bad signature -> 401", (await mcp(forged)).status === 401);

  // the workspace's list of connected apps
  await sleep(800); // the first read is recorded off the request path
  const secCookie = await signIn(A, "security");
  const list = await req("GET", "/api/workspaces/connections", { cookie: secCookie, headers: { "x-align-workspace": A.id } });
  const app = list.json?.apps?.find((a) => a.name === "Test CLI" && a.last_used_at);
  check("the workspace lists the app as reading, with its role and redirect host, and the URL to connect", list.status === 200 && !!app && app.role === "security" && app.redirect_host === "127.0.0.1:33418" && list.json.url === `${origin()}/api/mcp`, list.text);
  const bList = await req("GET", "/api/workspaces/connections", { cookie: await signIn(B, "leadership") });
  check("B's list doesn't show A's apps", bList.status === 200 && bList.json.apps.length === 0, bList.text);

  // Agents on this plan (lib/plan-rev.ts): an app is on the current plan until the plan changes, then again once it reads
  check("an app that read the workspace is on the current plan", app?.on_current_plan === true, JSON.stringify(app));
  const planProd = await signIn(A, "product");
  const moved = await req("POST", "/api/proposals", { body: { proposed_measure_text: "PLANREV new target", rationale: "PLANREV why", reciprocal_commitment: "PLANREV in return" }, cookie: planProd, headers: site() });
  const staleList = await req("GET", "/api/workspaces/connections", { cookie: secCookie });
  const stale = staleList.json?.apps?.find((a) => a.id === app?.id);
  check("after the plan changes (a new proposal), the app is shown as still on an older plan, with when it changed", moved.status < 300 && stale?.on_current_plan === false && !!staleList.json?.plan?.changed_at, `${moved.status} ${staleList.text}`);
  await mcp(t2.access_token);
  await sleep(800); // recorded off the request path
  const caught = (await req("GET", "/api/workspaces/connections", { cookie: secCookie })).json?.apps?.find((a) => a.id === app?.id);
  check("once the app reads again it is back on the current plan (recorded at once, not after 5 minutes)", caught?.on_current_plan === true, JSON.stringify(caught));

  // refresh rotation
  const rf = await token({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: clientId });
  check("refresh -> a new access token and a new refresh token", rf.status === 200 && rf.json.refresh_token !== t2.refresh_token && (await mcp(rf.json.access_token)).status === 200, rf.text);
  const rfWrongClient = await token({ grant_type: "refresh_token", refresh_token: rf.json.refresh_token, client_id: "dcr_BBBBBBBBBBBBBBBBBBBBBB" });
  check("refresh by another client -> invalid_grant", rfWrongClient.json?.error === "invalid_grant", rfWrongClient.text);
  const rfReuse = await token({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: clientId });
  const rfAfter = await token({ grant_type: "refresh_token", refresh_token: rf.json.refresh_token, client_id: clientId });
  check("an old refresh token used again -> invalid_grant, and the grant ends (new token refused, access 401)", rfReuse.json?.error === "invalid_grant" && rfAfter.json?.error === "invalid_grant" && (await mcp(rf.json.access_token)).status === 401, `${rfReuse.text} ${rfAfter.text}`);

  // disconnect, restart, session approval
  const t3 = await connect(clientId, { workspace: A.id, role: "product", passcode: A.passcodes.product });
  await mcp(t3.access_token);
  await sleep(500);
  const l3 = (await req("GET", "/api/workspaces/connections", { cookie: secCookie })).json.apps.find((a) => a.role === "product");
  const secDel = await req("DELETE", "/api/workspaces/connections", { body: { id: l3?.id }, cookie: secCookie, headers: site() });
  const prodCookie = await signIn(A, "product");
  const prodDel = await req("DELETE", "/api/workspaces/connections", { body: { id: l3?.id }, cookie: prodCookie, headers: site() });
  check("Security can't disconnect Product's app (403); Product can, and its token stops (401)", secDel.status === 403 && prodDel.status === 200 && (await mcp(t3.access_token)).status === 401, `${secDel.status} ${prodDel.status}`);
  const delCsrf = await req("DELETE", "/api/workspaces/connections", { body: {}, cookie: prodCookie, headers: { origin: "https://evil.example" } });
  check("disconnect from another site -> 403", delCsrf.status === 403, delCsrf.status);
  const t4 = await connect(clientId, { use_session: true, cookie: await signIn(A, "leadership") });
  check("a browser already signed in approves without a passcode", /^alm\./.test(t4?.access_token ?? "") && (await mcp(t4.access_token)).status === 200, JSON.stringify(t4));
  const lead = await signIn(A, "leadership");
  const reset = await req("POST", "/api/reset", { body: { confirm: "reset" }, cookie: lead, headers: site() });
  const afterReset = await mcp(t4.access_token);
  const rfReset = await token({ grant_type: "refresh_token", refresh_token: t4.refresh_token, client_id: clientId });
  check("Restart disconnects every app: access 401, refresh invalid_grant", reset.status === 200 && afterReset.status === 401 && rfReset.json?.error === "invalid_grant", `${reset.status} ${afterReset.status} ${rfReset.text}`);
  const t5 = await connect(clientId, { workspace: A.id, role: "security", passcode: A.passcodes.security });
  const t6 = await connect(clientId, { workspace: A.id, role: "security", passcode: A.passcodes.security });
  const l6 = (await req("GET", "/api/workspaces/connections", { cookie: secCookie })).json.apps.filter((a) => a.role === "security" && a.name === "Test CLI");
  check("connecting the same app as the same team again replaces the earlier connection (one row; the old token stops)", l6.length === 1 && (await mcp(t5.access_token)).status === 401 && (await mcp(t6.access_token)).status === 200, JSON.stringify(l6));
  const allProd = await req("DELETE", "/api/workspaces/connections", { body: {}, cookie: prodCookie, headers: site() });
  const allLead = await req("DELETE", "/api/workspaces/connections", { body: {}, cookie: await signIn(A, "leadership"), headers: site() });
  check("Disconnect all: leadership only (403 otherwise), then every token stops", allProd.status === 403 && allLead.status === 200 && (await mcp(t6.access_token)).status === 401, `${allProd.status} ${allLead.status}`);

  // audit and files
  const stFile = JSON.parse(readFileSync(path.join(dataDir, "workspaces", A.id, "state.json"), "utf8"));
  const actions = (stFile.audit ?? []).map((a) => a.action);
  check("audit rows for approve and disconnect", actions.includes("ai_app_approved") && actions.includes("ai_app_disconnected") && actions.includes("ai_apps_disconnected"), actions.join(","));
  const oauthFile = path.join(dataDir, "workspaces", A.id, "oauth.json");
  const mode = (statSync(oauthFile).mode & 0o777).toString(8);
  let all = "";
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else all += readFileSync(p, "utf8");
    }
  })(dataDir);
  const secret = t5.refresh_token.split(".").at(-1);
  check("oauth.json is 0600 and no refresh secret or access token is stored", mode === "600" && !all.includes(secret) && !all.includes(t5.access_token), mode);

  // codes under load and deletion (review L1, L2), in workspace B, which nothing above needs any more
  {
    const p = pkce();
    const code = codeFrom(await approve(authParams(clientId, p.challenge), { workspace: B.id, role: "security", passcode: B.passcodes.security }));
    const f = { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: p.verifier };
    const [x, y] = await Promise.all([token(f), token(f)]);
    const won = x.json?.access_token ?? y.json?.access_token;
    check("L1 a code exchanged twice at once: one gets invalid_grant, and the other's token is revoked too (401)", [x, y].some((r) => r.json?.error === "invalid_grant") && !!won && (await mcp(won)).status === 401, `${x.status} ${y.status}`);
  }
  {
    const p = pkce();
    const code = codeFrom(await approve(authParams(clientId, p.challenge), { workspace: B.id, role: "product", passcode: B.passcodes.product }));
    const del = spawnSync("node", [path.join(ROOT, "scripts/ws-admin.mjs"), "delete", B.id], { env: { ...process.env, ALIGN_DATA_DIR: dataDir }, encoding: "utf8" });
    const late = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: p.verifier });
    check("L2 a code outstanding when its workspace is deleted -> invalid_grant (400), not a server error", del.status === 0 && late.status === 400 && late.json?.error === "invalid_grant", `${del.status} ${late.status} ${late.text}`);
  }

  await stop();
}

// Rotating ALIGN_SECRET (review M1): a restart with a new secret ends every connected app, refresh tokens included.
// Client-document cache (re-review N1-evict and stale redirect URIs) runs here too, on a fresh server.
async function rotation(env, invite) {
  phaseName = "rotate";
  HOSTED = true;
  await start(env);
  const W = await makeWorkspace("Harbor Rotate", invite);
  const c = (await req("POST", "/oauth/register", { body: { client_name: "Rotate CLI", redirect_uris: [REDIRECT] } })).json.client_id;
  const t = await connect(c, { workspace: W.id, role: "security", passcode: W.passcodes.security });
  const before = (await mcp(t.access_token)).status;

  // N1-evict: an app with a live grant keeps its good document while 200 others pass through the cache.
  const { challenge } = pkce();
  const page = (clientId, ip) => req("GET", `/oauth/authorize?${new URLSearchParams(authParams(clientId, challenge))}`, { headers: { "fly-client-ip": ip } });
  const kept = "https://pub-kept.addr.align-test/doc";
  const plainApp = "https://pub-plain.addr.align-test/doc";
  const tk = await connect(kept, { workspace: W.id, role: "product", passcode: W.passcodes.product });
  const warmPlain = await page(plainApp, "198.51.100.99");
  for (let i = 0; i < 25; i++) await Promise.all(Array.from({ length: 8 }, (_, j) => page(`https://pub-f${i * 8 + j}.addr.align-test/doc`, `198.51.100.${100 + j}`)));
  const stalled = Promise.all(Array.from({ length: 8 }, (_, i) => page(`https://pub-r${i}.addr.align-test/slow`, `198.51.100.${120 + i}`)));
  await sleep(800);
  const full = docServer.open;
  const [keptPage, plainPage] = await Promise.all([page(kept, "198.51.100.130"), page(plainApp, "198.51.100.131")]);
  await stalled;
  check(
    "N1-evict an app with a live grant keeps its document through 200 others, and still connects with the cap full",
    /^alm\./.test(tk?.access_token ?? "") && full >= 8 && plain(keptPage.text).includes("Connect Claude"),
    `${full} stalled; ${plain(keptPage.text).match(/<h1[^>]*>[^<]*/)?.[0]}`,
  );
  check(
    "N1-evict the 200-document bound still holds for an app without a grant: pushed out, so 'try again' with the cap full",
    plain(warmPlain.text).includes("Connect Claude") && full >= 8 && plainPage.text.includes("couldn’t reach"),
    `${full} stalled; ${plain(plainPage.text).match(/<h1[^>]*>[^<]*/)?.[0]}`,
  );
  await stop();

  await start({ ...env, ALIGN_SECRET: "r".repeat(48) });
  const access = await mcp(t.access_token);
  const rf = await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: c });
  check("M1 rotating ALIGN_SECRET ends every connected app: the old access token 401, the old refresh token invalid_grant", before === 200 && access.status === 401 && rf.json?.error === "invalid_grant", `${before} ${access.status} ${rf.text}`);
  const after = await req("GET", "/api/workspaces/connections", { cookie: await signIn(W, "leadership") });
  check("I3 after the rotation the workspace lists no connected apps (their grants can never refresh)", before === 200 && after.status === 200 && after.json.apps.length === 0, after.text);

  // Stale redirect URIs: a document more than a day old is not served when the cap is full.
  const old = "https://pub-old.addr.align-test/doc";
  const warmOld = await page(old, "198.51.100.140");
  await page("https://clock-1500.addr.align-test/client.json", "198.51.100.141");
  const stalled2 = Promise.all(Array.from({ length: 8 }, (_, i) => page(`https://pub-o${i}.addr.align-test/slow`, `198.51.100.${150 + i}`)));
  await sleep(800);
  const full2 = docServer.open;
  const oldPage = await page(old, "198.51.100.142");
  await stalled2;
  check(
    "a document more than a day old is not served with the cap full ('try again'), so removed redirects don't live on",
    plain(warmOld.text).includes("Connect Claude") && full2 >= 8 && oldPage.text.includes("couldn’t reach"),
    `${full2} stalled; ${plain(oldPage.text).match(/<h1[^>]*>[^<]*/)?.[0]}`,
  );
  await stop();
}

// ---- run ----
if (BUILD) {
  console.log("building…");
  const b = spawnSync("npx", ["next", "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  if (b.status !== 0) process.exit(1);
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "align-oauth-"));
try {
  // Every server in this test loads the network stand-ins (scripts/oauth-test-net.mjs) and reaches the document server.
  const net = { NODE_OPTIONS: `--import ${pathToFileURL(path.join(ROOT, "scripts/oauth-test-net.mjs")).href}`, ALIGN_TEST_DOC_PORT: String(await startDocServer(tmp)) };
  await phase("local", { ...net, ALIGN_DATA_DIR: path.join(tmp, "local"), ALIGN_ALLOW_OPEN_CREATE: "1", ALIGN_CREATE_PER_HOUR: "50" });
  const invites = ["oauth-invite-000001", "oauth-invite-000002", "oauth-invite-000003"];
  const hosted = {
    ...net,
    HOSTED: "1",
    ALIGN_HOSTS: HOSTED_HOST,
    ALIGN_SECRET: "o".repeat(48),
    ALIGN_DATA_DIR: path.join(tmp, "hosted"),
    ALIGN_SIGNUP_CODES: invites.join(","),
    ALIGN_DELETE_BY: "2026-11-13",
    ALIGN_PRODUCT_PASSCODE: "product-strong-pass-1",
    ALIGN_SECURITY_PASSCODE: "security-strong-pass-1",
    ALIGN_LEADERSHIP_PASSCODE: "leadership-strong-pass-1",
  };
  await phase("hosted", hosted, invites);
  await rotation(hosted, invites[2]);
} catch (e) {
  fail++;
  console.log(`FAIL  [${phaseName}] stopped: ${e.message}`);
} finally {
  await stop();
  docServer.srv?.close();
  docServer.srv?.closeAllConnections?.();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\ntest-oauth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
