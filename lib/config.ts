import path from "node:path";
import { v2Problems } from "./v2/config";

// Every multi-workspace setting, read from the environment only (never from request headers).
// Mode L (loopback) is the default. HOSTED=1 is the hosted tester mode (founder ruling 10-21 "go C"): one server
// behind Fly's HTTPS proxy, an explicit hostname allowlist, strong secrets, no capture, no AI key, and no Northstar
// at all (the demo, its fixture and Sparta evidence are never served or read). ALIGN_PUBLIC=1 (full Mode P) is refused.

export interface Config {
  hosted: boolean; // HOSTED=1
  dataDir: string; // custom workspaces live under <dataDir>/workspaces; Northstar always stays in <cwd>/data
  workspacesRoot: string;
  maxWorkspaces: number;
  signupCode: string | null; // Mode L only: one shared code (ALIGN_SIGNUP_CODE)
  signupCodes: string[]; // single-use invite codes (ALIGN_SIGNUP_CODES, comma-separated); hosted requires these
  allowOpenCreate: boolean;
  allowedHosts: Set<string>; // hostnames without port: ALIGN_HOSTS when hosted, else the loopback names
  deleteBy: string | null; // ALIGN_DELETE_BY (YYYY-MM-DD): the date everything on a hosted server is deleted
  createPerHour: number; // ALIGN_CREATE_PER_HOUR in Mode L (tests); fixed at 5 when hosted
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

const list = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

export function config(): Config {
  const hosted = process.env.HOSTED === "1";
  const dataDir = path.resolve(process.env.ALIGN_DATA_DIR || path.join(process.cwd(), "data"));
  const max = Number(process.env.ALIGN_MAX_WORKSPACES || 25);
  return {
    hosted,
    dataDir,
    workspacesRoot: path.join(dataDir, "workspaces"),
    maxWorkspaces: Number.isInteger(max) && max > 0 ? max : 25,
    signupCode: hosted ? null : process.env.ALIGN_SIGNUP_CODE || null,
    signupCodes: (process.env.ALIGN_SIGNUP_CODES ?? "").split(",").map((c) => c.trim()).filter(Boolean), // case-sensitive
    allowOpenCreate: !hosted && process.env.ALIGN_ALLOW_OPEN_CREATE === "1",
    allowedHosts: new Set(hosted ? list(process.env.ALIGN_HOSTS) : LOOPBACK),
    deleteBy: process.env.ALIGN_DELETE_BY || null,
    createPerHour: hosted ? 5 : Number(process.env.ALIGN_CREATE_PER_HOUR || 5),
  };
}

/** Hostname of a Host header, without port ("[::1]" keeps its brackets). */
export function hostName(host: string | null): string {
  const h = (host || "").toLowerCase();
  return h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
}

/** The one host rule: the Host header names an allowed host (ALIGN_HOSTS when hosted, else loopback). */
export function hostAllowed(host: string | null): boolean {
  const name = hostName(host);
  return !!name && config().allowedHosts.has(name);
}

const DEFAULT_PASSCODES: Record<string, string> = {
  ALIGN_PRODUCT_PASSCODE: "product-demo",
  ALIGN_SECURITY_PASSCODE: "security-demo",
  ALIGN_LEADERSHIP_PASSCODE: "leadership-demo",
};

/** Everything wrong with a HOSTED=1 environment; empty means it may start. */
export function hostedProblems(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string[] {
  const p: string[] = [];
  const hosts = list(env.ALIGN_HOSTS);
  if (!hosts.length) p.push("ALIGN_HOSTS must list the public hostname(s)");
  if (hosts.some((h) => LOOPBACK.includes(h) || h === "::1")) p.push("ALIGN_HOSTS must not include loopback names");
  if (!env.ALIGN_SECRET || env.ALIGN_SECRET.length < 32) p.push("ALIGN_SECRET must be set (32+ characters)");
  const dir = env.ALIGN_DATA_DIR;
  if (!dir || !path.isAbsolute(dir)) p.push("ALIGN_DATA_DIR must be an absolute path on the persistent volume");
  else if (!path.relative(path.resolve(cwd), path.resolve(dir)).startsWith("..")) p.push("ALIGN_DATA_DIR must be outside the app directory");
  // One single-use invite code per tester: a shared code let one holder fill the server (review item 6).
  const codes = (env.ALIGN_SIGNUP_CODES ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!codes.length) p.push("ALIGN_SIGNUP_CODES must list single-use invite codes (comma-separated)");
  if (codes.some((c) => c.length < 12)) p.push("ALIGN_SIGNUP_CODES: every code must be 12+ characters");
  if (env.ALIGN_SIGNUP_CODE) p.push("ALIGN_SIGNUP_CODE (one shared code) is not allowed when hosted; use ALIGN_SIGNUP_CODES");
  if (env.ALIGN_ALLOW_OPEN_CREATE === "1") p.push("ALIGN_ALLOW_OPEN_CREATE is not allowed when hosted");
  if (env.ALIGN_CREATE_PER_HOUR) p.push("ALIGN_CREATE_PER_HOUR is not allowed when hosted (fixed at 5)");
  if (env.ALIGN_PUBLIC === "1") p.push("Public mode is not supported in this build"); // also behind proxy.ts's 503
  if (env.ALIGN_NORTHSTAR_PUBLIC) p.push("ALIGN_NORTHSTAR_PUBLIC is not allowed: Northstar is off when hosted");
  // The tester notice states the deletion date (go-C condition 3).
  const del = env.ALIGN_DELETE_BY ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(del) || Number.isNaN(Date.parse(`${del}T00:00:00Z`))) p.push("ALIGN_DELETE_BY must be a date (YYYY-MM-DD)");
  for (const [k, dflt] of Object.entries(DEFAULT_PASSCODES)) {
    const v = env[k];
    if (!v || v === dflt) p.push(`${k} must be set to a non-default passcode`);
    else if (v.length < 12) p.push(`${k} must be 12+ characters`);
  }
  if (env.AI_GATEWAY_API_KEY) p.push("AI_GATEWAY_API_KEY must not be set when hosted (no AI key)");
  if (env.ALIGN_CAPTURE && env.ALIGN_CAPTURE !== "0") p.push("ALIGN_CAPTURE must be off when hosted");
  p.push(...v2Problems(env)); // empty unless ALIGN_V2=1
  return p;
}

/** When the test server closes: the end of ALIGN_DELETE_BY in Pacific time (08:00 UTC the next day, midnight PST),
 *  so testers keep the whole promised day. Starting at 00:00 UTC closed it at 4 PM PT the day before (P1 item 5).
 *  The fixed +32 h is midnight in standard time (PST); during daylight time (PDT) it is 1 AM, an hour later. The
 *  test dates (Nov 6 / Nov 13 2026) fall after DST ends on Nov 1. */
export function testServerClosesAt(deleteBy: string): number {
  return Date.parse(`${deleteBy}T00:00:00Z`) + 32 * 60 * 60 * 1000;
}

/** True once ALIGN_DELETE_BY has ended: the hosted server is closed. It still starts (a refused start crash-loops on
 *  Fly, and then nobody can `fly ssh` in to purge), but proxy.ts answers 410 to every request, so no tester data is
 *  reachable past the date. The operator purges with ws-admin delete --all --yes (docs/HOSTING.md). */
export function testServerClosed(deleteBy: string | null | undefined, now = Date.now()): boolean {
  if (!deleteBy) return false;
  const t = testServerClosesAt(deleteBy);
  return !Number.isNaN(t) && t <= now;
}

/** hostedProblems() for this process, computed once: the environment doesn't change while the server runs. */
let problems: string[] | null = null;
export function startupProblems(): string[] {
  return (problems ??= process.env.HOSTED === "1" ? hostedProblems() : []);
}

/** Startup check (instrumentation.ts). Throws, so the server does not start. */
export function assertStartupConfig() {
  if (process.env.ALIGN_PUBLIC === "1") throw new Error("Public mode is not supported in this build");
  if (process.env.HOSTED === "1") {
    const p = hostedProblems();
    if (p.length) throw new Error(`HOSTED=1 refused to start:\n- ${p.join("\n- ")}`);
  }
}
