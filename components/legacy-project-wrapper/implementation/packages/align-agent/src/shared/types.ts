// Types shared by the CLI, the sync job and the hooks. Wire shapes follow docs/v2/WIRE.md.
import type { ReleaseReaches, ShareFacts, ShareNow, ShareTold } from "./ended.ts";

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
  /** Share of the workspace's agent time this goal should get, 0 to 100, or null (versioned; absent from older servers). */
  target_share?: number | null;
  /** Trailing 7 days, whole percents (goals feed only; absent from older servers). */
  allocation?: { target_share: number | null; share_7d: number; gap_7d: number | null; held?: boolean } | null;
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
  /** `since`: the first epoch of this share, which a share made again after an earlier one ended changes (cycle 6).
   *  `ended`: why a stopped share ended (a sign-out or a lost workspace, which the server lets this person share again;
   *  else `sharing_ended`), cycle 7. */
  share: { workspace_id: string; workspace_name: string; session_key: string; state: ShareState; since?: string; ended?: EndedWhy } | null;
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
  /** User-only messages (systemMessage); never model context. A notice about the share's state carries what happened
   *  (`facts`) and is worded when it is shown, from `share_now` (`text` is its words as the event left the state). */
  notices: { id: string; text: string; facts?: ShareFacts }[];
  /** The share's state now, from the same values as its latch files: what its notices are worded from (cycle 11). */
  share_now?: ShareNow;
  /** Parents and dependencies of the bound goal, from the cached feed. */
  context_goals?: ContextGoal[];
  /** Requests sent to this session (REQ-002): pending ones, and recently answered or withdrawn ones the hooks still tell. */
  requests?: HotRequest[];
  /** This session's newest epochs as the sync recorded them, so a hook can tell whether the epoch it opened is in. */
  epochs_seen?: string[];
  /** Goal holds on this session that were released (the release directive, who released it, the goal's title). */
  released_holds?: { directive_id: string; goal_id?: string; goal_title: string; by: string }[];
  /** The resume directive that lifted this session's stop from the web, while it is the latest word on its latch. */
  resumed?: string | null;
  /** The release directives still in force on this session (none of them withdrawn by a later hold on its goal), so
   *  a release notice is told only while its release holds (E2E-AGENT cycle 14 C14-2). Absent from older agents. */
  releases_now?: string[];
  /** The build that wrote this file (its writer generation and build id): one an older build wrote is re-rendered by
   *  the newer one's next command or pass (E2E-AGENT cycle 14). Absent from agents before that. */
  by?: { gen: number; build: string };
  /** Set when the session was shared from this machine before (its history may be deleted since): a share counts from
   *  now. `stopped` when its person stopped that share or deleted its history: a folder rule never shares it again. */
  prior_share?: { stopped: boolean } | null;
  updated_at: string;
}

/** The request types someone with authority over a goal may send to its sessions (REQ-002). */
export type RequestType = "replan" | "checkpoint" | "switch_goal";

/** `request` of a `kind: "request"` directive, as the server sends it. */
export interface WireRequest {
  id: string;
  type: RequestType;
  cancelled: boolean;
  /** On a cancellation: `withdrawn` by its sender (or a workspace owner), or `goal_closed` when its goal (or a
   *  switch_goal's target goal) was achieved or dropped. Null otherwise; absent from older servers (read as withdrawn). */
  cancel_reason?: "withdrawn" | "goal_closed" | null;
  goal: { id: string; title: string; version: number };
  target_goal: { id: string; title: string; version: number } | null;
  /** How the sender could send it: `approver` (in the goal's approval set when sent) or `owner` (a workspace owner
   *  outside it). Anything else is read as approver. */
  sender: { id: string; name: string; role: "approver" | "owner" };
  note: string | null;
  created_at: string;
}

/** `hold` of a `kind: "hold"` or `kind: "release"` directive. */
export interface WireHold {
  goal: { id: string; title: string };
  held_by?: { id: string; name: string };
  released_by?: { id: string; name: string };
  reason?: string | null;
  at: string;
}

/**
 * A request's local state for one session: `pending` until answered; `accepted` or `declined` by the developer;
 * `auto_accepted` when a safe request (checkpoint, replan draft) reached the agent and the developer had not declined it
 * by the end of that turn (delivered, not declined; not a report that the agent did it); `withdrawn` by its sender;
 * `expired` when the session's share ended (a sign-out, a lost workspace) before an answer, as the server expires it
 * (E2E-AGENT cycle 12 C12-4).
 */
