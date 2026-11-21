import path from "node:path";
import { api, loadCredentials, signedIn, stillBound } from "./api.ts";
import type { Ctx } from "./context.ts";
import { kvGet, kvSet, tx } from "./db.ts";
import { DECISION_PROVIDERS, decideGoal, decisionService, decisionWindow, decisionWindowStart, sameDecisionService, type DecisionService } from "./decision-model.ts";
import { loadFeed, loadMe, resolveWorkspace } from "./goals.ts";
import { getShare } from "./hot.ts";
import { pastSessions } from "./share.ts";
import type { AnalysisExtension, AnalysisTurn } from "./shared/analysis.ts";
import { matchAnchors, type GitInfo } from "./shared/anchors.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";
import { suggestionsQuiet, type GoalSuggestion, type SuggestionStage } from "./shared/goal-suggestions.ts";
import { layout } from "./shared/layout.ts";
import { matchRule, readRules, realDir } from "./shared/rules.ts";
import type { Goal, InjectedState, SpoolRecord } from "./shared/types.ts";

type Consent = { device: string; at: string; service?: DecisionService };
type Recipient = AnalysisExtension["recipient"];
const modelKey = (recipient: Recipient, ws?: string) => `goal_suggestion:${recipient}:${recipient === "provider" ? ws ?? "" : ""}`;

export function suggestionConsent(ctx: Ctx, recipient: Recipient, ws?: string): Consent | null {
  const stored = kvGet(ctx.db, modelKey(recipient, ws));
  const consent = stored ? JSON.parse(stored) as Consent : null;
  if (!consent?.device || !signedIn(ctx.home) || consent.device !== loadCredentials(ctx.home)?.device_id) return null;
  // A URL saved by an older CLI has no owner-managed revision.
  if (consent.service?.provider === "workspace" && !consent.service.revision) return null;
  return consent;
}

export function saveSuggestionConsent(ctx: Ctx, recipient: Recipient, ws: string | undefined, enabled: boolean, service?: DecisionService) {
  const device = loadCredentials(ctx.home)?.device_id;
  if (enabled && (!device || !signedIn(ctx.home))) throw new Error("Sign in on this machine before enabling model suggestions.");
  const current = suggestionConsent(ctx, recipient, ws);
  if (enabled && current && sameDecisionService(current.service, service)) return;
  kvSet(ctx.db, modelKey(recipient, ws), JSON.stringify(enabled && device ? { device, at: new Date().toISOString(), service } : null));
}

export function recordSuggestionReply(ctx: Ctx, entry: Extract<SpoolRecord, { type: "suggestion_reply" }>): void {
  if ((kvGet(ctx.db, `analysis_deleted:${entry.local_id}`) ?? "") >= entry.ts) return;
  ctx.db.prepare("INSERT OR IGNORE INTO goal_suggestion_feedback (local_id, stage, reply, chosen, at) VALUES (?,?,?,?,?)")
    .run(entry.local_id, entry.stage, entry.reply, entry.chosen, entry.ts);
}

type History = { folder: string; repo: string | null; branch: string | null; goal: string };
export function ruleChoices(goals: Goal[], folderGoal: string | null, cwd: string, git: GitInfo | null, history: History[]): string[] {
  if (folderGoal && goals.some(({ id }) => id === folderGoal)) return [folderGoal];
  const anchors = git ? matchAnchors(goals, git).map(({ id }) => id) : [];
  if (anchors.length === 1) return anchors;
  const allowed = new Set(anchors.length ? anchors : goals.map(({ id }) => id));
  const totals = new Map<string, number>();
  for (const item of history) {
    if (!allowed.has(item.goal)) continue;
    const sameFolder = item.folder === cwd;
    const sameRepoBranch = git?.branch && item.branch === git.branch && item.repo && git.remotes.includes(item.repo);
    if (sameFolder || sameRepoBranch) totals.set(item.goal, (totals.get(item.goal) ?? 0) + 1);
  }
  const ranked = [...totals].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (first && first[1] >= 2 && first[1] >= 2 * (second?.[1] ?? 0)) return [first[0]];
  return anchors.length === 2 ? anchors : [];
}

