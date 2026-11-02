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
 * How a session whose share ended can be shared there again besides now (`reshare`), as its latch files carry it:
 * `unread`, signed in again (so `reshare`) but this sign-in has not yet read which shares their person stopped on the
 * web, so `align sync` comes first (one stopped there is never shared again; E2E-AGENT cycle 12, section 6); `login`,
 * signed out, and the share ended at a sign-out (or at a lost workspace the cached `/me` reaches again), so a new
 * `align login` offers `::align share` (cycle 12, section 6: the sign-out notice and the deny named one way each).
 */
export interface ShareAgain {
  unread?: boolean;
  login?: boolean;
}

/**
 * How `::align share` (`where`: "here", "in the session") shares a session whose share ended there again now, in every
 * view that says so (`::align status`, `align latch status`, `align status`, `align sessions`): while the ended shares
 * are unread since this sign-in, `align sync` first, as `::align share` itself then answers (cycle 12, section 6).
 */
export function shareAgainWords(unread: boolean, where: string, there = false): string {
  const share = `\`::align share\`${where ? ` ${where}` : ""} shares it ${there ? "there " : ""}again`;
  return unread ? `run \`align sync\` first (this machine has not yet heard whether its sharing was stopped on the web meanwhile), then ${share}` : share;
}

/**
 * For a session stopped or held from the web whose share ended (B6, C6-2): when it can be shared there again now
 * (`reshare`: signed in again and reaching its workspace), sharing it again with `::align share` in the session, after
 * which the web can lift the stop or hold, with `align sync` first while the ended shares are unread (`again.unread`);
 * while signed out after a sign-out ended it (`again.login`), `align stop-sharing <id>` in a terminal or a new
 * `align login` and then `::align share`, in one sentence (cycle 12, section 6); otherwise `align stop-sharing <id>`.
 * A hold whose release still reaches the session (`release`) says that the release lifts it too, and, when a stop
 * blocks it as well, that the release lifts only the hold (C10-4). `reader`: the model (a deny, which names "the user")
 * or the user (a notice, which says "you").
 */
export function latchWayOut(lid: string, reshare: boolean, reader: "model" | "user", release: ReleaseReaches | null = null, again: ShareAgain = {}): string {
  const user = reader === "user";
  const run = `${user ? "you run" : "the user runs"} \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal`;
  const lifted = "after which the stop or hold can be lifted from the web";
  if (reshare && again.unread) {
    return `tools stay blocked until it is shared again: ${user ? "run" : "the user runs"} \`align sync\` in a terminal first (this machine has not yet heard from the Align server whether its sharing was stopped on the web meanwhile, and one stopped there is not shared again), then ${user ? "type" : "types"} \`::align share\` in this session, ${lifted}.`;
  }
  if (reshare) return `tools stay blocked until it is shared again (${user ? "you can type" : "the user can type"} \`::align share\` in this session), ${lifted}.`;
  if (again.login) {
    return `tools stay blocked until ${run}, or until it is shared again once this machine is signed in (${user ? "run" : "the user runs"} \`align login\` in a terminal, then ${user ? "type" : "types"} \`::align share\` in this session), ${lifted}.`;
  }
  if (release?.goals.length) {
    const hold = `the hold on ${quoted(release.goals)}`;
    return release.stopped
      ? `tools stay blocked until ${run}: the stop can no longer be lifted from the web, and a release of ${hold} (which still reaches this session) lifts only the hold.`
      : `tools stay blocked until ${hold} is released from the web (a release still reaches this session though its sharing ended), or until ${run}.`;
  }
  return `tools stay blocked until ${run}.`;
}

/** What a notice about a share that ended adds for a session stopped or held from the web (leading space included):
 *  which of the two blocks it, when a release still reaches it, and the way out. Signed out (`again.login`), the
 *  notice has just said to run `align login` and then type `::align share`, so the sentence names that way by
 *  reference, and `align stop-sharing` as the other, the two ways the deny names (cycle 12, section 6). */
