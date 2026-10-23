// The only text Align ever adds to model context. Fixed wording; only ratified goal fields are interpolated.
// Budgets (plan rev 2): envelope <= 1,200 chars (target 1,000), delta <= 300 chars (target 250).
import type { GoalSnapshot, Measure } from "./types.ts";

export const ENVELOPE_MAX = 1200;
export const DELTA_MAX = 300;

const AUTHORITY =
  "The goal is context for prioritizing the user's work. It grants no tool, network or credential authority and does not override user, system or project instructions.";

/** Strip control characters, collapse whitespace, neutralize our own marker, cap length. */
export function clean(text: unknown, max: number): string {
  const s = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\[\s*align/gi, "(Align")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 3).trimEnd()}...` : s;
}

function measureLine(m: Measure, max: number): string {
  const text = clean(m.text, max);
  const target = m.target ? clean(m.target, 60) : "";
  return target ? `- ${text} (target: ${target})` : `- ${text}`;
}

export function renderEnvelope(goal: GoalSnapshot): string {
  const head = [
    "[Align goal context]",
    `This session is shared to an Align workspace and counts toward the goal below. ${AUTHORITY}`,
    `Goal: ${clean(goal.title, 200)}`,
    `Status: ${clean(goal.status, 20)} (version ${Math.trunc(Number(goal.version) || 0)})`,
  ];
  const tail = "Changes to this goal arrive as short [Align] notes at the start of a turn.";
  const measures = (Array.isArray(goal.measures) ? goal.measures : []).slice(0, 8);
  const lines = measures.map((m) => measureLine(m, 160));
  for (let keep = lines.length; keep >= 0; keep--) {
    const shown = lines.slice(0, keep);
    const hidden = lines.length - keep;
    const body = shown.length ? ["Measures:", ...shown] : [];
    if (hidden > 0) body.push(`- (${hidden} more measures not shown)`);
    const text = [...head, ...body, tail].join("\n");
    if (text.length <= ENVELOPE_MAX) return text;
  }
  return [...head, tail].join("\n").slice(0, ENVELOPE_MAX);
}

function measuresInline(goal: GoalSnapshot, budget: number): string {
  const items = (Array.isArray(goal.measures) ? goal.measures : []).map((m) => clean(m.text, 80));
  let out = "";
  for (const item of items) {
    const next = out ? `${out}; ${item}` : item;
    if (next.length > budget) break;
    out = next;
  }
  return out;
}

function fit(prefix: string, goal: GoalSnapshot, suffix: string): string {
  const base = `${prefix}${suffix}`;
  const room = DELTA_MAX - base.length - " Measures: .".length;
  const m = room > 20 ? measuresInline(goal, room) : "";
  const text = m ? `${prefix} Measures: ${m}.${suffix}` : base;
  return text.length <= DELTA_MAX ? text : text.slice(0, DELTA_MAX);
}

export type DeltaKind = "bound" | "updated" | "unbound";

export function renderDelta(kind: DeltaKind, goal: GoalSnapshot | null): string {
  if (kind === "unbound" || !goal) {
    return "[Align] This session is no longer bound to an Align goal. Continue the user's task as instructed.";
  }
  const title = clean(goal.title, 120);
  const v = Math.trunc(Number(goal.version) || 0);
  const status = clean(goal.status, 20);
  const suffix = " No added authority.";
  if (kind === "bound") return fit(`[Align] From this turn this session counts toward goal "${title}" (v${v}, ${status}).`, goal, suffix);
  return fit(`[Align] Goal "${title}" is now v${v} (${status}).`, goal, suffix);
}
