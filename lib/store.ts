import { createHash, randomUUID } from "node:crypto";
import { promises as fs, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Actor, AppState, Plan } from "./types";
import { registryVersion } from "./registry";
import { config } from "./config";
import { HttpError } from "./errors";
import { withLock } from "./locks";
import { wsDir, workspaceExists, type CustomWsId, type WsId } from "./workspace";

export { HttpError };

export const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA, "state.json");
const FIXTURE_FILE = path.join(DATA, "fixture.json");
export const PLANS_DIR = path.join(ROOT, "agent", "plans");

export function sha256(text: string | Buffer) {
  return createHash("sha256").update(text).digest("hex");
}

export function planFileHash(plan: Pick<Plan, "plan_id" | "plan_version">) {
  const file = path.join(PLANS_DIR, `${plan.plan_id}@${plan.plan_version}.md`);
  return existsSync(file) ? sha256(readFileSync(file)) : "";
}

/** Fill fields added after a state file was written, so older state keeps loading. */
function withDefaults(s: AppState): AppState {
  s.org_draft ??= null;
  s.pushes ??= [];
  s.sessions ??= [];
  s.mappings ??= [];
  if (!s.registry_version) s.registry_version = registryVersion(s);
  return s;
}

/** Canonical form of inline plan text before hashing, so the same plan always gets the same hash. */
export function normalizePlanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function initialState(): AppState {
  const fixture = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as AppState;
  fixture.plans = fixture.plans.map((p) => ({ ...p, hash: planFileHash(p) }));
  return withDefaults(fixture);
}

export async function readState(ws: WsId = "northstar"): Promise<AppState> {
  if (ws !== "northstar") return readCustom(ws);
  // Hosted serves custom workspaces only. Every Northstar read and write (mutate and resetState read through here)
  // stops at this line, so no route, present or future, can reach the demo, its fixture or its evidence.
  if (config().hosted) throw new HttpError(404, "Not found");
  try {
    return withDefaults(JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as AppState);
  } catch {
    const s = initialState();
    await writeState(s);
    return s;
  }
}

