import { createHash, randomUUID } from "node:crypto";
import { promises as fs, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { AppState, Plan } from "./types";
import { registryVersion } from "./registry";

export const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA, "state.json");
const FIXTURE_FILE = path.join(DATA, "fixture.json");
export const PLANS_DIR = path.join(ROOT, "agent", "plans");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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

function initialState(): AppState {
  const fixture = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as AppState;
  fixture.plans = fixture.plans.map((p) => ({ ...p, hash: planFileHash(p) }));
  return withDefaults(fixture);
}

export async function readState(): Promise<AppState> {
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
    const result = await fn(s);
    await writeState(s);
    return result;
  } finally {
    release();
  }
}

export async function resetState(by: { actor: string; sid: string }) {
  return mutate((s) => {
    const fresh = initialState();
    // Keep ingested Sparta evidence across demo resets. The fixture's Alike reference wins; an operator-captured one is kept only if the fixture has none.
    fresh.simulations = s.simulations;
    // Captured agent sessions are real history: keep them. Their mappings are recomputed against the reset registry.
    fresh.sessions = s.sessions ?? [];
    fresh.mappings = [];
    if (!fresh.brief.alike_ref && s.brief.alike_ref) {
      fresh.brief.alike_ref = s.brief.alike_ref;
      fresh.brief.alike_status = s.brief.alike_status;
    }
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
