// Workspace-creation code refusals, shared by the server (app/api/workspaces, lib/workspace) and the /new form, so
// the form's field-level hint always recognises what the server says (Sean's #6 review: "invite code" vs /signup code/).
// No imports: scripts/test-tenancy.mjs loads this file directly.

/** Hosted invites: one message for a wrong code and a spent one, so the answer never confirms that a guessed code is real. */
export const BAD_INVITE = "That invite code isn’t valid or was already used";
/** Mode L's one shared signup code (ALIGN_SIGNUP_CODE). */
export const BAD_SIGNUP_CODE = "That signup code isn’t right";
/** Creation is off: no code would help, so this is not a field error. */
export const CREATION_CLOSED = "Workspace creation is closed";

/** True when a 403 from POST /api/workspaces is about the code the person typed (show it on the code field). */
export function isCodeRefusal(error: string | null | undefined): boolean {
  return !!error && /\b(?:signup|invite) code\b/i.test(error);
}