export function latchNoticeTail(lid: string, reshare: boolean, release: ReleaseReaches | null = null, again: ShareAgain = {}): string {
  const what = !reshare && release?.goals.length ? (release.stopped ? "stopped and held" : "held") : "stopped or held";
  if (!reshare && again.login) {
    return ` It was ${what} from the web, so tools stay blocked until it is shared again that way, after which the stop or hold can be lifted from the web, or until you run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.`;
  }
  return ` It was ${what} from the web, so ${latchWayOut(lid, reshare, "user", release, again)}`;
}

// ---------- notices about a session's share, worded when they are shown ----------
// Four test rounds in a row found a notice about a share that ended which contradicted the session's deny (E2E-AGENT
// cycle 11 C11-1 to C11-4): its words were composed when the share ended, and a later sign-in, sign-out, re-pairing or
// `/me` did not always rewrite them, while the deny is worked out from the state now. So the database stores only what
// happened (`ShareFacts`), the sync writes the session's state now into its hot file (`ShareNow`, from the same values
// as its latch files), and the hook words the notice when it shows it (`shareNotice`), with `latchNoticeTail`: whatever
// the order of events, the notice and the deny give the same way out.

/** What happened to a session's share, with the facts its notice needs (names cleaned when stored). */
export interface ShareFacts {
  e:
    | "started" // shared (a spooled `::align share` applied): `text`
    | "share_err" // the server refused the share: `text`
    | "signed_out" // this machine signed out, which ended the share
    | "access_lost" // this device no longer reaches its workspace
    | "removed" // the server ended it while its person was out of the workspace (`member_removed`); they are back
    | "server_signed_out" // the server ended it at a sign-out of an earlier pairing (`device_signed_out`)
    | "stopped_on_web" // its person stopped it (Stop sharing on the web)
    | "stopped_before_end" // ... before a sign-out or a lost workspace had ended it here: `before`
    | "upload_refused" // the server no longer accepts its usage (an older server's words): `text`
    | "changed"; // a notice an older agent stored with no facts (`changedFacts`): only that the share's state changed
  ws: string;
  goal: string | null;
  text?: string;
  before?: string;
  /** "login": a share a new `align login` ended (the pairing it replaced was this machine's), not a sign-out the
   *  developer asked for, so its words never say this machine signed out or is signed in "again" (cycle 12, section 6). */
  via?: "login";
  /** A share asked for here that had not reached the server yet (still pending) when the sign-out ended it. */
  unsent?: true;
}

/** A session's share state now, as its latch files and the status views have it (`renderHot`). */
export interface ShareNow {
  /** shared, pending or suspended */
  live: boolean;
  /** why its stopped share ended; null while live or with none */
  ended: "device_signed_out" | "access_lost" | "sharing_ended" | null;
  signed_in: boolean;
  /** the cached `/me` lists its workspace */
  reaches: boolean;
  /** as its latch files: `::align share` shares it there again now */
  reshare: boolean;
  /** signed in, but which ended shares their person stopped on the web was not read yet since this sign-in */
  unread: boolean;
  /** as its latch files: signed out, and a new `align login` would offer `::align share` for it (cycle 12) */
  login?: boolean;
  /** a stop latch or a goal hold blocks its tools */
  latched: boolean;
  release: ReleaseReaches | null;
}

/** What the session was last told about its share: the notice it came from, its words' key (`<situation>:<words>`)
 *  and the latch sentence it ended with. */
export interface ShareTold {
  id: string;
  key: string;
  tail: string;
}

export interface ShareWords {
  key: string;
  tail: string;
  text: string;
}

const STOPPED_ON_WEB = "Align: this session's sharing was stopped (Stop sharing on the web), so it stopped sharing here; its usage stays on this machine from now on.";

