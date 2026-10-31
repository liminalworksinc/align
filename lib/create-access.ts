import { timingSafeEqual } from "node:crypto";
import { BAD_INVITE, BAD_SIGNUP_CODE, CREATION_CLOSED } from "./codes";
import { config } from "./config";
import { checkCodeFailures, recordCodeFailure } from "./ratelimit";
import { HttpError } from "./store";
import { inviteUnused } from "./workspace";

function codeMatches(given: string | null | undefined, expected: string | null) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The code that lets a person create a workspace, checked the same way for creating it (POST /api/workspaces) and
 * for the intake interview that drafts it (POST /api/workspaces/interview). Access comes from config only: open
 * create (serve.sh, loopback), a single-use invite code (ALIGN_SIGNUP_CODES, required when hosted), or Mode L's
 * shared signup code. Wrong codes are limited per client. Read-only: it never spends an invite; createWorkspace does,
 * under the creation lock. Returns the matching invite (undefined for open create or the shared code).
 */
export async function checkCreateCode(client: string, given: string | null | undefined): Promise<string | undefined> {
  const cfg = config();
  if (cfg.allowOpenCreate) return undefined;
  checkCodeFailures(client);
  const invite = cfg.signupCodes.find((c) => codeMatches(given, c));
  const ok = invite !== undefined ? await inviteUnused(invite) : codeMatches(given, cfg.signupCode);
  if (!ok) {
    recordCodeFailure(client);
    // Invites: one message for wrong and spent, so the answer never confirms that a guessed code is real.
    if (cfg.signupCodes.length) throw new HttpError(403, BAD_INVITE);
    throw new HttpError(403, cfg.signupCode ? BAD_SIGNUP_CODE : CREATION_CLOSED);
  }
  return invite;
}
