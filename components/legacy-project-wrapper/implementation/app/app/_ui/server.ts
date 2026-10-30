import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/v2/auth";
import { testIdpEnabled } from "@/lib/v2/config";
import { ready } from "@/lib/v2/init";

// Server-side session reads for /app pages. Call only inside a <Suspense> boundary (cacheComponents): headers()
// is read first, so nothing here (the database included) runs while a page's static shell is prerendered.

export interface Me {
  id: string;
  name: string;
  email: string;
}

export async function currentUser(): Promise<Me | null> {
  const h = await headers();
  await ready();
  const s = await getAuth().api.getSession({ headers: h });
  return s?.user ? { id: s.user.id, name: s.user.name, email: s.user.email } : null;
}

/** The signed-in user, or a redirect to sign-in that comes back to `next`. */
export async function requireUser(next: string): Promise<Me> {
  const u = await currentUser();
  if (!u) redirect(`/app/sign-in?next=${encodeURIComponent(next)}`);
  return u;
}

export function signInOptions() {
  return {
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    testIdp: testIdpEnabled(),
  };
}

/** Only same-app paths, and an AI app's consent request (/oauth/authorize?...), are followed after sign-in. */
export function safeNext(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\/(?:app(?:[/?#]|$)|oauth\/authorize\?)/.test(s) && !s.startsWith("//") && !/[\\\s]/.test(s) ? s : "/app";
}
