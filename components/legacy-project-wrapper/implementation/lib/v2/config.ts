// Typed public names for the shared, independently qualified settings service.
import { runtimeSettings } from "../runtime-settings.mts";

export type CreationMode = "codes" | "open" | "closed";

export interface Caps {
  workspaces: number;
  owned: number;
  members: number;
  sessionsPerDeviceDay: number;
}

export const sessionMaxDays = runtimeSettings.sessionMaxDays;
export const testIdpEnabled = runtimeSettings.testIdpEnabled;
export const testOAuthUrl = runtimeSettings.testOAuthUrl;
export const googleConfigured = runtimeSettings.googleConfigured;
export const githubConfigured = runtimeSettings.githubConfigured;
export const emailApi = runtimeSettings.emailApi;
export const emailSignInEnabled = runtimeSettings.emailSignInEnabled;
export const localOwnerEmail = runtimeSettings.localOwnerEmail;
export const RECENT_SIGN_IN_MS = runtimeSettings.RECENT_SIGN_IN_MS;
export const localCodesPerHour = runtimeSettings.localCodesPerHour;
export const creationMode = runtimeSettings.creationMode;
export const caps = runtimeSettings.caps;
export const turnstile = runtimeSettings.turnstile;
export const v2Warnings = runtimeSettings.v2Warnings;
export const v2Problems = runtimeSettings.v2Problems;
export const publicOrigin = runtimeSettings.publicOrigin;
