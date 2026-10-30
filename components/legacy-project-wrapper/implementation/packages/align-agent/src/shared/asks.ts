// Asks between teams, read from the cached feed (`feeds/asks-<ws>.json`, written by the sync pass). Hook-safe:
// node:fs and node:path only, through fsx and layout. Only the *accepted* asks of the bound goal's team ever reach model
// context (owner decision D3), quoted with who asked and who accepted them; everything else here is for the user.
import { clean, personName, quoted, ASK_TEXT_MAX, ASKS_SHOWN } from "./envelope.ts";
import { readJson } from "./fsx.ts";
import { layout } from "./layout.ts";
import type { AcceptedAsk, Ask, AsksFile, FeedFile, MeFile, TeamAsks } from "./types.ts";

export function readAsks(home: string, ws: string): AsksFile | null {
  const f = readJson<AsksFile>(layout.asksFeed(home, ws));
  return f && Array.isArray(f.asks) ? f : null;
}

const OPEN_ORDER: Record<string, number> = { open: 0, accepted: 1, done: 2, declined: 2, withdrawn: 2 };

/** Open first, then accepted, then closed; newest source date first within each, then the latest change. */
export function askOrder(a: Ask, b: Ask): number {
  return (OPEN_ORDER[a.state] ?? 3) - (OPEN_ORDER[b.state] ?? 3) || String(b.source?.date).localeCompare(String(a.source?.date)) || String(b.updated_at).localeCompare(String(a.updated_at));
}

/** Who asked, as the envelope names them: the quoted label people use ("Faculty"), else the recorder's first name. */
function askedBy(a: Ask): string {
  return a.from_label ? quoted(a.from_label, 40) : personName(a.requester?.name);
}

/**
 * The accepted asks addressed to the team that owns `goalId`, newest acceptance first, at most 5, each clipped to 280
 * characters. Null when the goal has no team or the asks feed was never fetched, so callers can tell "none" from
 * "unknown".
 */
export function teamAsks(home: string, ws: string, goalId: string): TeamAsks | null {
  const goal = readJson<FeedFile>(layout.feed(home, ws))?.goals?.find((g) => g.id === goalId);
  const team = goal?.team;
  if (!team?.id) return null;
  const feed = readAsks(home, ws);
  if (!feed) return null;
  const accepted = feed.asks
    .filter((a) => a && a.state === "accepted" && a.team?.id === team.id && typeof a.text === "string")
    .sort((a, b) => String(b.decided_at || b.updated_at).localeCompare(String(a.decided_at || a.updated_at)));
  const asks: AcceptedAsk[] = accepted
    .slice(0, ASKS_SHOWN)
    .map((a) => ({
      id: a.id,
      text: clean(a.text, ASK_TEXT_MAX),
      asked_by: askedBy(a),
      asked_on: clean(a.source?.date, 10),
      accepted_by: a.decided_by ? personName(a.decided_by.name) : "the team",
    }));
  return { team: { id: team.id, name: team.name }, asks, accepted_ids: accepted.map((a) => a.id) };
}

/** This person's teams in a workspace (`teams`, or `pods` from servers before the rename). */
export function myTeams(me: MeFile | null, ws: string): { id: string; name: string }[] {
  const w = me?.workspaces?.find((x) => x.id === ws);
  return (w?.teams || w?.pods || []).map((t) => ({ id: t.id, name: t.name }));
}

/** One ask on one line for people (never model context): team, quoted text, who asked and where, its state. */
export function askLineForPeople(a: Ask, textMax = 140): string {
  const where = [a.source?.title ? clean(a.source.title, 60) : "", clean(a.source?.date, 10)].filter(Boolean).join(", ");
  const again = a.mentions?.length ? ` · came up again ${a.mentions.length} time${a.mentions.length > 1 ? "s" : ""}` : "";
  const by = a.from_label ? `"${clean(a.from_label, 40)}"` : clean(a.requester?.name, 40);
  const state = a.state === "accepted" && a.decided_by ? `accepted by ${clean(a.decided_by.name, 40)}` : clean(a.state, 12);
  return `${clean(a.team?.name, 40)}: ${quoted(a.text, textMax)} (asked by ${by}${where ? `, ${where}` : ""}${again}; ${state}${a.waiting_on_me ? "; waiting on you" : ""})`;
}

/**
 * The "Asked of your teams" section of `align team` (at most 6 lines): the open and accepted asks of this person's
 * teams. Empty when there are none or the feed was never fetched.
 */
export function asksSection(home: string, ws: string): string[] {
  const feed = readAsks(home, ws);
  if (!feed) return [];
  const teams = new Set(myTeams(readJson<MeFile>(layout.me(home)), ws).map((t) => t.id));
  const mine = feed.asks.filter((a) => (a.state === "open" || a.state === "accepted") && teams.has(a.team?.id)).sort(askOrder);
  if (!mine.length) return [];
  const shown = mine.slice(0, 4).map((a) => `- ${askLineForPeople(a)}`);
  const more = mine.length - shown.length;
  return ["Asked of your teams:", ...shown, ...(more > 0 ? [`- (+${more} more; run \`align asks\`)`] : [])];
}
