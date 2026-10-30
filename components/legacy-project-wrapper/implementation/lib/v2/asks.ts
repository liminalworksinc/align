import type { PolicyPrincipal } from "./policy";

// Asks (PORT-003): what one team was asked to do by someone else ("Faculty asked Product for SSO by June"), recorded
// by a person from a meeting or by hand, with its history ("came up again", v2_ask_mentions). An ask belongs to the team
// asked (a pod); it is read by the person who recorded it, every member and lead of that team, and workspace owners.
// A lead of the team (or a workspace owner) accepts or declines it, the team marks it done, and the person who recorded
// it may withdraw it. Ask text is people's text: the MCP tools mark it untrusted.
//
// PORT-001 declares the shapes and signatures; PORT-003 fills them in.

export type AskState = "open" | "accepted" | "done" | "declined" | "withdrawn";

export interface AskPerson {
  id: string;
  name: string;
}

/** An ask as the routes, the MCP tools and the Asks tab show it. */
export interface AskView {
  id: string;
  state: AskState;
  /** The team asked. */
  team: { id: string; name: string };
  /** The asked team's goal it concerns, or null when there is none or the reader can't read it. */
  goal: { id: string; title: string } | null;
  text: string;
  /** Who asked, as people say it ("Faculty"). */
  from_label: string | null;
  /** The person who recorded it. */
  requester: AskPerson;
  source: { kind: "meeting" | "manual"; title: string | null; date: string };
  mentions: { n: number; date: string; text: string; source_title: string; added_by: AskPerson }[];
  /** The last person who changed its state, and when. */
  decided_by: AskPerson | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  /** Open and the reader can accept it, or accepted and the reader can mark it done. */
  waiting_on_me: boolean;
  can: { accept: boolean; decline: boolean; done: boolean; reopen: boolean; withdraw: boolean; mention: boolean };
}

/** The asks this person can read, filtered by state and team, newest first (at most `limit`). */
export function readableAsks(pp: PolicyPrincipal, o: { state?: AskState; teamId?: string; limit?: number } = {}): AskView[] {
  void pp;
  void o;
  return [];
}

/** The open and accepted asks of the person's teams for align_get_brief: open first, then most mentions, then newest;
 *  at most 5, and how many more there are. */
export function asksForBrief(pp: PolicyPrincipal): { asks: AskView[]; more: number } {
  void pp;
  return { asks: [], more: 0 };
}
