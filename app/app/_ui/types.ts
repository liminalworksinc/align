// Response shapes the web app reads (see lib/v2/*). Kept here so client components import no server code.

export interface Goal {
  id: string;
  version: number;
  title: string;
  measures: { id: string; text: string; target: string | null }[];
  status: "active" | "achieved" | "dropped";
  visibility: "private" | "pod" | "workspace";
  owner: { id: string; name: string };
  pod: { id: string; name: string } | null;
  anchors: { repos: string[]; branch_patterns: string[]; issues: string[] };
  bindable: boolean;
  depends_on: string[];
  contributes_to: { id: string; title: string; version: number; reviewed_version: number | null; stale: boolean }[];
  /** Share of the workspace's agent time this goal should get (0 to 100), or null. */
  target_share: number | null;
  /** Trailing 7 days, whole percents (goals feed only). */
  allocation?: { target_share: number | null; share_7d: number; gap_7d: number | null } | null;
}

export interface WsDetail {
  workspace: { id: string; name: string; steering: "off" | "on" };
  role: "owner" | "member" | "viewer";
  me: string;
  members: { id: string; name: string; email: string; role: "owner" | "member" | "viewer" }[];
  pods: { id: string; name: string; my_role: "lead" | "member" | null; members: { id: string; name: string; role: "lead" | "member" }[] }[];
}

export interface GoalLabel {
  id: string | null;
  title: string | null;
  version?: number;
  private?: boolean;
}

export interface StopStatus {
  directive_id: string;
  kind: "stop" | "resume";
  created_at: string;
  receipts: { state: "received" | "applied" | "enforced"; at: string }[];
}

export interface MySession {
  session_key: string;
  harness: string;
  repo_alias: string | null;
  title: string | null;
  started_at: string;
  state: "shared" | "suspended" | "stopped";
  stopped_at: string | null;
  current_epoch: { epoch_id: string; goal_id: string | null; starts_at: string; goal: GoalLabel | null } | null;
  governing_goal: GoalLabel | null;
  agent_stopped: boolean;
  stop_status: StopStatus | null;
  conflicts: number;
  usage: { requests: number; input: number; output: number };
}

export interface AnySession {
  session_key: string;
  owner: { id: string; name: string };
  repo_alias: string | null;
  harness: string;
  state: string;
  agent_stopped: boolean;
  stop_status: StopStatus | null;
}

export interface Alignment {
  id: string;
  state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "revoked";
  revision: number;
  choice: "contribution" | "work_toward";
  requester: { id: string; name: string };
  target_goal: { id: string | null; title: string | null; visible: boolean } | null;
  source_goal: { id: string | null; title: string | null; visible: boolean } | null;
  sessions: { ref: number; session_key: string | null; owner: { id: string; name: string }; label: string; current_goal: { title: string | null; visible: boolean } | null }[];
  effects: { kind: string; text: string }[];
  approvers: { id: string; name: string; approved: boolean }[];
  note: string | null;
  history: { revision: number; choice: string; author: { id: string; name: string }; note: string | null; created_at: string }[];
  waiting_on_me: boolean;
  can: Record<"approve" | "counter" | "reject" | "accept_counter" | "withdraw" | "revoke", boolean>;
  created_at: string;
  updated_at: string;
}

export interface AllocationRow {
  kind: "goal" | "private" | "unallocated";
  goal: { id: string; title: string } | null;
  fresh_tokens: number;
  share: number;
  target_share: number | null;
  gap: number | null;
  est_list_usd_micros: number;
  unpriced_requests: number;
  sessions: number;
}

export interface AllocationResponse {
  window: { from: string | null; to: string | null; total_fresh_tokens: number; total_est_list_usd_micros: number; unpriced_requests: number; rows: AllocationRow[]; note: string };
  weekly: { week_start: string; total_fresh_tokens: number; rows: { kind: string; goal: { id: string; title: string } | null; share: number; target_share: number | null }[] }[];
  steering: { steering: "off" | "on"; total: number; days: { day: string; n: number }[] };
}

export interface Reallocation {
  id: string;
  state: "pending" | "countered" | "approved" | "rejected" | "withdrawn";
  revision: number;
  requester: { id: string; name: string };
  targets: { goal: { id: string; title: string } | null; from_share: number | null; current_share: number | null; target_share: number | null; owner: { id: string; name: string } | null }[];
  approvers: { id: string; name: string; approved: boolean }[];
  note: string | null;
  history: { revision: number; author: { id: string; name: string }; note: string | null; created_at: string }[];
  waiting_on_me: boolean;
  can: Record<"approve" | "counter" | "reject" | "accept_counter" | "withdraw", boolean>;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}
