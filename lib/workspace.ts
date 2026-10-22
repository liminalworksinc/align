import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, promises as fs, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { HttpError } from "./errors";
import { withLock } from "./locks";
import type { Actor, AppState } from "./types";

// Custom workspaces: ids, directories, passcodes, create and delete. Northstar is not a directory here:
// it stays in data/ and is handled only by store.ts. Every function that touches a custom directory
// takes a CustomWsId and checks it again before building a path.

export type CustomWsId = `w_${string}`; // ^w_[a-z2-7]{12}$, 60 random bits
export type WsId = "northstar" | CustomWsId;

const ID_RE = /^w_[a-z2-7]{12}$/;
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const ROLES: Actor[] = ["leadership", "product", "security"];
export const isRole = (x: unknown): x is Actor => typeof x === "string" && (ROLES as string[]).includes(x);

/** The only way client input becomes a workspace id. Rejects "northstar" and anything not exactly w_ + 12 base32. */
export function parseCustomWs(x: unknown): CustomWsId | null {
  return typeof x === "string" && ID_RE.test(x) ? (x as CustomWsId) : null;
}

function assertCustomWs(ws: CustomWsId): CustomWsId {
  if (!ID_RE.test(ws)) throw new HttpError(400, "Invalid workspace");
  return ws;
}

export function wsDir(ws: CustomWsId): string {
  return path.join(config().workspacesRoot, assertCustomWs(ws));
}

/** A workspace exists once its directory has been renamed into place with a workspace.json. */
export function workspaceExists(ws: CustomWsId): boolean {
  return existsSync(path.join(wsDir(ws), "workspace.json"));
}

export function newWorkspaceId(): CustomWsId {
  let s = "w_";
  for (let i = 0; i < 12; i++) s += B32[randomInt(32)];
  return s as CustomWsId;
}

// ---- passcodes ----

/** 16 base32 characters (80 bits), shown as xxxx-xxxx-xxxx-xxxx. */
export function newPasscode(): string {
  const raw = Array.from({ length: 16 }, () => B32[randomInt(32)]).join("");
  return raw.match(/.{4}/g)!.join("-");
}

const normalizePasscode = (p: string) => p.trim().toLowerCase().replace(/[\s-]/g, "");

// Each scrypt is ~50 ms of 16 MB work on libuv's 4-thread pool, which fs.promises shares: a burst of parallel
// sign-ins would stall every workspace's state reads. At most 2 run at once, 8 more may wait, the rest get 429.
const SCRYPT_RUNNING = 2;
const SCRYPT_WAITING = 8;
const sg = globalThis as unknown as { __alignScrypt?: { running: number; queue: (() => void)[] } };
const pool = (sg.__alignScrypt ??= { running: 0, queue: [] });

/** `wait`: creation always queues for a slot instead of getting 429, so a sign-in burst can never make a create fail
 *  part-way (creates are serialized by the creation lock and rate-limited, so the queue stays short). */
async function scryptAsync(passcode: string, salt: Buffer, wait = false): Promise<Buffer> {
  if (pool.running >= SCRYPT_RUNNING) {
    if (!wait && pool.queue.length >= SCRYPT_WAITING) throw new HttpError(429, "Too many sign-ins right now, try again in a moment");
    await new Promise<void>((r) => pool.queue.push(r)); // the releasing call hands its slot over
  } else pool.running++;
  try {
    return await new Promise((resolve, reject) =>
      scrypt(normalizePasscode(passcode), salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
    );
  } finally {
    const next = pool.queue.shift();
    if (next) next(); // slot passes straight to the next waiter: running stays the same
    else pool.running--;
  }
}

interface RoleHash {
  salt: string;
  hash: string;
}

export interface WorkspaceAuth {
  epoch: number;
  /** Agent tokens are checked against this, not `epoch` (which also signs human sessions), so revoking agents never
   *  signs people out. Absent in workspaces created before it existed: agentEpochOf falls back to `epoch`. */
  agent_epoch?: number;
  roles: Record<Actor, RoleHash>;
}

export const agentEpochOf = (a: WorkspaceAuth): number => a.agent_epoch ?? a.epoch;

async function hashPasscode(passcode: string): Promise<RoleHash> {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: (await scryptAsync(passcode, salt, true)).toString("base64") };
}

