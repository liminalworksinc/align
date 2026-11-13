// Caller-owned provider assembly. Behavior belongs to the qualified library.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP, genericOAuth } from "better-auth/plugins";
import { config, hostAllowed } from "../config";
import { clientNet } from "../ratelimit";
import { captchaPlugin } from "./captcha";
import { emailSignInEnabled, githubConfigured, googleConfigured, localCodesPerHour, localOwnerEmail, publicOrigin, RECENT_SIGN_IN_MS, sessionMaxDays, testIdpEnabled, testOAuthUrl } from "./config";
import { liveCodeFor } from "./core.mts";
import { audit, authDb, dbDir, get, LIVE_WS, run, sql, tx } from "./db";
import { nowIso, rand32 } from "./ids";
import { durableCount, durableRetryAfterMs, durableRoom, otpEmailKey, retryAfterMs, takeAll } from "./limits";
import { sendSignInCode } from "./mail";
import { create_auth } from "../native/.bindings/server_auth.js";

interface AuthRuntime {
  AUTH_BASE_PATH: "/api/v2/auth";
  TEST_OAUTH_PROVIDER: "align-test";
  COOKIE_PREFIX: "align_v2";
  CANNOT_SIGN_IN: "This email can't sign in here yet. Ask a workspace owner to invite you.";
  isRecentSignIn(signedInAt: Date | string, now?: number): boolean;
  reauthMessage(what: string): string;
  sessionCap(createdAt: Date | string): Date;
  passkeyParty(): { rpID: string; origin: string };
  tooManyCodesMessage(waitMs: number): string;
  machineCeilingMessage(waitMs: number, max: number): string;
  authOptions(): BetterAuthOptions;
  getAuth(): ReturnType<typeof betterAuth>;
  migrateAuth(): Promise<void>;
}

const auth = create_auth({
  createHash, randomBytes, chmodSync, existsSync, readFileSync, writeFileSync,
  path, passkey, betterAuth, APIError, createAuthMiddleware, getSessionFromCtx,
  isAPIError, getMigrations, emailOTP, genericOAuth, config, hostAllowed,
  clientNet, captchaPlugin, emailSignInEnabled, githubConfigured,
  googleConfigured, localCodesPerHour, localOwnerEmail, publicOrigin,
  RECENT_SIGN_IN_MS, sessionMaxDays, testIdpEnabled, testOAuthUrl,
  liveCodeFor, audit, authDb, dbDir, get, LIVE_WS, run, sql, tx, nowIso,
  rand32, durableCount, durableRetryAfterMs, durableRoom, otpEmailKey,
  retryAfterMs, takeAll, sendSignInCode,
  globalState: globalThis,
  readEnvironment: () => process.env,
  readDate: () => Date,
  readURL: () => URL,
}) as unknown as AuthRuntime;

export const AUTH_BASE_PATH = auth.AUTH_BASE_PATH;
export const TEST_OAUTH_PROVIDER = auth.TEST_OAUTH_PROVIDER;
export const COOKIE_PREFIX = auth.COOKIE_PREFIX;
export const CANNOT_SIGN_IN = auth.CANNOT_SIGN_IN;
export function isRecentSignIn(signedInAt: Date | string, now: number | undefined = undefined): boolean {
  return (0, auth.isRecentSignIn)(signedInAt, now);
}
export const reauthMessage = auth.reauthMessage;
export const sessionCap = auth.sessionCap;
export function passkeyParty(): { rpID: string; origin: string } {
  return (0, auth.passkeyParty)();
}
export function tooManyCodesMessage(waitMs: number): string {
  return (0, auth.tooManyCodesMessage)(waitMs);
}
export function machineCeilingMessage(waitMs: number, max: number): string {
  return (0, auth.machineCeilingMessage)(waitMs, max);
}
export function authOptions(): BetterAuthOptions {
  return (0, auth.authOptions)();
}
export function getAuth(): ReturnType<typeof betterAuth> {
  return (0, auth.getAuth)();
}
export async function migrateAuth(): Promise<void> {
  await (0, auth.migrateAuth)();
}
