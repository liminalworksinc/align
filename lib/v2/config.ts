// Goal sessions switches, read from the environment only. Nothing here touches the database, so lib/config.ts and
// proxy.ts can import it without opening anything.

/** ALIGN_GOAL_SESSIONS=1 turns on /app, /app/* and /api/v2/*. Unset, every one of them is 404 (proxy.ts). */
export const v2Enabled = (env: NodeJS.ProcessEnv = process.env) => env.ALIGN_GOAL_SESSIONS === "1";

/** The local test identity provider (email + password sign-up). Never when hosted, whatever the variable says. */
export const testIdpEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ALIGN_GOAL_SESSIONS_TEST_IDP === "1" && env.HOSTED !== "1";

const list = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/** The v2 part of hostedProblems(): empty unless ALIGN_GOAL_SESSIONS=1. */
export function v2Problems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!v2Enabled(env)) return [];
  const p: string[] = [];
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) p.push("BETTER_AUTH_SECRET must be set (32+ characters) when ALIGN_GOAL_SESSIONS=1");
  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]) {
    if (!env[k]) p.push(`${k} must be set when ALIGN_GOAL_SESSIONS=1`);
  }
  const origin = env.ALIGN_PUBLIC_ORIGIN ?? "";
  let url: URL | null = null;
  try {
    url = new URL(origin);
  } catch {}
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    p.push("ALIGN_PUBLIC_ORIGIN must be an https origin (https://host) when ALIGN_GOAL_SESSIONS=1");
  } else if (!list(env.ALIGN_HOSTS).includes(url.hostname.toLowerCase())) {
    p.push("ALIGN_PUBLIC_ORIGIN's host must be listed in ALIGN_HOSTS");
  }
  if (env.ALIGN_GOAL_SESSIONS_TEST_IDP) p.push("ALIGN_GOAL_SESSIONS_TEST_IDP is not allowed when hosted");
  return p;
}

/** The public origin when hosted (validated by v2Problems), else null. */
export function publicOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.HOSTED !== "1" || !env.ALIGN_PUBLIC_ORIGIN) return null;
  try {
    return new URL(env.ALIGN_PUBLIC_ORIGIN).origin;
  } catch {
    return null;
  }
}
