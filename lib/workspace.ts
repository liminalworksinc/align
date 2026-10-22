import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
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

function scryptAsync(passcode: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(normalizePasscode(passcode), salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

interface RoleHash {
  salt: string;
  hash: string;
}

export interface WorkspaceAuth {
  epoch: number;
  roles: Record<Actor, RoleHash>;
}

async function hashPasscode(passcode: string): Promise<RoleHash> {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: (await scryptAsync(passcode, salt)).toString("base64") };
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

// ---- lifecycle ----

async function appendEvent(event: "created" | "deleted", id: CustomWsId) {
  const root = config().workspacesRoot;
  await fs.mkdir(root, { recursive: true });
  await fs.appendFile(path.join(root, "_events.jsonl"), JSON.stringify({ ts: new Date().toISOString(), event, id }) + "\n");
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
export async function createWorkspace(args: { name: string; state: AppState; scenario: unknown }): Promise<CreatedWorkspace> {
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
    try {
      await fs.mkdir(tmp, { mode: 0o700 }); // owner-only: state holds private constraints, auth holds passcode hashes
      await fs.writeFile(path.join(tmp, "state.json"), JSON.stringify(args.state, null, 2), { mode: 0o600 });
      await fs.writeFile(path.join(tmp, "scenario.json"), JSON.stringify(args.scenario, null, 2), { mode: 0o600 });
      await fs.writeFile(path.join(tmp, "auth.json"), JSON.stringify(auth, null, 2), { mode: 0o600 });
      await fs.writeFile(path.join(tmp, "workspace.json"), JSON.stringify(meta, null, 2), { mode: 0o600 });
      await fs.rename(tmp, final);
    } catch (e) {
      await fs.rm(tmp, { recursive: true, force: true });
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
