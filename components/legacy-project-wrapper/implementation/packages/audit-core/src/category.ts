// Normalizing the person's change labels into at most five categories (spec §2.1).
// The subject of a label names its category: "caption shorter" and "caption less formal" are both caption changes.
// Words that only describe how something changed (shorter, tone, fix) are skipped when looking for the subject. Facts and
// sources share one category, as in the founder's prototype. A label with no subject is a style change.

const MODIFIERS = new Set([
  "shorter", "longer", "less", "more", "clearer", "clear", "simpler", "tone", "formal", "informal", "casual", "fix", "fixed",
  "swap", "swapped", "change", "changed", "rewrite", "rewrote", "redo", "make", "made", "the", "a", "an", "to", "of", "too",
  "add", "added", "remove", "removed", "cut", "tighten", "tightened", "rework", "reworked", "adjust", "adjusted", "update",
  "updated", "better", "wrong", "missing", "new", "different", "length", "style", "voice", "wording", "edit", "edits",
]);

const FACTS = new Set(["fact", "facts", "factual", "source", "sources", "citation", "citations", "cite", "accuracy", "reference", "references", "link", "links", "data"]);
const STYLE_ONLY = new Set(["tone", "formal", "informal", "casual", "length", "style", "voice", "wording", "shorter", "longer", "simpler", "clearer"]);

export const FACTS_CATEGORY = "facts and sources";
export const STYLE_CATEGORY = "style";
export const OTHER_CATEGORY = "other";
export const UNSPECIFIED_CATEGORY = "unspecified";

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);

/** The category for one change label, before the five-category cap. */
export function categoryOf(label: string): string {
  const ws = words(label);
  if (!ws.length) return UNSPECIFIED_CATEGORY;
  if (ws.some((w) => FACTS.has(w))) return FACTS_CATEGORY;
  // "tone less salesy": a label that opens on how it should sound is a style change, whatever adjective follows.
  if (STYLE_ONLY.has(ws[0])) return STYLE_CATEGORY;
  const subject = ws.find((w) => !MODIFIERS.has(w) && !/^\d+$/.test(w) && !/^x\d+$/.test(w));
  if (subject) return subject.replace(/s$/, "") || subject;
  return ws.some((w) => STYLE_ONLY.has(w)) ? STYLE_CATEGORY : UNSPECIFIED_CATEGORY;
}

/** Keep the four largest categories and fold the rest into "other" when there are more than `max`. Stable on ties:
 *  larger count first, then first appearance. Returns a mapping from each original category to its capped one. */
export function capCategories(counts: Map<string, number>, max: number): Map<string, string> {
  const order = [...counts.entries()].map(([k, n], i) => ({ k, n, i })).sort((a, b) => b.n - a.n || a.i - b.i);
  const map = new Map<string, string>();
  if (order.length <= max) {
    for (const { k } of order) map.set(k, k);
    return map;
  }
  order.forEach(({ k }, idx) => map.set(k, idx < max - 1 ? k : OTHER_CATEGORY));
  return map;
}
