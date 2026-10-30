// v2 settings, read from the environment only. Nothing here touches the database (lib/v2/core.mts, imported for the
// settings it shares with the operator script, opens nothing either), so lib/config.ts and proxy.ts can import it
// without opening anything. v2 (/app, /api/v2) is always on, in Mode L and hosted.

import { sessionMaxDays, testIdpEnabled, validMaxDays } from "./core.mts";

export { sessionMaxDays, testIdpEnabled };

const hostedEnv = (env: NodeJS.ProcessEnv) => env.HOSTED === "1";

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

/** How old a sign-in may be for a sensitive action (approving a device or an MCP app, role changes, removal,
 *  workspace deletion, passkeys, linking, signing out everywhere): 15 minutes. */
export const RECENT_SIGN_IN_MS = 15 * 60 * 1000;

// The absolute session cap (ALIGN_SESSION_MAX_DAYS: sessionMaxDays, validMaxDays) and the test identity provider
// switch live in lib/v2/core.mts, so the operator script reads them exactly as the server does.

// ---- hosted creation gate and abuse controls (PRESEED-002, PRESEED-003). Mode L ignores every one of these. ----

export type CreationMode = "codes" | "open" | "closed";
const CREATION_MODES: readonly CreationMode[] = ["codes", "open", "closed"];

/** Who may create a hosted workspace: ALIGN_CREATION = codes (default: a creation code), open (any signed-in person)
 *  or closed (nobody: the kill switch). Mode L is always open. */
export function creationMode(env: NodeJS.ProcessEnv = process.env): CreationMode {
  if (!hostedEnv(env)) return "open";
  const v = (env.ALIGN_CREATION || "codes").trim().toLowerCase() as CreationMode;
  return CREATION_MODES.includes(v) ? v : "closed"; // startup refuses an unknown value; fail closed regardless
}

/** The hosted caps, each a positive integer from its setting or the default; null (no cap) in Mode L. */
export interface Caps {
  /** ALIGN_MAX_WORKSPACES: workspaces on the server. */
  workspaces: number;
  /** ALIGN_MAX_OWNED_WORKSPACES: workspaces one person owns. */
  owned: number;
  /** ALIGN_MAX_MEMBERS: members of one workspace, pending invites included. */
  members: number;
  /** ALIGN_MAX_SESSIONS_PER_DEVICE_DAY: new shared sessions per device in any 24 hours. */
  sessionsPerDeviceDay: number;
}
const CAP_KEYS: [keyof Caps, string, number][] = [
  ["workspaces", "ALIGN_MAX_WORKSPACES", 100],
  ["owned", "ALIGN_MAX_OWNED_WORKSPACES", 2],
  ["members", "ALIGN_MAX_MEMBERS", 25],
  ["sessionsPerDeviceDay", "ALIGN_MAX_SESSIONS_PER_DEVICE_DAY", 500],
];
const posInt = (v: string | undefined) => (v !== undefined && /^\s*[1-9]\d{0,8}\s*$/.test(v) ? Number(v) : null);

export function caps(env: NodeJS.ProcessEnv = process.env): Caps | null {
  if (!hostedEnv(env)) return null;
  return Object.fromEntries(CAP_KEYS.map(([k, name, def]) => [k, posInt(env[name]) ?? def])) as unknown as Caps;
}

/** Cloudflare Turnstile, hosted only and only when both keys are set. `verifyUrl` is ALIGN_TURNSTILE_VERIFY_URL (for
 *  tests; https, checked at startup) or Cloudflare's own. */
export function turnstile(env: NodeJS.ProcessEnv = process.env): { siteKey: string; secretKey: string; verifyUrl: string } | null {
  if (!hostedEnv(env) || !env.ALIGN_TURNSTILE_SITE_KEY || !env.ALIGN_TURNSTILE_SECRET_KEY) return null;
  return {
    siteKey: env.ALIGN_TURNSTILE_SITE_KEY,
    secretKey: env.ALIGN_TURNSTILE_SECRET_KEY,
    verifyUrl: env.ALIGN_TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  };
}

/** The hosted creation and abuse settings' own problems (part of v2Problems). */
function gateProblems(env: NodeJS.ProcessEnv): string[] {
  const p: string[] = [];
  if (env.ALIGN_CREATION && !CREATION_MODES.includes(env.ALIGN_CREATION.trim().toLowerCase() as CreationMode)) p.push("ALIGN_CREATION must be codes, open or closed");
  for (const [, name] of CAP_KEYS) if (env[name] !== undefined && env[name] !== "" && posInt(env[name]) === null) p.push(`${name} must be a positive whole number`);
  if (!!env.ALIGN_TURNSTILE_SITE_KEY !== !!env.ALIGN_TURNSTILE_SECRET_KEY) p.push("ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY must be set together");
  if (env.ALIGN_TURNSTILE_VERIFY_URL) {
    let u: URL | null = null;
    try {
      u = new URL(env.ALIGN_TURNSTILE_VERIFY_URL);
    } catch {}
    if (!u || u.protocol !== "https:") p.push("ALIGN_TURNSTILE_VERIFY_URL must be an https URL");
  }
  return p;
}

/** Hosted settings that are allowed but worth one line in the log at startup. */
export function v2Warnings(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!hostedEnv(env) || turnstile(env)) return [];
  return ["Warning: ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY are not set, so sign-in, access requests and workspace creation have no bot check."];
}

const list = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/** The v2 part of hostedProblems(): Better Auth's secret, the public origin, a way to sign in, and the creation and
 *  abuse settings. */
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
  const maxDays = (env.ALIGN_SESSION_MAX_DAYS ?? "").trim();
  if (maxDays && !validMaxDays(maxDays)) p.push("ALIGN_SESSION_MAX_DAYS must be a whole number of days from 1 to 365");
  if (env.ALIGN_TEST_IDP) p.push("ALIGN_TEST_IDP is not allowed when hosted");
  if (env.ALIGN_TEST_NOW) p.push("ALIGN_TEST_NOW is not allowed when hosted (tests only)");
  if (env.ALIGN_LOCAL_OWNER_EMAIL) p.push("ALIGN_LOCAL_OWNER_EMAIL is not allowed when hosted (Mode L only)");
  p.push(...gateProblems(env));
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
