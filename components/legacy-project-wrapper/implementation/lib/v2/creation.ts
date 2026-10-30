import { config } from "../config";
import { secret } from "../secret";
import { requireCaptcha } from "./captcha";
import { caps, creationMode } from "./config";
import { CODE_RE, redeemCreationCode } from "./core.mts";
import { get, sql } from "./db";
import { refuseDisposable } from "./disposable";
import { V2Error, forbidden } from "./errors";

// Who may create a hosted workspace (PRESEED-002) and the hosted caps (PRESEED-003). Mode L skips all of it: one person
// on their own machine creates what they like.
//   ALIGN_CREATION=codes (default): a creation code (lib/v2/core.mts), single-use, redeemed in the same transaction as
//     the workspace; the one exception is ALIGN_FIRST_OWNER_EMAIL's first workspace on a server that has none.
//   ALIGN_CREATION=open: any signed-in person. ALIGN_CREATION=closed: nobody (the kill switch).
//   Caps: ALIGN_MAX_WORKSPACES on the server, ALIGN_MAX_OWNED_WORKSPACES per person, ALIGN_MAX_MEMBERS per workspace
//     (pending invites count), ALIGN_MAX_SESSIONS_PER_DEVICE_DAY (lib/v2/sessions.ts). Each refusal is 403 and says
//     to contact the operator.
//   A disposable email address can't create (lib/v2/disposable.ts), and the Turnstile check (lib/v2/captcha.ts)
//   applies when its keys are set.

const RAISE = "Contact the operator of this Align server to raise it.";

export interface Creator {
  id: string;
  email: string;
  emailVerified: boolean;
}

const firstOwnerEmail = () => (process.env.ALIGN_FIRST_OWNER_EMAIL || "").trim().toLowerCase();

/** Hosted, `codes` mode: does this person need a code? Not for the first owner's first workspace on an empty server. */
export function needsCode(email: string): boolean {
  if (creationMode() !== "codes") return false;
  const first = firstOwnerEmail();
  return !(first && first === email.toLowerCase() && !get("SELECT 1 AS x FROM v2_workspaces LIMIT 1"));
}

/** The checks that need no transaction-held state beyond counts: the mode, the caps and the address. Run before the
 *  captcha (so a refused request costs no verify call) and again inside the creating transaction. */
function check(user: Creator, code: string | null) {
  if (!config().hosted) return;
  if (creationMode() === "closed") throw forbidden("creation_closed", "New workspaces can't be created on this server right now. Contact its operator.");
  const c = caps()!;
  const total = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_workspaces")?.n ?? 0;
  if (total >= c.workspaces) throw forbidden("workspace_cap", `This server has reached its limit of ${c.workspaces} workspaces. ${RAISE}`);
  const owned = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_members WHERE user_id = ? AND role = 'owner'", user.id)?.n ?? 0;
  if (owned >= c.owned) throw forbidden("owned_workspace_cap", `You already own ${owned} workspace${owned === 1 ? "" : "s"}, the limit for one account here. ${RAISE}`);
  refuseDisposable(user.email);
  if (needsCode(user.email) && !code) throw forbidden("creation_code_required", "Creating a workspace here needs a creation code. Request access to get one.");
}

const invalid = () => forbidden("creation_code_invalid", "That creation code isn't valid. It may be mistyped, used, expired, revoked or for another email address.");

/** Before creating: everything but the code's redemption, including the captcha. Throws the refusal. */
export async function precheckCreation(req: Request, user: Creator, code: string | null) {
  check(user, code);
  if (!config().hosted) return;
  if (code !== null && !CODE_RE.test(code)) throw invalid();
  await requireCaptcha(req);
}

/** Inside the creating transaction: the checks again, then the code is spent for `wsId` (if this person needs one). */
export function admitCreation(user: Creator, code: string | null, wsId: string) {
  check(user, code);
  if (!config().hosted || !needsCode(user.email)) return;
  // A code bound to an email address is only for that address, verified by its sign-in method.
  if (!redeemCreationCode(sql, secret(), code!, user.emailVerified ? user.email : "", user.id, wsId)) throw invalid();
}

/** Members stay within ALIGN_MAX_MEMBERS (hosted). A new invite needs room beside the members and every open invite
 *  (`countInvites`); accepting one turns an open invite into a member, so it needs room beside the members only. */
export function checkMemberCap(wsId: string, countInvites: boolean) {
  const c = caps();
  if (!c) return;
  const now = new Date().toISOString();
  const members = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ?", wsId)?.n ?? 0;
  const pending = countInvites ? (get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_invites WHERE ws_id = ? AND accepted_at IS NULL AND expires_at > ?", wsId, now)?.n ?? 0) : 0;
  if (members + pending >= c.members) throw forbidden("member_cap", `This workspace has reached its limit of ${c.members} members, counting open invites. ${RAISE}`);
}

/** New shared sessions per device in any 24 hours (hosted). */
export function sessionCapError(max: number) {
  return new V2Error(403, "session_cap", `This device has shared ${max} new sessions in the last 24 hours, the limit here. ${RAISE}`);
}
