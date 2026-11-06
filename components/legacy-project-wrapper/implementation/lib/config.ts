// Typed public names for the independently qualified runtime settings service.
import { runtimeSettings } from "./runtime-settings.mts";

export interface Config {
  hosted: boolean;
  dataDir: string;
  allowedHosts: Set<string>;
}

export const LOOPBACK = runtimeSettings.LOOPBACK;
export const config = runtimeSettings.config;
export const hostName = runtimeSettings.hostName;
export const hostAllowed = runtimeSettings.hostAllowed;
export const hostedProblems = runtimeSettings.hostedProblems;
export const startupProblems = runtimeSettings.startupProblems;
export const assertStartupConfig = runtimeSettings.assertStartupConfig;
