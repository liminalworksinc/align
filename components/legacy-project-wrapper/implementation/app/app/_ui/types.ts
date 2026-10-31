// Response shapes the web app reads (see lib/v2/*). Kept here so client components import no server code.

/** One limit of a goal version (lib/v2/goal-limits.ts). */
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
  measures: { id: string; text: string; target: string | null }[];
  status: "active" | "achieved" | "dropped";
  level: "company" | "team";
  visibility: "private" | "team" | "workspace";
  owner: { id: string; name: string };
  team: { id: string; name: string } | null;
  anchors: { repos: string[]; branch_patterns: string[]; issues: string[] };
  bindable: boolean;
  depends_on: string[];
  limits: Limit[];
  contributes_to: { id: string; title: string; version: number; reviewed_version: number | null; stale: boolean }[];
}

export interface WsDetail {
  workspace: { id: string; name: string };
  role: "owner" | "member" | "viewer";
  me: string;
  members: { id: string; name: string; email: string; role: "owner" | "member" | "viewer" }[];
  teams: { id: string; name: string; my_role: "lead" | "member" | null; members: { id: string; name: string; role: "lead" | "member" }[] }[];
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
  sessions: { ref: number; session_key: string | null; owner: { id: string; name: string }; label: string; current_goal: { id: string | null; title: string | null; visible: boolean } | null }[];
  effects: { kind: string; text: string }[];
  requirements: { for: string | null; approvers: { id: string; name: string }[]; approved_by: { id: string; name: string } | null }[];
  approvers: { id: string; name: string; approved: boolean }[];
  note: string | null;
  history: { revision: number; choice: string; author: { id: string; name: string }; note: string | null; created_at: string }[];
  waiting_on_me: boolean;
  can: Record<"approve" | "counter" | "reject" | "accept_counter" | "withdraw" | "revoke", boolean>;
  created_at: string;
  updated_at: string;
}

export type ChangeFields = Partial<{ title: string; measures: Goal["measures"]; depends_on: string[]; status: Goal["status"]; limits: Limit[] }>;

export type EvidenceKind = "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other";

/** An evidence link on one change-request revision. Never verified: a person or an agent says what it shows. */
export interface Evidence {
  id: string;
  revision: number;
  kind: EvidenceKind;
  url: string;
  label: string;
  source: "person" | "agent";
  reported_as: "self-reported" | "agent-reported";
  added_by: { id: string; name: string };
  added_at: string;
  can_remove: boolean;
}

type SpendNums = { requests: number; est_list_usd_micros: number; unpriced_requests: number };

/** What Align recorded about the goal when a revision was written. */
export interface AlignSnapshot {
  revision: number;
  recorded_by: "align";
  recorded_at: string;
  window: { from: string; to: string; days: number };
  spend: { total: SpendNums; by_model: (SpendNums & { model: string })[] } | null;
  spend_hidden: boolean;
  bound_sessions: number;
  last_activity_at: string | null;
}

export interface ChangeRequest {
  id: string;
  goal: { id: string; title: string; version: number };
  state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded";
  revision: number;
  base_version: number;
  behind: boolean;
  requester: { id: string; name: string };
  changes: ChangeFields;
  reason: string;
  revisions: {
    revision: number;
    base_version: number;
    changes: ChangeFields;
    note: string | null;
    condition: string | null;
    acknowledged_by: { id: string; name: string } | null;
    acknowledged_at: string | null;
    author: { id: string; name: string };
    created_at: string;
    evidence: Evidence[];
    snapshot: AlignSnapshot | null;
  }[];
  diff: { before: ChangeFields; after: ChangeFields };
  approvers: { id: string; name: string }[];
  launchers: { id: string; name: string }[];
  approved_by: { id: string; name: string } | null;
  rejected_by: { id: string; name: string } | null;
  decision_note: string | null;
  note: string | null;
  rejection_reason: string | null;
  version: number | null;
  launch: "pending" | "not_yet" | "launched" | "superseded" | null;
  launch_decided_by: { id: string; name: string } | null;
  launch_decided_at: string | null;
  condition: { revision: number; text: string; acknowledged_by: { id: string; name: string } | null; acknowledged_at: string | null } | null;
  evidence_count: number;
  approved_without_evidence: boolean | null;
  can: Record<"approve" | "approve_and_launch" | "reject" | "counter" | "accept_counter" | "acknowledge" | "withdraw" | "rebase" | "add_evidence" | "launch" | "not_yet", boolean>;
  waiting_on_me: boolean;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}
