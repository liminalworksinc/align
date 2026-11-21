import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { api, bindDevice, clockOffset, loadCredentials, serverIso, signedIn, stillBound } from "./api.ts";
import { readTurn, type RecordCount, type TurnContent } from "./analysis-transcript.ts";
import { confirmedPreview, previewCode } from "./preview-code.ts";
import type { Ctx } from "./context.ts";
import { kvGet, kvSet, tx } from "./db.ts";
import { considerGoalSuggestion, saveSuggestionConsent, suggestionConsent } from "./goal-suggestions.ts";
import {
  checkLimits, DECISION_PROVIDERS, decisionService, decisionWindow, decisionWindowStart, sameDecisionService, type DecisionService,
} from "./decision-model.ts";
import { loadFeed } from "./goals.ts";
import { getShare } from "./hot.ts";
import { takeLease } from "./lease.ts";
import { enqueue } from "./share.ts";
import { confirming, madeActs, rawActs, relTo } from "./hooks/siblings.ts";
import { attributedCommit, COMMIT, verdictFor, verdictsOf } from "./hooks/evidence.ts";
import { exampleCrossings } from "./shared/drift.ts";
import { readJson, removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import { gitInfo } from "./shared/anchors.ts";
import { layout, localId } from "./shared/layout.ts";
import type { AnalysisExtension, AnalysisNotice, AnalysisTurn, Evidence } from "./shared/analysis.ts";
import { invalidatePastOffer, type SuggestionOrigin, type SuggestionReply, type SuggestionStage } from "./shared/goal-suggestions.ts";
import type { Harness, Limit, SpoolRecord } from "./shared/types.ts";

const MAX_JOBS = 8;
const MAX_SEND = 8;
const RUN_MS = 3000;
const SEND_TIMEOUT = 750;
const CONSENT = "analysis_results_consent";
const MAX_MODEL_SEND_MS = 1500;
const modelConsentKey = (ws: string) => `analysis_model_check_consent:${ws}`;
const MODEL_CHECK = { kind: "model_check", tier: 3, recipient: "provider" } as const satisfies AnalysisExtension;
type WorkspaceService = Extract<DecisionService, { provider: "workspace" }>;
type ModelConsent = { service: WorkspaceService; device: string; enabledFrom: string };
type Consent = { device: string; enabledFrom: string | null; pending: boolean };
type Scope = { ws: string; key: string; device: string };
type Wire = { id: string; epoch_id: string; goal_version: number; limit_id: string; evidence: Evidence; digest: string; turn_started_at: string };
type Source = { turn: Pick<AnalysisTurn, "root" | "at" | "transcript" | "endOffset">; harness: Harness; native: string };
type JobInput = Source & { turn: AnalysisTurn; legacy: boolean };
type Job = { local_id: string; root: string; input: string; ended_at: string; attempts: number };
type Result = {
  goal: { id: string; title?: string; version: number; epoch: string; origin: NonNullable<AnalysisTurn["binding"]>["origin"] } | null;
  records: { replies: number; calls: number; results: number; lower_bounds?: RecordCount[] } | null;
  findings: AnalysisNotice[];
  notices: boolean;
  source?: Source & { workspace?: string };
};

const base = ({ ws, key }: Scope) => `/api/v2/workspaces/${encodeURIComponent(ws)}/sessions/${encodeURIComponent(key)}/analysis`;
const timeout = (deadline: number) => Math.max(1, Math.min(SEND_TIMEOUT, deadline - Date.now()));
const deletionKey = (lid: string) => `analysis_deleted:${lid}`;
const consentOf = (ctx: Ctx): Consent | null => JSON.parse(kvGet(ctx.db, CONSENT) ?? "null");
const currentDevice = (ctx: Ctx) => loadCredentials(ctx.home)?.device_id;
const startedAfterConsent = (turnStart: string, enabledFrom: string | null | undefined) =>
  !!enabledFrom && turnStart > enabledFrom;
const wireOf = ({ id, version, limit, evidence, digest }: AnalysisNotice, epoch: string, turnStartedAt: string): Wire =>
  ({ id, epoch_id: epoch, goal_version: version, limit_id: limit.id, evidence, digest, turn_started_at: turnStartedAt });
const modelConsentOf = (ctx: Ctx, ws: string): ModelConsent | null => JSON.parse(kvGet(ctx.db, modelConsentKey(ws)) ?? "null");

export function recordAnalysis(ctx: Ctx, rec: Extract<SpoolRecord, { type: "analysis_turn" | "drift_feedback" }>) {
  tx(ctx.db, () => {
    if (rec.type === "drift_feedback") {
      if ((kvGet(ctx.db, deletionKey(rec.local_id)) ?? "") >= rec.ts) return;
      const f = rec.feedback;
      ctx.db.prepare("INSERT OR IGNORE INTO analysis_feedback VALUES (?,?,?,?,?,?,?)")
        .run(rec.local_id, f.root, f.kind, f.finding ?? "", f.version, f.at, f.digest ?? null);
      ctx.db.prepare("INSERT OR IGNORE INTO analysis_projection (local_id) VALUES (?)").run(rec.local_id);
      return;
    }
    const lid = localId(rec.harness, rec.native_id);
    if ((kvGet(ctx.db, deletionKey(lid)) ?? "") >= rec.turn.at) return;
    const input: JobInput = { turn: rec.turn, harness: rec.harness, native: rec.native_id, legacy: rec.legacy };
    ctx.db.prepare(`INSERT OR IGNORE INTO analysis_jobs (local_id, root, input, ended_at)
      SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM analysis_results WHERE local_id = ? AND root = ?)`)
      .run(lid, rec.turn.root, JSON.stringify(input), rec.ts, lid, rec.turn.root);
  });
}

function keyed(ctx: Ctx, kind: string, parts: string[]): string {
  return crypto.createHmac("sha256", ctx.secret).update(JSON.stringify([kind, ...parts])).digest("hex").slice(0, 32);
}

function segmentMatches(pattern: string, value: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === value;
  const first = parts.shift()!;
  const last = parts.pop()!;
  if (!value.startsWith(first) || !value.endsWith(last) || first.length + last.length > value.length) return false;
  let offset = first.length;
  const end = value.length - last.length;
  for (const part of parts) {
    const index = value.indexOf(part, offset);
    if (index < 0 || index + part.length > end) return false;
    offset = index + part.length;
  }
  return true;
}

function pathMatches(rule: string, file: string): boolean {
  const parts = rule.split("/");
  const segments = file.split("/");
  // Match complete path segments. A double star can consume zero or more segments.
  let previous = new Set([0]);
  for (const part of parts) {
    if (part === "**") {
      const start = Math.min(...previous);
      previous = new Set(segments.map((_, i) => i + 1).filter((i) => i >= start));
      if (start === 0) previous.add(0);
    } else {
      previous = new Set([...previous].filter((i) => i < segments.length && segmentMatches(part, segments[i])).map((i) => i + 1));
    }
    if (!previous.size) return false;
  }
  return previous.has(segments.length);
}

function occurrence(file: string): string | null {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return null;
  }
}

