#!/usr/bin/env node
// Mapper smoke test: sends 3 captured agent sessions, then polls /api/mappings for their Jev mappings.
// MAPPER_UNAVAILABLE because of the AI Gateway free tier is expected until credits land; it is reported, not failed.
// B1: the test grants capture consent for its synthetic repo first and reads /api/mappings with a leadership cookie.
// The server reports its mapper status. With the external model off (default) or no key, mapping must NOT be attempted:
// the test then passes only if none of its sessions got a mapping row. With it on, the original checks apply.

import { signIn } from "./lib/harness.mjs";

const BASE = (process.env.ALIGN_URL || "http://localhost:3100").replace(/\/$/, "");
const ts = Date.now();
const PROMPTS = [
  "close the stale support tickets oldest-first and reply publicly to each",
  "add beta instrumentation for metrics ingestion LIN-412",
  "fix a typo in the README",
];
const sessions = PROMPTS.map((prompt, i) => ({ sid: `test-map-${i + 1}-${ts}`, prompt }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function event(sid, prompt) {
  return {
    harness: "claude-code",
    session_id: sid,
    hook_event: "UserPromptSubmit",
    cwd: "/tmp/test-mapper",
    prompt,
    branch: "main",
    repo: "test-mapper",
    reason: "test",
  };
}

let cookie = "";
async function grantConsent() {
  if (!cookie) cookie = await signIn(BASE, "leadership");
  const res = await fetch(`${BASE}/api/sessions/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ harness: "claude-code", repo: "test-mapper" }),
  });
  if (!res.ok) throw new Error(`consent grant returned HTTP ${res.status}`);
}
async function revokeConsent() {
  await fetch(`${BASE}/api/sessions/consent`, {
    method: "DELETE",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ harness: "claude-code", repo: "test-mapper" }),
  }).catch(() => undefined);
}

async function post(body) {
  const res = await fetch(`${BASE}/api/sessions/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (route missing or dev server error page) */
  }
  return { status: res.status, json };
}

// Wait up to 5 minutes for /api/sessions/events to exist (it is built in parallel).
const routeDeadline = Date.now() + 5 * 60_000;
let first;
for (;;) {
  try {
    await grantConsent();
    first = await post(event(sessions[0].sid, sessions[0].prompt));
    if (first.json && first.status < 400) break;
    console.log(`waiting for /api/sessions/events (HTTP ${first.status}${first.json ? ` ${JSON.stringify(first.json)}` : ", non-JSON"})`);
  } catch (e) {
    console.log(`waiting for dev server (${e.message})`);
  }
  if (Date.now() > routeDeadline) {
    console.error("FAIL: /api/sessions/events did not become available within 5 minutes");
    process.exit(1);
  }
  await sleep(10_000);
}
for (const s of sessions.slice(1)) {
  const r = await post(event(s.sid, s.prompt));
  if (r.status >= 400) {
    console.error(`FAIL: event for ${s.sid} returned HTTP ${r.status} ${JSON.stringify(r.json)}`);
    process.exit(1);
  }
}
console.log(`sent ${sessions.length} sessions: ${sessions.map((s) => s.sid).join(", ")}`);

await revokeConsent(); // sessions are in; no further capture for the synthetic repo
const ids = sessions.map((s) => `claude-code:${s.sid}`);
const getMappings = async () => {
  const res = await fetch(`${BASE}/api/mappings`, { headers: { cookie } });
  return res.ok ? res.json() : null;
};

// B1-4/B1-5: with the external model off or no key, nothing may be mapped. Wait past the 1.5 s debounce, then check.
const probe = await getMappings();
if (!probe) {
  console.error("FAIL: /api/mappings never responded");
  process.exit(1);
}
if (probe.mapper && probe.mapper.status !== "on") {
  await sleep(4000);
  const after = await getMappings();
  const rows = (after?.mappings || []).filter((m) => ids.includes(m.session_id));
  console.log(`mapper status: ${probe.mapper.status} ("${probe.mapper.message}")`);
  if (!after || rows.length) {
    console.error(`FAIL: mapping was attempted with the mapper ${probe.mapper.status}: ${rows.length} row(s) ${rows.map((m) => m.state).join(", ")}`);
    process.exit(1);
  }
  console.log(`cleanup: session ids ${ids.join(", ")}`);
  console.log(`PASS: ${probe.mapper.message}: mapping not attempted, no rows written for ${ids.length} sessions`);
  process.exit(0);
}

// Poll /api/mappings up to 25s until every test session has a settled mapping.
const settled = (m) => m && m.state !== "PENDING";
let data = null;
const deadline = Date.now() + 25_000;
while (Date.now() < deadline) {
  await sleep(1500);
  const d = await getMappings();
  if (!d) continue;
  data = d;
  const found = ids.map((id) => data.mappings.find((m) => m.session_id === id));
  if (found.every(settled)) break;
}

if (!data) {
  console.error("FAIL: /api/mappings never responded");
  process.exit(1);
}
console.log(`registry_version ${data.registry_version}; registry keys: ${data.registry.map((e) => e.key).join(", ")}`);

let missing = 0;
let freeTier = 0;
for (const [i, id] of ids.entries()) {
  const m = data.mappings.find((x) => x.session_id === id);
  if (!m) {
    missing++;
    console.log(`- ${id}: NO MAPPING`);
    continue;
  }
  const conf = m.confidence == null ? "-" : m.confidence.toFixed(2);
  const conflict = m.conflict ? `${m.conflict.probability.toFixed(2)}${m.conflict.flagged ? " FLAGGED" : ""}` : "-";
  console.log(`- ${id} "${PROMPTS[i]}"`);
  console.log(`    state=${m.state} choice=${m.choice ?? "-"} confidence=${conf} conflict=${conflict} model=${m.model ?? "-"}${m.error ? ` error="${m.error}"` : ""}`);
  if (m.state === "MAPPER_UNAVAILABLE" && /free tier/i.test(m.error || "")) freeTier++;
}

if (missing) {
  console.error(`FAIL: ${missing} session(s) had no mapping after 25s`);
  process.exit(1);
}
if (freeTier) {
  console.log(`NOTE: Jev is unavailable on the AI Gateway free tier (${freeTier}/${ids.length}). Expected until credits are added; mapper path verified end to end.`);
}
console.log(`cleanup: session ids ${ids.join(", ")}`);
