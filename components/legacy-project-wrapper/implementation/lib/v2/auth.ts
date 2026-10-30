import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins";
import { config, hostAllowed } from "../config";
import { clientNet } from "../ratelimit";
import { signPayload } from "../secret";
import { captchaPlugin } from "./captcha";
import { emailSignInEnabled, githubConfigured, googleConfigured, publicOrigin, testIdpEnabled } from "./config";
import { liveCodeFor } from "./core.mts";
import { authDb, dbDir, get, sql, tx } from "./db";
import { rand32 } from "./ids";
import { durableCount, durableRoom, takeAll } from "./limits";
import { sendSignInCode } from "./mail";

// Authentication only (who you are): Better Auth, mounted at /api/v2/auth. Authorization (what you may do) is ours,
// in lib/v2/policy.ts. Sign-in methods:
//   - Google and GitHub, each only when its client id and secret are set;
//   - an emailed one-time code (emailOtp, type sign-in): always in Mode L (printed, lib/v2/mail.ts), hosted only with
//     the email API settings. 6 digits, 5 minutes, 3 attempts, stored hashed. Sends are limited to 3 per email per
//     10 minutes and 10 per client per hour and, hosted, 5 per email per hour (durable, keyed by an HMAC of the
//     address) and 3 per client per minute (Better Auth's limit, durable). The send answer never says whether an
//     account exists. A code signs in the account with that verified email; a new account is made only for a pending
//     invite, in Mode L, or (hosted) for an address with a usable creation code bound to it (lib/v2/creation.ts) or
//     for ALIGN_FIRST_OWNER_EMAIL while the server has no account. When Turnstile is on (lib/v2/captcha.ts), sending
//     and signing in with a code both need its token;
//   - ALIGN_TEST_IDP=1 (never when hosted) adds email + password so the flow can be tested without OAuth apps.
// Account linking is explicit only (/app/account); nothing is linked by a matching email.

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

const OTP_SEND = "/email-otp/send-verification-otp";
const OTP_SIGN_IN = "/sign-in/email-otp";
/** Shown when an email code is valid but no account may be made for its address. */
export const CANNOT_SIGN_IN = "This email can't sign in here yet. Ask a workspace owner to invite you.";
const otpIdentifier = (email: string) => `sign-in-otp-${email}`;
/** Better Auth's "hashed" OTP storage: base64url(SHA-256(code)), unpadded. */
const otpHash = (code: string) => createHash("sha256").update(code).digest("base64url");

/** The email plugin's other routes (password reset, email change, code checks) are not part of Align. */
const DISABLED_OTP_PATHS = [
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/forget-password/email-otp",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
];

/** May an email code create an account for this (normalized) address? */
function mayCreateByEmailCode(email: string): boolean {
  if (!config().hosted) return true;
  const now = new Date().toISOString();
  if (get("SELECT 1 AS x FROM v2_invites WHERE email = ? AND accepted_at IS NULL AND expires_at > ?", email, now)) return true;
  if (liveCodeFor(sql, email)) return true; // an approved access request (lib/v2/core.mts)
  const first = (process.env.ALIGN_FIRST_OWNER_EMAIL || "").trim().toLowerCase();
  return !!first && first === email && !get("SELECT 1 AS x FROM ba_user LIMIT 1");
}

/** The origin for the link in a code message: the public origin when hosted; in Mode L the loopback host the request
 *  came to (proxy.ts has checked it), or this server's own address for a code the server sends itself. */
function linkOrigin(headers: Headers | undefined): string {
  const pub = publicOrigin();
  if (pub) return pub;
  const host = headers?.get("host");
  return host && hostAllowed(host) ? `http://${host}` : `http://127.0.0.1:${process.env.PORT || "3100"}`;
}

const tooMany = () => new APIError("TOO_MANY_REQUESTS", { code: "rate_limited", message: "Too many codes were sent. Wait a few minutes, then try again." });

/** Before every Better Auth request (and server-side api call): email-code send limits, and the unverified-email
 *  refusal. Anything else passes untouched. */
