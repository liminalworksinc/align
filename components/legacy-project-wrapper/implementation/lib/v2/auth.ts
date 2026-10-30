import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP, genericOAuth } from "better-auth/plugins";
import { config, hostAllowed } from "../config";
import { clientNet } from "../ratelimit";
import { captchaPlugin } from "./captcha";
import { emailSignInEnabled, githubConfigured, googleConfigured, publicOrigin, RECENT_SIGN_IN_MS, sessionMaxDays, testIdpEnabled, testOAuthUrl } from "./config";
import { liveCodeFor } from "./core.mts";
import { audit, authDb, dbDir, get, LIVE_WS, run, sql, tx } from "./db";
import { nowIso, rand32 } from "./ids";
import { durableCount, durableRoom, otpEmailKey, takeAll } from "./limits";
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
//   - a passkey (@better-auth/passkey), added from /app/account by a person already signed in. The relying party is
//     the public origin's host when hosted; in Mode L it is localhost, so passkeys work at http://localhost:<port>
//     only (WebAuthn needs a domain, and 127.0.0.1 is not one). A passkey sign-in is a new session, so it is a
//     fresh sign-in;
//   - ALIGN_TEST_IDP=1 (never when hosted) adds email + password so the flow can be tested without OAuth apps, and,
//     with ALIGN_TEST_OAUTH_URL (a loopback stub the test serves), an "align-test" OAuth provider that signs in and links
//     through the same Better Auth routes as Google and GitHub.
// The access and refresh tokens a provider issues at sign-in or linking are encrypted in ba_account
// (account.encryptOAuthTokens: XChaCha20-Poly1305 under BETTER_AUTH_SECRET); Align never uses them. An ID token
// (Google issues one; a signed statement of who signed in) is stored as issued, as are session tokens.
// Account linking is explicit only (/app/account); nothing is linked by a matching email.
// Sessions: 7 days, extended on use (Better Auth's expiresIn and updateAge), and never longer than
// ALIGN_SESSION_MAX_DAYS (30) after the sign-in that made them: an older session is deleted the next time it is
// presented, and the daily retention job (lib/v2/retention.ts) deletes the rest with the expired ones.

export const AUTH_BASE_PATH = "/api/v2/auth";
/** The test-only OAuth provider's id (ALIGN_TEST_IDP=1 with ALIGN_TEST_OAUTH_URL). */
export const TEST_OAUTH_PROVIDER = "align-test";
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

/** The email plugin's other routes (password reset, email change, code checks) are not part of Align. Nor are Better
 *  Auth's own session revocation and passkey management routes: Align's are /api/v2/account/* (a recent sign-in where
 *  it matters, and audited). */
