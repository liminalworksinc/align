import type { GitInfo } from "./anchors.ts";
import type { GoalSnapshot, Limit } from "./types.ts";
import type { EpochOrigin } from "./epoch-origin.ts";

/** Hook state for the turn that actually received the goal, including a binding that has yet to sync. */
export interface AnalysisTurn {
  root: string;
  at: string;
  transcript: string | null;
  endOffset?: number;
  cwd: string | null;
  git?: GitInfo | null;
  binding: {
    workspace: string;
    key: string;
    epoch: string;
    origin: EpochOrigin | null;
    goal: GoalSnapshot;
  } | null;
}

/** Declaration for a later worker. It must pass the same consent gate before it receives input. */
export interface AnalysisExtension {
  kind: "model_check" | "goal_suggestion";
  tier: 3;
  recipient: "session" | "provider";
}

export type Evidence = "wording" | "example" | "tool" | "file" | "git";
export const EVIDENCE_WORDS: Record<Evidence, string> = {
  wording: "The reply stated an action that may cross this limit.",
  example: "The reply matched the crossing example.",
  tool: "A tool confirmed a change to a path covered by this limit.",
  file: "A file change matched a path covered by this limit.",
  git: "A change seen in Git matched a path covered by this limit.",
};

export interface AnalysisNotice {
  id: string;
  root: string;
  version: number;
  title: string;
  limit: Pick<Limit, "id" | "text" | "type">;
  digest: string;
  evidence: Evidence;
}

export interface DriftFeedback {
  kind: "wrong" | "missed";
  root: string;
  version: number | null;
  finding: string | null;
  digest?: string;
  at: string;
}

export const RESULTS_PREVIEW = "Derived findings stay on this machine with hosted Align. A local Align server can receive them only if you turn sharing on. Run `align data-sharing` to review it.";

export function signalsPreview(enabled: boolean): string {
  return enabled
    ? "Work signals ON: repo-relative paths of edited files, commit subjects, task labels and the branch name, plus claim labels, go to Align and people who can read the goal if the workspace allows it. Run `align data-sharing signals <session> off` to turn it off for a session."
    : "Work signals OFF: only hashes of edited files are sent. Add --signals to share paths and labels with people who can read the goal.";
}