function ownHistory(ctx: Ctx, ws: string, lid: string, person: string): History[] {
  const captured = ctx.db.prepare(`SELECT folder, repo, branch, goal FROM goal_binding_history
    WHERE workspace=? AND person=? AND local_id<>?
      AND at > COALESCE((SELECT value FROM kv WHERE key='analysis_deleted:' || goal_binding_history.local_id), '')
    ORDER BY at DESC LIMIT 40`).all(ws, person, lid) as History[];
  if (captured.length === 40) return captured;
  // Earlier clients did not retain branch snapshots. Use their current live bindings for folder evidence.
  const current = ctx.db.prepare(`SELECT s.cwd, h.binding_goal AS goal FROM sessions s JOIN shares h USING(local_id)
    JOIN epochs e ON e.epoch_id=h.binding_epoch
    WHERE h.workspace_id=? AND h.local_id<>? AND NOT EXISTS (
      SELECT 1 FROM kv WHERE key='analysis_deleted:' || s.local_id
    ) AND h.state='shared' AND e.synced=1 AND h.binding_goal IS NOT NULL
      AND s.cwd IS NOT NULL AND NOT EXISTS (SELECT 1 FROM goal_binding_history g WHERE g.local_id=s.local_id)
    ORDER BY e.starts_at DESC LIMIT ?`).all(ws, lid, 40 - captured.length) as { cwd: string; goal: string }[];
  return [...captured, ...current.map(({ cwd, goal }) => ({ folder: path.resolve(cwd), repo: null, branch: null, goal }))];
}

export function pastGoalSuggestion(ctx: Ctx, folders: string[], now: number) {
  const ws = resolveWorkspace(ctx.home, ctx.config.default_workspace);
  if (!ws || !signedIn(ctx.home)) return undefined;
  const goals = bindable(loadFeed(ctx.home, ws.id)?.goals ?? []);
  for (const folder of folders) {
    if (!path.isAbsolute(folder) || suggestionsQuiet(ctx.home, folder) || matchRule(readRules(ctx.home), folder)) continue;
    const { take } = pastSessions(ctx, realDir(folder), 7, now);
    if (take.length < 2 || take.length > 100) continue;
    const suggestion = ctx.db.prepare(`SELECT g.candidates FROM goal_suggestions g
      WHERE g.local_id=? AND g.stage='initial' AND g.origin='suggested_rule' AND g.workspace=?
        AND NOT EXISTS (SELECT 1 FROM goal_suggestion_feedback f WHERE f.local_id=g.local_id AND f.stage=g.stage)`)
    const suggestions = take.map(({ local_id }) => readJson(layout.suggestionReply(ctx.home, local_id, "initial"))
      ? undefined : suggestion.get(local_id, ws.id)?.candidates);
    const first = suggestions[0];
    if (typeof first !== "string" || !suggestions.every((v) => v === first)) continue;
    const ids = JSON.parse(first) as string[];
    if (ids.length !== 1 || !goals.some(({ id }) => id === ids[0])) continue;
    const estimates = take.map(({ local_id }) => ctx.db.prepare(`SELECT CASE
      WHEN COUNT(*)=COUNT(est_list_usd_micros) THEN SUM(est_list_usd_micros) END AS micros
      FROM requests WHERE local_id=?`).get(local_id)?.micros);
    const micros = estimates.every((v) => typeof v === "number") ? estimates.reduce((a, b) => a + b, 0) : null;
    const expires_at = Math.min(...take.map((session) => Date.parse(session.last_active ?? session.started_at ?? session.created_at))) + 7 * 86_400_000;
    if (expires_at > now) return { folder, workspace: ws.id, goal: ids[0], sessions: take.length, micros, expires_at, local_ids: take.map(({ local_id }) => local_id) };
  }
}

const bindable = (goals: Goal[]) => goals.filter((goal) => goal.status === "active" && goal.bindable === true);
const checked = (ctx: Ctx, lid: string, stage: SuggestionStage) => ctx.db.prepare(
  `SELECT 1 FROM goal_suggestions WHERE local_id=? AND stage=?
    UNION ALL SELECT 1 FROM goal_suggestion_feedback WHERE local_id=? AND stage=? LIMIT 1`,
).get(lid, stage, lid, stage);

function saveChoice(ctx: Ctx, lid: string, turn: AnalysisTurn, suggestion: GoalSuggestion) {
  const { stage, workspace, candidates, origin } = suggestion;
  tx(ctx.db, () => {
    if ((kvGet(ctx.db, `analysis_deleted:${lid}`) ?? "") >= turn.at || checked(ctx, lid, stage)) return;
    ctx.db.prepare("INSERT INTO goal_suggestions VALUES (?,?,?,?,?,?,?)")
      .run(lid, stage, workspace, turn.root, JSON.stringify(candidates), origin, turn.at);
    if (candidates.length) writeJsonAtomic(layout.suggestion(ctx.home, lid), suggestion);
  });
}

