import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/v2/auth";
import { config } from "@/lib/config";
import { emailSignInEnabled, githubConfigured, googleConfigured, testIdpEnabled } from "@/lib/v2/config";
import { ready } from "@/lib/v2/init";

// Server-side session reads for /app pages. Call only inside a <Suspense> boundary (cacheComponents): headers()
// is read first, so nothing here (the database included) runs while a page's static shell is prerendered.

export interface Me {
  id: string;
  name: string;
  email: string;
  /** When this session signed in (ISO): approving a device needs a recent sign-in. */
  signedInAt: string;
}

export async function currentUser(): Promise<Me | null> {
  const h = await headers();
  await ready();
  const s = await getAuth().api.getSession({ headers: h });
  return s?.user ? { id: s.user.id, name: s.user.name, email: s.user.email, signedInAt: new Date(s.session.createdAt).toISOString() } : null;
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
}

export function signInOptions(): SignInOptions {
  return { google: googleConfigured(), github: githubConfigured(), email: emailSignInEnabled(), testIdp: testIdpEnabled(), local: !config().hosted };
}

/** Only an /app path or the OAuth consent page (/oauth/authorize?...) is followed after sign-in; anything else is /app. */
export function safeNext(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || s.includes("\\")) return "/app";
  return /^\/app(?:[/?#]|$)/.test(s) || /^\/oauth\/authorize(?:[?#]|$)/.test(s) ? s : "/app";
}

/** The first value of a query parameter. */
export const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
