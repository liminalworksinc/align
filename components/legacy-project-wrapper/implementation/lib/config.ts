import path from "node:path";
import { v2Problems } from "./v2/config";

// Server settings, read from the environment only (never from request headers).
// Mode L (loopback) is the default. HOSTED=1 is the hosted mode: one server behind Fly's HTTPS proxy, an explicit
// hostname allowlist and strong secrets (docs/HOSTING.md). ALIGN_PUBLIC=1 (an open public mode) is
// refused in every mode.

export interface Config {
  hosted: boolean; // HOSTED=1
  dataDir: string; // ALIGN_DATA_DIR, else <cwd>/data: the v2 database, the pid file and registered OAuth clients
  allowedHosts: Set<string>; // hostnames without port: ALIGN_HOSTS when hosted, else the loopback names
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
  p.push(...v2Problems(env)); // Better Auth, the public origin and sign-in (lib/v2/config.ts)
  return p;
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
