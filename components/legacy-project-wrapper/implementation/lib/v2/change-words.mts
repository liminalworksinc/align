// What an accepted change changed, field by field, in words: shared by the web app's decision value card and the MCP
// decision record's text summary, so a person and an agent read the same lines ("Arms shipped target 500 → 600", never
// "Measures: 1 → 1"). Plain module (no server imports), so client components can load it. People's text goes through
// `q` (the MCP layer marks it untrusted); dependencies are named by `title` (an id when the reader has no title).

interface MeasureLike {
  id: string;
  text: string;
  target: string | null;
}
interface LimitLike {
  id: string;
  type: string;
  text: string;
}
export interface FieldDiff {
  before: unknown;
  after: unknown;
  /** depends_on only: how many dependencies on each side the reader can't read (they are left out of before and
   *  after), so the words still count them (C5-3). */
  hidden?: { before: number; after: number } | null;
}

/** "a goal you can't see" / "2 goals you can't see": dependencies the reader can't read, never named. */
export const hiddenGoals = (n: number) => (n === 1 ? "a goal you can't see" : `${n} goals you can't see`);

/** Named dependencies, then the ones the reader can't see, counted after "and": "Growth dashboard and 1 other goal you
 *  can't see", never "Growth dashboard, a goal you can't see", which reads as if the named goal were the hidden one
 *  (X1). With nothing named, just the count ("a goal you can't see"). */
export function withHidden(names: string[], hidden: number): string {
  if (!hidden) return names.join(", ");
  if (!names.length) return hiddenGoals(hidden);
  return `${names.join(", ")} and ${hidden === 1 ? "1 other goal" : `${hidden} other goals`} you can't see`;
}

const LIMIT_WORDS: Record<string, string> = { must: "Must", must_not: "Must not", out_of_scope: "Out of scope" };

export interface ChangeWordsOptions {
  /** Wraps a person's text (default: as is). */
  q?: (s: string) => string;
  /** A dependency's name (default: its id). */
  title?: (id: string) => string;
  arrow?: string;
}

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** One line per change in one field of a diff (title, measures, depends_on, status, limits). */
export function changeWords(field: string, d: FieldDiff, o: ChangeWordsOptions = {}): string[] {
  const q = o.q ?? ((s: string) => s);
  const arrow = o.arrow ?? "→";
  const title = o.title ?? ((id: string) => id);
  if (field === "measures") {
    const b = list<MeasureLike>(d.before);
    const a = list<MeasureLike>(d.after);
    const t = (x: string | null) => (x === null || x === undefined || x === "" ? "none" : q(x));
    const out: string[] = [];
    for (const m of a) {
      const was = b.find((x) => x.id === m.id);
      if (!was) out.push(`Added measure ${q(m.text)}${m.target ? ` (target ${q(m.target)})` : ""}`);
      else if (was.text !== m.text && (was.target ?? null) !== (m.target ?? null)) out.push(`Measure ${q(was.text)} became ${q(m.text)}, target ${t(was.target)} ${arrow} ${t(m.target)}`);
      else if (was.text !== m.text) out.push(`Measure ${q(was.text)} became ${q(m.text)}`);
      else if ((was.target ?? null) !== (m.target ?? null)) out.push(`${q(m.text)} target ${t(was.target)} ${arrow} ${t(m.target)}`);
    }
    for (const m of b) if (!a.some((x) => x.id === m.id)) out.push(`Removed measure ${q(m.text)}`);
    return out.length ? out : ["Measures reordered"];
  }
  if (field === "limits") {
    const b = list<LimitLike>(d.before);
    const a = list<LimitLike>(d.after);
    const w = (l: LimitLike) => `${LIMIT_WORDS[l.type] ?? l.type}: ${q(l.text)}`;
    const out: string[] = [];
    for (const l of a) {
      const was = b.find((x) => x.id === l.id);
      if (!was) out.push(`Added limit ${w(l)}`);
      else if (was.text !== l.text || was.type !== l.type) out.push(`Limit ${w(was)} became ${w(l)}`);
    }
    for (const l of b) if (!a.some((x) => x.id === l.id)) out.push(`Removed limit ${w(l)}`);
    return out.length ? out : ["Limits reordered"];
  }
  if (field === "depends_on") {
    const b = list<string>(d.before);
    const a = list<string>(d.after);
    const added = a.filter((id) => !b.includes(id));
    const removed = b.filter((id) => !a.includes(id));
    // The ones the reader can't read are counted, never named, after any named ones, as on the rest of the card (C5-3).
    const more = Math.max(0, (d.hidden?.after ?? 0) - (d.hidden?.before ?? 0));
    const fewer = Math.max(0, (d.hidden?.before ?? 0) - (d.hidden?.after ?? 0));
    const out: string[] = [];
    if (added.length || more) out.push(`Now depends on ${withHidden(added.map((id) => q(title(id))), more)}`);
    if (removed.length || fewer) out.push(`No longer depends on ${withHidden(removed.map((id) => q(title(id))), fewer)}`);
    // The reader sees only the dependencies they can read: the change was to one they can't (one swapped for another).
    return out.length ? out : ["Dependencies you can't see changed"];
  }
  if (field === "title") return [`Title ${q(String(d.before ?? ""))} ${arrow} ${q(String(d.after ?? ""))}`];
  if (field === "status") return [`Status ${String(d.before ?? "—")} ${arrow} ${String(d.after ?? "—")}`];
  return [`${field}: ${String(d.before ?? "—")} ${arrow} ${String(d.after ?? "—")}`];
}

/** Every changed field's lines, in the record's field order. */
export function diffWords(diff: Record<string, FieldDiff | undefined>, o: ChangeWordsOptions = {}): string[] {
  return ["title", "measures", "limits", "status", "depends_on"].flatMap((k) => (diff[k] ? changeWords(k, diff[k]!, o) : []));
}

// ---- why a counter has nothing to send: the server's 409 no_change and the Suggest a change form's reason ----
// A counter is a revision of the request, so it is compared with the version the request was made against (its base),
// never with the goal as it is now: on a request behind its goal the two differ, and the words say which one (C8-2).

/** The server's 409 no_change for a counter that changes nothing on the request's base version (C7-2). On a request
 *  behind its goal it names that version, so removing what only the goal's newer version has never reads as changing
 *  "nothing on the goal" (C8-2). */
export function counterNoChange(baseVersion: number, goalVersion: number): string {
  return baseVersion === goalVersion
    ? "This suggestion changes nothing on the goal, so there is nothing to suggest. Change a field to suggest something else, or decline the request."
    : `This suggestion changes nothing on version ${baseVersion}, the version this request was made against (the goal is now at version ${goalVersion}), so there is nothing to suggest. Change a field to suggest something else, or decline the request.`;
}

/** Why the counter form's Review this decision is disabled: what it would send is the request's base (W3, C8-2). */
export function counterSameAsBase(baseVersion: number, goalVersion: number): string {
  return baseVersion === goalVersion
    ? "This suggestion is the same as the request's base; change a field to suggest something."
    : `This suggestion is the same as the request's base, version ${baseVersion} (the goal is now at version ${goalVersion}); change a field to suggest something.`;
}

/** A counter identical to the request with no "Accept if…" condition: the server's 409 no_change and the form's reason
 *  (W4). A request behind its goal is approved once its requester updates it. */
export function counterSameAsRequest(requester: string, baseVersion: number, goalVersion: number): string {
  return baseVersion === goalVersion ? "That's what the request already asks for: approve it instead." : `That's what the request already asks for: approve it once ${requester} updates it to version ${goalVersion}.`;
}