function streak(ctx: Ctx, lid: string, binding: string, root: string, goal: string): number {
  const previous = ctx.db.prepare(`SELECT earlier.root_turn FROM root_turns earlier
    JOIN root_turns current ON current.local_id=earlier.local_id
    WHERE current.local_id=? AND current.root_turn=?
      AND (COALESCE(earlier.first_hook_at, earlier.ts), earlier.seq) < (COALESCE(current.first_hook_at, current.ts), current.seq)
    ORDER BY COALESCE(earlier.first_hook_at, earlier.ts) DESC, earlier.seq DESC LIMIT 1`).get(lid, root)?.root_turn as string | undefined;
  const row = ctx.db.prepare(`INSERT INTO goal_suggestion_streaks VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(local_id) DO UPDATE SET binding=excluded.binding, goal=excluded.goal, root=excluded.root,
    count=CASE WHEN goal_suggestion_streaks.binding<>excluded.binding OR goal_suggestion_streaks.goal<>excluded.goal THEN 1
      WHEN goal_suggestion_streaks.root=excluded.root THEN goal_suggestion_streaks.count
      WHEN goal_suggestion_streaks.root=? THEN goal_suggestion_streaks.count+1 ELSE 1 END
    RETURNING count`).get(lid, binding, goal, root, previous ?? null);
  return Number(row?.count ?? 0);
}

export async function considerGoalSuggestion(ctx: Ctx, lid: string, turn: AnalysisTurn,
  prompt: string | undefined, canUse: (cap: AnalysisExtension, workspace: string, at: string) => boolean, deadline: number) {
  const currentTurn = () => (kvGet(ctx.db, `analysis_deleted:${lid}`) ?? "") < turn.at && stillBound(ctx) && signedIn(ctx.home);
  const cwd = turn.cwd && path.resolve(turn.cwd);
  if (!currentTurn() || !cwd || !signedIn(ctx.home) || suggestionsQuiet(ctx.home, cwd)) return;
  const inj = readJson<InjectedState>(layout.injected(ctx.home, lid));
  const share = getShare(ctx, lid);
  const binding = turn.binding;
  const person = loadMe(ctx.home)?.user.id;
  if (!person) return;
  const stage = binding ? "move" : "initial";
  if (binding ? share?.state !== "shared" || share.binding_goal !== binding.goal.id : share || inj?.anchor_hint || inj?.rule_share) return;
  if (!binding && (checked(ctx, lid, stage) || readJson(layout.suggestionReply(ctx.home, lid, stage)))) return;
  if (!binding) {
    const first = ctx.db.prepare("SELECT root_turn FROM root_turns WHERE local_id=? ORDER BY COALESCE(first_hook_at, ts), seq LIMIT 1").get(lid);
    if (first?.root_turn !== turn.root) return;
  }

  const folderRule = matchRule(readRules(ctx.home), cwd);
  const ws = resolveWorkspace(ctx.home, binding?.workspace || folderRule?.workspace_id || ctx.config.default_workspace);
  if (!ws) return;
  const cached = loadFeed(ctx.home, ws.id);
  const git = turn.git ?? null;
  if (binding) {
    tx(ctx.db, () => {
      if (!currentTurn()) return;
      ctx.db.prepare(`INSERT INTO goal_binding_history VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(local_id, workspace, person) DO UPDATE SET folder=excluded.folder, repo=excluded.repo,
        branch=excluded.branch, goal=excluded.goal, at=excluded.at WHERE excluded.at>goal_binding_history.at`)
        .run(lid, ws.id, person, cwd, git?.remotes[0] ?? null, git?.branch ?? null, binding.goal.id, turn.at);
    });
    const declinedInitial = ctx.db.prepare("SELECT 1 FROM goal_suggestion_feedback WHERE local_id=? AND stage='initial' AND reply<>'accepted'").get(lid);
    if (declinedInitial || checked(ctx, lid, stage) || readJson(layout.suggestionReply(ctx.home, lid, stage))) return;
  }
  const goals = bindable(cached?.goals ?? []);
  let candidates = ruleChoices(goals, folderRule?.goal_id ?? null, cwd, git, []);
  if (candidates.length !== 1) candidates = ruleChoices(goals, folderRule?.goal_id ?? null, cwd, git, ownHistory(ctx, ws.id, lid, person));
  let origin: GoalSuggestion["origin"] = "suggested_rule";
  if (binding) {
    const count = tx(ctx.db, () => {
      if (!currentTurn()) return 0;
      if (candidates.length !== 1 || candidates[0] === binding.goal.id) {
        ctx.db.prepare("DELETE FROM goal_suggestion_streaks WHERE local_id=?").run(lid);
        return 0;
      }
      return streak(ctx, lid, binding.epoch, turn.root, candidates[0]);
    });
    if (count < 3) return;
  } else if (!candidates.length) {
    const choice = await modelSuggestion(ctx, ws.id, git, turn, prompt, canUse, () =>
      currentTurn() && !getShare(ctx, lid) && !suggestionsQuiet(ctx.home, cwd) && !readJson(layout.suggestionReply(ctx.home, lid, stage)), deadline);
    if (!choice) return;
    candidates = [choice.goal];
    origin = choice.origin;
  }
  if (currentTurn() && !checked(ctx, lid, stage) && !suggestionsQuiet(ctx.home, cwd) && !readJson(layout.suggestionReply(ctx.home, lid, stage))) {
    saveChoice(ctx, lid, turn, { stage, workspace: ws.id, candidates, origin, binding: binding?.goal.id ?? null, folder: cwd });
  }
}

