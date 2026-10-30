// Types shared by the CLI, the sync job and the hooks. Wire shapes follow docs/v2/WIRE.md.

export type Harness = "claude-code" | "codex";

export interface Measure {
  id: string;
  text: string;
  target: string | null;
}

/** One limit of a goal version (wire v2.3, PORT-002): ratified goal content, at most 5 per version. */
export interface Limit {
  id: string;
  type: "must" | "must_not" | "out_of_scope";
  text: string;
  source: { kind: "meeting" | "manual"; title: string; date: string } | null;
}

export interface Goal {
  id: string;
  version: number;
  title: string;
  measures: Measure[];
  status: "active" | "achieved" | "dropped";
  /** "team" goals are shown as team; servers before teams were renamed said "pod". */
  visibility: "private" | "team" | "workspace" | "pod";
  /** company or team (absent from older servers). */
  level?: "company" | "team";
  owner: { id: string; name: string };
  team?: { id: string; name: string } | null;
  anchors: { repos: string[]; branch_patterns: string[]; issues: string[] };
  bindable: boolean;
  /** Goals whose output this goal consumes (wire v2.2; absent from older servers). */
  depends_on?: string[];
  /** Goals this goal contributes to, and whether its owner reviewed it against their current versions. */
  contributes_to?: { id: string; title: string; version: number; reviewed_version: number | null; stale: boolean }[];
  /** Limits set in this version by the goal's approvers (absent from servers before PORT-002). */
  limits?: Limit[];
}

/** A goal related to the bound one that its agent should also know: a parent it contributes to, or a dependency. */
export interface ContextGoal {
  rel: "parent" | "depends";
  /** parent only: the bound goal was not reviewed against this parent version yet. */
  stale: boolean;
  goal: GoalSnapshot;
}

/** Only the ratified goal fields that may reach the model. */
export interface GoalSnapshot {
  id: string;
  version: number;
  title: string;
  measures: Measure[];
  status: Goal["status"];
  /** Present only when the version has limits, so limit-free snapshots are unchanged. */
  limits?: Limit[];
}

export type ShareState = "pending" | "shared" | "suspended" | "stopped";

export interface HotState {
  v: 1;
  local_id: string;
  harness: Harness;
  native_session_id: string;
  cwd: string | null;
  share: { workspace_id: string; workspace_name: string; session_key: string; state: ShareState } | null;
  goal: GoalSnapshot | null;
  binding: { epoch_id: string; goal_id: string | null } | null;
  /** Opened by the next UserPromptSubmit hook (a root-turn boundary). */
  pending_binding: {
    id: string;
    goal_id: string | null;
    goal: GoalSnapshot | null;
    cause: string;
    directive_id: string | null;
  } | null;
  /** Directive ids whose effect on model context has not been injected yet. */
  pending_directives: string[];
  /** User-only messages (systemMessage); never model context. */
  notices: { id: string; text: string }[];
  /** Parents and dependencies of the bound goal, from the cached feed. */
  context_goals?: ContextGoal[];
  updated_at: string;
}

export interface InjectedState {
  v: 1;
  goal_id: string | null;
  goal_version: number | null;
  goal_status: string | null;
  share_state: ShareState | null;
  context_epoch: number;
  consumed_binding: string | null;
  applied: string[];
  notices_shown: string[];
  /** Sibling session local id (or remote session key) -> newest activity of theirs already shown to this session. */
  siblings_seen?: Record<string, string>;
  /** When the last sibling card was injected (cards are rate-limited unless work overlaps). */
  card_at?: string;
  /** Related goal id -> version already in context. */
  context_seen?: Record<string, number>;
  /** Related goal id -> its measures (as compared) at that version, so a change note can say what changed. */
  context_measures?: Record<string, string[]>;
  /** The bound goal's limits (id and text) last put into context, so a version's delta can name a changed limit. */
  limits_seen?: { id: string; text: string }[];
  /** The accepted asks of the bound goal's team last put into context (D3); a change is told once as a delta. */
  asks_seen?: { team_id: string; ids: string[] };
  /** Limit ids a local drift notice was already shown for (D5): once per limit per session. */
  drift_shown?: string[];
  at: string;
}

export interface Latch {
  v: 1;
  stopped: true;
  directive_id: string;
  seq: number;
  at: string;
}

export interface FeedFile {
  workspace_id: string;
  workspace_name: string;
  version: string;
  etag: string | null;
  fetched_at: string;
  goals: Goal[];
}

/** An ask as `GET /api/v2/workspaces/:ws/asks` returns it (AskView, PORT-003), without the `can` flags. */
export interface Ask {
  id: string;
  state: "open" | "accepted" | "done" | "declined" | "withdrawn";
  team: { id: string; name: string };
  goal: { id: string; title: string } | null;
  text: string;
  from_label: string | null;
  requester: { id: string; name: string };
  source: { kind: "meeting" | "manual"; title: string | null; date: string };
  mentions: { n: number; date: string; text: string; source_title: string; added_by: { id: string; name: string } }[];
  decided_by: { id: string; name: string } | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  waiting_on_me: boolean;
}

/** feeds/asks-<ws>.json: the asks of this person's teams and the asks they recorded, revalidated with an ETag. */
export interface AsksFile {
  workspace_id: string;
  version: string;
  etag: string | null;
  fetched_at: string;
  asks: Ask[];
}

/** An accepted ask as it may reach model context (D3): cleaned, clipped, with who asked and who accepted it. */
export interface AcceptedAsk {
  id: string;
  text: string;
  asked_by: string;
  asked_on: string;
  accepted_by: string;
}

/** The accepted asks addressed to the bound goal's team, newest first, at most 5. */
export interface TeamAsks {
  team: { id: string; name: string };
  asks: AcceptedAsk[];
  /** Every accepted ask of the team (also those past the first 5), so a delta tells "closed" from "not shown". */
  accepted_ids?: string[];
}

/** drift/<lid>.json: limits the agent's last reply may conflict with, waiting to be shown to the user (D5). */
export interface DriftFile {
  v: 1;
  goal_id: string;
  goal_title: string;
  items: { limit_id: string; type: Limit["type"]; text: string }[];
  at: string;
}

export interface MeFile {
  user: { id: string; name: string; email: string };
  device: { id: string; name: string } | null;
  /** Each workspace's teams for this person (`teams`; servers before teams were renamed sent `pods`). */
  workspaces: { id: string; name: string; role: string; teams?: { id: string; name: string; role: string }[]; pods?: { id: string; name: string; role: string }[] }[];
  default_workspace?: string | null;
}

export type SpoolRecord =
  | {
      type: "session_start";
      harness: Harness;
      native_id: string;
      source: string;
      cwd: string | null;
      transcript_path: string | null;
      model: string | null;
      api_key_env: boolean;
      cloud_provider_env: boolean;
      ts: string;
    }
  | { type: "root_turn"; harness: Harness; native_id: string; root_turn: string; cwd: string | null; ts: string }
  | {
      type: "epoch_open";
      harness: Harness;
      native_id: string;
      local_id: string;
      epoch_id: string;
      goal_id: string | null;
      starts_at: string;
      root_turn: string | null;
      cause: string;
      pending_id: string;
      directive_id: string | null;
      ts: string;
    }
  | { type: "applied"; local_id: string; directive_ids: string[]; ts: string }
  | {
      type: "command";
      harness: Harness;
      native_id: string;
      cwd: string | null;
      command: "share" | "unshare" | "bind";
      arg: string | null;
      /** Set when a folder rule shares the session; otherwise the default workspace is used. */
      workspace?: string | null;
      rule_dir?: string | null;
      ts: string;
    };
