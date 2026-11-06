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
  /** its share ended because this machine can't reach its workspace now: if it can again, the session can be shared
   *  there again and the stop lifted from the web */
  lost?: boolean;
}

/**
 * How `::align share` (`where`: "here", "in the session") shares a session whose share ended there again now, in every
 * view that says so (`::align status`, `align latch status`, `align status`, `align sessions`): while the ended shares
 * are unread since this sign-in, `align sync` first, as `::align share` itself then answers (cycle 12, section 6).
 * `unsent`: its share never reached the server, so it is shared, not shared again.
 */
export function shareAgainWords(unread: boolean, where: string, there = false, unsent = false): string {
  // A share that never reached the server is shared, not shared again (E2E-AGENT cycle 14 C14-4).
  const share = `\`::align share\`${where ? ` ${where}` : ""} shares it${there ? " there" : ""}${unsent ? "" : " again"}`;
  return unread ? `run \`align sync\` first (this machine has not yet heard whether its sharing was stopped on the web meanwhile), then ${share}` : share;
}

/**
 * A stop set from the session's Align workspace holds after its sharing ends (LIM-2441): stopping sharing on this machine
 * (`align stop-sharing`, `::align unshare`) or deleting the shared history keeps it, and a session whose sharing was
 * stopped is not shared again, so once nothing can reach the session from the web the stop can't be lifted and the
 * session stays stopped. A new session is not stopped. A goal hold is a latch of its own, which `align stop-sharing`
 * still frees.
 */
function stopStays(user: boolean, lost = false): string {
  const after = lost
    ? `, and nothing lifts it from here unless this machine can reach that workspace again, when sharing it there again lets the stop be lifted from the web`
    : ", and nothing lifts it from here now";
  return `this session stays stopped: a stop set from its Align workspace holds after its sharing ends${after}. A new session is not stopped${user ? "" : ", so the user can start one to keep working"}.`;
}

/**
 * Why a session stopped from its workspace is not shared again once its person stopped sharing it or deleted its shared
 * history (LIM-2441): the stop holds after both, and a new share would start a server record with no stop on it, which
 * the web could not resume while this machine kept the session blocked. So it is not shared, and it stays stopped.
 */
export const STOP_HOLDS_NO_SHARE =
  "this session was stopped from its Align workspace, and that stop holds after its shared history is deleted, so it is not shared again and it stays stopped. A new session is not stopped.";

/**
 * For a session stopped or held from the web whose share ended (B6, C6-2): when it can be shared there again now
 * (`reshare`: signed in again and reaching its workspace), sharing it again with `::align share` in the session, after
 * which the web can lift the stop or hold, with `align sync` first while the ended shares are unread (`again.unread`);
 * while signed out after a sign-out ended it (`again.login`), `align stop-sharing <id>` in a terminal or a new
 * `align login` and then `::align share`, in one sentence (cycle 12, section 6); otherwise `align stop-sharing <id>`.
 * A hold whose release still reaches the session (`release`) says that the release lifts it too, and, when a stop
 * blocks it as well, that the release lifts only the hold (C10-4). `reader`: the model (a deny, which names "the user")
 * or the user (a notice, which says "you"). `stop`: a stop latch blocks it, which `align stop-sharing` never lifts: where
 * nothing else can, the session stays stopped (LIM-2441).
 */
