import { allocation } from "./allocation";
import { changeRequestDecision, type ChangeRequestAction } from "./changes";
import { previewTx, type RowChange } from "./db";
import { goalObj, goalRow, goalsDependingOn, type GoalRow } from "./goals";
import { usd } from "./money.mts";
import { count } from "./plural.mts";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import type { Body } from "./validate";

// Approve with foresight (Lane B): what a decision on a change request would do, before anyone makes it.
// POST …/change-requests/<id>/preview { action, revision, … } runs the decision's own body (changeRequestDecision in
// lib/v2/changes.ts, the one tx() runs) inside previewTx (lib/v2/db.ts): every row it would write is recorded, then
// rolled back, and nothing it would send (product events, mail) leaves. The same checks apply as for the decision
// itself, in the same order: 404 for a request the caller can't read (an outsider), 403 for a viewer or someone who
// can't make this decision, and any refusal (409 stale_revision, cycle, …) is the one the decision would get.
// The answer is in the reader's terms: a goal they can't read is never named (counted, "a goal you can't see"), and
// sessions are counted, never named or keyed. `tables` counts rows per table and operation, so a check can hold the
// preview against what the decision then does, row for row.

type GoalFields = { title: string; measures: unknown[]; limits: unknown[]; status: string; depends_on: string[] };

export interface ForesightLine {
  kind: "agents" | "pause" | "goal" | "dependents" | "spend" | "requests" | "record";
  text: string;
  /** Before and after, for the reader to expand (compare.tsx). */
  compare?: { before: Partial<GoalFields>; after: Partial<GoalFields>; before_label: string; after_label: string; hidden: { before: number; after: number } };
  /** More lines when expanded. */
  detail?: string[];
}

export interface Foresight {
  action: ChangeRequestAction;
  /** Nothing reaches an agent and no spend target moves. */
  quiet: boolean;
  lines: ForesightLine[];
  /** Names of the goals the lines and compares mention by id, readable by the reader only. */
  titles: Record<string, string>;
  /** What the decision would send, captured and not sent. */
  held_back: { events: number; mail: number };
  tables: Record<string, { insert: number; update: number; delete: number }>;
}

const fieldsOf = (r: Record<string, unknown>): GoalFields => ({
  title: String(r.title),
  measures: JSON.parse(String(r.measures_json ?? "[]")),
  limits: JSON.parse(String(r.limits_json ?? "[]")),
  status: String(r.status),
  depends_on: JSON.parse(String(r.depends_on_json ?? "[]")),
});

const pct = (n: unknown) => (n === null || n === undefined ? "no target" : `${n}%`);

