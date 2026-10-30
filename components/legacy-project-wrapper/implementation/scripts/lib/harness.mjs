// Shared test harness: base URL guard, cookie-jar sign-in, and a fetch hook that records state per step.
// The hook installs only when this file is preloaded with `node --import` and SNAPSHOT_HOOK_OUT is set.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createNormalizer } from "./normalize.mjs";

export const PASSCODES = {
  product: process.env.ALIGN_PRODUCT_PASSCODE || "product-demo",
  security: process.env.ALIGN_SECURITY_PASSCODE || "security-demo",
  leadership: process.env.ALIGN_LEADERSHIP_PASSCODE || "leadership-demo",
};
export const VIEWERS = ["product", "security", "leadership", "anon"];

/** Base URL from argv, then ALIGN_URL. Refuses the demo port 3100 unless ALIGN_TEST_ALLOW_DEMO=1. */
export function baseUrl(arg = process.argv[2]) {
  const base = (arg || process.env.ALIGN_URL || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) throw new Error("Pass the server URL, e.g. http://127.0.0.1:3205");
  if (new URL(base).port === "3100" && process.env.ALIGN_TEST_ALLOW_DEMO !== "1") {
    throw new Error("Refusing port 3100 (the demo server). Set ALIGN_TEST_ALLOW_DEMO=1 to override.");
  }
  return base;
}

/** Signs in one role and returns its cookie header. Uses the unhooked fetch. */
export async function signIn(base, role, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(base + "/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role, passcode: PASSCODES[role] }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).join("; ");
  if (res.status !== 200 || !cookie) throw new Error(`sign-in as ${role} failed: ${res.status}`);
  return cookie;
}

/** /api/state as each viewer, normalized. */
export async function stateViews(base, cookies, norm, fetchImpl = globalThis.fetch) {
  const views = {};
  for (const viewer of VIEWERS) {
    const res = await fetchImpl(base + "/api/state", { headers: viewer === "anon" ? {} : { cookie: cookies[viewer] } });
    views[viewer] = { status: res.status, body: norm.value(await res.json().catch(() => null)) };
  }
  return views;
}

const stepName = (n, label) => `${String(n).padStart(2, "0")}-${label.replace(/[^A-Za-z0-9#]+/g, "_").replace(/#/g, "").slice(0, 70)}.json`;

async function installHook(outDir) {
  const base = baseUrl();
  const realFetch = globalThis.fetch;
  const norm = createNormalizer();
  const cookies = {};
  let step = 0;
  mkdirSync(outDir, { recursive: true });

  let capturing = false; // the state reads call the global fetch; let them through unhooked
  // /api/mcp serves v2 workspaces only (specs/align/mcp.md): the Northstar MCP listings are no longer recorded.
  const record = async (label) => {
    step++;
    capturing = true;
    try {
      const views = await stateViews(base, cookies, norm, realFetch);
      writeFileSync(path.join(outDir, stepName(step, label)), JSON.stringify(views) + "\n"); // compact; snapshot-northstar.mjs hashes out simulations
    } finally {
      capturing = false;
    }
  };

  const ready = (async () => {
    for (const role of ["product", "security", "leadership"]) cookies[role] = await signIn(base, role, realFetch);
    await record("initial");
  })();

  globalThis.fetch = async (input, init = {}) => {
    if (capturing) return realFetch(input, init);
    await ready;
    const res = await realFetch(input, init);
    const method = (init.method || "GET").toUpperCase();
    const url = String(input);
    if (method !== "GET" && url.startsWith(base)) {
      await res.clone().arrayBuffer(); // the route has finished its write once the body is complete
      const label = `${method}_${norm.text(url.slice(base.length))}_${res.status}`;
      await record(label);
    }
    return res;
  };
}

if (process.env.SNAPSHOT_HOOK_OUT) await installHook(process.env.SNAPSHOT_HOOK_OUT);