function activityFindings(ctx: Ctx, job: Job, turn: AnalysisTurn, content: TurnContent | null) {
  const { binding, cwd } = turn;
  const repo = binding?.goal.limits?.some((l) => l.path_anchors?.length) && cwd ? gitInfo(cwd)?.toplevel : null;
  if (!repo || !binding) return [];
  const all = rawActs(ctx.home, job.local_id);
  const verdicts = verdictsOf(all);
  const confirmedTools = new Set(all.filter((a) => a.t === "ran" && a.tool_verdict).map((a) => a.u));
  const belongs = all.filter((a) => a.g === binding.goal.id && !a.ag && (!a.u || !content?.calls.size || content.calls.has(a.u)));
  const edits = madeActs(belongs.filter((a) => a.t === "edit" && a.p), confirming(ctx.home, job.local_id), verdicts)
    .flatMap((a) => {
      if (!a.p) return [];
      const when = a.via === "git" ? occurrence(a.p) : a.at;
      if (!when || when < turn.at || when > job.ended_at || (a.via === "git" && Date.parse(a.at) - Date.parse(job.ended_at) > 30_000)) return [];
      if (!a.via && (!a.u || verdictFor(a, verdicts) !== true)) return [];
      const file = relTo(repo, a.p);
      if (!file) return [];
      const evidence: Evidence = a.via === "git" ? "git" : a.u && confirmedTools.has(a.u) ? "tool" : "file";
      return [{ file, evidence }];
    });
  const settled = verdictsOf(all.filter((a) => a.at <= job.ended_at && a.p === COMMIT));
  const commits = belongs.filter((a) => a.t === "commit" && a.at >= turn.at && a.at <= job.ended_at && verdictFor(a, settled) === true).slice(0, 4);
  const committedPaths = commits.flatMap((act) => {
    if (!act.d || gitInfo(act.d)?.toplevel !== repo) return [];
    const commit = attributedCommit(act);
    if (!commit) return [];
    try {
      const paths = execFileSync("git", ["-C", repo, "diff-tree", "--no-commit-id", "--no-ext-diff", "--no-renames", "--name-only", "-r", "-z", "--root", commit, "--"], {
        encoding: "utf8", timeout: 200, maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "ignore"],
      });
      return paths.split("\0").filter(Boolean).map((file) => ({ file, evidence: "git" as const }));
    } catch {
      return [];
    }
  });
  return [...edits, ...committedPaths];
}

