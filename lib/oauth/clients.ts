import { randomBytes } from "node:crypto";
import { lookup } from "node:dns";
import { promises as fs } from "node:fs";
import https from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { config } from "../config";
import { withLock } from "../locks";

// OAuth clients for the MCP connector (Claude, ChatGPT, Claude Code, Codex). Public clients only (PKCE, no secret).
// Two kinds, both resolved here:
// - CIMD: the client_id is an https URL whose JSON document lists the client's name and redirect URIs (the MCP
//   authorization spec's preferred way). Anyone can make the consent page fetch one, so the fetch is bounded. When
//   hosted, only documents on the AI providers' own domains are fetched (CIMD_HOSTS, plus ALIGN_CIMD_HOSTS); other apps
//   use DCR. Everywhere: private addresses refused, 3 s from start to end, 5 KB, no retry, one fetch per URL at a
//   time, and a URL that failed is not tried again for 30 s. DNS lookups are counted until they return, not until the
//   request gives up: a lookup can't be cancelled and holds one of libuv's 4 threads (which sign-in's scrypt and file
//   reads share), so at most 2 run at once and 2 threads always stay free. Results are cached.
// - DCR: POST /oauth/register stores {client_name, redirect_uris} under a random dcr_ id in
//   <workspacesRoot>/_oauth_clients.json, so the end-of-test purge removes it with the workspaces.
// A redirect URI is https, or http on a loopback host (Claude Code and Codex listen on a local port).

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  kind: "cimd" | "dcr";
}

const MAX_DCR_CLIENTS = 500;
const MAX_REDIRECTS = 10;
const NAME_MAX = 80;
const CIMD_MAX_BYTES = 5 * 1024;
const CIMD_TIMEOUT_MS = 3000;
const CIMD_CACHE_MS = 10 * 60 * 1000;
const CIMD_BAD_CACHE_MS = 60 * 1000; // a document that answered but can't be used: re-checked after a minute
const CIMD_MAX_LOOKUPS = 2;
const CIMD_DOWN_MS = 30 * 1000; // a document that couldn't be fetched is not tried again for this long
// The AI providers' own domains: Claude Code's and the Claude apps' documents are on claude.ai, Codex's on chatgpt.com.
const CIMD_HOSTS = ["claude.ai", "anthropic.com", "chatgpt.com", "openai.com"];
const cimdHostAllowed = (host: string) =>
  !config().hosted ||
  [...CIMD_HOSTS, ...(process.env.ALIGN_CIMD_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)].some((d) => host === d || host.endsWith(`.${d}`));
const DCR_ID = /^dcr_[A-Za-z0-9_-]{22}$/;

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https anywhere, or http on a loopback host. No fragments, no userinfo. */
export function validRedirect(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK_NAMES.has(u.hostname);
}

/** Exact match, except that a loopback redirect may use any port (RFC 8252 section 7.3): the CLI picks one at run time. */
export function redirectAllowed(client: OAuthClient, uri: string): boolean {
  if (!validRedirect(uri)) return false;
  if (client.redirect_uris.includes(uri)) return true;
  const want = new URL(uri);
  if (want.protocol !== "http:") return false;
  return client.redirect_uris.some((r) => {
    const u = new URL(r);
    return u.protocol === "http:" && u.hostname === want.hostname && u.pathname === want.pathname && u.search === want.search;
  });
}

const cleanName = (v: unknown, fallback: string) => {
  // A name is self-asserted and shown on the consent page and in the audit log: one line, no control characters.
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").slice(0, NAME_MAX).trim() : "";
  return s || fallback;
};

// ---- DCR ----

const dcrFile = () => path.join(config().workspacesRoot, "_oauth_clients.json");

