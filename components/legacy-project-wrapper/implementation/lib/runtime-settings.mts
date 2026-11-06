// One Node binding for the qualified settings service and its qualified warning dependency.
import { create_settings } from "./native/.bindings/runtime_settings.js";
import { follow_up_problem } from "./native/.bindings/value_rules.js";
import type { Config } from "./config";
import type { Caps, CreationMode } from "./v2/config";

interface RuntimeSettings {
  LOOPBACK: ReadonlySet<string>;
  RECENT_SIGN_IN_MS: number;
  config(): Config;
  hostName(host: string | null): string;
  hostAllowed(host: string | null): boolean;
  hostedProblems(env?: NodeJS.ProcessEnv, cwd?: string): string[];
  startupProblems(): string[];
  assertStartupConfig(): void;
  testIdpEnabled(env?: NodeJS.ProcessEnv): boolean;
  validMaxDays(value: string): boolean;
  sessionMaxDays(env?: NodeJS.ProcessEnv): number;
  testOAuthUrl(env?: NodeJS.ProcessEnv): string | null;
  googleConfigured(env?: NodeJS.ProcessEnv): boolean;
  githubConfigured(env?: NodeJS.ProcessEnv): boolean;
  emailApi(env?: NodeJS.ProcessEnv): { url: string; key: string; from: string } | null;
  emailSignInEnabled(env?: NodeJS.ProcessEnv): boolean;
  localOwnerEmail(env?: NodeJS.ProcessEnv): string;
  localCodesPerHour(env?: NodeJS.ProcessEnv): number;
  creationMode(env?: NodeJS.ProcessEnv): CreationMode;
  caps(env?: NodeJS.ProcessEnv): Caps | null;
  turnstile(env?: NodeJS.ProcessEnv): { siteKey: string; secretKey: string; verifyUrl: string } | null;
  v2Warnings(env?: NodeJS.ProcessEnv): string[];
  v2Problems(env?: NodeJS.ProcessEnv): string[];
  publicOrigin(env?: NodeJS.ProcessEnv): string | null;
}

export const runtimeSettings = create_settings({
  environment: () => process.env,
  cwd: () => process.cwd(),
  followUpProblem: follow_up_problem,
}) as RuntimeSettings;
