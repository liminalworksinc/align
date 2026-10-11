import { promises as fs, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AppState, CheckResult, SimulationRun, TraceRow } from "./types";
import { ROOT, now, sha256 } from "./store";

export const EVIDENCE_DIR = path.join(ROOT, "sparta", "walkthrough-lab", "evidence");
export const TRACE_DIR = path.join(ROOT, "agent", "traces");
const LABEL = /^([a-z0-9-]+)@(\d+)-(normal|interruption)-\d+(?:\.json)?$/;
const PROTECTED_TICKETS = ["1"];

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.keys(v as Json).sort().map((k) => [k, canonical((v as Json)[k])]));
  return v;
}

export function readTrace(label: string): Json | null {
  const file = path.join(TRACE_DIR, `${label}.trace.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Json) : null;
}

function toRun(ev: Json, file: string, fileSha: string, index: number | null, s: AppState): SimulationRun | null {
  const base = path.basename(file, ".json");
  const m = base.match(LABEL);
  if (!m) return null; // only Align-labelled runs (plan@version-scenario-stamp) are ingested
  const [, planId, planVersion] = m;
  const trace = readTrace(base);
  const plan = s.plans.find((p) => p.plan_id === planId && p.plan_version === Number(planVersion));
  const snapshot = obj(ev.snapshot);
  const diff = obj(snapshot.diff);
  const before = obj(obj(diff.before).tickets);
  const updated = arr(obj(diff.updated).tickets).map(obj);
  const changed = updated.map((t) => {
    const prev = obj(before[String(t.id)]);
    const fields = ["status", "priority", "tags", "comments"].filter(
      (f) => JSON.stringify(t[f]) !== JSON.stringify(prev[f]),
    );
    return { ticket_id: String(t.id), fields };
  });
  const checks: CheckResult[] = arr(obj(ev.grade).checks).map((c) => {
    const o = obj(c);
    return { id: String(o.id), label: String(o.label), passed: o.passed === true, detail: String(o.detail ?? "") };
  });
  const changedIds = new Set(changed.map((c) => c.ticket_id));
  const traceRows: TraceRow[] = arr(snapshot.requests).map((r) => {
    const o = obj(r);
    const method = String(o.method);
    return {
      seq: Number(o.seq),
      kind: method === "GET" ? "read" : method === "PUT" || method === "POST" ? "write" : "other",
      method,
      path: String(o.path),
      status: Number(o.status),
      injected: Number(o.injected) > 0,
    };
  });
  const execution = obj(ev.execution);
  const exitCode = Number(execution.exitCode ?? execution.agentExitCode ?? -1);
  const passed = obj(ev.grade).passed === true && exitCode === 0;
  const inputs = obj(ev.inputs);
  const traceSha = trace ? String(trace.plan_sha256 ?? "") : "";
  return {
    id: `sim-${fileSha.slice(0, 10)}${index === null ? "" : `-${index}`}`,
    plan_id: planId,
    plan_version: Number(planVersion),
    plan_hash: traceSha || plan?.hash || "",
    world_id: String((trace?.world_id as string) ?? "fresh world (id stripped from evidence)"),
    mission_id: String(ev.missionId),
    seed_version: String(ev.seedHash ?? "").slice(0, 12),
    checks_version: sha256(JSON.stringify(canonical(obj(inputs.checks)[String(ev.missionId)] ?? {}))).slice(0, 12),
    scenario: ev.scenarioEnabled ? "interruption" : "normal",
    changed_records: changed,
    protected_records: PROTECTED_TICKETS.map((t) => ({ ticket_id: t, unchanged: !changedIds.has(t) })),
    checks,
    trace: traceRows,
    verdict: passed ? "PASS" : "FAIL",
    exit_code: exitCode,
    report_path: path.relative(ROOT, file),
    report_sha256: fileSha,
    package_version: String(obj(ev.package).version ?? ""),
    ingested_at: now(),
  };
}

/** Ingest new Align evidence files. Idempotent: keyed by file sha256 (plus run index for batches). */
export async function ingestEvidence(s: AppState): Promise<number> {
  if (!existsSync(EVIDENCE_DIR)) return 0;
  const files = (await fs.readdir(EVIDENCE_DIR)).filter((f) => f.endsWith(".json")).sort();
  let added = 0;
  for (const f of files) {
    const file = path.join(EVIDENCE_DIR, f);
    const raw = await fs.readFile(file);
    const fileSha = sha256(raw);
    if (s.simulations.some((r) => r.report_sha256 === fileSha)) continue;
    const ev = JSON.parse(raw.toString("utf8")) as Json;
    const runs = Array.isArray(ev.runs) ? ev.runs.map((r, i) => [obj(r), i] as const) : [[ev, null] as const];
    for (const [run, i] of runs) {
      const sim = toRun(run, file, fileSha, i, s);
      if (sim) {
        s.simulations.push(sim);
        added++;
      }
    }
  }
  return added;
}

export async function readEvidenceFile(rel: string): Promise<Json | null> {
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(EVIDENCE_DIR + path.sep)) return null;
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Json;
  } catch {
    return null;
  }
}
