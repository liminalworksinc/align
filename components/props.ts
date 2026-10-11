import type { StateView } from "@/lib/types";
import type { Me, Selection } from "./useAlign";

export type View = "today" | "goals" | "team" | "proposals" | "evidence";
export type Drawer = "brief" | "scenario" | null;

/** Props every view/panel component receives from app/page.tsx. */
export interface ViewProps {
  s: StateView;
  me: Me; // me.actor is "product" | "security" (views only render when signed in)
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
}
