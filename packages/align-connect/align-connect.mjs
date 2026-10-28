#!/usr/bin/env node
// align-connect: a local stdio MCP server that relays to Align's MCP endpoint over HTTP, for apps that run MCP
// servers on this computer (Claude Desktop's claude_desktop_config.json, or any stdio-only client).
// Usage: node align-connect.mjs <align url>      e.g. node align-connect.mjs http://127.0.0.1:3100
//
// No dependencies (Node 20+). It signs in with Align's OAuth server the way Claude Code and Codex do: protected
// resource metadata, authorization server metadata, dynamic registration of a loopback redirect, PKCE S256. The person
// approves in their browser on Align's own page; the code comes back to a one-shot server on 127.0.0.1. Tokens are
// kept in ~/.align/connect/<host>.json (0600) and refreshed when they expire.
// stdout carries only MCP messages; everything else goes to stderr (Claude Desktop writes it to its MCP log).
// ALIGN_CONNECT_NO_BROWSER=1 prints the sign-in URL instead of opening a browser.

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const base = (process.argv[2] || process.env.ALIGN_URL || "").replace(/\/+$/, "").replace(/\/api\/mcp$/, "");
if (!/^https?:\/\//.test(base)) {
  process.stderr.write("usage: align-connect <align url>, for example https://align.example.com\n");
  process.exit(2);
}
const MCP = `${base}/api/mcp`;
const log = (msg) => process.stderr.write(`[align-connect] ${msg}\n`);

// ---- token store ----
const dir = path.join(process.env.ALIGN_HOME || path.join(os.homedir(), ".align"), "connect");
const file = path.join(dir, `${new URL(base).host.replace(/[^a-z0-9.-]/gi, "_")}.json`);
function load() {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
function save(data) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}
let store = load();

// ---- OAuth ----
async function json(url, init) {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${init?.method ?? "GET"} ${url}: ${r.status} ${body.error_description ?? body.error ?? ""}`.trim()), { code: body.error });
  return body;
}

async function metadata() {
  const prm = await json(`${base}/.well-known/oauth-protected-resource/api/mcp`);
  const issuer = prm.authorization_servers?.[0];
  if (!issuer) throw new Error("Align did not name an authorization server");
  return { resource: prm.resource, as: await json(`${issuer}/.well-known/oauth-authorization-server`) };
}

function openBrowser(url) {
  if (process.env.ALIGN_CONNECT_NO_BROWSER === "1") return log(`sign in here: ${url}`);
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => log(`open this to sign in: ${url}`)).unref();
  log(`opened your browser to sign in to Align (${new URL(url).host})`);
}

/** One sign-in: a loopback server waits for the code, the person approves in the browser, the code becomes tokens. */
async function signIn() {
  const { resource, as } = await metadata();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  let finish;
  const done = new Promise((resolve, reject) => (finish = { resolve, reject }));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/callback") return res.writeHead(404).end();
    const ok = u.searchParams.get("state") === state && u.searchParams.get("iss") === as.issuer && u.searchParams.get("code");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(ok ? "<p>Align is connected. You can close this tab.</p>" : "<p>Align was not connected. Close this tab and try again.</p>");
    if (ok) finish.resolve(u.searchParams.get("code"));
    else finish.reject(new Error(u.searchParams.get("error_description") || u.searchParams.get("error") || "sign-in did not complete"));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const redirect = `http://127.0.0.1:${server.address().port}/callback`;
  try {
    // Registration is per redirect: the port changes on every sign-in.
    const client = await json(as.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Align connector (this computer)", redirect_uris: [redirect], token_endpoint_auth_method: "none" }),
    });
    const auth = new URL(as.authorization_endpoint);
    for (const [k, v] of Object.entries({ response_type: "code", client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state, resource, scope: "goals:read" }))
      auth.searchParams.set(k, v);
    openBrowser(auth.toString());
    const timer = setTimeout(() => finish.reject(new Error("sign-in timed out after 5 minutes")), 5 * 60 * 1000);
    const code = await done.finally(() => clearTimeout(timer));
    const tokens = await json(as.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier, resource }),
    });
    store = { client_id: client.client_id, token_endpoint: as.token_endpoint, resource, ...tokenFields(tokens) };
    save(store);
    log("signed in");
  } finally {
    server.close();
  }
}

const tokenFields = (t) => ({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 });

/**
 * A new access token from the refresh token: true, or false when the sign-in has ended (invalid_grant). Another
 * align-connect for the same Align (Claude Desktop and a terminal, say) may have refreshed first, so the file is read
 * again before refreshing. A network error throws and keeps the tokens, so a blip doesn't ask for a new sign-in.
 */
async function refresh() {
  const disk = load();
  if (disk.refresh_token && disk.refresh_token !== store.refresh_token) {
    store = disk;
    if (store.access_token && store.expires_at > Date.now() + 30_000) return true;
  }
  if (!store.refresh_token) return false;
  try {
    const t = await json(store.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: store.refresh_token, client_id: store.client_id, resource: store.resource }),
    });
    store = { ...store, ...tokenFields(t) };
    save(store);
    return true;
  } catch (e) {
    if (e.code !== "invalid_grant") throw e;
    log(`refresh failed (${e.message}); signing in again`);
    store = {};
    save(store);
    return false;
  }
}

/** A usable access token: the stored one, a refreshed one, or a new sign-in. One refresh and one sign-in at a time:
 * Align ends a connection whose refresh token is used twice, and parallel tool calls would otherwise do that. */
let signing = null;
let refreshing = null;
async function token(force = false) {
  if (!force && store.access_token && store.expires_at > Date.now() + 30_000) return store.access_token;
  refreshing ??= refresh().finally(() => (refreshing = null));
  if (await refreshing) return store.access_token;
  signing ??= signIn().finally(() => (signing = null));
  await signing;
  return store.access_token;
}

// ---- relay ----
let protocolVersion = null;
let sessionId = null;

/** POST one JSON-RPC message to Align; returns the JSON-RPC response (JSON or the first SSE data event), or null. */
async function forward(msg, retried = false) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${await token()}` };
  if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const r = await fetch(MCP, { method: "POST", headers, body: JSON.stringify(msg) });
  if (r.status === 401 && !retried) {
    store.expires_at = 0;
    await token(true);
    return forward(msg, true);
  }
  sessionId = r.headers.get("mcp-session-id") ?? sessionId;
  if (r.status === 202 || msg.id === undefined) return null;
  const text = await r.text();
  const type = r.headers.get("content-type") || "";
  const body = type.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .find(Boolean)
    : text;
  try {
    return JSON.parse(body);
  } catch {
    return { jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `Align answered ${r.status}` } };
  }
}

const out = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return log("ignored a line that is not JSON");
  }
  try {
    const res = await forward(msg);
    if (msg.method === "initialize" && res?.result?.protocolVersion) protocolVersion = res.result.protocolVersion;
    if (res) out(res);
  } catch (e) {
    log(e.message);
    if (msg.id !== undefined) out({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `Align is not reachable: ${e.message}` } });
  }
});
rl.on("close", () => process.exit(0));
log(`relaying to ${MCP}${store.access_token ? " (signed in)" : " (will ask you to sign in)"}`);
