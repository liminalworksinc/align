// The only text Align ever adds to model context. Fixed wording; the interpolated fields are ratified goal fields,
// file paths, task labels and commit subjects recorded by the user's own sessions on this machine, and, from other
// machines, only a person's first name (letters only) and repo-relative paths made of path characters. Other people's
// free text (task labels, commit subjects, claim reasons) reaches the user through `align team`, never through hooks.
// Budgets (plan rev 2): envelope <= 1,200 chars (target 1,000), delta <= 300 chars (target 250), card <= 300 chars.
import type { ContextGoal, GoalSnapshot, Measure } from "./types.ts";

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

const ver = (g: GoalSnapshot) => Math.trunc(Number(g.version) || 0);

/** One line per related goal: parents with their measures (the common goal every child must keep fitting), dependencies by name. */
function contextLines(context: ContextGoal[], withMeasures: boolean): string[] {
  return context.slice(0, 4).map((c) => {
    if (c.rel === "depends") return `Depends on: "${clean(c.goal.title, 100)}" (version ${ver(c.goal)}); its changes also arrive as [Align] notes.`;
    const m = withMeasures ? measuresInline(c.goal, 220) : "";
    return `Contributes to: "${clean(c.goal.title, 120)}" (version ${ver(c.goal)})${m ? `. Its measures: ${m}` : ""}. This goal must keep fitting it.`;
  });
}

