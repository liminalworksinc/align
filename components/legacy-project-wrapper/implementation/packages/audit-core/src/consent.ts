// The single-use send permission (spec C1 to C3, the LIM-2529 design). The preview issues a permission bound to the
// exact text it showed; the send must present that text and that permission, once, within ten minutes. Consent is a
// click on the page: no command-line path issues or presents one (C2).
//
// Pure: the caller supplies the signer (HMAC under the server secret) and the store of issued ids.

export const PERMISSION_TTL_MS = 10 * 60 * 1000;
const PREFIX = "alaud.";

export interface Signer {
  (payload: string): string;
}

/** Issued permission ids. A permission is honored only if this process issued it and it has not been used. */
export interface PermissionStore {
  issue(id: string, expiresAt: number): void;
  /** "ok" consumes the id; "unknown" (never issued here, or forgotten by a restart) and "used" refuse. */
  consume(id: string, now: number): "ok" | "unknown" | "used";
}

const enc = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const dec = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/** SHA-256 of the text to be sent, hex. */
export async function digest(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Buffer.from(h).toString("hex");
}

/** A permission for sending exactly `text`, valid once until now + 10 minutes. */
export async function issuePermission(text: string, sign: Signer, store: PermissionStore, now = Date.now()): Promise<{ permission: string; expiresAt: number }> {
  const id = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const expiresAt = now + PERMISSION_TTL_MS;
  const claim = `${id}.${expiresAt}.${await digest(text)}`;
  store.issue(id, expiresAt);
  return { permission: `${PREFIX}${enc(claim)}.${sign(`${PREFIX}${claim}`)}`, expiresAt };
}

export type PermissionCheck =
  | { ok: true }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "text_changed" | "used" | "unknown" };

/** Check and consume a permission. Fails closed: anything unrecognized is refused. Consumes only when every other
 *  check passed, so a tampered request cannot burn a real permission. */
export async function consumePermission(permission: unknown, text: string, sign: Signer, store: PermissionStore, now = Date.now()): Promise<PermissionCheck> {
  if (typeof permission !== "string" || !permission.startsWith(PREFIX)) return { ok: false, reason: "malformed" };
  const [b64, sig, extra] = permission.slice(PREFIX.length).split(".");
  if (!b64 || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const claim = dec(b64);
  const [id, exp, hash] = claim.split(".");
  if (!id || !/^\d+$/.test(exp ?? "") || !/^[a-f0-9]{64}$/.test(hash ?? "")) return { ok: false, reason: "malformed" };
  if (!timingSafeEqual(sign(`${PREFIX}${claim}`), sig)) return { ok: false, reason: "bad_signature" };
  if (now > Number(exp)) return { ok: false, reason: "expired" };
  if ((await digest(text)) !== hash) return { ok: false, reason: "text_changed" };
  const r = store.consume(id, now);
  return r === "ok" ? { ok: true } : { ok: false, reason: r };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** In-memory issued ids. ASSUMES ONE SERVER PROCESS: production ran one Fly machine (read Nov 23, 2026). A restart
 *  forgets every issued id, so every open permission becomes "unknown" and is refused: the person previews again
 *  (one retry), and nothing can be replayed. Two machines would need a shared store, or every send could land on the
 *  machine that did not issue it. */
export function memoryPermissionStore(max = 10_000): PermissionStore {
  const live = new Map<string, { exp: number; used: boolean }>();
  const prune = (now: number) => {
    for (const [k, v] of live) if (v.exp < now) live.delete(k);
  };
  return {
    issue(id, expiresAt) {
      prune(Date.now());
      while (live.size >= max) live.delete(live.keys().next().value!);
      live.set(id, { exp: expiresAt, used: false });
    },
    consume(id, now) {
      const e = live.get(id);
      if (!e || e.exp < now) return "unknown";
      if (e.used) return "used";
      e.used = true;
      return "ok";
    },
  };
}
