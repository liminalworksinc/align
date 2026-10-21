// Jev mapper: classifies captured agent sessions against the live goal registry.
//   scheduleMapping(sessionId)  -- debounced, fire-and-forget; maps one session against the current registry
//   remapAll()                  -- re-map every session (called when registry_version changes)
//   ensureRegistryFresh()       -- recompute registry_version; remap everything when it changed
// Custom scenarios are never mapped: the goal registry is Northstar's, so all three return early for them.
// None of these throw into callers. Results are persisted as SessionMapping rows via mutate().
// All of them do nothing unless mappingEnabled(): the external model is off by default (ALIGN_MAPPER_EXTERNAL=1 turns it on).
// Only Jev (typesafe-ai/jev via AI Gateway) is ever called. On failure the mapping is MAPPER_UNAVAILABLE; no other model is substituted.
// A session whose harness and repo has no capture consent is never sent to the model and never gets a mapping row.

import { scenarioOf } from "./labels";
import { activeRegistry, registryVersion, refreshRegistry } from "./registry";
import { hasCaptureConsent, mutate, now, readState } from "./store";
import type { AgentSession, AppState, RegistryEntry, SessionMapping } from "./types";

const ENDPOINT = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const MODEL = "typesafe-ai/jev";
const DEBOUNCE_MS = 1500;
const TIMEOUT_MS = 15000;
const PROPOSE_AT = 0.6;
const CONFLICT_AT = 0.6;

// ---- External model control (B1-4) ----
// Session text leaves the machine only when ALIGN_MAPPER_EXTERNAL=1. Default off: nothing is scheduled or sent.

export function externalModelEnabled(): boolean {
  return process.env.ALIGN_MAPPER_EXTERNAL === "1";
}

export interface MapperStatus {
  status: "off" | "no-key" | "on";
  message: string;
}

/** B1-5: what the API reports. With the control off or the key missing, mapping is not attempted and no row is written. */
export function mapperStatus(): MapperStatus {
  if (!externalModelEnabled()) return { status: "off", message: "external model off" };
  if (!apiKey()) return { status: "no-key", message: "no key" };
  return { status: "on", message: "external model on" };
}

/** True only when mapping may run (control on AND key present). Every entry point below checks it. */
export function mappingEnabled(): boolean {
  return mapperStatus().status === "on";
}

// ---- API key (server-side only; never logged or returned) ----
// Read from the process environment only. No .env file anywhere is read for it.

function apiKey(): string | null {
  return process.env.AI_GATEWAY_API_KEY || null;
}

// ---- Jev request ----

interface JevResult {
  model: string;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  conflict: number;
}

class JevError extends Error {}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function describe(session: AgentSession): string {
  const prompts = session.prompts
    .slice(-3)
    .map((p, i) => `${i + 1}) ${clip(p.text.replace(/\s+/g, " ").trim(), 300)}`)
    .join(" ");
  const files = session.files.slice(-15).join(", ") || "none";
  const origin = `${session.origin.kind}${session.origin.ref ? ` ${session.origin.ref}` : ""}`;
  const report = session.last_message ? clip(session.last_message.replace(/\s+/g, " ").trim(), 400) : "none";
  const text =
    `Agent session (${session.harness}) in repo ${session.repo || "unknown"} on branch ${session.branch || "unknown"}. ` +
    `Origin: ${origin}. Recent prompts: ${prompts || "none"}. Files touched: ${files}. Last report: ${report}`;
  return clip(text, 1500);
}

function errorMessage(status: number, payload: unknown): string {
  const p = payload as { message?: unknown; error?: { message?: unknown } | string } | null;
  const raw =
    (typeof p?.message === "string" && p.message) ||
    (typeof p?.error === "object" && typeof p.error?.message === "string" && p.error.message) ||
    (typeof p?.error === "string" && p.error) ||
    "";
  if (/free tier/i.test(raw)) return "Jev unavailable: free tier — add AI Gateway credits";
  if (status === 401) return "Jev unavailable: AI Gateway key rejected";
  if (status === 429) return "Jev unavailable: rate limited";
  return `Jev unavailable: HTTP ${status}${raw ? ` — ${clip(raw, 120)}` : ""}`;
}

