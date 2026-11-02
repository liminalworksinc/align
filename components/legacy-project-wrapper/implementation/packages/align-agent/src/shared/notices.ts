// Which notices are about a session's share state. Hook-safe: no imports.

/** Notices about whether this session is shared (started, refused, ended; `signed_in_` and `workspace_back_` are kinds
 *  an older agent stored): only the newest of them still holds (C5-3, C7-2), worded when shown (`shareNotice`, cycle
 *  11). A workspace this device reaches for the first time is not one: it says nothing about this session's own share. */
export const SHARE_STATE_NOTICES = ["share_started_", "share_err_", "upload_refused_", "server_stopped_", "signed_out_", "signed_in_", "access_lost_", "workspace_back_"];

/** A notice's kind: its id without the `<local id>/` it is stored under. */
export const noticeKind = (id: string): string => id.slice(id.indexOf("/") + 1);

export const isShareStateNotice = (kind: string): boolean => SHARE_STATE_NOTICES.some((k) => kind.startsWith(k));

/** The notice a stop lifted from the web leaves (a `resumed_` one). */
export const RESUMED_NOTICE = "Align: this session was resumed from its Align workspace, so its tools work again.";

/**
 * The words of a resume told while a goal hold still blocks the session's tools (the stop and the hold are independent,
 * and a resume never lifts a hold): the stop is lifted, but the hold on `held` (goal titles, cleaned; empty when its
 * hold file can't be read) still blocks them, for the user and for the model (E2E-AGENT cycle 10 C10-3).
 */
export function resumedButHeld(held: string[], reader: "user" | "model"): string {
  const q = held.map((t) => `"${t}"`);
  const which = q.length ? `the hold on ${reader === "model" ? "goal " : ""}${q.length > 1 ? `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}` : q[0]}` : "a goal hold";
  const verb = q.length > 1 ? "block" : "blocks";
  return reader === "user"
    ? `Align: this session was resumed from its Align workspace, so its stop is lifted, but ${which} still ${verb} its tools until it is released.`
    : `[Align] This session was resumed from its Align workspace, so the stop no longer blocks its tools, but ${which} still ${verb} them until it is released. Tell the user and wait for instructions.`;
}