export type RequestState = "pending" | "accepted" | "auto_accepted" | "declined" | "withdrawn" | "expired";

export interface HotRequest extends Omit<WireRequest, "cancelled"> {
  state: RequestState;
  answered_at: string | null;
  /** The `request` directive that carried it: an accepted switch_goal's binding names it as its cause. */
  directive_id?: string;
}

/** latch/<lid>.hold.json: the goal holds on this session. Any hold, or a file that can't be read, blocks every tool. */
export interface HoldLatch {
  v: 1;
  /** As on the stop latch: the release can no longer reach this session. */
  ended?: EndedWhy;
  /** As on the stop latch: `::align share` can share it again now, after which a release reaches it. */
  reshare?: true;
  /** As on the stop latch. */
  unread?: true;
  /** As on the stop latch. */
  login?: true;
  /** As on the stop latch. */
  relogin?: true;
  /** With `ended`: the holds' release still reaches this session (its sharing was stopped while this device held it),
   *  and whether a stop blocks it too (C10-4). */
  release?: ReleaseReaches;
  holds: { goal_id: string; goal_title: string; by: string; reason: string | null; directive_id: string; seq: number; at: string }[];
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
  /** The notice about its share's state the session was last told, so it is told again when its advice changes. */
  share_told?: ShareTold;
  /** Notices about its share's state this agent's hook marked seen (told or not): one seen that is not among them was
   *  shown by an older hook, as its stored text (E2E-AGENT cycle 12 C12-1). */
  share_seen?: string[];
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
  asks_seen?: { team_id: string; team_name?: string; ids: string[]; member?: boolean };
  /** Before E2E acycle2: limit ids a drift notice was shown for (once per limit per session). No longer read. */
  drift_shown?: string[];
  /** Local drift notice (D5): `<limit id>:<digest>` of each crossing sentence already told, so one sentence is never
   *  told twice while a later, different one still is (E2E acycle2 A2-cross-1). Digests only, never reply text. */
  drift_seen?: string[];
  /** Local drift notice: how many notices named each limit in this session (at most `DRIFT_PER_LIMIT`). */
  drift_count?: Record<string, number>;
  /**
   * Requests (REQ-002) by id: `shown` once the user notice and model context went out, `told` the answer last put into
   * context, `answer` the developer's `::align accept|decline` before the sync has recorded it, `auto` once the Stop hook
   * auto-accepted a safe request.
   */
  requests_seen?: Record<string, { shown?: boolean; told?: string; answer?: "accepted" | "declined"; auto?: boolean }>;
  /** When this session was shown its one steering line, if ever. */
  steering_at?: string;
  /**
   * A binding the developer chose in the session (`::align bind`, or `::align accept` of a switch_goal) before the sync
   * has recorded it: the next prompt opens its epoch from here, so it never waits for a sync. The spooled command
   * carries the same id, so the sync records the same binding.
   */
  local_binding?: { id: string; goal_id: string | null; goal: GoalSnapshot | null; cause: string; directive_id: string | null };
  /** Pending bindings the developer replaced in the session before the sync caught up: never opened (N1). */
  superseded_bindings?: string[];
  /** The epoch this hook opened last, and its goal, until the sync has recorded it (hot `epochs_seen`): until then the
   *  hot file's goal is the one before it, which must not read as another switch (N1). */
  opened_epoch?: { epoch_id: string; goal: GoalSnapshot | null; at: string };
  /** The share a folder rule asked for at this session's start, until the sync has made it (hot `share`): `::align
   *  status` says it is on its way rather than "private" (cycle 10, section 5). */
  rule_share?: { workspace_id: string; workspace_name: string; goal_id: string | null; goal_title: string | null; at: string };
  /** Release directives already told to the model as a context line. */
  releases_told?: string[];
  /** Goals whose hold the model saw block a tool (a hold deny), so a release of it is told to the model (cycle 8). */
  holds_told?: string[];
  /** The goal title of each hold in `holds_told`, so a hold that is gone without a release directive (one seen only in
   *  the cached feed, say) is told to the model by name (cycle 9). */
  hold_titles?: Record<string, string>;
  /** The model saw the stop latch block a tool since the last resume it was told, so a resume is told to it. */
  stop_told?: boolean;
  /** The resume the model was last told about. */
  resume_told?: string;
  /** The share (its `since`, the share's first epoch) the model was last told it counts in, recorded whenever an envelope
   *  or a delta about the share's goal is delivered (for a folder rule's share at session start, the epoch the hook chose
   *  for it): a share made again later is told as `bound` even toward the goal already in context, since it stopped
   *  counting in between (cycles 6 and 7). */
  share_since?: string;
  at: string;
}

