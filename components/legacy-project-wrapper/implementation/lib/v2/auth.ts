import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config } from "../config";
import { publicOrigin, testIdpEnabled } from "./config";
import { authDb, dbDir } from "./db";
import { rand32 } from "./ids";

// Authentication only (who you are): Better Auth 1.7.7, mounted at /api/v2/auth. Authorization (what you may do)
// is ours, in lib/v2/policy.ts. Google and GitHub sign-in from the environment; no automatic account linking by
// email. ALIGN_GOAL_SESSIONS_TEST_IDP=1 (never when hosted) adds email + password so the flow can be tested without OAuth apps.

export const AUTH_BASE_PATH = "/api/v2/auth";
/** Cookie prefix: Better Auth's session cookie is align_v2.session_token (__Secure- when hosted), never align_session. */
export const COOKIE_PREFIX = "align_v2";

function secret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (config().hosted) throw new Error("BETTER_AUTH_SECRET must be set when hosted"); // hostedProblems refuses first
  const file = path.join(dbDir(), ".auth-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  chmodSync(file, 0o600);
  return readFileSync(file, "utf8").trim();
}

export function authOptions(): BetterAuthOptions {
  const hosted = config().hosted;
  const origin = publicOrigin();
  const social: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    social.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    social.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"];
  return {
    appName: "Align",
    database: authDb(),
    basePath: AUTH_BASE_PATH,
    secret: secret(),
    // Hosted: the one public origin. Mode L: whatever loopback host and port this server answers on.
    baseURL: hosted && origin ? origin : { allowedHosts: loopback.flatMap((h) => [h, `${h}:*`]), protocol: "http" },
    trustedOrigins: hosted && origin ? [origin] : loopback.map((h) => `http://${h}:*`),
    socialProviders: social,
    emailAndPassword: { enabled: testIdpEnabled() && !hosted, autoSignIn: true, minPasswordLength: 8, maxPasswordLength: 128 },
    account: { modelName: "ba_account", accountLinking: { enabled: false, disableImplicitLinking: true } },
    user: { modelName: "ba_user" },
    session: { modelName: "ba_session" },
    verification: { modelName: "ba_verification" },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "memory",
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 20 },
      },
    },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: hosted,
      // Fly's edge sets Fly-Client-IP (proxy.ts refuses hosted requests without it). Mode L has one client.
      ipAddress: hosted ? { ipAddressHeaders: ["fly-client-ip"] } : { disableIpTracking: true },
      database: { generateId: ({ model }) => (/user$/.test(model) ? `u_${rand32(15)}` : rand32(20)) },
    },
    logger: { level: "error" },
  } satisfies BetterAuthOptions;
}

type Auth = ReturnType<typeof betterAuth>;
const g = globalThis as unknown as { __alignV2Auth?: Auth };

export function getAuth(): Auth {
  return (g.__alignV2Auth ??= betterAuth(authOptions()));
}

/** Better Auth's own tables (ba_user, ba_session, ba_account, ba_verification), via its programmatic migrations. */
export async function migrateAuth() {
  const { runMigrations } = await getMigrations(authOptions());
  await runMigrations();
}