async function callJev(state: string, registry: RegistryEntry[]): Promise<JevResult> {
  const key = apiKey();
  if (!key) throw new JevError("Jev unavailable: no AI Gateway key configured");
  const criteria: Record<string, string> = {};
  for (const e of registry) criteria[e.key] = e.label;
  const goals = registry
    .filter((e) => e.key !== "none")
    .map((e) => clip(e.label, 300))
    .join(" | ");
  const payload = {
    model: MODEL,
    state,
    questions: {
      goal: {
        type: "choice",
        instructions:
          "Which accepted goal does this agent session's work most directly serve? Choose 'none' if the work does not clearly serve any listed goal.",
        criteria,
      },
      conflict: {
        type: "noul",
        instructions: `Does this agent session's work conflict with or undermine any accepted goal or its measures? Accepted goals: ${goals}`,
      },
    },
  };

  let lastError = "Jev unavailable";
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1000));
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      lastError = name === "TimeoutError" || name === "AbortError" ? "Jev unavailable: request timed out" : "Jev unavailable: network error";
      continue;
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      lastError = errorMessage(res.status, data);
      if (res.status === 429 || res.status >= 500) continue;
      throw new JevError(lastError);
    }
    const d = data as {
      model?: string;
      answers?: {
        goal?: { choice?: unknown; confidence?: unknown; probabilities?: unknown };
        conflict?: { noul?: unknown };
      };
    } | null;
    const goal = d?.answers?.goal;
    const choice = typeof goal?.choice === "string" ? goal.choice : null;
    if (!choice || !(choice in criteria) || typeof goal?.confidence !== "number") {
      throw new JevError("Jev unavailable: unexpected response");
    }
    const probabilities: Record<string, number> = {};
    if (goal.probabilities && typeof goal.probabilities === "object") {
      for (const [k, v] of Object.entries(goal.probabilities as Record<string, unknown>)) if (typeof v === "number") probabilities[k] = v;
    }
    const noul = d?.answers?.conflict?.noul;
    return {
      model: typeof d?.model === "string" ? d.model : MODEL,
      choice,
      confidence: goal.confidence,
      probabilities,
      conflict: typeof noul === "number" ? noul : 0,
    };
  }
  throw new JevError(lastError);
}

// ---- Mapping one session ----

export async function mapSession(sessionId: string): Promise<void> {
  if (!mappingEnabled()) return;
  const st = await readState();
  if (scenarioOf(st) === "custom") return;
  const session = st.sessions.find((x) => x.id === sessionId);
  if (!session) return;
  // Consent is checked before any text leaves the machine. A revoked repo's session is skipped.
  if (!hasCaptureConsent(st, session.harness, session.repo)) return;
  const registry = activeRegistry(st);
  const version = registryVersion(st);

  let mapping: SessionMapping;
  try {
    const r = await callJev(describe(session), registry);
    mapping = {
      session_id: sessionId,
      registry_version: version,
      choice: r.choice,
      confidence: r.confidence,
      probabilities: r.probabilities,
      conflict: { probability: r.conflict, flagged: r.conflict >= CONFLICT_AT },
      state: r.choice !== "none" && r.confidence >= PROPOSE_AT ? "PROPOSED" : "UNASSIGNED",
      model: r.model,
      mapped_at: now(),
    };
  } catch (e) {
    const msg = e instanceof JevError ? e.message : "Jev unavailable";
    if (!(e instanceof JevError)) console.error("[mapper]", e);
    mapping = {
      session_id: sessionId,
      registry_version: version,
      choice: null,
      confidence: null,
      probabilities: {},
      state: "MAPPER_UNAVAILABLE",
      model: null,
      error: msg,
      mapped_at: now(),
    };
  }

  await mutate((s) => {
    const current = s.sessions.find((x) => x.id === sessionId);
    if (!current) return;
    // Re-checked under the write lock: a revoke that landed during the model call wins, and no row is written.
    if (!hasCaptureConsent(s, current.harness, current.repo)) return;
    const i = s.mappings.findIndex((m) => m.session_id === sessionId);
    const prev = i >= 0 ? s.mappings[i] : null;
    // An owner's decision stands while the registry is unchanged and Jev still picks the same goal.
    // A Jev outage never erases an owner's decision either.
    if (prev && (prev.state === "CONFIRMED" || prev.state === "REJECTED") && prev.registry_version === mapping.registry_version) {
      if (mapping.state === "MAPPER_UNAVAILABLE" || mapping.choice === prev.choice) return;
    }
    if (i >= 0) s.mappings[i] = mapping;
    else s.mappings.push(mapping);
  });
}