export interface Latch {
  v: 1;
  stopped: true;
  directive_id: string;
  seq: number;
  at: string;
  /** Set when the session's sharing ended (this machine signed out, or the server no longer has the share), so no
   *  resume can reach it: only `align stop-sharing <session>` lifts the latch. */
  ended?: EndedWhy;
  /** With `ended`: this machine can share the session there again now (signed in again, its workspace in reach again),
   *  so `::align share` shares it again, after which the web can resume it (C6-2). */
  reshare?: true;
  /** With `reshare`: this sign-in has not yet read which shares their person stopped on the web, so `align sync` comes
   *  before `::align share` (E2E-AGENT cycle 12, section 6). */
  unread?: true;
  /** With `ended`: signed out, and a new `align login` would let `::align share` share it again, besides
   *  `align stop-sharing` (cycle 12, section 6). */
  login?: true;
  /** With `ended` (`device_signed_out`), signed in: a new `align login` that replaced this machine's pairing ended its
   *  share, so the deny never says this machine signed out (E2E-AGENT cycle 13, section 5). */
  relogin?: true;
  /** With `ended`: the session is held too, and the hold's release still reaches it, lifting only the hold (C10-4). */
  release?: ReleaseReaches;
}

/** Why a share ended so that nothing from the web can lift its latches any more. */
export type EndedWhy = "device_signed_out" | "access_lost" | "sharing_ended";

export interface FeedFile {
  workspace_id: string;
  workspace_name: string;
  version: string;
  etag: string | null;
  fetched_at: string;
  goals: Goal[];
  /** The workspace's steering switch (absent from older servers, which means off). */
  steering?: "off" | "on";
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
  /** Device feed only: an accepted ask read only because a session of this device follows `goal_id`, the asked team's
   *  goal, through an approved "work toward" alignment (server A1-cross-2). */
  via_alignment?: { goal_id: string } | null;
}

/** feeds/asks-<ws>.json: the asks of this person's teams and the asks they recorded, revalidated with an ETag. */
export interface AsksFile {
  workspace_id: string;
  version: string;
  etag: string | null;
  fetched_at: string;
  asks: Ask[];
  /** Teams whose accepted asks were kept because this machine's sessions count toward one of their goals. */
  followed?: string[];
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
  /** Whether this person is in the team (`me.json`); false for a team whose goal a session follows through an approved
   *  alignment, so the agent is told "this session follows a goal of that team", never "you are in this team". */
  member?: boolean;
}

/** drift/<lid>.json: limits the agent's last reply may conflict with, waiting to be shown to the user (D5). */
export interface DriftFile {
  v: 1;
  goal_id: string;
  goal_title: string;
  /** One per limit; `digests` are the crossing sentences' digests (`crossingDigest`), never their text. */
  items: { limit_id: string; type: Limit["type"]; text: string; digests?: string[] }[];
  at: string;
}

export interface MeFile {
  user: { id: string; name: string; email: string };
  device: { id: string; name: string } | null;
  /** Each workspace's teams for this person (`teams`; servers before teams were renamed sent `pods`). */
  workspaces: { id: string; name: string; role: string; teams?: { id: string; name: string; role: string }[]; pods?: { id: string; name: string; role: string }[] }[];
  default_workspace?: string | null;
  /** The person's workspaces this device was not given (servers from cycle 6 on): named so `--workspace` can point to
   *  the Devices page grant instead of saying "unknown workspace". */
  other_workspaces?: { id: string; name: string }[];
  /** Set when this machine signed out (logout, or the server revoked the device), so hooks refuse to share. */
  signed_out?: boolean;
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
      /** The developer's `::align accept|decline`, or the Stop hook auto-accepting a safe request (`auto`). */
      type: "request_answer";
      local_id: string;
      request_id: string;
      answer: "accepted" | "declined";
      auto: boolean;
      /** An accepted switch_goal: the id of the binding the hook already applies at the next prompt. */
      pending_id?: string;
      ts: string;
    }
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
      /** `bind`: the id of the binding the hook already applies at the next prompt (InjectedState.local_binding). */
      pending_id?: string;
      /** `share` from a folder rule at session start: the share's first epoch, chosen by the hook that gave the model the
       *  goal's envelope, so the share the model was told about is known by its id (cycle 7). */
      epoch_id?: string;
      ts: string;
    };