function evidenceDigest(ctx: Ctx, workspace: string, goal: string, limit: string, value: string) {
  return keyed(ctx, "limit evidence", [workspace, goal, limit, value]);
}

function findingsFor(ctx: Ctx, job: Job, turn: AnalysisTurn, content: TurnContent | null, checked: Limit[]): AnalysisNotice[] {
  const binding = turn.binding;
  if (!binding || readJson<{ drift?: boolean }>(layout.config(ctx.home))?.drift === false) return [];
  const goal = binding.goal;
  const limits = goal.limits ?? [];
  const titles = [goal.title, ...goal.measures.map((m) => m.text), ...(loadFeed(ctx.home, binding.workspace)?.goals.flatMap((g) => [g.title, ...g.measures.map((m) => m.text)]) ?? [])];
  const known = { titles, texts: limits.map((limit) => limit.text) };
  const edits = activityFindings(ctx, job, turn, content);
  const out = new Map<string, AnalysisNotice>();
  const add = (limit: Limit, value: string, evidence: Evidence) => {
    const digest = evidenceDigest(ctx, binding.workspace, goal.id, limit.id, value);
    const id = keyed(ctx, "finding", [job.local_id, turn.root, String(goal.version), digest]);
    if (!out.has(id)) out.set(id, { id, root: turn.root, version: goal.version, title: goal.title, limit: { id: limit.id, text: limit.text, type: limit.type }, evidence, digest });
  };
  for (const limit of limits) {
    for (const edit of edits.filter((e) => limit.path_anchors?.some((a) => pathMatches(a, e.file))).slice(0, 4)) {
      if (limit.type !== "must") add(limit, edit.file, edit.evidence);
    }
    const reply = content?.replies.join("\n") ?? "";
    for (const { sentence, example } of exampleCrossings(limit, reply, known).slice(-4)) add(limit, sentence, example ? "example" : "wording");
  }
  for (const limit of checked) {
    if (![...out.values()].some((finding) => finding.limit.id === limit.id)) add(limit, content!.finalReply!, "model");
  }
  return [...out.values()];
}

function project(ctx: Ctx, lid: string): void {
  const rows = ctx.db.prepare("SELECT result FROM analysis_results WHERE local_id = ? ORDER BY ended_at DESC LIMIT 12").all(lid) as { result: string }[];
  const contests = ctx.db.prepare("SELECT version, digest FROM analysis_feedback WHERE local_id = ? AND kind = 'wrong'").all(lid);
  const suppressed = new Set(contests.map((f) => `${f.version}:${f.digest}`));
  const notices = rows.reverse().flatMap(({ result }) => {
    const r = JSON.parse(result) as Result;
    return r.findings.filter((f) => (r.notices || f.evidence !== "wording") && !suppressed.has(`${f.version}:${f.digest}`));
  }).slice(-60);
  if (notices.length) writeJsonAtomic(layout.analysis(ctx.home, lid), notices);
  else removeFile(layout.analysis(ctx.home, lid));
}

