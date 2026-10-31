import { listGrants } from "../oauth/grants";
import { config } from "../config";
import { listAlignments } from "./alignments";
import { listAsks } from "./asks";
import { changeRequestGroups } from "./changes";
import { all } from "./db";
import { visibleGoals } from "./goals";
import { alignmentWaits, appEvidence, changeWaits, launchWaits, type EvidenceClass, type HomeNext, type HomePerson } from "./home-core.mts";
import type { PolicyPrincipal } from "./policy";
import { memberName } from "./workspaces";

// The workspace Home (PORT2-001, from v1's "Know what needs you", main #41/#42): one read of what needs this person
// and what waits on others, the active goals, and the connected AI apps with when each last read the goals. Built
// only from what the server already holds; it records nothing. The rules that need no database (evidence classes,
// what an open item waits on, whether an approved change waits on a launch) are in lib/v2/home-core.mts.
// Each section is read on its own: a section whose read fails is null, which the page shows as "unknown", never as
// zero. Change requests and alignments "waiting on others" are the open ones that involve the reader: they asked, or
// the goal is theirs, their team's, or (for a workspace owner) a company goal, or they are in its approval set.

export interface HomeChange {
  id: string;
  goal: { id: string; title: string; version: number };
  state: string;
  requester: HomePerson;
  reason: string;
  next: HomeNext;
  /** Who it waits on; empty when nobody can approve it yet. */
  waiting_on: HomePerson[];
  updated_at: string;
}

export interface HomeAsk {
  id: string;
  state: string;
  team: { id: string; name: string };
  goal: { id: string; title: string } | null;
  text: string;
  from_label: string | null;
  requester: HomePerson;
  next: HomeNext;
}

export interface HomeAlignment {
  id: string;
  state: string;
  requester: HomePerson;
  target_goal: { id: string | null; title: string | null; visible: boolean } | null;
  next: HomeNext;
  waiting_on: HomePerson[];
  updated_at: string;
}

export interface HomeGoal {
  id: string;
  title: string;
  version: number;
  level: "company" | "team";
  team: { id: string; name: string } | null;
  owner: HomePerson;
  /** The reader owns it, it is their team's, or it is a company goal and they are a workspace owner. */
  mine: boolean;
}

export interface HomeApp {
  id: string;
  name: string;
  connected_by: HomePerson;
  approved_at: string;
  /** The last MCP request whose token verified: the app connected. Never a read on its own. */
  last_used_at: string | null;
  /** The last tool call that returned goal content (lib/mcp/register.ts): the only read Align observes. */
  last_read_at: string | null;
  evidence_class: EvidenceClass;
}

/** One section, or null when reading it failed (logged like a route's server error). */
function section<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (e) {
    if (config().hosted) console.error("Home section error:", (e as Error)?.name ?? "unknown");
    else console.error(e);
    return null;
  }
}

const byName = (list: HomePerson[]) => [...new Map(list.map((p) => [p.id, p])).values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

export function workspaceHome(pp: PolicyPrincipal) {
  const me = pp.userId;
  const goals = section(() => visibleGoals(pp));
  const goalById = new Map((goals ?? []).map((g) => [g.id, g]));
  const ours = (goalId: string | null | undefined) => {
    const g = goalId ? goalById.get(goalId) : undefined;
    return !!g && (g.owner_id === me || (!!g.pod_id && pp.pods.has(g.pod_id)) || (pp.wsRole === "owner" && g.level === "company"));
  };
  const teamName = (podId: string | null) => (podId ? (all<{ name: string }>("SELECT name FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, podId)[0]?.name ?? "") : "");

  const change_requests = section(() => {
    const g = changeRequestGroups(pp);
    const views = [...g.waiting_on_me, ...g.mine, ...g.others];
    const onMe: HomeChange[] = [];
    const onOthers: HomeChange[] = [];
    for (const v of views) {
      const item = (next: HomeNext, waiting_on: HomePerson[]): HomeChange => ({
        id: v.id,
        goal: v.goal,
        state: v.state,
        requester: v.requester,
        reason: v.reason,
        next,
        waiting_on,
        updated_at: v.updated_at,
      });
      const launch = launchWaits(v);
      if (launch) {
        // LAUNCH-001: an approved change agents don't have yet (see lib/v2/home-core.mts).
        if (launch.can_launch) onMe.push(item("launch", [{ id: me, name: memberName(me) }]));
        else if (v.requester.id === me || ours(v.goal.id)) onOthers.push(item("launch", byName(launch.launchers)));
        continue;
      }
      const w = changeWaits(v);
      if (!w) continue;
      const mineToAct = v.waiting_on_me || (w.next === "rebase" && v.can.rebase);
      if (mineToAct) onMe.push(item(w.next, w.waiting_on));
      else if (v.requester.id === me || ours(v.goal.id) || v.approvers.some((a) => a.id === me)) onOthers.push(item(w.next, w.waiting_on));
    }
    return { waiting_on_me: onMe, waiting_on_others: onOthers };
  });

  const asks = section(() => ({
    waiting_on_me: listAsks(pp, { states: ["open", "accepted"] })
      .filter((a) => a.waiting_on_me)
      .map(
        (a): HomeAsk => ({ id: a.id, state: a.state, team: a.team, goal: a.goal, text: a.text, from_label: a.from_label, requester: a.requester, next: a.state === "open" ? "accept" : "done" }),
      ),
  }));

  const alignments = section(() => {
    const l = listAlignments(pp);
    const onMe: HomeAlignment[] = [];
    const onOthers: HomeAlignment[] = [];
    for (const a of [...l.waiting_on_me, ...l.mine, ...l.others]) {
      const w = alignmentWaits(a);
      if (!w) continue;
      const item: HomeAlignment = { id: a.id, state: a.state, requester: a.requester, target_goal: a.target_goal, next: w.next, waiting_on: w.waiting_on, updated_at: a.updated_at };
      (a.waiting_on_me ? onMe : onOthers).push(item);
    }
    return { waiting_on_me: onMe, waiting_on_others: onOthers };
  });

  const active_goals =
    goals &&
    section(() =>
      goals
        .filter((g) => g.status === "active")
        .map(
          (g): HomeGoal => ({
            id: g.id,
            title: g.title,
            version: g.version,
            level: g.level === "company" ? "company" : "team",
            team: g.pod_id ? { id: g.pod_id, name: teamName(g.pod_id) } : null,
            owner: { id: g.owner_id, name: memberName(g.owner_id) },
            mine: ours(g.id),
          }),
        )
        .sort((a, b) => Number(b.mine) - Number(a.mine)),
    );

  const apps = section(() => ({
    /** A workspace owner sees every connected app; anyone else, their own (as on the Apps tab). */
    everyone: pp.wsRole === "owner",
    items: listGrants(pp).map(
      (g): HomeApp => ({
        id: g.id,
        name: g.name,
        connected_by: g.user,
        approved_at: g.approved_at,
        last_used_at: g.last_used_at,
        last_read_at: g.last_read_at,
        evidence_class: appEvidence(g.last_read_at),
      }),
    ),
  }));

  return { me, change_requests, asks, alignments, goals: active_goals, apps };
}

export type WorkspaceHome = ReturnType<typeof workspaceHome>;