export function latchWayOut(lid: string, reshare: boolean, reader: "model" | "user", release: ReleaseReaches | null = null, again: ShareAgain = {}, stop = false): string {
  const user = reader === "user";
  const run = `${user ? "you run" : "the user runs"} \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal`;
  const lifted = "after which the stop or hold, if still in place, can be lifted from the web";
  if (reshare && again.unread) {
    return `tools stay blocked until it is shared again: ${user ? "run" : "the user runs"} \`align sync\` in a terminal first (this machine has not yet heard from the Align server whether its sharing was stopped on the web meanwhile, and one stopped there is not shared again), then ${user ? "type" : "types"} \`::align share\` in this session, ${lifted}.`;
  }
  if (reshare) return `tools stay blocked until it is shared again (${user ? "you can type" : "the user can type"} \`::align share\` in this session), ${lifted}.`;
  if (again.login) {
    if (stop) {
      return `tools stay blocked until it is shared again once this machine is signed in (${user ? "run" : "the user runs"} \`align login\` in a terminal, then ${user ? "type" : "types"} \`::align share\` in this session), ${lifted}; until then ${stopStays(user)}`;
    }
    return `tools stay blocked until ${run}, or until it is shared again once this machine is signed in (${user ? "run" : "the user runs"} \`align login\` in a terminal, then ${user ? "type" : "types"} \`::align share\` in this session), ${lifted}.`;
  }
  if (release?.goals.length) {
    const hold = `the hold on ${quoted(release.goals)}`;
    return release.stopped || stop
      ? `${stopStays(user, !!again.lost)} A release of ${hold} (which still reaches this session) lifts only the hold.`
      : `tools stay blocked until ${hold} is released from the web (a release still reaches this session though its sharing ended), or until ${run}.`;
  }
  return stop ? stopStays(user, !!again.lost) : `tools stay blocked until ${run}.`;
}

/** What a notice about a share that ended adds for a session stopped or held from the web (leading space included):
 *  which of the two blocks it, when a release still reaches it, and the way out. Signed out (`again.login`), the
 *  notice has just said to run `align login` and then type `::align share`, so the sentence names that way by
 *  reference, and `align stop-sharing` as the other, the two ways the deny names (cycle 12, section 6). */