function finishJob(ctx: Ctx, job: Job, input: JobInput, content: TurnContent | null, checked: Limit[]) {
  const { turn } = input;
  const bind = turn.binding;
  const result: Result = {
    goal: bind ? { id: bind.goal.id, title: bind.goal.title, version: bind.goal.version, epoch: bind.epoch, origin: bind.origin } : null,
    records: content ? {
      replies: content.replies.length, calls: content.calls.size, results: content.results.size,
      ...(content.lowerBounds.size ? { lower_bounds: [...content.lowerBounds] } : {}),
    } : null,
    findings: findingsFor(ctx, job, turn, content, checked),
    notices: !input.legacy,
    source: content ? {
      harness: input.harness, native: input.native, workspace: bind?.workspace,
      turn: { root: turn.root, at: turn.at, transcript: turn.transcript, endOffset: turn.endOffset },
    } : undefined,
  };
  const recorded = tx(ctx.db, () => {
    if ((kvGet(ctx.db, deletionKey(job.local_id)) ?? "") >= turn.at) return false;
    ctx.db.prepare("DELETE FROM analysis_jobs WHERE local_id = ? AND root = ?").run(job.local_id, job.root);
    if (!ctx.db.prepare("INSERT OR IGNORE INTO analysis_results VALUES (?,?,?,?,?)")
      .run(job.local_id, job.root, turn.at, job.ended_at, JSON.stringify(result)).changes) return false;
    const consent = consentOf(ctx);
    if (!bind || !consent || currentDevice(ctx) !== consent.device || !startedAfterConsent(turn.at, consent.enabledFrom)) return true;
    const turnStartedAt = serverIso(turn.at, clockOffset(ctx.home));
    for (const finding of result.findings) {
      if (input.legacy && finding.evidence === "wording") continue;
      const scope: Scope = { ws: bind.workspace, key: bind.key, device: consent.device };
      enqueue(ctx, job.local_id, "analysis_put", { scope, wire: wireOf(finding, bind.epoch, turnStartedAt) });
    }
    return true;
  });
  project(ctx, job.local_id);
  return recorded;
}

async function syncConsent(ctx: Ctx, deadline: number) {
  const consent = consentOf(ctx);
  if (consent?.pending && consent.device === currentDevice(ctx) && Date.now() < deadline) {
    const res = await api(ctx, "PUT", "/api/v2/devices/self/data-sharing", {
      body: { enabled: !!consent.enabledFrom }, timeoutMs: timeout(deadline),
    });
    if (res.status === 403 && res.json?.error === "results_unavailable") {
      tx(ctx.db, () => {
        kvSet(ctx.db, CONSENT, JSON.stringify({ ...consent, enabledFrom: null, pending: false }));
        ctx.db.prepare("DELETE FROM outbox WHERE kind = 'analysis_put'").run();
      });
      return "unavailable" as const;
    }
    if (res.status === 200 && res.json?.enabled === !!consent.enabledFrom) kvSet(ctx.db, CONSENT, JSON.stringify({ ...consent, pending: false }));
  }
}

/** A later check or goal suggestion must declare its tier here before receiving input. */
export function analysisSharingAllowed(ctx: Ctx, capability: 2 | AnalysisExtension, workspace?: string, at?: string): boolean {
  if (capability !== 2) {
    if (capability.kind === "model_check") return !!workspace && modelChecksOn(ctx, workspace, at);
    if (capability.kind !== "goal_suggestion" || capability.tier !== 3) return false;
    const consent = suggestionConsent(ctx, capability.recipient, workspace);
    return at ? startedAfterConsent(at, consent?.at) : !!consent;
  }
  const consent = consentOf(ctx);
  return !!consent?.enabledFrom && consent.device === currentDevice(ctx);
}

const modelScope = (device: string, ws: string, service: WorkspaceService) =>
  ["model check", device, ws, service.endpoint, service.revision];

