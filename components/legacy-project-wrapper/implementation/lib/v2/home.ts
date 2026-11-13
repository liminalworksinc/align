// Caller-owned Home types and explicit resource bindings.
import { listGrants } from "../oauth/grants";
import { config } from "../config";
import { listAlignments } from "./alignments";
import { listAsks } from "./asks";
import { changeRequestGroups } from "./changes";
import { all } from "./db";
import { goalRow, visibleGoals } from "./goals";
import { alignmentWaits, appEvidence, changeWaits, launchWaits, type EvidenceClass, type HomeNext, type HomePerson } from "./home-core.mts";
import type { PolicyPrincipal } from "./policy";
import { memberName } from "./workspaces";
import { create_home } from "../native/.bindings/server_home.js";

// The workspace Home (PORT2-001, from v1's "Know what needs you", main #41/#42): one read of what needs this person
// and what waits on others, the active goals, and the connected AI apps with when each last read the goals. Built
// only from what the server already holds; it records nothing. The rules that need no database (evidence classes,
// what an open item waits on, whether an approved change waits on a launch) are in lib/v2/home-core.mts.
// Each section is read on its own: a section whose read fails is null, which the page shows as "unknown", never as
// zero. Change requests and alignments "waiting on others" are the open ones that involve the reader: they asked, or
// the goal is theirs, their team's, or (for a workspace owner) a company goal, or they are in its approval set.
// "Declined" (main #53, M2): the reader's own latest request on an active goal, when an approver declined it, so the
// requester sees the decision and its reason ("<requester> sees your reason", the decide card) without opening the goal;
// it stays until they send a newer request on that goal or the goal closes. It waits on nobody and is never counted.
export interface HomeChange {
    id: string;
    goal: {
        id: string;
        title: string;
        version: number;
    };
    state: string;
    requester: HomePerson;
    reason: string;
    next: HomeNext;
    /** Who it waits on; empty when nobody can approve it yet. */
    waiting_on: HomePerson[];
    updated_at: string;
}

/** The reader's latest request on an active goal, declined (main #53): who declined it, why and when. */
export interface HomeDeclined {
    id: string;
    goal: {
        id: string;
        title: string;
        version: number;
    };
    reason: string;
    rejected_by: HomePerson | null;
    rejection_reason: string | null;
    decided_at: string | null;
}

export interface HomeAsk {
    id: string;
    state: string;
    team: {
        id: string;
        name: string;
    };
    goal: {
        id: string;
        title: string;
    } | null;
    text: string;
    from_label: string | null;
    requester: HomePerson;
    next: HomeNext;
}

export interface HomeAlignment {
    id: string;
    state: string;
    requester: HomePerson;
    target_goal: {
        id: string | null;
        title: string | null;
        visible: boolean;
    } | null;
    /** What it asks for and from what, so two requests of one person on one goal differ on the Home (A1-cross-9): the
     *  choice, the requester's goal that contributes (if any) and its sessions as the Alignments tab names them. */
    choice: "contribution" | "work_toward";
    source_goal: {
        id: string | null;
        title: string | null;
        visible: boolean;
    } | null;
    sessions: {
        label: string;
        started_at: string | null;
        key_end: string;
    }[];
    next: HomeNext;
    waiting_on: HomePerson[];
    updated_at: string;
}

export interface HomeGoal {
    id: string;
    title: string;
    version: number;
    level: "company" | "team";
    team: {
        id: string;
        name: string;
    } | null;
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

export type WorkspaceHome = ReturnType<typeof workspaceHome>;

interface HomeRuntime {
  workspaceHome: (pp: PolicyPrincipal) => { me: string; change_requests: { waiting_on_me: HomeChange[]; waiting_on_others: HomeChange[]; declined: HomeDeclined[]; } | null; asks: { waiting_on_me: HomeAsk[]; } | null; alignments: { waiting_on_me: HomeAlignment[]; waiting_on_others: HomeAlignment[]; } | null; goals: HomeGoal[] | null; apps: { everyone: boolean; items: HomeApp[]; } | null; };
}
const homeService = create_home({
  listGrants: (...args: Parameters<typeof listGrants>) => listGrants(...args),
  config: (...args: Parameters<typeof config>) => config(...args),
  listAlignments: (...args: Parameters<typeof listAlignments>) => listAlignments(...args),
  listAsks: (...args: Parameters<typeof listAsks>) => listAsks(...args),
  changeRequestGroups: (...args: Parameters<typeof changeRequestGroups>) => changeRequestGroups(...args),
  all: (...args: Parameters<typeof all>) => all(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  visibleGoals: (...args: Parameters<typeof visibleGoals>) => visibleGoals(...args),
  alignmentWaits: (...args: Parameters<typeof alignmentWaits>) => alignmentWaits(...args),
  appEvidence: (...args: Parameters<typeof appEvidence>) => appEvidence(...args),
  changeWaits: (...args: Parameters<typeof changeWaits>) => changeWaits(...args),
  launchWaits: (...args: Parameters<typeof launchWaits>) => launchWaits(...args),
  memberName: (...args: Parameters<typeof memberName>) => memberName(...args),
  readConsole: () => console,
}) as unknown as HomeRuntime;

export function workspaceHome(pp: PolicyPrincipal): { me: string; change_requests: { waiting_on_me: HomeChange[]; waiting_on_others: HomeChange[]; declined: HomeDeclined[]; } | null; asks: { waiting_on_me: HomeAsk[]; } | null; alignments: { waiting_on_me: HomeAlignment[]; waiting_on_others: HomeAlignment[]; } | null; goals: HomeGoal[] | null; apps: {
/** A workspace owner sees every connected app; anyone else, their own (as on the Apps tab). */
everyone: boolean; items: HomeApp[]; } | null; } {
    return (0, homeService.workspaceHome)(pp);
}
