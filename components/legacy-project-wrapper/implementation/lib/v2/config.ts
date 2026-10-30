// v2 settings, read from the environment only. Nothing here touches the database, so lib/config.ts and proxy.ts can
// import it without opening anything. v2 (/app, /api/v2) is always on, in Mode L and hosted.

const hostedEnv = (env: NodeJS.ProcessEnv) => env.HOSTED === "1";

/** The local test identity provider (email + password sign-up). ALIGN_TEST_IDP=1, never when hosted. */
export const testIdpEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ALIGN_TEST_IDP === "1" && !hostedEnv(env);

export const googleConfigured = (env: NodeJS.ProcessEnv = process.env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const githubConfigured = (env: NodeJS.ProcessEnv = process.env) => !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

const EMAIL_KEYS = ["ALIGN_EMAIL_API_URL", "ALIGN_EMAIL_API_KEY", "ALIGN_EMAIL_FROM"] as const;

/** The hosted email API settings: all three set and the URL https (checked at startup by v2Problems). */
export function emailApi(env: NodeJS.ProcessEnv = process.env): { url: string; key: string; from: string } | null {
  if (!EMAIL_KEYS.every((k) => env[k])) return null;
  try {
    if (new URL(env.ALIGN_EMAIL_API_URL!).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: env.ALIGN_EMAIL_API_URL!, key: env.ALIGN_EMAIL_API_KEY!, from: env.ALIGN_EMAIL_FROM! };
}

/** Email one-time-code sign-in: always in Mode L (the code is printed), hosted only with the email API settings. */
export const emailSignInEnabled = (env: NodeJS.ProcessEnv = process.env) => !hostedEnv(env) || !!emailApi(env);

/** The Mode L local owner's email (lib/v2/local-owner.ts). */
export const localOwnerEmail = (env: NodeJS.ProcessEnv = process.env) => (env.ALIGN_LOCAL_OWNER_EMAIL || "owner@align.localhost").trim().toLowerCase();

/** How old a sign-in may be to approve a device or an MCP app: 15 minutes. */
export const RECENT_SIGN_IN_MS = 15 * 60 * 1000;

const list = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/** The v2 part of hostedProblems(): Better Auth's secret, the public origin, and a way to sign in. */
export function v2Problems(env: NodeJS.ProcessEnv = process.env): string[] {
  const p: string[] = [];
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) p.push("BETTER_AUTH_SECRET must be set (32+ characters)");
  const origin = env.ALIGN_PUBLIC_ORIGIN ?? "";
  let url: URL | null = null;
  try {
    url = new URL(origin);
  } catch {}
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    p.push("ALIGN_PUBLIC_ORIGIN must be an https origin (https://host)");
  } else if (!list(env.ALIGN_HOSTS).includes(url.hostname.toLowerCase())) {
    p.push("ALIGN_PUBLIC_ORIGIN's host must be listed in ALIGN_HOSTS");
  }
  // Sign-in: the email API (all three settings, https), or Google, or GitHub. Each provider is optional.
  const emailSet = EMAIL_KEYS.filter((k) => env[k]);
  if (emailSet.length && emailSet.length < EMAIL_KEYS.length) p.push(`Set all of ${EMAIL_KEYS.join(", ")} or none (missing ${EMAIL_KEYS.filter((k) => !env[k]).join(", ")})`);
  if (env.ALIGN_EMAIL_API_URL) {
    let u: URL | null = null;
    try {
      u = new URL(env.ALIGN_EMAIL_API_URL);
    } catch {}
    if (!u || u.protocol !== "https:") p.push("ALIGN_EMAIL_API_URL must be an https URL");
  }
  for (const [id, sec] of [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ]) {
    if (!!env[id] !== !!env[sec]) p.push(`${id} and ${sec} must be set together`);
  }
  if (!emailSet.length && !googleConfigured(env) && !githubConfigured(env)) {
    p.push("Sign-in needs the email settings (ALIGN_EMAIL_API_URL, ALIGN_EMAIL_API_KEY, ALIGN_EMAIL_FROM) or a Google or GitHub client (id and secret)");
  }
  if (env.ALIGN_TEST_IDP) p.push("ALIGN_TEST_IDP is not allowed when hosted");
  if (env.ALIGN_LOCAL_OWNER_EMAIL) p.push("ALIGN_LOCAL_OWNER_EMAIL is not allowed when hosted (Mode L only)");
  return p;
}

/** The public origin when hosted (validated by v2Problems), else null. */
export function publicOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!hostedEnv(env) || !env.ALIGN_PUBLIC_ORIGIN) return null;
  try {
    return new URL(env.ALIGN_PUBLIC_ORIGIN).origin;
  } catch {
    return null;
  }
}
