// The way out of a stop latch or goal hold whose share ended, in one place: the deny the model reads and every notice
// the user reads about a share that ended are built from it, so they never give different advice (E2E-AGENT cycle 9
// C9-2). Hook-safe: no imports.

/**
 * For a session stopped or held from the web whose share ended (B6, C6-2): when it can be shared there again now
 * (`reshare`: signed in again and reaching its workspace), sharing it again with `::align share` in the session, after
 * which the web can lift the stop or hold; otherwise `align stop-sharing <id>` in a terminal. Never both: following
 * `align stop-sharing` makes sharing it again impossible. `reader`: the model (a deny, which names "the user") or the
 * user (a notice, which says "you").
 */
export function latchWayOut(lid: string, reshare: boolean, reader: "model" | "user"): string {
  const user = reader === "user";
  return reshare
    ? `tools stay blocked until it is shared again (${user ? "you can type" : "the user can type"} \`::align share\` in this session), after which the stop or hold can be lifted from the web.`
    : `tools stay blocked until ${user ? "you run" : "the user runs"} \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.`;
}

/** What a notice about a share that ended adds for a session stopped or held from the web (leading space included). */
export function latchNoticeTail(lid: string, reshare: boolean): string {
  return ` It was stopped or held from the web, so ${latchWayOut(lid, reshare, "user")}`;
}
