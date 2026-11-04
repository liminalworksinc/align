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
  /** Share of the workspace's agent time this goal should get (0 to 100), or null. */
  target_share: number | null;
  /** Trailing 7 days, whole percents (goals feed only; null for a goal that is not active). */
  allocation?: { target_share: number | null; share_7d: number; gap_7d: number | null; held: boolean } | null;
}

export interface WsDetail {
  workspace: { id: string; name: string; steering: "off" | "on" };
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
  /** Why sharing ended when its person did not stop it, so no stop or resume reaches it: "device_signed_out" (the
   *  machine that shared it signed out) or "member_removed" (its person left or was removed from the workspace). */
  ended_reason: "device_signed_out" | "member_removed" | null;
  /** The machine that shared it: its name, whether it signed out of Align, and whether it has this workspace now (W7). */
  device: { id: string; name: string; signed_out: boolean; has_workspace: boolean } | null;
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
  started_at: string;
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
  /** started_at and key_end (the key's last 6 characters) tell two sessions of one person in one repository apart. */
  sessions: { ref: number; session_key: string | null; owner: { id: string; name: string }; label: string; started_at: string | null; key_end: string; current_goal: { id: string | null; title: string | null; visible: boolean } | null }[];
  effects: { kind: string; text: string }[];
  requirements: { for: string | null; approvers: { id: string; name: string }[]; approved_by: { id: string; name: string } | null }[];
  approvers: { id: string; name: string; approved: boolean }[];
  note: string | null;
  history: { revision: number; choice: string; author: { id: string; name: string }; note: string | null; created_at: string }[];
  waiting_on_me: boolean;
  can: Record<"approve" | "counter" | "reject" | "accept_counter" | "withdraw" | "revoke", boolean>;
  /** Who declined, withdrew or revoked it, and when (null while open or approved). */
  closed_by: { id: string; name: string } | null;
  closed_at: string | null;
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
  /** depends_on lists only goals the reader can read; hidden_depends_on counts the others on each side (null when
   *  depends_on doesn't change). */
  diff: { before: ChangeFields; after: ChangeFields; hidden_depends_on?: { before: number; after: number } | null };
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
  /** Why the reader, who decides on it, may not approve (pending) or launch (approved) it: it adds a dependency on a
   *  goal they can't see. The server's refusal, naming no goal; null otherwise (C4-1). */
  dependency_not_visible?: string | null;
  /** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop.
   *  The server's refusal, naming no goal, the same for every reader; null otherwise (C5-1). */
  dependency_loop?: string | null;
  /** What happened to it, in the words the server's wrong_state refusal gives ("This request was declined by <name>, so
   *  nothing changes."), for a card that finds it changed before sending (W2). */
  state_note: string;
  waiting_on_me: boolean;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

/** One row of GET …/allocation (lib/v2/allocation.ts). */
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
  weekly: { week_start: string; total_fresh_tokens: number; rows: { kind: AllocationRow["kind"]; goal: { id: string; title: string } | null; share: number; target_share: number | null }[] }[];
  steering: { steering: "off" | "on"; total: number; days: { day: string; n: number }[] };
}

/** A proposal to change the target shares of one or more goals (lib/v2/reallocations.ts). */
export interface Reallocation {
  id: string;
  state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded";
  revision: number;
  requester: { id: string; name: string };
  targets: {
    goal: { id: string; title: string } | null;
    from_share: number | null;
    current_share: number | null;
    target_share: number | null;
    base_version: number | null;
    approvers: { id: string; name: string }[];
    approved_by: { id: string; name: string } | null;
    approved: boolean;
  }[];
  note: string | null;
  history: { revision: number; author: { id: string; name: string }; note: string | null; created_at: string }[];
  launch: "pending" | "not_yet" | "launched" | "superseded" | null;
  launch_decided_by: { id: string; name: string } | null;
  launch_decided_at: string | null;
  rejected_by: { id: string; name: string } | null;
  rejection_reason: string | null;
  waiting_on_me: boolean;
  can: Record<"approve" | "approve_and_launch" | "launch" | "not_yet" | "counter" | "accept_counter" | "reject" | "withdraw", boolean>;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}
