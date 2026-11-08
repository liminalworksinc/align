// Typed public names for the independently qualified envelope library.
import * as native from "../native/.bindings/agent_envelope.js";

// The way out of a stop latch or goal hold whose share ended, in one place: the deny the model reads and every notice
// the user reads about a share that ended are built from it, so they never give different advice (E2E-AGENT cycle 9
// C9-2). Used by hooks and user notices.
/**
 * A goal hold whose release still reaches the session although its share ended: its sharing was stopped (Stop sharing
 * on the web, say) while this device held it, so the server still sends the goal's release here (E2E-AGENT cycle 10
 * C10-4). `goals`: the held goals' titles; `stopped`: a stop latch blocks it too, which nothing from the web lifts now.
 */
export interface ReleaseReaches {
    goals: string[];
    stopped: boolean;
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
    /** The prior share ended because this device lost workspace access. */
    lost?: boolean;
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
    e: "started" // shared (a spooled `::align share` applied): `text`
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
    /** A workspace stop remains in force after sharing ends. */
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
/** The situations a session can be told its share is in: live, stopped for good, signed out, shareable again, out of
 *  reach. A notice is told again only when the session's situation differs from the one it was last told. */
type Situation = "live" | "stopped" | "out" | "reshare" | "noreach";

const values = native.ended_data() as {
    STOP_HOLDS_NO_SHARE: "this session was stopped from its Align workspace, and that stop holds after its sharing stopped or its shared history was deleted, so it is not shared again and it stays stopped. A new session is not stopped.";
    SHARE_CHANGED: "Align: this session's sharing changed; run `align sessions` in a terminal for what it is now, and `align latch status` if its tools are blocked.";
};

export const SHARE_CHANGED = values.SHARE_CHANGED;
export const STOP_HOLDS_NO_SHARE = values.STOP_HOLDS_NO_SHARE;

export const shareAgainWords = native.share_again_words as (unread: boolean, where: string, there?: boolean, unsent?: boolean) => string;
export const latchWayOut = native.latch_way_out as (lid: string, reshare: boolean, reader: "model" | "user", release?: ReleaseReaches | null, again?: ShareAgain, stop?: boolean) => string;
export const latchNoticeTail = native.latch_notice_tail as (lid: string, reshare: boolean, release?: ReleaseReaches | null, again?: ShareAgain, stop?: boolean) => string;
export const neverSentWords = native.never_sent_words as (when: string) => string;
export const storedText = native.stored_text as (f: ShareFacts) => string;
export const stateSituation = native.state_situation as (now: ShareNow) => Situation | "hold";
export const toldSituation = native.told_situation as (key: string) => Situation | null;
export const noneTold = native.none_told as (id: string, now: ShareNow) => ShareTold;
export const shareNotice = native.share_notice as (lid: string, id: string, f: ShareFacts, now: ShareNow, told: ShareTold | null, toldFacts?: ShareFacts | null) => ShareWords | "hold" | null;
export const shareRetell = native.share_retell as (id: string, w: ShareWords, told: ShareTold | null, fresh: boolean, changed?: boolean) => boolean;
export const endedWhyWords = native.ended_why_words as (why: NonNullable<ShareNow["ended"]>, again: boolean, relogin?: boolean, brief?: boolean) => string;