async function readModelService(ctx: Ctx, ws: string) {
  const result = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(ws)}/data-sharing`, {
    timeoutMs: SEND_TIMEOUT, redirect: "error",
  });
  const service = result.status === 200 ? decisionService("workspace", result.json?.decision_service) : null;
  if (service?.provider !== "workspace") throw new Error("Ask the workspace owner to set a decision service address in People.");
  return service;
}

export async function modelConsentPreview(ctx: Ctx, ws: string) {
  const device = currentDevice(ctx);
  if (!device || !signedIn(ctx.home)) throw new Error("Sign in on this machine before allowing model checks.");
  const service = await readModelService(ctx, ws);
  if (device !== currentDevice(ctx)) throw new Error("This machine's pairing changed. Preview the recipient again.");
  return { endpoint: service.endpoint, code: previewCode(ctx.secret, modelScope(device, ws, service)) };
}

export function modelChecksOn(ctx: Ctx, ws: string, at?: string) {
  const consent = modelConsentOf(ctx, ws);
  return !!consent && signedIn(ctx.home) && consent.device === currentDevice(ctx)
    && (!at || startedAfterConsent(at, consent.enabledFrom));
}

export async function setModelChecks(ctx: Ctx, ws: string, code?: string) {
  const unlock = await waitForAnalysisLease(ctx);
  const unbind = bindDevice(ctx);
  try {
    if (code === undefined) {
      ctx.db.prepare("DELETE FROM kv WHERE key = ?").run(modelConsentKey(ws));
      return;
    }
    const device = currentDevice(ctx);
    if (!device || !signedIn(ctx.home)) throw new Error("Sign in on this machine before allowing model checks.");
    const service = await readModelService(ctx, ws);
    if (!stillBound(ctx) || !confirmedPreview(ctx.secret, modelScope(device, ws, service), code)) {
      throw new Error("Review the current recipient with align data-sharing model preview, then confirm it.");
    }
    if (!modelChecksOn(ctx, ws) || !sameDecisionService(modelConsentOf(ctx, ws)?.service, service)) {
      kvSet(ctx.db, modelConsentKey(ws), JSON.stringify({ device, service, enabledFrom: new Date().toISOString() } satisfies ModelConsent));
    }
  } finally {
    unbind();
    unlock();
  }
}

async function checkTurn(ctx: Ctx, job: Job, input: JobInput, content: TurnContent, deadline: number): Promise<Limit[]> {
  const { binding, at } = input.turn;
  const reply = content.finalReply;
  if (input.legacy || !binding || !reply?.trim() || Buffer.byteLength(reply) > 2000
    || readJson<{ drift?: boolean }>(layout.config(ctx.home))?.drift === false) return [];
  const limits = binding.goal.limits?.slice(0, 10);
  const { workspace: ws, key: sessionKey } = binding;
  const consent = modelConsentOf(ctx, ws);
  const key = ctx.env[DECISION_PROVIDERS.workspace.key];
  if (!limits?.length || !consent || !key?.trim() || !analysisSharingAllowed(ctx, MODEL_CHECK, ws, at)) return [];
  const current = () => {
    const share = getShare(ctx, job.local_id);
    return stillBound(ctx) && share?.state === "shared" && share.workspace_id === ws && share.session_key === sessionKey
      && (kvGet(ctx.db, deletionKey(job.local_id)) ?? "") < at && modelConsentOf(ctx, ws)?.enabledFrom === consent.enabledFrom;
  };
  if (!current() || Date.now() >= deadline) return [];
  try {
    const remaining = decisionWindowStart();
    const permission = await api(ctx, "POST", `/api/v2/workspaces/${encodeURIComponent(ws)}/sessions/${encodeURIComponent(sessionKey)}/model-check`, {
      timeoutMs: Math.max(1, deadline - Date.now()),
      redirect: "error",
    });
    const duration = decisionWindow(permission, MAX_MODEL_SEND_MS);
    if (!duration || !sameDecisionService(consent.service, decisionService("workspace", permission.json?.decision_service))) return [];
    const crossed = await checkLimits(consent.service, key, reply, limits, MAX_MODEL_SEND_MS,
      () => current() ? Math.min(remaining(duration), deadline - Date.now()) : 0);
    return current() ? crossed.map((index) => limits[index]) : [];
  } catch {
    return [];
  }
}

async function waitForAnalysisLease(ctx: Ctx) {
  const waitUntil = Date.now() + 5000;
  for (;;) {
    const unlock = takeLease(ctx, "analysis");
    if (unlock) return unlock;
    if (Date.now() >= waitUntil) throw new Error("Analysis is finishing. Try again in a moment.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function setGoalSuggestionConsent(ctx: Ctx, recipient: AnalysisExtension["recipient"],
  workspace: string | undefined, enabled: boolean, service?: DecisionService) {
  if (!enabled) return saveSuggestionConsent(ctx, recipient, workspace, false);
  const device = currentDevice(ctx);
  const unlock = await waitForAnalysisLease(ctx);
  try {
    if (!stillBound(ctx) || currentDevice(ctx) !== device) throw new Error("This machine's pairing changed. Choose again for the current device.");
    saveSuggestionConsent(ctx, recipient, workspace, enabled, service);
  } finally {
    unlock();
  }
}

export async function setResultsEnabled(ctx: Ctx, enabled: boolean): Promise<"saved" | "pending" | "unavailable"> {
  const unlock = await waitForAnalysisLease(ctx);
  const unbind = bindDevice(ctx);
  try {
    const device = currentDevice(ctx);
    if (enabled && !device) throw new Error("Sign in on this machine before sharing derived results.");
    const current = consentOf(ctx);
    tx(ctx.db, () => {
      const enabledFrom = enabled ? (current?.device === device ? current?.enabledFrom : null) ?? new Date().toISOString() : null;
      const owner = device ?? current?.device;
      if (owner) kvSet(ctx.db, CONSENT, JSON.stringify({ device: owner, enabledFrom, pending: true } satisfies Consent));
      if (!enabled) ctx.db.prepare("DELETE FROM outbox WHERE kind = 'analysis_put'").run();
    });
    if (signedIn(ctx.home) && await syncConsent(ctx, Date.now() + SEND_TIMEOUT).catch(() => undefined) === "unavailable") return "unavailable";
    return consentOf(ctx)?.pending ? "pending" : "saved";
  } finally {
    unbind();
    unlock();
  }
}

type QueuedRow = { id: number; local_id: string; kind: "analysis_put" | "analysis_delete"; payload: string; attempts: number };

async function putResult(ctx: Ctx, row: QueuedRow, scope: Scope, wire: Wire, deadline: number, permissions: Map<string, string | null>) {
  const consent = consentOf(ctx);
  if (!analysisSharingAllowed(ctx, 2) || consent?.device !== scope.device) return true;
  if (consent.pending) return false;
  const share = getShare(ctx, row.local_id);
  if (share?.state !== "shared" || share.workspace_id !== scope.ws || share.session_key !== scope.key) return true;
  const epoch = ctx.db.prepare("SELECT synced FROM epochs WHERE epoch_id=? AND local_id=?").get(wire.epoch_id, row.local_id) as { synced: number } | undefined;
  if (epoch?.synced !== 1) return !epoch || epoch.synced < 0;
  const url = base(scope);
  if (!permissions.has(url)) {
    const result = await api(ctx, "GET", `${url}?status=1`, { timeoutMs: timeout(deadline) });
    if (result.status !== 200) return result.status === 404;
    const status = result.json;
    permissions.set(url, status?.available === true && status.enabled === true && typeof status.enabled_since === "string"
      ? status.enabled_since : null);
  }
  const enabledSince = permissions.get(url);
  if (!startedAfterConsent(wire.turn_started_at, enabledSince)) return true;
  if (Date.now() >= deadline) return false;
  ctx.db.prepare("INSERT OR IGNORE INTO analysis_copies (local_id, workspace, session_key, device, id, payload) VALUES (?,?,?,?,?,?)")
    .run(row.local_id, scope.ws, scope.key, scope.device, wire.id, JSON.stringify(wire));
  const sent = await api(ctx, "POST", url, { body: wire, timeoutMs: timeout(deadline) });
  if (sent.status === 200 && Object.keys(wire).every((key) => sent.json?.[key] === wire[key as keyof Wire])) {
    ctx.db.prepare("UPDATE analysis_copies SET acknowledged=1 WHERE local_id=? AND workspace=? AND session_key=? AND id=?")
      .run(row.local_id, scope.ws, scope.key, wire.id);
    return true;
  }
  if (sent.status === 410 && sent.json?.error === "finding_gone") {
    ctx.db.prepare("DELETE FROM analysis_copies WHERE local_id=? AND workspace=? AND session_key=? AND id=?")
      .run(row.local_id, scope.ws, scope.key, wire.id);
  }
  return sent.status >= 400 && sent.status < 500 && sent.status !== 429;
}

async function flushAnalysis(ctx: Ctx, deadline: number) {
  const rows = ctx.db.prepare(`SELECT id, local_id, kind, payload, attempts FROM outbox
    WHERE kind IN ('analysis_put', 'analysis_delete') AND next_at <= ?
    ORDER BY CASE kind WHEN 'analysis_delete' THEN 0 ELSE 1 END, id LIMIT ?`).all(Date.now(), MAX_SEND) as QueuedRow[];
  const permissions = new Map<string, string | null>();
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    const { scope, wire } = JSON.parse(row.payload) as { scope: Scope; wire?: Wire };
    let done = false;
    if (currentDevice(ctx) === scope.device) {
      try {
        if (row.kind === "analysis_delete") {
          const res = await api(ctx, "DELETE", base(scope), { timeoutMs: timeout(deadline) });
          if (res.status === 204) {
            ctx.db.prepare("DELETE FROM analysis_copies WHERE local_id=? AND workspace=? AND session_key=?")
              .run(row.local_id, scope.ws, scope.key);
            done = true;
          }
        } else if (wire) done = await putResult(ctx, row, scope, wire, deadline, permissions);
      } catch {
        /* Retry without writing request data to logs. */
      }
    } else if (row.kind === "analysis_put") done = true;
    if (done) ctx.db.prepare("DELETE FROM outbox WHERE id=?").run(row.id);
    else ctx.db.prepare("UPDATE outbox SET attempts=attempts+1, next_at=? WHERE id=?")
      .run(Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(row.attempts, 6)), row.id);
  }
}

export async function runAnalysis(ctx: Ctx) {
  if (!ctx.db.prepare(`SELECT 1 FROM analysis_jobs UNION ALL
    SELECT 1 FROM analysis_projection UNION ALL
    SELECT 1 FROM outbox WHERE kind IN ('analysis_put','analysis_delete') LIMIT 1`).get() && !consentOf(ctx)?.pending) return;
  const unlock = takeLease(ctx, "analysis");
  if (!unlock) return;
  const unbind = bindDevice(ctx);
  const deadline = Date.now() + RUN_MS;
  try {
    const jobs = ctx.db.prepare("SELECT * FROM analysis_jobs WHERE next_at<=? ORDER BY ended_at LIMIT ?").all(Date.now(), MAX_JOBS) as Job[];
    for (const job of jobs) {
      if (Date.now() >= deadline) break;
      const input = JSON.parse(job.input) as JobInput;
      const content = readTurn(input.harness, input.native, input.turn);
      if (input.turn.transcript && !content && job.attempts < 2) {
        ctx.db.prepare("UPDATE analysis_jobs SET attempts=attempts+1, next_at=? WHERE local_id=? AND root=?")
          .run(Date.now() + 1000 * (job.attempts + 1), job.local_id, job.root);
      } else {
        const checked = content ? await checkTurn(ctx, job, input, content, deadline) : [];
        const recorded = finishJob(ctx, job, input, content, checked);
        if (recorded && signedIn(ctx.home)) {
          await considerGoalSuggestion(ctx, job.local_id, input.turn, content?.prompt,
            (cap, ws, at) => analysisSharingAllowed(ctx, cap, ws, at)).catch(() => undefined);
        }
      }
    }
    const dirty = ctx.db.prepare("SELECT local_id FROM analysis_projection LIMIT ?").all(MAX_JOBS) as { local_id: string }[];
    for (const { local_id: lid } of dirty) {
      if (Date.now() >= deadline) break;
      ctx.db.prepare("DELETE FROM analysis_projection WHERE local_id=?").run(lid);
      project(ctx, lid);
    }
    if (signedIn(ctx.home)) {
      await syncConsent(ctx, deadline).catch(() => undefined);
      await flushAnalysis(ctx, deadline);
    }
  } finally {
    unbind();
    unlock();
  }
}

type SavedSuggestion = { stage: SuggestionStage; workspace: string; candidates: string; origin: SuggestionOrigin; at: string };
type SavedReply = { stage: SuggestionStage; reply: SuggestionReply; chosen: string | null; at: string };

function readSource(source: Source | undefined) {
  return source ? readTurn(source.harness, source.native, source.turn) : null;
}

export function excerptSource(ctx: Ctx, lid: string, root: string) {
  const row = ctx.db.prepare("SELECT result FROM analysis_results WHERE local_id=? AND root=?").get(lid, root) as { result: string } | undefined;
  if (!row) return null;
  const { source } = JSON.parse(row.result) as Result;
  return readSource(source);
}

export function inspectAnalysis(ctx: Ctx, lid: string, showEvidence = false) {
  const turns = ctx.db.prepare("SELECT root, started_at, ended_at, result FROM analysis_results WHERE local_id=? ORDER BY ended_at DESC").all(lid);
  const feedback = ctx.db.prepare("SELECT root, version, kind, NULLIF(finding, '') AS finding, at FROM analysis_feedback WHERE local_id=? ORDER BY at").all(lid);
  const copies = ctx.db.prepare("SELECT workspace, session_key, payload, acknowledged FROM analysis_copies WHERE local_id=? ORDER BY rowid").all(lid);
  const pending = ctx.db.prepare("SELECT kind FROM outbox WHERE local_id=? AND kind IN ('analysis_put','analysis_delete')").all(lid);
  return {
    turns: turns.map(({ root, started_at, ended_at, result }) => {
      const row = { root: String(root), started_at: String(started_at), ended_at: String(ended_at) };
      const { source, findings, ...parsed } = JSON.parse(String(result)) as Result;
      if (!showEvidence || !findings.some((finding) => finding.evidence === "model")) return { ...row, ...parsed, findings };
      const reply = readSource(source)?.finalReply;
      const workspace = source?.workspace;
      return {
        ...row, ...parsed,
        findings: findings.map((finding) => finding.evidence === "model" ? {
          ...finding,
          reply: workspace && parsed.goal && reply && evidenceDigest(ctx, workspace, parsed.goal.id, finding.limit.id, reply) === finding.digest
            ? reply : "Unknown",
        } : finding),
      };
    }),
    feedback,
    suggestions: ctx.db.prepare("SELECT stage, workspace, candidates, origin, at FROM goal_suggestions WHERE local_id=? ORDER BY at").all(lid)
      .map((row) => {
        const { candidates, ...saved } = row as SavedSuggestion;
        return { ...saved, candidates: JSON.parse(candidates) as string[] };
      }),
    suggestion_feedback: ctx.db.prepare("SELECT stage, reply, chosen, at FROM goal_suggestion_feedback WHERE local_id=? ORDER BY at").all(lid) as SavedReply[],
    sent: copies.filter((row) => row.acknowledged).map((row) => ({ workspace: row.workspace, session: row.session_key, finding: JSON.parse(String(row.payload)) as Wire })),
    delivery_unknown: copies.filter((row) => !row.acknowledged && row.payload !== "null").map((row) => ({ workspace: row.workspace, session: row.session_key, finding: JSON.parse(String(row.payload)) as Wire })),
    upload_pending: pending.some((r) => r.kind === "analysis_put"),
    deletion_pending: pending.some((r) => r.kind === "analysis_delete"),
  };
}

export async function deleteAnalysis(ctx: Ctx, lid: string): Promise<boolean> {
  const unlock = await waitForAnalysisLease(ctx);
  const unbind = bindDevice(ctx);
  try {
    tx(ctx.db, () => {
      kvSet(ctx.db, deletionKey(lid), new Date().toISOString());
      for (const table of ["goal_suggestions", "goal_suggestion_feedback", "goal_suggestion_streaks", "goal_binding_history"]) {
        ctx.db.prepare(`DELETE FROM ${table} WHERE local_id=?`).run(lid);
      }
      for (const table of ["analysis_results", "analysis_jobs", "analysis_feedback", "analysis_projection"]) ctx.db.prepare(`DELETE FROM ${table} WHERE local_id=?`).run(lid);
      ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind='analysis_put'").run(lid);
      ctx.db.prepare("UPDATE outbox SET next_at=0 WHERE local_id=? AND kind='analysis_delete'").run(lid);
      const scopes = ctx.db.prepare("SELECT DISTINCT workspace AS ws, session_key AS key, device FROM analysis_copies WHERE local_id=?").all(lid);
      for (const scope of scopes) enqueue(ctx, lid, "analysis_delete", { scope });
      ctx.db.prepare("DELETE FROM analysis_copies WHERE local_id=?").run(lid);
    });
    invalidatePastOffer(ctx.home);
    const preview = layout.suggestionSharePreview(ctx.home, lid);
    if (readJson(preview)) writeJsonAtomic(preview, true);
    for (const file of [layout.analysis(ctx.home, lid), layout.analysisEnd(ctx.home, lid), layout.analysisLast(ctx.home, lid), layout.analysisSeen(ctx.home, lid), layout.analysisTurn(ctx.home, lid), layout.drift(ctx.home, lid),
      layout.suggestion(ctx.home, lid), ...(["initial", "move"] as const).flatMap((stage) =>
        [layout.suggestionReply(ctx.home, lid, stage), layout.suggestionSeen(ctx.home, lid, stage)])]) removeFile(file);
    if (signedIn(ctx.home)) await flushAnalysis(ctx, Date.now() + RUN_MS);
    return !inspectAnalysis(ctx, lid).deletion_pending;
  } finally {
    unbind();
    unlock();
  }
}