async function writeState(s: AppState) {
  await fs.mkdir(DATA, { recursive: true });
  const tmp = `${STATE_FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, STATE_FILE);
}

// Single-writer queue shared across route bundles in one Node process.
const g = globalThis as unknown as { __alignLock?: Promise<unknown> };

export async function mutate<T>(fn: (s: AppState) => T | Promise<T>): Promise<T> {
  const prev = g.__alignLock ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  g.__alignLock = prev.then(() => next);
  await prev.catch(() => undefined);
  try {
    const s = await readState();
    const before = JSON.stringify(s);
    const result = await fn(s);
    // Skip no-op writes: every /api/state poll runs through here, and rewriting an unchanged
    // state.json makes the dev server recompile and reload open pages in a loop.
    if (JSON.stringify(s) !== before) await writeState(s);
    return result;
  } finally {
    release();
  }
}

// ---- custom workspaces ----
// No fallback: a missing or unreadable custom state is an error, never a reseed (only Northstar reseeds).

const MAX_WS_BYTES = 1024 * 1024;
const AUDIT_KEEP = 1000;
const ARCHIVE_MAX_BYTES = 1024 * 1024; // per archive file; at most two per workspace (review M5)

async function readCustom(ws: CustomWsId): Promise<AppState> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(wsDir(ws), "state.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "This workspace no longer exists");
    throw new HttpError(500, "This workspace could not be read");
  }
  try {
    return withDefaults(JSON.parse(raw) as AppState);
  } catch {
    throw new HttpError(500, "This workspace could not be read");
  }
}

/** Never creates directories. Caps size first (a refused write changes nothing on disk), then trims audit to the
 *  last 1000 rows (older rows go to audit-archive.jsonl). Files are owner-only: state holds private constraints. */
async function writeCustom(ws: CustomWsId, s: AppState) {
  const dir = wsDir(ws);
  if (!workspaceExists(ws)) throw new HttpError(404, "This workspace no longer exists");
  if (Buffer.byteLength(JSON.stringify({ ...s, audit: [] }, null, 2)) > MAX_WS_BYTES) throw new HttpError(413, "This workspace is full");
  if (s.audit.length > AUDIT_KEEP) {
    const old = s.audit.slice(0, s.audit.length - AUDIT_KEEP);
    const chunk = old.map((r) => JSON.stringify(r)).join("\n") + "\n";
    // Bounded on the shared volume: once the archive would pass ARCHIVE_MAX_BYTES it becomes audit-archive.1.jsonl
    // (replacing the previous one) and a new file starts, so one workspace holds at most two archive files.
    const archive = path.join(dir, "audit-archive.jsonl");
    const size = await fs.stat(archive).then((st) => st.size, () => 0);
    if (size + Buffer.byteLength(chunk) > ARCHIVE_MAX_BYTES) await fs.rename(archive, path.join(dir, "audit-archive.1.jsonl")).catch(() => undefined);
    await fs.appendFile(archive, chunk, { mode: 0o600 });
    s.audit = s.audit.slice(-AUDIT_KEEP);
  }
  const text = JSON.stringify(s, null, 2);
  const file = path.join(dir, "state.json");
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, text, { mode: 0o600 });
  await fs.rename(tmp, file);
}

/** mutate() for one custom workspace, under that workspace's own lock. */
export async function mutateWs<T>(ws: CustomWsId, fn: (s: AppState) => T | Promise<T>): Promise<T> {
  return withLock(ws, async () => {
    const s = await readCustom(ws);
    const before = JSON.stringify(s);
    const result = await fn(s);
    if (JSON.stringify(s) !== before) await writeCustom(ws, s);
    return result;
  });
}

/** Replace a custom workspace's whole state (Restart) under its lock. The caller builds it; the store never imports scenario.ts. */
export async function replaceWorkspaceState(ws: CustomWsId, build: (current: AppState) => AppState) {
  return mutateWs(ws, (s) => {
    const next = build(s);
    for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k];
    Object.assign(s, next);
  });
}

// ---- Capture consent (B1-1) ----
// One record per harness and repo. Without one, /api/sessions/events refuses the event and writes nothing.
// Kept off AppState's declared fields and never defaulted, so a fresh state (and Northstar /api/state) has no such key.

export type CaptureHarness = "claude-code" | "codex";

export interface CaptureConsent {
  harness: CaptureHarness;
  repo: string;
  granted_by: Actor;
  granted_at: string;
}

type WithConsents = AppState & { capture_consents?: CaptureConsent[] };

export function captureConsents(s: AppState): CaptureConsent[] {
  return (s as WithConsents).capture_consents ?? [];
}

export function hasCaptureConsent(s: AppState, harness: string, repo: string): boolean {
  return !!repo && captureConsents(s).some((c) => c.harness === harness && c.repo === repo);
}

export function setCaptureConsents(s: AppState, list: CaptureConsent[]) {
  if (list.length) (s as WithConsents).capture_consents = list;
  else delete (s as WithConsents).capture_consents;
}

/**
 * Reset to the Northstar fixture. `fresh` drops carried-over Sparta evidence and the operator-captured Alike
 * reference (used when leaving a custom scenario). Consented sessions and the audit log are kept either way.
 */
export async function resetState(by: { actor: string; sid: string }, opts?: { fresh?: boolean }) {
  return mutate((s) => {
    const fresh = initialState();
    // Object.assign below never removes keys, so clear the custom-only fields first. Northstar never has them.
    delete s.scenario;
    delete s.teams;
    delete s.scenario_config;
    if (!opts?.fresh) {
      // Keep ingested Sparta evidence across demo resets. The fixture's Alike reference wins; an operator-captured one is kept only if the fixture has none.
      fresh.simulations = s.simulations;
      if (!fresh.brief.alike_ref && s.brief.alike_ref) {
        fresh.brief.alike_ref = s.brief.alike_ref;
        fresh.brief.alike_status = s.brief.alike_status;
      }
    }
    // Captured agent sessions are real history: keep the ones whose harness and repo still have a capture consent
    // record (B1-2, ruling R1 default). Sessions without one are purged. Mappings are recomputed against the reset registry.
    fresh.sessions = (s.sessions ?? [])
      .filter((x) => hasCaptureConsent(s, x.harness, x.repo))
      .map((x) => ({ ...x, directives: [] })); // deliveries belong to the reset history
    fresh.mappings = [];
    // The audit log is never erased: a reset is itself an audited event.
    fresh.audit = [
      ...s.audit,
      { id: id("a"), actor: by.actor, session_id: by.sid, action: "reset", target: "state", at: now() },
    ] as AppState["audit"];
    Object.assign(s, fresh);
    return s;
  });
}

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
