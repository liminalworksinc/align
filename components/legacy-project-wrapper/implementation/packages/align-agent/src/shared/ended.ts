// The way out of a stop latch or goal hold whose share ended, in one place: the deny the model reads and every notice
// the user reads about a share that ended are built from it, so they never give different advice (E2E-AGENT cycle 9
// C9-2). Hook-safe: no imports.

/**
 * A goal hold whose release still reaches the session although its share ended: its sharing was stopped (Stop sharing
 * on the web, say) while this device held it, so the server still sends the goal's release here (E2E-AGENT cycle 10
 * C10-4). `goals`: the held goals' titles; `stopped`: a stop latch blocks it too, which nothing from the web lifts now.
 */
export interface ReleaseReaches {
  goals: string[];
  stopped: boolean;
}

/** `"A"`, `"A" and "B"`, `"A", "B" and "C"`. */
function quoted(titles: string[]): string {
  const q = titles.map((t) => `"${t}"`);
  return q.length > 1 ? `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}` : (q[0] ?? "its goal");
}

/**
 * For a session stopped or held from the web whose share ended (B6, C6-2): when it can be shared there again now
 * (`reshare`: signed in again and reaching its workspace), sharing it again with `::align share` in the session, after
 * which the web can lift the stop or hold; otherwise `align stop-sharing <id>` in a terminal. Never both: following
 * `align stop-sharing` makes sharing it again impossible. A hold whose release still reaches the session (`release`)
 * says that the release lifts it too, and, when a stop blocks it as well, that the release lifts only the hold (C10-4).
 * `reader`: the model (a deny, which names "the user") or the user (a notice, which says "you").
 */
export function latchWayOut(lid: string, reshare: boolean, reader: "model" | "user", release: ReleaseReaches | null = null): string {
  const user = reader === "user";
  const run = `${user ? "you run" : "the user runs"} \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal`;
  if (reshare) return `tools stay blocked until it is shared again (${user ? "you can type" : "the user can type"} \`::align share\` in this session), after which the stop or hold can be lifted from the web.`;
  if (release?.goals.length) {
    const hold = `the hold on ${quoted(release.goals)}`;
    return release.stopped
      ? `tools stay blocked until ${run}: the stop can no longer be lifted from the web, and a release of ${hold} (which still reaches this session) lifts only the hold.`
      : `tools stay blocked until ${hold} is released from the web (a release still reaches this session though its sharing ended), or until ${run}.`;
  }
  return `tools stay blocked until ${run}.`;
}

/** What a notice about a share that ended adds for a session stopped or held from the web (leading space included):
 *  which of the two blocks it, when a release still reaches it, and the way out. */
export function latchNoticeTail(lid: string, reshare: boolean, release: ReleaseReaches | null = null): string {
  const what = !reshare && release?.goals.length ? (release.stopped ? "stopped and held" : "held") : "stopped or held";
  return ` It was ${what} from the web, so ${latchWayOut(lid, reshare, "user", release)}`;
}
