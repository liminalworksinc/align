// Types shared by the CLI, the sync job and the hooks. Wire shapes follow docs/v2/WIRE.md.

export type Harness = "claude-code" | "codex";

export interface Measure {
  id: string;
  text: string;
  target: string | null;
}

export interface Goal {
  id: string;
  version: number;
  title: string;
  measures: Measure[];
  status: "active" | "achieved" | "dropped";
  visibility: "private" | "pod" | "workspace";
  owner: { id: string; name: string };
  pod: { id: string; name: string } | null;
  anchors: { repos: string[]; branch_patterns: string[]; issues: string[] };
  bindable: boolean;
}

/** Only the ratified goal fields that may reach the model. */
export interface GoalSnapshot {
  id: string;
  version: number;
  title: string;
  measures: Measure[];
  status: Goal["status"];
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

export interface MeFile {
  user: { id: string; name: string; email: string };
  device: { id: string; name: string } | null;
  workspaces: { id: string; name: string; role: string; pods: { id: string; name: string; role: string }[] }[];
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
