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
//   authorization spec's preferred way). Fetched with a lookup that refuses private addresses, 3 s, 5 KB, cached.
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

/** dns.lookup that fails for a private address, so the check and the connection use the same answer (no rebinding). */
function publicLookup(hostname: string, options: object, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) {
  lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err, "");
    const list = addrs as { address: string; family: number }[];
    if (!list.length || list.some((a) => privateAddress(a.address))) return cb(Object.assign(new Error("refused address"), { refused: true }), "");
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

function fetchDocument(url: URL): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: publicLookup as never, timeout: CIMD_TIMEOUT_MS, headers: { accept: "application/json" } }, (res) => {
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
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
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
  return u;
}

const g = globalThis as unknown as { __alignCimd?: Map<string, { at: number; client: OAuthClient | null }> };
const cimdCache = (g.__alignCimd ??= new Map());

/** The app's client document couldn't be fetched (network, timeout, a 5xx): not cached, so a retry can work. */
export class ClientUnreachable extends Error {}

async function resolveCimd(url: URL, clientId: string): Promise<OAuthClient | null> {
  const hit = cimdCache.get(clientId);
  if (hit && Date.now() - hit.at < (hit.client ? CIMD_CACHE_MS : CIMD_BAD_CACHE_MS)) return hit.client;
  let doc: Record<string, unknown> | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      doc = (await fetchDocument(url)) as Record<string, unknown>;
      break;
    } catch (e) {
      const { status, refused } = e as { status?: number; refused?: boolean };
      if (refused || (status && status < 500)) break; // a private address, or the host answered: this document can't be used
      if (attempt === 1) {
        console.warn(`[oauth] client document ${url.href} unreachable: ${(e as Error).message}`);
        throw new ClientUnreachable(url.hostname);
      }
    }
  }
  let client: OAuthClient | null = null;
  const uris = doc?.redirect_uris;
  if (doc && doc.client_id === clientId && Array.isArray(uris) && uris.length && uris.length <= MAX_REDIRECTS && uris.every(validRedirect))
    client = { client_id: clientId, client_name: cleanName(doc.client_name, url.hostname), redirect_uris: uris as string[], kind: "cimd" };
  else console.warn(`[oauth] client document ${url.href} can't be used`);
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