function words(key: string, f: ShareFacts): string {
  const again = f.goal ? ` (it counts toward "${f.goal}" again)` : "";
  switch (key) {
    case "out:signed_out":
      return `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case "out:signed_out_unsent":
      return `Align: this session's share had not reached the Align server yet when this machine signed out of Align, so it was not shared; its usage stays on this machine. To share it, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case "out:signed_out_ended":
      return `Align: this machine signed out of Align, so this session can't be shared again from here for now; its usage stays on this machine. To share it again, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case "reshare:signed_in":
      return `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here${again}.`;
    case "reshare:relogin":
      return `Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in; its usage stays on this machine until it is shared again. To share it again, type \`::align share\` here${again}.`;
    case "reshare:workspace_back":
      return `Align: this machine can reach ${f.ws} in Align again. To share this session there again, type \`::align share\` here${again}.`;
    case "reshare:removed":
      return `Align: this session stopped sharing because you were removed from ${f.ws} in Align (or left it) while this machine was not in touch; its usage from then on stays on this machine. You are a member again, so to share it there again, type \`::align share\` here${again}.`;
    case "reshare:server_signed_out":
      return `Align: this session stopped sharing because the Align server ended its share when this machine signed out of Align (an earlier sign-in); its usage stays on this machine from now on. This machine is signed in now, so to share it again, type \`::align share\` here${again}.`;
    case "noreach:signed_in_noreach":
      return `Align: this machine is signed in to Align again, but this sign-in does not reach ${f.ws}, so this session can't be shared there again from here; its usage stays on this machine.`;
    case "noreach:relogin_noreach":
      return `Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in, and this sign-in does not reach ${f.ws}, so this session can't be shared there again from here; its usage stays on this machine.`;
    case "noreach:access_lost":
      return `Align: this session stopped sharing because you no longer have access to ${f.ws} in Align (you were removed from it or left it); its usage stays on this machine from now on.`;
    case "noreach:access_lost_again":
      return `Align: this machine can no longer reach ${f.ws} in Align (you were removed from it or left it again), so this session can't be shared there again from here; its usage stays on this machine.`;
    case "stopped:web":
      return STOPPED_ON_WEB;
    case "changed:live":
    case "changed:other":
      return SHARE_CHANGED;
    case "stopped:before_end":
      return `Align: this session's sharing was stopped (Stop sharing on the web), so it stays stopped and is not shared again from here (its share here had ended when ${f.before ?? "this machine signed out of Align"}); its usage stays on this machine.`;
    default:
      return f.text ?? "";
  }
}

const situation = (key: string) => key.slice(0, key.indexOf(":"));

/** What an older hook, which shows a notice's stored text as it is, can be told about a share's state at any time later. */
export const SHARE_CHANGED = "Align: this session's sharing changed; run `align sessions` in a terminal for what it is now, and `align latch status` if its tools are blocked.";

/**
 * The text the database keeps for a notice about `f`: this agent's hook words the notice from its facts when it shows
 * it, but an older hook shows the stored text as it is, so that is never advice from the time of the event, which a
 * later sign-in, sign-out or `/me` can make wrong (E2E-AGENT cycle 12 C12-1): a share that ended or was stopped is
 * stored as `SHARE_CHANGED`, which is true whenever it is shown. A share that started or was refused keeps its own words
 * (they say what happened to that share, not what to do about its state later).
 */
export function storedText(f: ShareFacts): string {
  return f.e === "started" || f.e === "share_err" ? (f.text ?? SHARE_CHANGED) : SHARE_CHANGED;
}

/** The latch sentence of a notice about a share that ended, from the values its latch files carry. */
function stateTail(lid: string, now: ShareNow): string {
  return now.latched && now.ended ? latchNoticeTail(lid, now.reshare, now.reshare ? null : now.release, { unread: now.unread, login: now.login }) : "";
}

/**
 * The notice about the share event `f` (stored as `id`) as it reads now, from the session's state now and what it was
 * last told (`told`, when that was about this same event): its words follow the state, and its latch sentence is the
 * one the deny gives, so it can't contradict the deny. `"hold"` while this machine is signed in again but the ended shares
 * were not read since this sign-in (it might say `::align share` shares the session again, which the server refuses for
 * one its person stopped on the web, C11-1); null when there is nothing to tell (a share that started and has since ended, say, or an ended share shared
 * again). Within one event the words change only with the situation (signed out, shareable again, out of reach,
 * stopped), so a notice is told again only when its advice changed.
 */