/** The lines a set of row changes amounts to for this reader (inside the preview, before the rollback). */
function describe(pp: PolicyPrincipal, crId: string, changes: RowChange[]): Omit<Foresight, "action" | "held_back"> {
  const lines: ForesightLine[] = [];
  const titles: Record<string, string> = {};
  const tables: Foresight["tables"] = {};
  for (const c of changes) (tables[c.table] ??= { insert: 0, update: 0, delete: 0 })[c.op]++;

  const readable = (id: string): GoalRow | null => {
    const g = goalRow(pp.wsId, id);
    if (!g || !canReadGoal(pp, goalObj(g))) return null;
    titles[g.id] = g.title;
    return g;
  };
  const nameOf = (id: string | null) => (id ? (readable(id) ? `“${titles[id]}”` : "a goal you can't see") : "no goal");

  // Directives: what reaches agents. Sessions counted per directive kind and goal, never named.
  const dirs = changes.filter((c) => c.table.startsWith("v2_directives") && c.op === "insert").map((c) => c.after!);
  const targets = changes.filter((c) => c.table === "v2_directive_targets" && c.op === "insert").map((c) => c.after!);
  const keysOf = (dirId: unknown) => new Set(targets.filter((t) => t.directive_id === dirId).map((t) => String(t.session_key)));
  for (const d of dirs) {
    const n = keysOf(d.id).size;
    const goalId = d.goal_id ? String(d.goal_id) : null;
    const sessions = count(n, "agent session");
    switch (d.kind) {
      case "goal_version": {
        const v = d.goal_json ? (JSON.parse(String(d.goal_json)) as { version: number; status: string }) : null;
        const closed = v && v.status !== "active";
        lines.push({ kind: "agents", text: closed ? `${sessions} ${n === 1 ? "learns" : "learn"} ${nameOf(goalId)} is ${v!.status}` : `${sessions} ${n === 1 ? "switches" : "switch"} to version ${v?.version ?? "?"} of ${nameOf(goalId)}` });
        break;
      }
      case "binding_suspended":
        lines.push({ kind: "pause", text: `${sessions} ${n === 1 ? "pauses" : "pause"} until ${n === 1 ? "its owner picks" : "their owners pick"} a goal` });
        break;
      case "release":
        lines.push({ kind: "agents", text: `${sessions} on ${nameOf(goalId)} ${n === 1 ? "is" : "are"} no longer held` });
        break;
      default:
        lines.push({ kind: "agents", text: `${sessions} ${n === 1 ? "gets" : "get"} a ${String(d.kind).replace(/_/g, " ")} directive` });
    }
  }

  // Goals: a new version of each, compared field by field; a target share, as spend.
  let weekly: number | null = null;
  for (const c of changes.filter((c) => c.table === "v2_goals" && c.op === "update")) {
    const id = String(c.after!.id);
    const g = readable(id);
    const from = Number(c.before!.version);
    const to = Number(c.after!.version);
    if (!g) {
      lines.push({ kind: "goal", text: "A goal you can't see gets a new version" });
      continue;
    }
    const before = fieldsOf(c.before!);
    const after = fieldsOf(c.after!);
    const hiddenOf = (ids: string[]) => ids.filter((d) => !readable(d)).length;
    const shown = (f: GoalFields): Partial<GoalFields> => ({ ...f, depends_on: f.depends_on.filter((d) => readable(d)) });
    const changed = (Object.keys(before) as (keyof GoalFields)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    const words = changed.map((k) => ({ title: "title", measures: "measures", limits: "limits", status: "status", depends_on: "dependencies" })[k]);
    if (changed.length)
      lines.push({
        kind: "goal",
        text: `${nameOf(id)} moves from version ${from} to ${to}: ${words.join(", ")} change${words.length === 1 ? "s" : ""}`,
        compare: { before: shown(before), after: shown(after), before_label: `Version ${from}`, after_label: `Version ${to}`, hidden: { before: hiddenOf(before.depends_on), after: hiddenOf(after.depends_on) } },
      });
    if (changed.length) {
      const dependents = [...goalsDependingOn(pp.wsId, id)];
      const seen = dependents.filter((d) => readable(d));
      if (dependents.length) {
        const closed = after.status !== "active" && before.status === "active";
        lines.push({
          kind: "dependents",
          text: `${count(dependents.length, "dependent goal")} ${closed ? `${dependents.length === 1 ? "depends" : "depend"} on a goal that is now ${after.status}` : `${dependents.length === 1 ? "sees" : "see"} version ${to}`}`,
          detail: [...seen.map((d) => `“${titles[d]}”`), ...(dependents.length > seen.length ? [count(dependents.length - seen.length, "goal you can't see", "goals you can't see")] : [])],
        });
      }
    }
    const t0 = c.before!.target_share ?? null;
    const t1 = c.after!.target_share ?? null;
    if (t0 !== t1) {
      if (weekly === null) weekly = allocation(pp, new Date(Date.now() - 7 * 86_400_000).toISOString(), null).total_est_list_usd_micros;
      const delta = (Number(t1 ?? 0) - Number(t0 ?? 0)) / 100;
      const moved = Math.round(Math.abs(delta) * weekly);
      const toward = delta > 0;
      lines.push({
        kind: "spend",
        text: weekly > 0 ? `About ${usd(moved)} a week of agent time moves ${toward ? `from the rest of the workspace to ${nameOf(id)}` : `from ${nameOf(id)} to the rest of the workspace`}` : `${nameOf(id)}'s target share changes`,
        detail: [`Target share: ${pct(t0)} → ${pct(t1)}`, weekly > 0 ? `At last week's ${usd(weekly)} of shared agent time, list price` : "No shared agent time in the last 7 days to price it"],
      });
    }
  }

  // Other open decisions this one closes: requests, target proposals, asks and alignments.
  const closedHere = (table: string, label: string, many: string, to: (r: Record<string, unknown>) => boolean) => {
    const n = changes.filter((c) => c.table === table && c.op === "update" && String(c.after!.id) !== crId && c.before!.state !== c.after!.state && to(c.after!)).length;
    if (n) lines.push({ kind: "requests", text: count(n, label, many) });
  };
  closedHere("v2_change_requests", "other change request is superseded", "other change requests are superseded", (r) => r.state === "superseded");
  closedHere("v2_reallocations", "target proposal is superseded", "target proposals are superseded", (r) => r.state === "superseded");
  closedHere("v2_alignments", "alignment to this goal ends", "alignments to this goal end", () => true);
  const expired = changes.filter((c) => c.table === "v2_request_targets" && c.op === "update" && c.after!.state === "expired").length;
  if (expired) lines.push({ kind: "requests", text: `${count(expired, "open agent request")} ${expired === 1 ? "expires" : "expire"}` });

  // The decision itself, as it is recorded.
  const me = changes.find((c) => c.table === "v2_change_requests" && String((c.after ?? c.before)!.id) === crId);
  if (me?.after) {
    const a = me.after;
    const text =
      a.state === "approved"
        ? a.launch === "launched"
          ? `Recorded as approved and launched as version ${a.version}`
          : a.launch === "not_yet"
            ? "Recorded as not yet: it stays approved, waiting for launch"
            : "Recorded as approved, not launched: agents keep the current version"
        : a.state === "rejected"
          ? "Recorded as declined, with your reason"
          : a.state === "withdrawn"
            ? "Recorded as withdrawn"
            : `Recorded as ${a.state}`;
    lines.push({ kind: "record", text });
  }

  const quiet = !dirs.length && !lines.some((l) => l.kind === "spend");
  return { quiet, lines, titles, tables };
}

/** The preview of one decision on a change request. Throws exactly what the decision would throw. */
export async function previewChangeRequest(pp: PolicyPrincipal, goalId: string, id: string, action: ChangeRequestAction, b: Body): Promise<Foresight> {
  const body = changeRequestDecision(pp, goalId, id, action, b);
  const p = await previewTx(body, (changes) => describe(pp, id, changes));
  if (!p.ok) throw p.error;
  const held = { events: p.outbound.filter((o) => o.kind === "event").length, mail: p.outbound.filter((o) => o.kind === "mail").length };
  return { action, ...p.observed!, held_back: held };
}