const beforeHook = createAuthMiddleware(async (ctx) => {
  const body = (ctx.body ?? {}) as { email?: unknown; type?: unknown; otp?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (ctx.path === OTP_SEND) {
    if (body.type !== "sign-in") throw new APIError("BAD_REQUEST", { code: "bad_request", message: "Only sign-in codes are sent" });
    if (!email) return;
    const limits = [{ key: `otp-email:${email}`, max: 3, windowMs: 10 * 60 * 1000 }];
    // A code the server sends itself (the Mode L local owner, an in-process call with no request) has no client.
    if (ctx.request) {
      const client = config().hosted ? `ip:${clientNet(ctx.request.headers.get("fly-client-ip") ?? "unknown")}` : "local";
      limits.push({ key: `otp-client:${client}`, max: 10, windowMs: 60 * 60 * 1000 });
    }
    // Hosted, also 5 per address per hour, stored so a restart doesn't reset it. Keyed by an HMAC of the address, so
    // the table holds no email. All of these count only if all of them allow the send.
    const durable = config().hosted ? [{ key: `otp-email-hour:${signPayload(`alo.${email}`)}`, max: 5, windowMs: 60 * 60 * 1000 }] : [];
    const ok = await tx(() => {
      if (!durableRoom(durable) || !takeAll(limits)) return false;
      durableCount(durable);
      return true;
    });
    if (!ok) throw tooMany();
    return;
  }
  if (ctx.path === OTP_SIGN_IN && email && typeof body.otp === "string") {
    // An account whose email is not verified (a provider that didn't verify it) is never taken over by a code.
    // Checked only for a correct, live code, so a guess learns nothing; a wrong code goes on to Better Auth, which
    // counts the attempt.
    const u = await ctx.context.internalAdapter.findUserByEmail(email);
    if (!u || u.user.emailVerified) return;
    const v = await ctx.context.internalAdapter.findVerificationValue(otpIdentifier(email));
    if (!v || v.expiresAt < new Date()) return;
    const i = v.value.lastIndexOf(":");
    const [stored, attempts] = i < 0 ? [v.value, 0] : [v.value.slice(0, i), Number(v.value.slice(i + 1))];
    if (attempts >= 3 || stored !== otpHash(body.otp)) return;
    await ctx.context.internalAdapter.deleteVerificationByIdentifier(otpIdentifier(email));
    throw new APIError("FORBIDDEN", { code: "email_unverified", message: "This account's email address is not verified, so an email code can't sign in to it." });
  }
});

/** Send requests whose delivery failed (lib/v2/mail.ts threw). Their code is already deleted. */
const failedSends = new WeakSet<Request>();

/** After a send request: a failed delivery fails the request (5xx), never a success that sent nothing. */
const afterHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === OTP_SEND && ctx.request && failedSends.has(ctx.request)) {
    throw new APIError("INTERNAL_SERVER_ERROR", { code: "email_failed", message: "The sign-in email could not be sent. Try again later." });
  }
});

export function authOptions(): BetterAuthOptions {
  const hosted = config().hosted;
  const origin = publicOrigin();
  const social: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (googleConfigured()) social.google = { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! };
  if (githubConfigured()) social.github = { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! };
  const plugins: BetterAuthPlugin[] = [];
  const bot = captchaPlugin(); // Turnstile on the email-code routes, hosted with both keys set
  if (bot) plugins.push(bot);
  if (emailSignInEnabled()) {
    plugins.push(
      emailOTP({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 3,
        storeOTP: "hashed",
        disableSignUp: false, // sign-up is decided by databaseHooks.user.create.before below
        rateLimit: { window: 60, max: 10 },
        async sendVerificationOTP({ email, otp, type }, ctx) {
          if (type !== "sign-in") throw new APIError("BAD_REQUEST", { code: "bad_request", message: "Only sign-in codes are sent" });
          try {
            await sendSignInCode(email, otp, linkOrigin(ctx?.request?.headers ?? ctx?.headers));
          } catch {
            // The code was stored before sending: a code nobody received must not stay usable.
            await ctx?.context.internalAdapter.deleteVerificationByIdentifier(otpIdentifier(email)).catch(() => undefined);
            // Better Auth logs and swallows an error thrown here, so the request is failed by afterHook instead.
            if (ctx?.request) failedSends.add(ctx.request);
            else throw new Error("The sign-in code could not be delivered");
          }
        },
      }),
    );
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"];
  const port = process.env.PORT || "3100";
  return {
    appName: "Align",
    database: authDb(),
    basePath: AUTH_BASE_PATH,
    secret: secret(),
    // Hosted: the one public origin. Mode L: the loopback names on this server's own port (next start and next dev
    // set PORT). Better Auth trusts every allowed host as an origin, so `127.0.0.1:*` would let another local web
    // app pass its origin checks.
    baseURL: hosted && origin ? origin : { allowedHosts: loopback.map((h) => `${h}:${port}`), protocol: "http" },
    trustedOrigins: hosted && origin ? [origin] : [],
    socialProviders: social,
    plugins,
    disabledPaths: DISABLED_OTP_PATHS,
    hooks: { before: beforeHook, after: afterHook },
    databaseHooks: {
      user: {
        create: {
          // An email code makes an account only for a pending invite, in Mode L, or for the hosted first owner.
          // Other creations (Google, GitHub, the test IdP, the Mode L local owner) are not limited here.
          async before(user, ctx) {
            if (ctx?.path !== OTP_SIGN_IN) return;
            const email = String(user.email).toLowerCase();
            if (!mayCreateByEmailCode(email)) throw new APIError("FORBIDDEN", { code: "cannot_sign_in", message: CANNOT_SIGN_IN });
            // An email code carries no name: start from the address's local part (the person can be renamed later).
            if (!user.name) return { data: { ...user, name: email.split("@")[0].slice(0, 100) } };
          },
        },
      },
    },
    emailAndPassword: { enabled: testIdpEnabled() && !hosted, autoSignIn: true, minPasswordLength: 8, maxPasswordLength: 128 },
    // Linking is explicit only: POST /api/v2/auth/link-social from /app/account. Never by a matching email.
    account: { modelName: "ba_account", accountLinking: { enabled: true, disableImplicitLinking: true } },
    user: { modelName: "ba_user" },
    session: { modelName: "ba_session" },
    verification: { modelName: "ba_verification" },
    // Hosted, the counters live in the database (ba_rate_limit), so a restart doesn't reset them. Mode L has no client
    // address (IP tracking is off), so Better Auth applies none of these there.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: hosted ? "database" : "memory",
      modelName: "ba_rate_limit",
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 20 },
        // 3 code sends per client per minute; the per-email and per-client-hour limits are ours, in beforeHook.
        [OTP_SEND]: { window: 60, max: 3 },
        [OTP_SIGN_IN]: { window: 60, max: 10 },
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
