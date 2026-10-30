import path from "node:path";
import { v2Problems } from "./v2/config";

// Server settings, read from the environment only (never from request headers).
// Mode L (loopback) is the default. HOSTED=1 is the hosted mode: one server behind Fly's HTTPS proxy, an explicit
// hostname allowlist, strong secrets and a closing date (docs/HOSTING.md). ALIGN_PUBLIC=1 (an open public mode) is
// refused in every mode.

export interface Config {
  hosted: boolean; // HOSTED=1
  dataDir: string; // ALIGN_DATA_DIR, else <cwd>/data: the v2 database, the pid file and registered OAuth clients
  allowedHosts: Set<string>; // hostnames without port: ALIGN_HOSTS when hosted, else the loopback names
  deleteBy: string | null; // ALIGN_DELETE_BY (YYYY-MM-DD): the date a hosted server closes
}

/** Loopback host names, as the Host header writes them ("[::1]" keeps its brackets). */
export const LOOPBACK: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

const list = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

export function config(): Config {
  const hosted = process.env.HOSTED === "1";
  return {
    hosted,
    dataDir: path.resolve(process.env.ALIGN_DATA_DIR || path.join(process.cwd(), "data")),
    allowedHosts: new Set(hosted ? list(process.env.ALIGN_HOSTS) : LOOPBACK),
    deleteBy: process.env.ALIGN_DELETE_BY || null,
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
  // Anything after the name may only be a numeric port: the Host header is echoed into connect URLs and paste lines.
  const rest = (host || "").toLowerCase().slice(name.length);
  return !!name && /^(?::\d{1,5})?$/.test(rest) && config().allowedHosts.has(name);
}

/** Everything wrong with a HOSTED=1 environment; empty means it may start. */
export function hostedProblems(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string[] {
  const p: string[] = [];
  const hosts = list(env.ALIGN_HOSTS);
  if (!hosts.length) p.push("ALIGN_HOSTS must list the public hostname(s)");
  if (hosts.some((h) => LOOPBACK.has(h) || h === "::1")) p.push("ALIGN_HOSTS must not include loopback names");
  if (!env.ALIGN_SECRET || env.ALIGN_SECRET.length < 32) p.push("ALIGN_SECRET must be set (32+ characters)");
  const dir = env.ALIGN_DATA_DIR;
  if (!dir || !path.isAbsolute(dir)) p.push("ALIGN_DATA_DIR must be an absolute path on the persistent volume");
  else if (!path.relative(path.resolve(cwd), path.resolve(dir)).startsWith("..")) p.push("ALIGN_DATA_DIR must be outside the app directory");
  if (env.ALIGN_PUBLIC === "1") p.push("Public mode is not supported in this build"); // also behind proxy.ts's 503
  // The closing date: past it the server answers 410 to everything (testServerClosed).
  const del = env.ALIGN_DELETE_BY ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(del) || Number.isNaN(Date.parse(`${del}T00:00:00Z`))) p.push("ALIGN_DELETE_BY must be a date (YYYY-MM-DD)");
  p.push(...v2Problems(env)); // Better Auth, the public origin and sign-in (lib/v2/config.ts)
  return p;
}

/** When a hosted server closes: the end of ALIGN_DELETE_BY in Pacific time (08:00 UTC the next day, midnight PST),
 *  so people keep the whole promised day. The fixed +32 h is midnight in standard time (PST); during daylight time
 *  (PDT) it is 1 AM, an hour later. */
export function testServerClosesAt(deleteBy: string): number {
  return Date.parse(`${deleteBy}T00:00:00Z`) + 32 * 60 * 60 * 1000;
}

/** True once ALIGN_DELETE_BY has ended: the hosted server is closed. It still starts (a refused start crash-loops on
 *  Fly, and then nobody can `fly ssh` in to deal with the volume), but proxy.ts answers 410 to every request, so no
 *  data is reachable past the date. */
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