export async function verifyPasscode(h: RoleHash, passcode: string): Promise<boolean> {
  const expected = Buffer.from(h.hash, "base64");
  const given = await scryptAsync(passcode, Buffer.from(h.salt, "base64"));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Sessions are checked on every poll, so auth.json is read synchronously and cached by mtime.
const g = globalThis as unknown as { __alignAuthCache?: Map<string, { mtimeMs: number; auth: WorkspaceAuth }> };
const authCache = (g.__alignAuthCache ??= new Map());

/** auth.json for a workspace, or null if the workspace does not exist (or is being deleted). */
const validAuth = (a: unknown): a is WorkspaceAuth => {
  const x = a as WorkspaceAuth | null;
  return !!x && typeof x.epoch === "number" && !!x.roles &&
    ROLES.every((r) => typeof x.roles[r]?.salt === "string" && typeof x.roles[r]?.hash === "string");
};

/** null only when the workspace has no auth file (deleted): its sessions have ended. Anything else that stops the
 *  read (EMFILE, a malformed file) is a server error, never a false "Session ended". */
export function readAuth(ws: CustomWsId): WorkspaceAuth | null {
  const file = path.join(wsDir(ws), "auth.json");
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch (e) {
    authCache.delete(ws);
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new HttpError(500, "This workspace could not be read");
  }
  const hit = authCache.get(ws);
  if (hit && hit.mtimeMs === mtimeMs) return hit.auth;
  let auth: unknown;
  try {
    auth = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    authCache.delete(ws);
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; // deleted between stat and read
    throw new HttpError(500, "This workspace could not be read");
  }
  if (!validAuth(auth)) throw new HttpError(500, "This workspace could not be read");
  authCache.set(ws, { mtimeMs, auth });
  return auth;
}

/** Revoke every agent token for a workspace by bumping agent_epoch in auth.json (atomic, owner-only). Restart and
 *  the leadership revoke route call this; human sessions are untouched. */
export async function bumpAgentEpoch(ws: CustomWsId): Promise<number> {
  return withLock(`auth:${ws}`, async () => {
    const auth = readAuth(ws);
    if (!auth) throw new HttpError(404, "This workspace no longer exists");
    const next: WorkspaceAuth = { ...auth, agent_epoch: agentEpochOf(auth) + 1 };
    const file = path.join(wsDir(ws), "auth.json");
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await fs.rename(tmp, file);
    authCache.delete(ws);
    return next.agent_epoch as number;
  });
}

// ---- lifecycle ----

async function appendEvent(event: "created" | "deleted", id: CustomWsId) {
  const root = config().workspacesRoot;
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.appendFile(path.join(root, "_events.jsonl"), JSON.stringify({ ts: new Date().toISOString(), event, id }) + "\n", { mode: 0o600 });
}

/** Live workspaces: directories named like an id. Skips _events.jsonl, .tmp-* and .deleting-*. */
export async function countWorkspaces(): Promise<number> {
  try {
    const names = await fs.readdir(config().workspacesRoot);
    return names.filter((n) => ID_RE.test(n)).length;
  } catch {
    return 0;
  }
}

export interface CreatedWorkspace {
  id: CustomWsId;
  name: string;
  passcodes: Record<Actor, string>;
}

/**
 * Create a workspace atomically: everything is written to <root>/.tmp-<id>/ and renamed into place, so a
 * workspace can be signed into only once it is complete. The cap check and the create share one lock.
 */
/** Invite codes already used, as sha256 hex (never the code itself), in <workspacesRoot>/_used_invites.json. */
const usedFile = () => path.join(config().workspacesRoot, "_used_invites.json");
const codeHash = (code: string) => createHash("sha256").update(code).digest("hex");
async function usedInvites(): Promise<string[]> {
  try {
    const v = JSON.parse(await fs.readFile(usedFile(), "utf8"));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new HttpError(500, "The invite list could not be read");
  }
}
/** Refuses an invite code that was already used. Read-only; claimInvite (under the creation lock) records it. */
export async function inviteUnused(code: string): Promise<boolean> {
  return !(await usedInvites()).includes(codeHash(code));
}
/** One message for a wrong code and a spent one, so the answer never confirms that a guessed code is real. */
export const BAD_INVITE = "That invite code isn’t valid or was already used";

async function writeUsed(list: string[]) {
  await fs.mkdir(config().workspacesRoot, { recursive: true, mode: 0o700 });
  const tmp = `${usedFile()}.${randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list), { mode: 0o600 });
  await fs.rename(tmp, usedFile());
}
async function claimInvite(code: string) {
  const used = await usedInvites();
  const h = codeHash(code);
  if (used.includes(h)) throw new HttpError(403, BAD_INVITE);
  await writeUsed([...used, h]);
}
/** Gives a claimed invite back when the create fails after claiming it, so a failure never burns a tester's code. */
async function unclaimInvite(code: string) {
  const h = codeHash(code);
  await writeUsed((await usedInvites()).filter((x) => x !== h));
}

/** `invite` is a single-use code to spend, `takeToken` the creation rate bucket. Inside the creation lock: the cap
 *  check, then all hashing and file writes (hashing waits for a slot, never 429), then the invite claim, the rate
 *  token and the rename. Anything that fails after the claim gives the invite back, so a failed create never burns a
 *  tester's code, and a spent or wrong code is refused before any rate token is taken (review items 6, M1). */
export async function createWorkspace(args: { name: string; state: AppState; scenario: unknown; invite?: string; takeToken?: () => void }): Promise<CreatedWorkspace> {
  return withLock("_create", async () => {
    const cfg = config();
    if ((await countWorkspaces()) >= cfg.maxWorkspaces) throw new HttpError(409, "The workspace limit for this server has been reached");
    const id = newWorkspaceId();
    const root = cfg.workspacesRoot;
    const final = wsDir(id);
    const tmp = path.join(root, `.tmp-${id}`);
    const passcodes = Object.fromEntries(ROLES.map((r) => [r, newPasscode()])) as Record<Actor, string>;
    const roles = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await hashPasscode(passcodes[r])]))) as Record<Actor, RoleHash>;
    const auth: WorkspaceAuth = { epoch: 1, roles };
    const meta = { id, name: args.name, created_at: new Date().toISOString(), schema_version: 1 };
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    let claimed = false;
    try {
      await fs.mkdir(tmp, { mode: 0o700 }); // owner-only: state holds private constraints, auth holds passcode hashes
      await fs.writeFile(path.join(tmp, "state.json"), JSON.stringify(args.state, null, 2), { mode: 0o600 });
      await fs.writeFile(path.join(tmp, "scenario.json"), JSON.stringify(args.scenario, null, 2), { mode: 0o600 });
      await fs.writeFile(path.join(tmp, "auth.json"), JSON.stringify(auth, null, 2), { mode: 0o600 });
      await fs.writeFile(path.join(tmp, "workspace.json"), JSON.stringify(meta, null, 2), { mode: 0o600 });
      if (args.invite !== undefined) {
        await claimInvite(args.invite);
        claimed = true;
      }
      args.takeToken?.();
      await fs.rename(tmp, final);
    } catch (e) {
      await fs.rm(tmp, { recursive: true, force: true });
      if (claimed) await unclaimInvite(args.invite as string).catch((u) => console.error("invite refund failed", (u as Error).name));
      throw e;
    }
    // The workspace exists once the rename lands. A failed event append must not turn that into a 500 that loses
    // the only copy of its passcodes; the event log is a record, not the source of truth (countWorkspaces reads dirs).
    await appendEvent("created", id).catch((e) => console.error("workspace event append failed", (e as Error).name));
    return { id, name: args.name, passcodes };
  });
}

/** Saved setup input, the rebuild source for Restart. Never served. */
export async function readScenarioFile(ws: CustomWsId): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(path.join(wsDir(ws), "scenario.json"), "utf8"));
  } catch {
    throw new HttpError(404, "This workspace no longer exists");
  }
}

/** Delete under the workspace lock: rename aside, then remove. A racing request sees 404, never a new directory. */
export async function deleteWorkspace(ws: CustomWsId) {
  const dir = wsDir(ws);
  const root = path.resolve(config().workspacesRoot);
  if (path.dirname(path.resolve(dir)) !== root) throw new HttpError(400, "Invalid workspace");
  await withLock(ws, async () => {
    if (!workspaceExists(ws)) throw new HttpError(404, "This workspace no longer exists");
    const aside = path.join(root, `.deleting-${ws}`);
    await fs.rename(dir, aside);
    authCache.delete(ws);
    await fs.rm(aside, { recursive: true, force: true });
  });
  await appendEvent("deleted", ws);
}
