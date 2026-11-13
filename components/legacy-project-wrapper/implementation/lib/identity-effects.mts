// Bind existing host services to the qualified sign-in effects namespace.
import {chmodSync, mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {captcha} from "better-auth/plugins";
import type {BetterAuthPlugin} from "better-auth";
import {config} from "./config";
import {emailApi, turnstile} from "./v2/config";
import {postEmail} from "./v2/core.mts";
import {dbDir} from "./v2/db";
import {V2Error} from "./v2/errors";
import {create_effects} from "./native/.bindings/server_identity_effects.js";

export interface IdentityEffectsRuntime {
  SIGN_IN_SUBJECT: "Your Align sign-in code";
  CAPTCHA_HEADER: "x-captcha-response";
  signInLink(origin: string, email: string, code: string): string;
  signInFile(): string;
  sendSignInCode(email: string, code: string, origin: string): Promise<void>;
  captchaPlugin(): BetterAuthPlugin | null;
  requireCaptcha(req: Request): Promise<void>;
}

export const identityEffects = create_effects({
  config,
  emailApi,
  turnstile,
  postEmail,
  dbDir,
  path,
  mkdirSync: (directory: string, options: {recursive: true; mode: number}) =>
    mkdirSync(/*turbopackIgnore: true*/ directory, options),
  writeFileSync: (file: string, text: string, options: {mode: number}) =>
    writeFileSync(/*turbopackIgnore: true*/ file, text, options),
  chmodSync: (file: string, mode: number) => chmodSync(/*turbopackIgnore: true*/ file, mode),
  captcha,
  V2Error,
  readURLSearchParams: () => URLSearchParams,
  readConsole: () => console,
  readFetch: () => fetch,
  readAbortSignal: () => AbortSignal,
}) as unknown as IdentityEffectsRuntime;
