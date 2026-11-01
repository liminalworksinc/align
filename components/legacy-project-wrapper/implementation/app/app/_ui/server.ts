import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { passkeyPromptDue } from "@/lib/v2/account";
import { getAuth, passkeyParty } from "@/lib/v2/auth";
import { config } from "@/lib/config";
import { creationMode, emailSignInEnabled, githubConfigured, googleConfigured, testIdpEnabled, turnstile } from "@/lib/v2/config";
import { needsCode } from "@/lib/v2/creation";
import { ready } from "@/lib/v2/init";
import { memberPrincipal } from "@/lib/v2/workspaces";

// Server-side session reads for /app pages. Call only inside a <Suspense> boundary (cacheComponents): headers()
// is read first, so nothing here (the database included) runs while a page's static shell is prerendered.

export interface Me {
  id: string;
  name: string;
  email: string;
  /** When this session signed in (ISO): sensitive actions need a recent sign-in. */
  signedInAt: string;
  /** Offer to add a passkey: the person has none, has not said "Not now", and this page is on the passkey host. */
  passkeyPrompt: boolean;
}

export async function currentUser(): Promise<Me | null> {
  const h = await headers();
  // Rendering waits for the request here: the session read below checks times (Date.now), which Next refuses while
  // it prerenders a page's shell (it logged "encountered the unstable value Date.now()" for /app and /app/sign-in).
  await connection();
  await ready();
  const s = await getAuth().api.getSession({ headers: h });
  if (!s?.user) return null;
  // The passkey prompt only where a passkey can work: on the passkey host (Mode L: localhost, not 127.0.0.1, where the
  // README's link points). The Account page says where passkeys work.
  const onPasskeyHost = (h.get("host") ?? "").replace(/:\d+$/, "").toLowerCase() === passkeyParty().rpID;
  return { id: s.user.id, name: s.user.name, email: s.user.email, signedInAt: new Date(s.session.createdAt).toISOString(), passkeyPrompt: onPasskeyHost && passkeyPromptDue(s.user.id) };
}

/** The signed-in user, or a redirect to sign-in that comes back to `next`. */
export async function requireUser(next: string): Promise<Me> {
  const u = await currentUser();
  if (!u) redirect(`/app/sign-in?next=${encodeURIComponent(next)}`);
  return u;
}

/** Whether this person is a member of this live workspace (not deleted, not removed). Workspace pages show "This
 *  workspace doesn't exist or you're not in it" otherwise, as the API answers 404 (never which of the two). */
export async function inWorkspace(me: Me, ws: string): Promise<boolean> {
  await ready();
  return memberPrincipal(ws, me.id).wsRole !== null;
}

export interface SignInOptions {
  google: boolean;
  github: boolean;
  email: boolean;
  testIdp: boolean;
  /** Mode L: codes are printed, not emailed. */
  local: boolean;
  /** The passkey relying party: passkeys work only on a page served from this host (localhost in Mode L). */
  passkeyHost: string;
  /** Where passkeys work, for the hint shown on any other host (Mode L at 127.0.0.1). */
  passkeyOrigin: string;
  /** The Turnstile site key when the bot check is on (hosted, both keys set), else null. */
  captchaSiteKey: string | null;
  /** Hosted with ALIGN_CREATION=codes: link to /app/request-access. */
  requestAccess: boolean;
}

export function signInOptions(): SignInOptions {
  const party = passkeyParty();
  return {
    google: googleConfigured(),
    github: githubConfigured(),
    email: emailSignInEnabled(),
    testIdp: testIdpEnabled(),
    local: !config().hosted,
    passkeyHost: party.rpID,
    passkeyOrigin: party.origin,
    captchaSiteKey: turnstile()?.siteKey ?? null,
    requestAccess: creationMode() === "codes",
  };
}

/** What the create-workspace forms on /app need (lib/v2/creation.ts). Mode L: no code, never closed, no captcha. */
export interface CreationOptions {
  /** This person must enter a creation code (hosted, codes mode, not the first owner's first workspace). */
  needsCode: boolean;
  closed: boolean;
  captchaSiteKey: string | null;
}

export async function creationOptions(me: Me): Promise<CreationOptions> {
  await ready();
  return { needsCode: needsCode(me.email), closed: creationMode() === "closed", captchaSiteKey: turnstile()?.siteKey ?? null };
}

/** Only an /app path or an AI app's consent request (/oauth/authorize?...) is followed after sign-in; anything else
 *  (another origin, a backslash or whitespace trick) is /app. */
export function safeNext(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || /[\\\s]/.test(s)) return "/app";
  return /^\/(?:app(?:[/?#]|$)|oauth\/authorize\?)/.test(s) ? s : "/app";
}

/** The first value of a query parameter. */
export const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