export function latchNoticeTail(lid: string, reshare: boolean, release: ReleaseReaches | null = null, again: ShareAgain = {}, stop = false): string {
  const what = !reshare && release?.goals.length ? (release.stopped ? "stopped and held" : "held") : "stopped or held";
  if (!reshare && again.login && stop) {
    return ` It was ${what} from the web, so tools stay blocked until it is shared again that way, after which the stop or hold, if still in place, can be lifted from the web; until then ${stopStays(true)}`;
  }
  if (!reshare && again.login) {
    return ` It was ${what} from the web, so tools stay blocked until it is shared again that way, after which the stop or hold, if still in place, can be lifted from the web, or until you run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.`;
  }
  return ` It was ${what} from the web, so ${latchWayOut(lid, reshare, "user", release, again, stop)}`;
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
    | "share_stopped" // a share asked for here of a session its person had stopped (the server never shares it again)
    | "upload_refused" // the server no longer accepts its usage (an older server's words): `text`
    | "changed"; // a notice an older agent stored with no facts (`changedFacts`): only that the share's state changed
  ws: string;
  goal: string | null;
  text?: string;
  before?: string;
  /** "login": a share a new `align login` ended (the pairing it replaced was this machine's), not a sign-out the
   *  developer asked for, so its words never say this machine signed out or is signed in "again" (cycle 12, section 6). */
  via?: "login";
  /** With `via`: this machine signed out since, so the end now reads as a sign-out's (E2E-AGENT cycle 13, section 5). */
  out_since?: true;
  /** A share asked for here that had not reached the server yet (still pending) when the sign-out (or the lost
   *  workspace) ended it: every wording of its end says it was never shared (E2E-AGENT cycle 14 C14-4). */
  unsent?: true;
  /** The writer generation of the build that stored it (`WRITER_GEN`; absent before cycle 14). */
  g?: number;
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
  /** a stop latch blocks its tools (a stop holds after its sharing ends; LIM-2441) */
  stopped?: boolean;
  /** false when the cached `/me` says its person is no longer a member of its workspace (neither this device's
   *  workspaces nor `other_workspaces` list it: removed, or they left); absent when that is not known (an older server
   *  sends no `other_workspaces`) or it is listed (E2E-AGENT cycle 13, section 5). */
  member?: false;
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

/** The clause for a share that had not reached the server yet when `when` ended it, so it was never shared: one wording
 *  for every notice about such an end (a sign-out, a replacing `align login`, a lost workspace), so none calls it a share
 *  that ended or is shared "again" (E2E-AGENT cycle 14 C14-4). */
export function neverSentWords(when: string): string {
  return `this session's share had not reached the Align server yet when ${when}, so it was not shared`;
}

const RELOGIN_WHEN = "a new sign-in on this machine (`align login`) replaced the earlier one";
const OUT_WHEN = "this machine signed out of Align";

/** How the end of the share `f` (`why`: why it ended, as its latch has it) came, for `neverSentWords`. */
function endWhen(f: ShareFacts, why: ShareNow["ended"]): string {
  if (f.e === "access_lost" || why === "access_lost") return `you lost access to ${f.ws} in Align (you were removed from it or left it)`;
  return f.via === "login" && !f.out_since ? RELOGIN_WHEN : OUT_WHEN;
}

function words(key: string, f: ShareFacts, why: ShareNow["ended"] = null): string {
  const unsent = !!f.unsent;
  const re = unsent ? "" : " again";
  const again = f.goal ? ` (it counts toward "${f.goal}"${re})` : "";
  const never = neverSentWords(endWhen(f, why));
  // Out of reach: it can't be shared there (again) from here; one never sent says so in the same sentence.
  const noShare = unsent ? `can't be shared there from here (${never})` : "can't be shared there again from here";
  switch (key) {
    case "out:signed_out":
      return `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case "out:signed_out_unsent":
      return `Align: ${neverSentWords(OUT_WHEN)}; its usage stays on this machine. To share it, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case "out:signed_out_ended":
      return unsent
        ? `Align: this machine signed out of Align, so this session can't be shared from here for now (${never}); its usage stays on this machine. To share it, run \`align login\` in a terminal, then type \`::align share\` here${again}.`
        : `Align: this machine signed out of Align, so this session can't be shared again from here for now; its usage stays on this machine. To share it again, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case "reshare:signed_in":
      return unsent
        ? `Align: this machine is signed in to Align again. Earlier, ${never}; to share it, type \`::align share\` here${again}.`
        : `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here${again}.`;
    case "reshare:relogin":
      return unsent
        ? `Align: ${neverSentWords(RELOGIN_WHEN)}; its usage stays on this machine until it is shared. To share it, type \`::align share\` here${again}.`
        : `Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in; its usage stays on this machine until it is shared again. To share it again, type \`::align share\` here${again}.`;
    case "reshare:workspace_back":
      return unsent
        ? `Align: this machine can reach ${f.ws} in Align again. Earlier, ${never}; to share it there, type \`::align share\` here${again}.`
        : `Align: this machine can reach ${f.ws} in Align again. To share this session there again, type \`::align share\` here${again}.`;
    case "reshare:removed":
      return `Align: this session stopped sharing because you were removed from ${f.ws} in Align (or left it) while this machine was not in touch; its usage from then on stays on this machine. You are a member again, so to share it there again, type \`::align share\` here${again}.`;
    case "reshare:server_signed_out":
      return `Align: this session stopped sharing because the Align server ended its share when this machine signed out of Align (an earlier sign-in); its usage stays on this machine from now on. This machine is signed in now, so to share it again, type \`::align share\` here${again}.`;
    case "noreach:signed_in_noreach":
      return `Align: this machine is signed in to Align again, but this sign-in does not reach ${f.ws}, so this session ${noShare}; its usage stays on this machine.`;
    case "noreach:relogin_noreach":
      return unsent
        ? `Align: ${neverSentWords(RELOGIN_WHEN)}, and this sign-in does not reach ${f.ws}, so it can't be shared there from here; its usage stays on this machine.`
        : `Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in, and this sign-in does not reach ${f.ws}, so this session can't be shared there again from here; its usage stays on this machine.`;
    case "noreach:signed_in_removed":
      return `Align: this machine is signed in to Align again, but you are no longer a member of ${f.ws} in Align (you were removed from it or left it), so this session ${noShare}; its usage stays on this machine.`;
    case "noreach:relogin_removed":
      return unsent
        ? `Align: ${neverSentWords(RELOGIN_WHEN)}, and you are no longer a member of ${f.ws} in Align (you were removed from it or left it), so it can't be shared there from here; its usage stays on this machine.`
        : `Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in, and you are no longer a member of ${f.ws} in Align (you were removed from it or left it), so this session can't be shared there again from here; its usage stays on this machine.`;
    case "noreach:removed_again":
      return `Align: you are no longer a member of ${f.ws} in Align (you were removed from it or left it), so this session ${noShare}; its usage stays on this machine.`;
    case "noreach:reach_lost":
      return `Align: this sign-in no longer reaches ${f.ws} in Align, so this session ${noShare}; its usage stays on this machine.`;
    case "noreach:access_lost":
      return unsent
        ? `Align: ${never}; its usage stays on this machine.`
        : `Align: this session stopped sharing because you no longer have access to ${f.ws} in Align (you were removed from it or left it); its usage stays on this machine from now on.`;
    case "noreach:access_lost_again":
      return `Align: this machine can no longer reach ${f.ws} in Align (you were removed from it or left it again), so this session ${noShare}; its usage stays on this machine.`;
    case "stopped:web":
      return STOPPED_ON_WEB;
    case "changed:live":
    case "changed:other":
      return SHARE_CHANGED;
    case "stopped:before_end":
      return `Align: this session's sharing was stopped (Stop sharing on the web), so it stays stopped and is not shared again from here (its share here had ended when ${f.before ?? "this machine signed out of Align"}); its usage stays on this machine.`;
    case "stopped:share_refused":
      return "Align: this session's sharing was stopped (Stop sharing on the web), so it stays stopped and is not shared again from here; its usage stays on this machine.";
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
  return now.latched && now.ended ? latchNoticeTail(lid, now.reshare, now.reshare ? null : now.release, { unread: now.unread, login: now.login, lost: now.ended === "access_lost" }, !!now.stopped) : "";
}

/** The situations a session can be told its share is in: live, stopped for good, signed out, shareable again, out of
 *  reach. A notice is told again only when the session's situation differs from the one it was last told. */
type Situation = "live" | "stopped" | "out" | "reshare" | "noreach";

/** The session's situation now (`"hold"`: signed in again with the ended shares unread, so nothing is told yet). */
export function stateSituation(now: ShareNow): Situation | "hold" {
  if (now.live) return "live";
  if (now.ended !== "device_signed_out" && now.ended !== "access_lost") return "stopped";
  if (now.signed_in && now.unread) return "hold";
  return !now.signed_in ? (now.ended === "access_lost" && !now.reaches ? "noreach" : "out") : now.reshare ? "reshare" : "noreach";
}

/** The situation a notice's words (`ShareTold.key`) told the session it was in; null when they told none (the neutral
 *  sentence, or nothing). */
export function toldSituation(key: string): Situation | null {
  const s = situation(key);
  if (s === "started" || key === "changed:live") return "live";
  if (s === "stopped" || s === "share_err" || key === "changed:other") return "stopped";
  if (s === "out" || s === "reshare" || s === "noreach") return s;
  // "Nothing to tell" (`none:<situation>`), kept with the situation it was in then.
  if (s === "none") return (["live", "stopped", "out", "reshare", "noreach"] as const).find((x) => x === key.slice(5)) ?? null;
  return null;
}

/** What `planNotices` records when there is nothing to tell about a notice now: the situation it was in. */
export function noneTold(id: string, now: ShareNow): ShareTold {
  const sit = stateSituation(now);
  return { id, key: `none:${sit === "hold" ? "" : sit}`, tail: "" };
}

/**
 * The notice about the share event `f` (stored as `id`) as it reads now, from the session's state now and what it was
 * last told (`told`, when that was about this same event): its words follow the state, and its latch sentence is the
 * one the deny gives, so it can't contradict the deny. `"hold"` while this machine is signed in again but the ended shares
 * were not read since this sign-in (it might say `::align share` shares the session again, which the server refuses for
 * one its person stopped on the web, C11-1); null when there is nothing to tell (a share that started and has since ended, say, or an ended share shared
 * again). Within one event the words change only with the situation (signed out, shareable again, out of reach,
 * stopped), so a notice is told again only when its advice changed.
 *
 * A notice an older build stored (`changed`: no facts, or another build's) continues what the session was last told,
 * whatever event that was about: in the same situation it keeps those words (`toldFacts`: the facts of the notice they
 * came from, when the hot file still has it), so it is never told a second time in one situation; in another, it is
 * worded from the state now, a share a replacing `align login` ended never as "signed in again" (E2E-AGENT cycle 14
 * C14-1).
 */
export function shareNotice(lid: string, id: string, f: ShareFacts, now: ShareNow, told: ShareTold | null, toldFacts: ShareFacts | null = null): ShareWords | "hold" | null {
  const changed = f.e === "changed";
  const sitNow = stateSituation(now);
  if (changed && sitNow === "hold") return "hold";
  if (changed && told && told.id !== id && toldSituation(told.key) === sitNow) {
    // The same situation as it was last told: those words, as now.
    const base = toldFacts && toldFacts.e !== "changed" ? shareNotice(lid, told.id, toldFacts, now, told) : null;
    if (base && base !== "hold" && toldSituation(base.key) === sitNow) return base;
    const tail = stateTail(lid, now);
    return { key: told.key, tail, text: (situation(told.key) === "started" || situation(told.key) === "none" ? SHARE_CHANGED : words(told.key, f, now.ended)) + tail };
  }
  // About this same event; for an older build's notice, what the session was told of how its share ended (its words
  // decide how a change of situation is worded: signed in "again", the workspace "back").
  const prev = told && (told.id === id || (changed && ["out", "reshare", "noreach"].includes(situation(told.key)))) ? told : null;
  const tail = stateTail(lid, now);
  const out = (key: string): ShareWords => ({ key, tail, text: words(key, f, now.ended) + tail });
  switch (f.e) {
    case "started":
      return now.live ? { key: "started:text", tail: "", text: words("", f) } : null;
    case "share_err":
      return now.live ? null : { key: "share_err:text", tail: "", text: words("", f) };
    case "stopped_on_web":
      return now.live ? null : out("stopped:web");
    case "stopped_before_end":
      return now.live ? null : out("stopped:before_end");
    case "share_stopped":
      return now.live ? null : out("stopped:share_refused");
    case "upload_refused":
      return now.live ? null : out("stopped:refused");
    case "changed":
      // An older build's notice: what it said may no longer hold, so never its words. Live, or stopped for good, it is
      // told as changed (true whenever shown); ended at a sign-out or a lost workspace, as such an end is told (held
      // back while the ended shares are unread). E2E-AGENT cycle 13 C13-1.
      if (now.live) return out("changed:live");
      if (now.ended !== "device_signed_out" && now.ended !== "access_lost") return out("changed:other");
  }
  // A share that a sign-out or a lost workspace ended (or the server, the same ways): its words follow this machine's
  // sign-in and reach now. A share stopped for good since, or shared again, has a newer event or nothing to tell.
  if (now.live || (now.ended !== "device_signed_out" && now.ended !== "access_lost")) return null;
  // Signed in again, but its person may have stopped it on the web: nothing until the ended shares are read.
  if (sitNow === "hold") return "hold";
  const sit = sitNow;
  if (prev && situation(prev.key) === sit) return out(prev.key);
  const was = prev ? situation(prev.key) : null;
  // Ended by a new `align login` that replaced this machine's pairing, and this machine has not signed out since: never
  // "signed out" or "signed in again" (cycle 12, section 6; C14-1). Told the sign-out's words before, it did sign out.
  const relogin = f.via === "login" && !f.out_since && now.ended === "device_signed_out" && was !== "out";
  if (sit === "out") return out(now.ended === "device_signed_out" ? (f.unsent ? "out:signed_out_unsent" : "out:signed_out") : "out:signed_out_ended");
  if (sit === "reshare") {
    if (!prev && f.e === "removed") return out("reshare:removed");
    if (!prev && f.e === "server_signed_out") return out("reshare:server_signed_out");
    // Told this sign-in does not reach its workspace: what changed is the reach (a workspace given back on the Devices
    // page or at a re-invite), not the sign-in (cycle 12, section 6).
    if (was === "noreach") return out("reshare:workspace_back");
    if (relogin) return out("reshare:relogin");
    return out(now.ended === "device_signed_out" || was === "out" ? "reshare:signed_in" : "reshare:workspace_back");
  }
  // Out of its workspace because its person is no longer a member: the removal is named, not this sign-in's reach, so
  // nobody signs in again hoping to tick it (E2E-AGENT cycle 13, section 5).
  const removed = now.member === false;
  if (relogin && was !== "reshare") return out(removed ? "noreach:relogin_removed" : "noreach:relogin_noreach");
  if (removed && now.ended === "device_signed_out") return out(was === "reshare" ? "noreach:removed_again" : "noreach:signed_in_removed");
  // Told it could be shared again after a replacing `align login`, now out of reach: the reach changed, never "signed in
  // again" (C14-1).
  if (relogin) return out("noreach:reach_lost");
  if (now.ended === "device_signed_out" || (was === "out" && now.signed_in)) return out(removed ? "noreach:signed_in_removed" : "noreach:signed_in_noreach");
  return out(was === "reshare" ? "noreach:access_lost_again" : "noreach:access_lost");
}

/** Tell the notice `w` now, after `told`: when it is about a newer event (`fresh`), or its situation changed since, or
 *  its latch sentence changed while it still blocks (a re-pairing took the release away, say). A notice an older build
 *  stored (`changed`) is about no event of its own: told only when the situation differs from the one the session was
 *  last told (or it was told none), or its latch sentence changed while it still blocks (E2E-AGENT cycle 14 C14-1). */
export function shareRetell(id: string, w: ShareWords, told: ShareTold | null, fresh: boolean, changed = false): boolean {
  if (changed) return !told || toldSituation(told.key) === null || toldSituation(told.key) !== toldSituation(w.key) || (!!w.tail && w.tail !== told.tail);
  if (fresh || !told || told.id !== id) return fresh;
  return situation(told.key) !== situation(w.key) || (!!w.tail && w.tail !== told.tail);
}

/**
 * Why a share ended, as the deny and `align latch status` (`brief`) say it, worded in one place: `again`, it can be
 * shared there again now; `relogin`, a new `align login` that replaced this machine's pairing ended it while this machine
 * is signed in, so never that it signed out, as its notice says (E2E-AGENT cycle 13, section 5).
 */
export function endedWhyWords(why: NonNullable<ShareNow["ended"]>, again: boolean, relogin = false, brief = false): string {
  if (why === "device_signed_out" && relogin) return "a new sign-in on this machine (`align login`) ended its share from the earlier sign-in";
  const out = brief ? "this machine signed out" : "this machine signed out of Align";
  if (why === "device_signed_out") return again ? `${out}, and is signed in again now` : out;
  if (why === "access_lost") return again ? "this machine lost access to its Align workspace, and can reach it again now" : "this machine no longer has access to its Align workspace";
  return "the Align server no longer has this session's share";
}
