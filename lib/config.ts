import path from "node:path";

// Every multi-workspace setting, read from the environment only (never from request headers).
// This build ships Mode L (loopback) only: ALIGN_PUBLIC=1 is refused at startup.

export interface Config {
  dataDir: string; // custom workspaces live under <dataDir>/workspaces; Northstar always stays in <cwd>/data
  workspacesRoot: string;
  maxWorkspaces: number;
  signupCode: string | null;
  allowOpenCreate: boolean;
  allowedHosts: Set<string>; // hostnames without port
  trustProxy: boolean;
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

export function config(): Config {
  const dataDir = path.resolve(process.env.ALIGN_DATA_DIR || path.join(process.cwd(), "data"));
  const max = Number(process.env.ALIGN_MAX_WORKSPACES || 25);
  const hosts = (process.env.ALIGN_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return {
    dataDir,
    workspacesRoot: path.join(dataDir, "workspaces"),
    maxWorkspaces: Number.isInteger(max) && max > 0 ? max : 25,
    signupCode: process.env.ALIGN_SIGNUP_CODE || null,
    allowOpenCreate: process.env.ALIGN_ALLOW_OPEN_CREATE === "1",
    allowedHosts: new Set(hosts.length ? hosts : LOOPBACK),
    trustProxy: process.env.ALIGN_TRUST_PROXY === "1",
  };
}

/** Startup check (instrumentation.ts). Mode P needs TLS, a signup code and more; none of that is in this build. */
export function assertStartupConfig() {
  if (process.env.ALIGN_PUBLIC === "1") throw new Error("Public mode is not supported in this build");
}
