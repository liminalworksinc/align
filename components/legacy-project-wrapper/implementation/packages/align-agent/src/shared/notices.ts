// Which notices are about a session's share state. Hook-safe: no imports.

/** Notices about whether this session is shared (started, refused, ended, or this machine signed in again or its lost
 *  workspace back so it can be shared there again): only the newest of them still holds (C5-3, C7-2). A workspace this
 *  device reaches for the first time is not one: it says nothing about this session's own share, so a notice that its
 *  share ended is still told next to it. */
export const SHARE_STATE_NOTICES = ["share_started_", "share_err_", "upload_refused_", "server_stopped_", "signed_out_", "signed_in_", "access_lost_", "workspace_back_"];

/** A notice's kind: its id without the `<local id>/` it is stored under. */
export const noticeKind = (id: string): string => id.slice(id.indexOf("/") + 1);

export const isShareStateNotice = (kind: string): boolean => SHARE_STATE_NOTICES.some((k) => kind.startsWith(k));

/** Share-state notices that tell the session `::align share` shares it again now (signed in again and reaching its
 *  workspace, its workspace back, a member again): a sign-out or a workspace lost again makes them untrue, so the
 *  session is told the notice for the new state, whatever it has seen (C8-1). */
const RESHARE_NOW = ["signed_in_", "workspace_back_", "upload_refused_signed_out_", "access_lost_rejoined_"];

export const offersReshare = (kind: string | null): boolean => !!kind && !kind.startsWith("signed_in_noreach_") && RESHARE_NOW.some((k) => kind.startsWith(k));
