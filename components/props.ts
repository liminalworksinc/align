import type { Actor, StateView } from "@/lib/types";
import type { Me, Selection } from "./useAlign";

// v6 nav ids: "turn" (Your turn), "studio" (Scenario Studio), "decisions" (the decisions list). "decision" is the record.
export type View = "turn" | "studio" | "decisions" | "decision" | "today" | "company" | "goals" | "team" | "work" | "proposals" | "evidence";
export type Drawer = "brief" | "scenario" | null;

/** Props every view/panel component receives from app/page.tsx. */
export interface ViewProps {
  s: StateView;
  me: Me; // me.actor is "product" | "security" (views only render when signed in)
  /** The workspace this page shows: the /w/<id> slug, or "northstar". Sent with writes, as act() does. */
  workspace: string;
  selection: Selection | null;
  select: (sel: Selection) => void;
  go: (view: View) => void;
  openDrawer: (d: Drawer) => void;
  /** POST to an API path; returns parsed JSON or null on error (error is shown globally). */
  act: <T>(path: string, body?: unknown) => Promise<T | null>;
  /** Record a timer touchpoint: "ceo_change_viewed" | "brief_reviewed" | "scenario_reviewed" | "evidence_opened" | "saw_accepted_version". */
  mark: (action: string) => void;
  /** Scenario → Proposal hand-off: plan + simulation refs chosen in Scenario Studio. */
  attached: { plan_id: string; plan_version: number; simulation_refs: string[] } | null;
  setAttached: (a: { plan_id: string; plan_version: number; simulation_refs: string[] } | null) => void;
  /** One-shot request to open the proposal composer on the next Proposals visit (+ New conflict, Propose a change). */
  compose?: boolean;
  setCompose?: (on: boolean) => void;
  /** Custom only: the header's Switch team, so a hand-off can offer "Act as <team> →" in place (still needs that passcode). */
  switchTeam?: (role: Actor) => void;
  /** Custom workspaces: the decision value card's checked next-step links (lib/config.ts nextStepLinks); null hides one. */
  nextStep?: { waitlist: string | null; loi: string | null };
}