// ---- Debounce + single global queue ----

const g = globalThis as unknown as {
  __alignMapperTimers?: Map<string, ReturnType<typeof setTimeout>>;
  __alignMapperQueue?: Promise<void>;
  __alignMapperQueued?: Set<string>;
  __alignMapperRunning?: Set<string>;
};
const timers = (g.__alignMapperTimers ??= new Map());
const queued = (g.__alignMapperQueued ??= new Set());
const running = (g.__alignMapperRunning ??= new Set());

function enqueue(sessionId: string) {
  if (queued.has(sessionId)) return; // already waiting; it will read the latest state when it runs
  queued.add(sessionId);
  g.__alignMapperQueue = (g.__alignMapperQueue ?? Promise.resolve())
    .then(async () => {
      queued.delete(sessionId);
      running.add(sessionId);
      try {
        await mapSession(sessionId);
      } finally {
        running.delete(sessionId);
      }
    })
    .catch((e) => {
      queued.delete(sessionId);
      console.error("[mapper] mapping failed", sessionId, e);
    });
}

/** `s` is the state the caller just read or wrote; a custom scenario schedules nothing. */
export function scheduleMapping(sessionId: string, s: Pick<AppState, "scenario">): void {
  if (!mappingEnabled()) return;
  if (scenarioOf(s) === "custom") return;
  try {
    const t = timers.get(sessionId);
    if (t) clearTimeout(t);
    timers.set(
      sessionId,
      setTimeout(() => {
        timers.delete(sessionId);
        enqueue(sessionId);
      }, DEBOUNCE_MS),
    );
  } catch (e) {
    console.error("[mapper] schedule failed", e);
  }
}

export function remapAll(): void {
  if (!mappingEnabled()) return;
  readState()
    .then((s) => {
      for (const x of s.sessions) if (hasCaptureConsent(s, x.harness, x.repo)) scheduleMapping(x.id, s);
    })
    .catch((e) => console.error("[mapper] remapAll failed", e));
}

/** Recompute the registry version. When it changed (org push, ratify), remap every session. Also picks up sessions with no current mapping. */
export async function ensureRegistryFresh(): Promise<void> {
  try {
    const snap = await readState();
    if (scenarioOf(snap) === "custom") return;
    let changed = false;
    if (registryVersion(snap) !== snap.registry_version) {
      changed = await mutate((s) => refreshRegistry(s));
    }
    // The registry version above is bookkeeping and always kept current. Mapping itself is gated.
    if (!mappingEnabled()) return;
    if (changed) {
      remapAll();
      return;
    }
    const current = snap.registry_version;
    for (const x of snap.sessions) {
      if (!hasCaptureConsent(snap, x.harness, x.repo)) continue;
      const m = snap.mappings.find((mm) => mm.session_id === x.id);
      if ((!m || m.registry_version !== current) && !timers.has(x.id) && !queued.has(x.id) && !running.has(x.id)) scheduleMapping(x.id, snap);
    }
  } catch (e) {
    console.error("[mapper] registry refresh failed", e);
  }
}