const DISABLED_PATHS = [
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/passkey/list-user-passkeys",
  "/passkey/update-passkey",
  "/passkey/delete-passkey",
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
  if (get(`SELECT 1 AS x FROM v2_invites WHERE email = ? AND accepted_at IS NULL AND expires_at > ? AND ${LIVE_WS("ws_id")}`, email, now)) return true;
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

/** True when a sign-in at `signedInAt` is recent enough for a sensitive action (15 minutes). */
export function isRecentSignIn(signedInAt: Date | string, now = Date.now()): boolean {
  const t = new Date(signedInAt).getTime();
  return Number.isFinite(t) && now - t <= RECENT_SIGN_IN_MS;
}

/** Better Auth routes that need a recent sign-in, and what the person is asked to sign in again for. */
const RECENT_PATHS: Record<string, string> = {
  "/passkey/generate-register-options": "add a passkey",
  "/passkey/verify-registration": "add a passkey",
  "/link-social": "link an account",
};
export const reauthMessage = (what: string) => `Sign in again to ${what}. This needs a sign-in from the last 15 minutes.`;

/** The latest a session made at `createdAt` may last. */
export const sessionCap = (createdAt: Date | string) => new Date(new Date(createdAt).getTime() + sessionMaxDays() * 86_400_000);

/** The passkey relying party: the public origin's host when hosted; localhost on this server's port in Mode L. */
export function passkeyParty(): { rpID: string; origin: string } {
  const pub = publicOrigin();
  if (config().hosted && pub) return { rpID: new URL(pub).hostname, origin: pub };
  return { rpID: "localhost", origin: `http://localhost:${process.env.PORT || "3100"}` };
}

type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** The absolute cap: the session this request presents is deleted if it is older than the cap (so every session read
 *  after this, Better Auth's get-session and our webAuth and page reads alike, finds none). Sessions nobody presents
 *  are deleted by the retention job. */
async function endCappedSessions(ctx: HookCtx) {
  const cutoff = new Date(Date.now() - sessionMaxDays() * 86_400_000);
  const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
  if (token) {
    await ctx.context.adapter.deleteMany({ model: "session", where: [{ field: "token", value: token }, { field: "createdAt", operator: "lt", value: cutoff }] });
  }
}

const tooMany = () => new APIError("TOO_MANY_REQUESTS", { code: "rate_limited", message: "Too many codes were sent. Wait a few minutes, then try again." });

/** Before every Better Auth request (and server-side api call): the absolute session cap, a recent sign-in for adding a
 *  passkey or linking an account, email-code send limits, and the unverified-email refusal. */
const beforeHook = createAuthMiddleware(async (ctx) => {
  await endCappedSessions(ctx);
  const what = RECENT_PATHS[ctx.path];
  if (what) {
    // No session: Better Auth answers 401 itself.
    const s = await getSessionFromCtx(ctx);
    if (s && !isRecentSignIn(s.session.createdAt)) throw new APIError("FORBIDDEN", { code: "reauth_required", message: reauthMessage(what) });
    const name = (ctx.body as { name?: unknown } | undefined)?.name;
    if (typeof name === "string" && name.trim().length > 100) throw new APIError("BAD_REQUEST", { code: "bad_request", message: "A passkey name is at most 100 characters" });
    return;
  }
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
    const durable = config().hosted ? [{ key: otpEmailKey(email), max: 5, windowMs: 60 * 60 * 1000 }] : [];
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

/** After a send request: a failed delivery fails the request (5xx), never a success that sent nothing. After a passkey
 *  is added: the audit row (no workspace, like device pairing). */
const afterHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === OTP_SEND && ctx.request && failedSends.has(ctx.request)) {
    throw new APIError("INTERNAL_SERVER_ERROR", { code: "email_failed", message: "The sign-in email could not be sent. Try again later." });
  }
  if (ctx.path === "/passkey/verify-registration") {
    const r = ctx.context.returned as { id?: unknown; userId?: unknown } | undefined;
    if (r && !(r instanceof Error) && typeof r.id === "string" && typeof r.userId === "string") {
      const [id, userId] = [r.id, r.userId];
      await tx(() => audit(null, userId, "passkey.added", id, nowIso()));
    }
  }
});

/** A passkey just signed someone in: its "last used" time (lib/v2/account.ts lists it). */
async function notePasskeyUse(credentialId: string) {
  const at = nowIso();
  await tx(() =>
    run(
      "INSERT INTO v2_passkey_use (passkey_id, last_used_at) SELECT id, ? FROM ba_passkey WHERE credentialID = ? ON CONFLICT (passkey_id) DO UPDATE SET last_used_at = excluded.last_used_at",
      at,
      credentialId,
    ),
  );
}

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
  const testOAuth = testOAuthUrl();
  if (testOAuth) {
    plugins.push(
      genericOAuth({
        config: [
          {
            providerId: TEST_OAUTH_PROVIDER,
            clientId: "align-test",
            clientSecret: "align-test-secret",
            authorizationUrl: `${testOAuth}/authorize`,
            tokenUrl: `${testOAuth}/token`,
            userInfoUrl: `${testOAuth}/userinfo`,
            scopes: ["email"],
          },
        ],
      }),
    );
  }
  const party = passkeyParty();
  plugins.push(
    passkey({
      rpID: party.rpID,
      rpName: "Align",
      origin: party.origin,
      // Discoverable credentials, so a passkey signs in with no email typed (and through the email field's autofill).
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      schema: { passkey: { modelName: "ba_passkey" } },
      authentication: {
        async afterVerification({ clientData }) {
          if (typeof clientData.id === "string") await notePasskeyUse(clientData.id);
        },
      },
    }),
  );
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
    disabledPaths: DISABLED_PATHS,
    hooks: { before: beforeHook, after: afterHook },
    databaseHooks: {
      // The absolute cap: no session is ever extended past ALIGN_SESSION_MAX_DAYS after its sign-in. On a refresh, the
      // session being refreshed is the one Better Auth just read (ctx.context.session).
      session: {
        create: {
          async before(s) {
            const cap = sessionCap(s.createdAt ?? new Date());
            if (s.expiresAt && new Date(s.expiresAt) > cap) return { data: { ...s, expiresAt: cap } };
          },
        },
        update: {
          async before(s, ctx) {
            const createdAt = ctx?.context.session?.session.createdAt;
            if (!s.expiresAt || !createdAt) return;
            const cap = sessionCap(createdAt);
            if (new Date(s.expiresAt) > cap) return { data: { ...s, expiresAt: cap } };
          },
        },
      },
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
    // Linking is explicit only: POST /api/v2/auth/link-social from /app/account. Never by a matching email. Provider
    // access and refresh tokens are stored encrypted (Align keeps them only because Better Auth does).
    account: { modelName: "ba_account", encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true } },
    user: { modelName: "ba_user" },
    // 7 days, extended on use; freshAge matches Align's recent sign-in, for Better Auth's own fresh-session checks.
    session: { modelName: "ba_session", expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60, freshAge: RECENT_SIGN_IN_MS / 1000 },
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
        "/passkey/generate-authenticate-options": { window: 60, max: 20 },
        "/passkey/verify-authentication": { window: 60, max: 10 },
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

/** Better Auth's own tables (ba_user, ba_session, ba_account, ba_verification, ba_passkey), via its programmatic
 *  migrations. */
export async function migrateAuth() {
  const { runMigrations } = await getMigrations(authOptions());
  await runMigrations();
}