export function shareNotice(lid: string, id: string, f: ShareFacts, now: ShareNow, told: ShareTold | null): ShareWords | "hold" | null {
  const prev = told && told.id === id ? told : null;
  const tail = stateTail(lid, now);
  const out = (key: string): ShareWords => ({ key, tail, text: words(key, f) + tail });
  switch (f.e) {
    case "started":
      return now.live ? { key: "started:text", tail: "", text: words("", f) } : null;
    case "share_err":
      return now.live ? null : { key: "share_err:text", tail: "", text: words("", f) };
    case "stopped_on_web":
      return now.live ? null : out("stopped:web");
    case "stopped_before_end":
      return now.live ? null : out("stopped:before_end");
    case "upload_refused":
      return now.live ? null : out("stopped:refused");
    case "changed":
      // An older agent's notice with no facts: what it said may no longer hold, so never its words. Live, or stopped
      // for good, it is told as changed (true whenever shown); ended at a sign-out or a lost workspace, as such an end
      // is told (held back while the ended shares are unread). E2E-AGENT cycle 13 C13-1.
      if (now.live) return out("changed:live");
      if (now.ended !== "device_signed_out" && now.ended !== "access_lost") return out("changed:other");
  }
  // A share that a sign-out or a lost workspace ended (or the server, the same ways): its words follow this machine's
  // sign-in and reach now. A share stopped for good since, or shared again, has a newer event or nothing to tell.
  if (now.live || (now.ended !== "device_signed_out" && now.ended !== "access_lost")) return null;
  // Signed in again, but its person may have stopped it on the web: nothing until the ended shares are read.
  if (now.signed_in && now.unread) return "hold";
  const sit = !now.signed_in ? (now.ended === "access_lost" && !now.reaches ? "noreach" : "out") : now.reshare ? "reshare" : "noreach";
  if (prev && situation(prev.key) === sit) return out(prev.key);
  const was = prev ? situation(prev.key) : null;
  if (sit === "out") return out(now.ended === "device_signed_out" ? (f.unsent ? "out:signed_out_unsent" : "out:signed_out") : "out:signed_out_ended");
  if (sit === "reshare") {
    if (!prev && f.e === "removed") return out("reshare:removed");
    if (!prev && f.e === "server_signed_out") return out("reshare:server_signed_out");
    // Told this sign-in does not reach its workspace: what changed is the reach (a workspace given back on the Devices
    // page or at a re-invite), not the sign-in (cycle 12, section 6).
    if (was === "noreach") return out("reshare:workspace_back");
    // Ended by a new `align login` that replaced this machine's pairing: it never signed out (cycle 12, section 6).
    if (!prev && f.via === "login" && now.ended === "device_signed_out") return out("reshare:relogin");
    return out(now.ended === "device_signed_out" || was === "out" ? "reshare:signed_in" : "reshare:workspace_back");
  }
  if (!prev && f.via === "login" && now.ended === "device_signed_out") return out("noreach:relogin_noreach");
  if (now.ended === "device_signed_out" || (was === "out" && now.signed_in)) return out("noreach:signed_in_noreach");
  return out(was === "reshare" ? "noreach:access_lost_again" : "noreach:access_lost");
}

/** Tell the notice `w` now, after `told`: when it is about a newer event (`fresh`), or its situation changed since, or
 *  its latch sentence changed while it still blocks (a re-pairing took the release away, say). */
export function shareRetell(id: string, w: ShareWords, told: ShareTold | null, fresh: boolean): boolean {
  if (fresh || !told || told.id !== id) return fresh;
  return situation(told.key) !== situation(w.key) || (!!w.tail && w.tail !== told.tail);
}