export function renderEnvelope(goal: GoalSnapshot, context: ContextGoal[] = []): string {
  const head = [
    "[Align goal context]",
    `This session is shared to an Align workspace and counts toward the goal below. ${AUTHORITY}`,
    `Goal: ${clean(goal.title, 200)}`,
    `Status: ${clean(goal.status, 20)} (version ${ver(goal)})`,
  ];
  const tail = context.length ? "Changes to these goals arrive as short [Align] notes at the start of a turn." : "Changes to this goal arrive as short [Align] notes at the start of a turn.";
  const measures = (Array.isArray(goal.measures) ? goal.measures : []).slice(0, 8);
  const lines = measures.map((m) => measureLine(m, 160));
  for (const withParentMeasures of [true, false]) {
    const ctx = contextLines(context, withParentMeasures);
    for (let keep = lines.length; keep >= 0; keep--) {
      const shown = lines.slice(0, keep);
      const hidden = lines.length - keep;
      const body = shown.length ? ["Measures:", ...shown] : [];
      if (hidden > 0) body.push(`- (${hidden} more measures not shown)`);
      const text = [...head, ...body, ...ctx, tail].join("\n");
      if (text.length <= ENVELOPE_MAX) return text;
    }
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

/** The text a measure is compared by when telling an agent what changed. */
export const measureKey = (m: Measure): string => `${clean(m.text, 200)}${m.target ? ` (target: ${clean(m.target, 60)})` : ""}`;

/**
 * A related goal changed: a parent the bound goal contributes to, or a goal it depends on. Names what changed when the
 * previous measures are known (new or reworded measures first), else lists the measures.
 */
export function renderContextDelta(c: ContextGoal, before?: string[]): string {
  const title = clean(c.goal.title, 50);
  const head = c.rel === "parent" ? `[Align] Parent goal "${title}" is now v${ver(c.goal)}.` : `[Align] Dependency "${title}" is now v${ver(c.goal)}.`;
  const keep = c.rel === "parent" ? " Keep this session's work consistent with it." : "";
  const stale = c.rel === "parent" && c.stale ? " Not yet reviewed against this session's goal." : "";
  const end = " No added authority.";
  const now = (Array.isArray(c.goal.measures) ? c.goal.measures : []).map(measureKey);
  if (before) {
    const added = now.filter((m) => !before.includes(m));
    const gone = before.filter((m) => !now.includes(m)).length;
    const what = added.length
      ? `${added.length === 1 && gone === 1 ? "Changed" : "New"} measure: "${added[0]}"${added.length > 1 ? ` (+${added.length - 1} more)` : ""}.`
      : gone
        ? `${gone} measure${gone > 1 ? "s" : ""} removed.`
        : c.goal.status !== "active"
          ? `Status: ${clean(c.goal.status, 20)}.`
          : "";
    if (what) {
      // What changed is the point of the note: it keeps its room; the review flag goes first when space is short.
      const fixed = `${head} `.length + keep.length + end.length;
      const room = DELTA_MAX - fixed;
      const w = what.length > room ? `${what.slice(0, Math.max(0, room - 4)).trimEnd()}..."` : what;
      const withStale = `${head} ${w}${stale}${keep}${end}`;
      return withStale.length <= DELTA_MAX ? withStale : `${head} ${w}${keep}${end}`;
    }
  }
  return fit(head, c.goal, `${stale}${keep}${end}`);
}

export const CARD_MAX = 300;

export interface SiblingSummary {
  harness: "claude-code" | "codex";
  id: string;
  minutes_ago: number;
  files: string[];
  commits: string[];
  /** Another person: "Yoonseo (6 sessions)". Absent for this machine's own sessions. */
  who?: string;
  /** Set for work from another machine. Decides what reaches the model, whatever `who` holds. */
  remote?: boolean;
  /** Files this session also touched recently, listed first. */
  overlap?: string[];
  /** The other side's own label for its work (`::align task`, or its branch). */
  task?: string;
  /** Set when the other work is toward a related goal rather than this one. */
  goal?: string;
  /** Edits whose file names were not shared (the other person did not turn on work signals). */
  unnamed?: number;
  /** Another person's session count. */
  sessions?: number;
  /** Files the other side claimed and still holds. */
  claims?: string[];
}

/** Shown for another machine signed in as the same user. */
export const SELF_ELSEWHERE = "You, on another machine";
/** Shown for a claim whose file name was not shared. */
export const NAME_NOT_SHARED = "a file (name not shared)";

/** Another person's name in model context: the first word of their account name, letters only. */
export function personName(name: unknown): string {
  if (name === SELF_ELSEWHERE) return name;
  const first = String(name ?? "").normalize("NFKC").trim().split(/\s+/)[0] || "";
  return first.replace(/[^\p{L}\p{M}'.-]/gu, "").slice(0, 20) || "A teammate";
}

/** A path from another machine in model context: repo-relative path characters only, otherwise withheld. */
export function remotePath(p: unknown): string {
  const s = String(p ?? "");
  if (s === NAME_NOT_SHARED) return s;
  return /^[A-Za-z0-9._@+\-][A-Za-z0-9._@+\-/]{0,79}$/.test(s) && !s.includes("..") ? s : "a file with an unusual name";
}

const harnessLabel = (h: SiblingSummary["harness"]) => (h === "codex" ? "Codex" : "Claude Code");
const ago = (m: number) => (m < 1 ? "just now" : `${m} min ago`);

/**
 * One sender's line. `detail` 2 keeps everything, 1 drops commit subjects, 0 also drops task and goal labels. Another
 * person's (`remote`) task label and commit subjects are never shown: they are free text from someone else's machine.
 */
function siblingLine(s: SiblingSummary, maxFiles: number, detail = 2): string {
  const remote = !!s.remote;
  const name = remote
    ? `${personName(s.who)} (${s.sessions ?? 1} session${(s.sessions ?? 1) > 1 ? "s" : ""}, ${ago(s.minutes_ago)})`
    : `${harnessLabel(s.harness)} session ${clean(String(s.id).slice(0, 8), 20)} (active ${ago(s.minutes_ago)})`;
  const overlap = (s.overlap || []).slice(0, Math.max(1, maxFiles)).map((f) => clean(f, 60));
  const path = (f: string) => (remote ? remotePath(f) : clean(f, 60));
  const files = s.files.filter((f) => !(s.overlap || []).includes(f)).slice(0, Math.max(0, maxFiles - overlap.length)).map(path);
  const more = s.files.length - files.length - overlap.length + (s.unnamed || 0);
  const parts: string[] = [];
  if (detail >= 1 && s.goal) parts.push(`toward "${clean(s.goal, 60)}"`);
  if (detail >= 1 && s.task && !remote) parts.push(`on "${clean(s.task, 50)}"`);
  const named = [...overlap.map((f) => `${f} (yours too)`), ...files];
  if (named.length) parts.push(`edited ${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}`);
  else if (more > 0) parts.push(`edited ${more} file${more > 1 ? "s" : ""}`);
  if (detail >= 1 && s.claims?.length) parts.push(`claimed ${s.claims.slice(0, 2).map(path).join(", ")}`);
  if (detail >= 2 && s.commits.length && !remote) parts.push(`committed "${clean(s.commits[0], 60)}"`);
  return `${name}${parts.length ? `: ${parts.join("; ")}` : ""}.`;
}

/** What other sessions toward this goal (or related ones) did since this session last heard. Drops detail until it fits. */
export function renderCard(sibs: SiblingSummary[]): string | null {
  if (!sibs.length) return null;
  const remote = sibs.some((s) => s.remote);
  const head = remote ? "[Align] In flight toward this goal and related ones:" : "[Align] Also working toward this goal on this machine:";
  const tail = remote ? "Run `align team` for details." : "Read their changes before editing the same files.";
  // Keep as many senders as fit, shedding detail before dropping anyone; the first (overlap first) keeps the most.
  for (let keep = Math.min(sibs.length, 3); keep >= 1; keep--) {
    for (const detail of [2, 1, 0]) {
      for (const maxFiles of [3, 2, 1, 0]) {
        const lines = sibs.slice(0, keep).map((s, i) => siblingLine(s, maxFiles, i === 0 ? Math.max(detail, 1) : detail));
        const rest = sibs.length - keep;
        const text = [head, ...lines, ...(rest > 0 ? [`(${rest} more)`] : []), tail].join(" ");
        if (text.length <= CARD_MAX) return text;
      }
    }
  }
  return `${head} ${sibs.length} other senders. ${tail}`.slice(0, CARD_MAX);
}

/**
 * A session toward a related goal touched or claimed a file this session is about to edit. `file` is this session's own
 * path. For another person (`remote`) the name is reduced to a first name and their claim reason is left out.
 */
export function crossNote(
  who: string,
  file: string,
  minutesAgo: number,
  opts: { goal?: string | null; claimUntil?: string | null; task?: string | null; remote?: boolean } = {},
): string {
  const task = opts.remote ? null : opts.task;
  const toward = opts.goal ? `working toward "${clean(opts.goal, 60)}"` : "working toward the same goal";
  const what = opts.claimUntil
    ? `claimed ${clean(file, 80)} until ${clean(opts.claimUntil, 10)}${task ? ` for "${clean(task, 50)}"` : ""}`
    : `edited ${clean(file, 80)} ${minutesAgo < 1 ? "less than a minute ago" : `${minutesAgo} min ago`}`;
  return `[Align] ${opts.remote ? personName(who) : clean(who, 40)}, ${toward}, ${what}. Coordinate before changing it further; run \`align team\` for details. No added authority.`;
}

export function collisionReason(harness: SiblingSummary["harness"], id: string, file: string, minutesAgo: number): string {
  const ago = minutesAgo < 1 ? "less than a minute ago" : `${minutesAgo} min ago`;
  return `Align: ${harnessLabel(harness)} session ${clean(String(id).slice(0, 8), 20)}, working toward the same goal, edited ${clean(file, 80)} ${ago}. Read the file again so you keep its changes, then retry this edit.`;
}