const MODEL_POLICY_MS = 750;
const MODEL_REQUEST_MS = 2200;

async function modelSuggestion(ctx: Ctx, ws: string, git: GitInfo | null, turn: AnalysisTurn, prompt: string | undefined,
  canUse: (cap: AnalysisExtension, workspace: string, at: string) => boolean, stillPrivate: () => boolean, deadline: number) {
  // The harness integrations do not expose a way to pin the original provider and account to a fork.
  if (canUse({ kind: "goal_suggestion", tier: 3, recipient: "session" }, ws, turn.at)) return null;
  const cap: AnalysisExtension = { kind: "goal_suggestion", tier: 3, recipient: "provider" };
  const consent = suggestionConsent(ctx, cap.recipient, ws);
  const service = consent?.service;
  if (!consent || !service || !prompt || !canUse(cap, ws, turn.at)) return null;
  const key = ctx.env[DECISION_PROVIDERS[service.provider]?.key];
  if (!key) return null;

  const current = () => {
    const latest = suggestionConsent(ctx, cap.recipient, ws);
    return latest?.at === consent.at && latest.device === consent.device && sameDecisionService(latest.service, service)
      && stillBound(ctx) && stillPrivate();
  };
  const url = `/api/v2/workspaces/${encodeURIComponent(ws)}`;
  const timeout = () => Math.max(1, Math.min(MODEL_POLICY_MS, deadline - Date.now()));
  const feed = await api(ctx, "GET", `${url}/goals`, { timeoutMs: timeout(), deadline });
  if (feed.status !== 200 || !Array.isArray(feed.json?.goals) || !current()) return null;
  const active = bindable(feed.json.goals as Goal[]);

  const permissionUrl = `${url}/data-sharing?for=model-suggestion&recipient=${service.provider}`;
  const requestPolicy = (phase: string) => api(ctx, "GET", `${permissionUrl}&${phase}`, {
    timeoutMs: timeout(), deadline, redirect: "error",
  });
  const remaining = decisionWindowStart();
  const policy = await requestPolicy("phase=dispatch");
  const duration = decisionWindow(policy);
  const { revision, goals } = policy.json ?? {};
  if (!duration || !/^[a-f0-9]{32}$/.test(typeof revision === "string" ? revision : "")
    || !Array.isArray(goals) || !goals.every((goal) => goal && typeof goal.id === "string" && typeof goal.title === "string")
    || new Set(goals.map(({ id }) => id)).size !== goals.length) return null;

  const recipientMatches = (value: unknown) =>
    service.provider !== "workspace" || sameDecisionService(service, decisionService("workspace", value));
  if (!recipientMatches(policy.json?.decision_service)) return null;
  const repoAlias = ctx.db.prepare("SELECT alias FROM repo_aliases WHERE workspace_id=? AND repo_root=?")
    .get(ws, git?.toplevel ?? turn.cwd)?.alias as string | undefined;

  const goal = await decideGoal(service, key, {
    first_prompt: prompt, ...(git?.branch ? { branch: git.branch } : {}), repo_alias: repoAlias ?? null,
    goals: goals.map(({ id, title }) => ({ id, title })),
  }, Math.max(1, Math.min(MODEL_REQUEST_MS, deadline - Date.now())), fetch, (send) => tx(ctx.db, () =>
    current() && remaining(duration) > 0 && Date.now() < deadline ? send() : null));
  const anchors = git ? matchAnchors(active, git) : [];
  if (!goal || !current() || Date.now() >= deadline || (anchors.length && !anchors.some(({ id }) => id === goal))) return null;
  const answer = await requestPolicy(`phase=answer&revision=${revision}`);
  if (answer.status !== 200 || answer.json?.enabled !== true || !recipientMatches(answer.json.decision_service)
    || !current() || remaining(Number.MAX_SAFE_INTEGER) <= 0) return null;
  return { goal, origin: "suggested_model" as const };
}
