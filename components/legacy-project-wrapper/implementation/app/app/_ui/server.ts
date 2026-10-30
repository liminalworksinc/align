import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { passkeyPromptDue } from "@/lib/v2/account";
import { getAuth, passkeyParty } from "@/lib/v2/auth";
import { config } from "@/lib/config";
import { creationMode, emailSignInEnabled, githubConfigured, googleConfigured, testIdpEnabled, turnstile } from "@/lib/v2/config";
import { needsCode } from "@/lib/v2/creation";
import { ready } from "@/lib/v2/init";

// Server-side session reads for /app pages. Call only inside a <Suspense> boundary (cacheComponents): headers()
// is read first, so nothing here (the database included) runs while a page's static shell is prerendered.

export interface Me {
  id: string;
  name: string;
  email: string;
  /** When this session signed in (ISO): sensitive actions need a recent sign-in. */
  signedInAt: string;
  /** Offer to add a passkey: the person has none and has not said "Not now". */
  passkeyPrompt: boolean;
}

export async function currentUser(): Promise<Me | null> {
  const h = await headers();
  await ready();
  const s = await getAuth().api.getSession({ headers: h });
  if (!s?.user) return null;
  return { id: s.user.id, name: s.user.name, email: s.user.email, signedInAt: new Date(s.session.createdAt).toISOString(), passkeyPrompt: passkeyPromptDue(s.user.id) };
}

/** The signed-in user, or a redirect to sign-in that comes back to `next`. */
export async function requireUser(next: string): Promise<Me> {
  const u = await currentUser();
  if (!u) redirect(`/app/sign-in?next=${encodeURIComponent(next)}`);
  return u;
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