async function readDcr(): Promise<OAuthClient[]> {
  try {
    const v = JSON.parse(await fs.readFile(dcrFile(), "utf8"));
    return Array.isArray(v) ? (v as OAuthClient[]) : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export class RegistrationError extends Error {}

/** RFC 7591 registration for a public client. Returns the stored client; the oldest entry goes past the cap. */
export async function registerClient(meta: Record<string, unknown>): Promise<OAuthClient> {
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECTS || !uris.every(validRedirect))
    throw new RegistrationError("redirect_uris must list 1 to 10 https URLs or http URLs on localhost");
  const method = meta.token_endpoint_auth_method ?? "none";
  if (method !== "none") throw new RegistrationError("Only public clients (token_endpoint_auth_method none) are supported");
  const client: OAuthClient = {
    client_id: `dcr_${randomBytes(16).toString("base64url")}`,
    client_name: cleanName(meta.client_name, "An unnamed app"),
    redirect_uris: [...new Set(uris as string[])],
    kind: "dcr",
  };
  await withLock("_oauth_clients", async () => {
    const list = (await readDcr()).slice(-(MAX_DCR_CLIENTS - 1));
    await fs.mkdir(config().workspacesRoot, { recursive: true, mode: 0o700 });
    const tmp = `${dcrFile()}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify([...list, client]), { mode: 0o600 });
    await fs.rename(tmp, dcrFile());
  });
  return client;
}

// ---- CIMD ----

/** Private, loopback, link-local, CGNAT, multicast and reserved ranges: a client document is never fetched from these. */
export function privateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(v) === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return privateAddress(mapped[1]);
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff") || v.startsWith("64:ff9b") || v.startsWith("2001:db8");
  }
  return true;
}

const lk = globalThis as unknown as { __alignCimdLookups?: number };

/** dns.lookup that fails for a private address, so the check and the connection use the same answer (no rebinding). */
function publicLookup(hostname: string, options: object, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) {
  if ((lk.__alignCimdLookups ?? 0) >= CIMD_MAX_LOOKUPS) return cb(new Error("busy"), "");
  lk.__alignCimdLookups = (lk.__alignCimdLookups ?? 0) + 1;
  lookup(hostname, { ...options, all: true }, (err, addrs) => {
    lk.__alignCimdLookups = Math.max((lk.__alignCimdLookups ?? 1) - 1, 0);
    if (err) return cb(err, "");
    const list = addrs as { address: string; family: number }[];
    if (!list.length || list.some((a) => privateAddress(a.address))) return cb(Object.assign(new Error("refused address"), { refused: true }), "");
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

function fetchDocument(url: URL): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: publicLookup as never, headers: { accept: "application/json", "user-agent": "Align (OAuth client metadata check)" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(Object.assign(new Error(`status ${res.statusCode}`), { status: res.statusCode }));
      }
      let size = 0;
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > CIMD_MAX_BYTES) req.destroy(new Error("too large"));
        else chunks.push(c);
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(Object.assign(new Error("not JSON"), { status: 200 })); // it answered: can't be used
        }
      });
    });
    // From start to end, not idle time: a host that sends a byte every few seconds still stops here.
    const deadline = setTimeout(() => req.destroy(new Error("timeout")), CIMD_TIMEOUT_MS);
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
  });
}

/** A CIMD client_id: https, a path, no fragment, no userinfo, no IP literal, default port. */
export function cimdUrl(clientId: string): URL | null {
  if (clientId.length > 500) return null;
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hash || u.username || u.password || u.port || u.pathname === "/" || isIP(u.hostname.replace(/^\[|\]$/g, ""))) return null;
  // A public name only: no single-label hosts and no local-only suffixes, which never resolve to a public address.
  if (!u.hostname.includes(".") || u.hostname.endsWith(".") || /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i.test(u.hostname)) return null;
  if (!cimdHostAllowed(u.hostname)) return null;
  return u;
}

const g = globalThis as unknown as {
  __alignCimd?: Map<string, { at: number; client: OAuthClient | null }>;
  __alignCimdPending?: Map<string, Promise<OAuthClient | null>>;
  __alignCimdDown?: Map<string, number>;
};
const cimdCache = (g.__alignCimd ??= new Map());
const pending = (g.__alignCimdPending ??= new Map());
const MAX_PENDING = 50;
const down = (g.__alignCimdDown ??= new Map());

/** The app's client document couldn't be fetched (network, timeout, a 5xx, a 403 or 429 from a bot wall, or too many
 *  checks at once): not cached as unusable, so a retry later can work. */
export class ClientUnreachable extends Error {}

// Hosted logs carry no request-supplied text (go-C condition 5), not even the host.
const where = (url: URL) => (config().hosted ? "(hosted)" : url.href);

async function resolveCimd(url: URL, clientId: string): Promise<OAuthClient | null> {
  const hit = cimdCache.get(clientId);
  if (hit && Date.now() - hit.at < (hit.client ? CIMD_CACHE_MS : CIMD_BAD_CACHE_MS)) return hit.client;
  if ((down.get(clientId) ?? 0) > Date.now()) throw new ClientUnreachable(url.hostname);
  const running = pending.get(clientId);
  if (running) return running;
  if (pending.size >= MAX_PENDING) throw new ClientUnreachable(url.hostname);
  const p = fetchCimd(url, clientId).finally(() => pending.delete(clientId));
  pending.set(clientId, p);
  return p;
}

async function fetchCimd(url: URL, clientId: string): Promise<OAuthClient | null> {
  let doc: Record<string, unknown> | null = null;
  try {
    doc = (await fetchDocument(url)) as Record<string, unknown>;
  } catch (e) {
    const { status, refused } = e as { status?: number; refused?: boolean };
    // A private address, or the host answered with a client error: this document can't be used. 403 and 429 are more
    // often a bot wall in front of the real document, so those count as unreachable, like a 5xx or no answer.
    if (!(refused || (status && status < 500 && status !== 403 && status !== 429))) {
      console.warn(`[oauth] client document at ${where(url)} unreachable`, config().hosted ? (e as Error)?.name : (e as Error).message);
      if ((e as Error).message !== "busy") {
        while (down.size >= 1000) down.delete(down.keys().next().value!);
        down.set(clientId, Date.now() + CIMD_DOWN_MS);
      }
      throw new ClientUnreachable(url.hostname);
    }
  }
  let client: OAuthClient | null = null;
  const uris = doc?.redirect_uris;
  if (doc && doc.client_id === clientId && Array.isArray(uris) && uris.length && uris.length <= MAX_REDIRECTS && uris.every(validRedirect))
    client = { client_id: clientId, client_name: cleanName(doc.client_name, url.hostname), redirect_uris: uris as string[], kind: "cimd" };
  else console.warn(`[oauth] client document at ${where(url)} can't be used`);
  while (cimdCache.size >= 200) cimdCache.delete(cimdCache.keys().next().value!);
  cimdCache.set(clientId, { at: Date.now(), client });
  return client;
}

/** The client behind a client_id, or null when it is unknown or its document can't be used. */
export async function resolveClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== "string" || !clientId) return null;
  if (DCR_ID.test(clientId)) return (await readDcr()).find((c) => c.client_id === clientId) ?? null;
  const url = cimdUrl(clientId);
  return url ? resolveCimd(url, clientId) : null;
}
