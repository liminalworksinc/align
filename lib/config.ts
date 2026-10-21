import path from "node:path";

// Every multi-workspace setting, read from the environment only (never from request headers).
// Mode L (loopback) is the default. HOSTED=1 is the hosted tester mode (founder ruling 10-21 "go C"): one server
// behind the platform's HTTPS proxy, an explicit hostname allowlist, strong secrets, no capture, Northstar closed.
// ALIGN_PUBLIC=1 (the spec's full Mode P) is still refused.

export interface Config {
  hosted: boolean; // HOSTED=1
  northstarPublic: boolean; // HOSTED=1 only: serve Northstar's no-session routes anyway (ALIGN_NORTHSTAR_PUBLIC=1)
  dataDir: string; // custom workspaces live under <dataDir>/workspaces; Northstar always stays in <cwd>/data
  workspacesRoot: string;
  maxWorkspaces: number;
  signupCode: string | null;
  allowOpenCreate: boolean;
  allowedHosts: Set<string>; // hostnames without port: ALIGN_HOSTS when hosted, else the loopback names
  trustProxy: boolean;
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
    northstarPublic: hosted && process.env.ALIGN_NORTHSTAR_PUBLIC === "1",
    dataDir,
    workspacesRoot: path.join(dataDir, "workspaces"),
    maxWorkspaces: Number.isInteger(max) && max > 0 ? max : 25,
    signupCode: process.env.ALIGN_SIGNUP_CODE || null,
    allowOpenCreate: !hosted && process.env.ALIGN_ALLOW_OPEN_CREATE === "1",
    allowedHosts: new Set(hosted ? list(process.env.ALIGN_HOSTS) : LOOPBACK),
    trustProxy: process.env.ALIGN_TRUST_PROXY === "1",
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
  if (!env.ALIGN_SIGNUP_CODE || env.ALIGN_SIGNUP_CODE.length < 12) p.push("ALIGN_SIGNUP_CODE must be set (12+ characters)");
  if (env.ALIGN_ALLOW_OPEN_CREATE === "1") p.push("ALIGN_ALLOW_OPEN_CREATE is not allowed when hosted");
  for (const [k, dflt] of Object.entries(DEFAULT_PASSCODES)) {
    const v = env[k];
    if (!v || v === dflt) p.push(`${k} must be set to a non-default passcode`);
    else if (v.length < 12) p.push(`${k} must be 12+ characters`);
  }
  if (env.AI_GATEWAY_API_KEY) p.push("AI_GATEWAY_API_KEY must not be set when hosted (no AI key)");
  if (env.ALIGN_CAPTURE && env.ALIGN_CAPTURE !== "0") p.push("ALIGN_CAPTURE must be off when hosted");
  return p;
}

/** Startup check (instrumentation.ts). Throws, so the server does not start. */
export function assertStartupConfig() {
  if (process.env.ALIGN_PUBLIC === "1") throw new Error("Public mode is not supported in this build");
  if (process.env.HOSTED === "1") {
    const p = hostedProblems();
    if (p.length) throw new Error(`HOSTED=1 refused to start:\n- ${p.join("\n- ")}`);
  }
}
