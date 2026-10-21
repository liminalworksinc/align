#!/usr/bin/env node
// B1 privacy gates over HTTP, with SYNTHETIC capture events only. Every synthetic prompt and command carries MARKER.
// Usage: node scripts/test-b1.mjs <baseUrl> [--expect-mapper=off|no-key]   (refuses port 3100)
// Run it against a server started from this worktree: the marker grep reads this worktree's data/state.json.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, signIn } from "./lib/harness.mjs";

const MARKER = "B1-SYNTHETIC-MARKER-7f3a";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = path.join(ROOT, "data", "state.json");
const REPO = "b1-synthetic-repo";
const OTHER_REPO = "b1-synthetic-other";
const TS = Date.now();

const argBase = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!argBase) {
  console.error("usage: node scripts/test-b1.mjs <baseUrl> [--expect-mapper=off|no-key]");
  process.exit(2);
}
if (new URL(argBase).port === "3100") {
  console.error("Refusing port 3100 (the demo server).");
  process.exit(2);
}
const BASE = baseUrl(argBase);
const EXPECT_MAPPER = (process.argv.find((a) => a.startsWith("--expect-mapper=")) || "--expect-mapper=off").split("=")[1];
if (!["off", "no-key"].includes(EXPECT_MAPPER)) {
  console.error("--expect-mapper must be off or no-key");
  process.exit(2);
}

let failures = 0;
let passes = 0;
function check(name, ok, detail = "") {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` -- ${detail}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, { cookie, json, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (json !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers: h, body: json === undefined ? undefined : JSON.stringify(json) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
}

const sid = (label) => `b1-${label}-${TS}`;
const event = (sessionId, repo = REPO, extra = {}) => ({
  harness: "claude-code",
  session_id: sessionId,
  hook_event: "UserPromptSubmit",
  cwd: `/tmp/${repo}`,
  repo,
  branch: "main",
  prompt: `${MARKER} synthetic prompt for ${sessionId}`,
  ...extra,
});
const postEvent = (ev) => call("POST", "/api/sessions/events", { json: ev });
const grant = (cookie, repo = REPO, harness = "claude-code") => call("POST", "/api/sessions/consent", { cookie, json: { harness, repo } });
const revoke = (cookie, repo = REPO, harness = "claude-code") => call("DELETE", "/api/sessions/consent", { cookie, json: { harness, repo } });

/** Marker occurrences in this worktree's data/state.json (0 when the file does not exist). */
function markerCount() {
  if (!existsSync(STATE_FILE)) return 0;
  return readFileSync(STATE_FILE, "utf8").split(MARKER).length - 1;
}

/** Sessions as /api/state shows them (that route still exposes them to every caller until B1-6). */
async function stateSessions(cookie) {
  const r = await call("GET", "/api/state", { cookie });
  return Array.isArray(r.body?.sessions) ? r.body.sessions : [];
}

const lead = await signIn(BASE, "leadership");
const product = await signIn(BASE, "product");
// Start from no consent for the synthetic repos, whatever an earlier run left behind.
await revoke(lead, REPO);
await revoke(lead, OTHER_REPO);
const created = new Set();

// ---------------- B1-1 consent ----------------
console.log("\n# B1-1 consent");
{
  const before = markerCount();
  const id = sid("noconsent");
  const r = await postEvent(event(id));
  check("event without consent is refused with 403", r.status === 403, `status=${r.status} ${JSON.stringify(r.body)}`);
  await sleep(2500); // past the mapper debounce: nothing may appear later either
  check("refused event wrote nothing (no marker added to data/state.json)", markerCount() === before, `before=${before} after=${markerCount()}`);
  check("refused event created no session", !(await stateSessions(lead)).some((s) => s.id === `claude-code:${id}`));

  const anon = await call("POST", "/api/sessions/consent", { json: { harness: "claude-code", repo: REPO } });
  check("granting consent signed out is refused with 401", anon.status === 401, `status=${anon.status}`);
  const bad = await grant(lead, "../etc");
  check("consent rejects a repo that is not a folder name (400)", bad.status === 400, `status=${bad.status}`);
  const foreign = await call("POST", "/api/sessions/consent", { cookie: lead, json: { harness: "claude-code", repo: REPO }, headers: { origin: "http://evil.example" } });
  check("consent from a foreign Origin is refused (403)", foreign.status === 403, `status=${foreign.status}`);

  const g = await grant(lead);
  check("signed-in grant records consent for claude-code + repo", g.status === 200 && g.body?.consent?.repo === REPO, `status=${g.status}`);
  const list = await call("GET", "/api/sessions/consent", { cookie: lead });
  check("consent record is listed server-side", list.status === 200 && list.body.consents.some((c) => c.harness === "claude-code" && c.repo === REPO));

  const okId = sid("consented");
  const ok = await postEvent(event(okId));
  check("event with consent is accepted", ok.status === 200 && ok.body?.id === `claude-code:${okId}`, `status=${ok.status}`);
  if (ok.status === 200) created.add(`claude-code:${okId}`);

  const other = await postEvent(event(sid("otherrepo"), OTHER_REPO));
  check("consent is per repo: another repo is still refused", other.status === 403, `status=${other.status}`);
  const codex = await postEvent({ ...event(sid("codex")), harness: "codex" });
  check("consent is per harness: codex in the same repo is still refused", codex.status === 403, `status=${codex.status}`);

  const rv = await revoke(lead);
  check("revoke removes the consent record", rv.status === 200 && rv.body?.revoked === true);
  const after = await postEvent(event(sid("revoked")));
  check("after revoke, events are refused again", after.status === 403, `status=${after.status}`);
}

// ---------------- B1-2 delete + reset purge ----------------
console.log("\n# B1-2 delete");
{
  for (const id of created) {
    const r = await call("DELETE", `/api/sessions/${encodeURIComponent(id)}`, { cookie: lead });
    check(`B1-1 session deleted (${id})`, r.status === 200, `status=${r.status}`);
  }
  created.clear();
  await grant(lead);
  const idA = `claude-code:${sid("delete")}`;
  const a = await postEvent(event(idA.slice("claude-code:".length)));
  check("consented session created for the delete test", a.status === 200, `status=${a.status}`);
  await sleep(2500); // let any scheduled mapping settle first
  check("marker is in data/state.json before the delete", markerCount() > 0, `count=${markerCount()}`);

  const delUrl = `/api/sessions/${encodeURIComponent(idA)}`;
  const anon = await call("DELETE", delUrl);
  check("DELETE signed out is refused with 401", anon.status === 401, `status=${anon.status}`);
  const foreign = await call("DELETE", delUrl, { cookie: lead, headers: { origin: "http://evil.example" } });
  check("DELETE from a foreign Origin is refused (403)", foreign.status === 403, `status=${foreign.status}`);
  const del = await call("DELETE", delUrl, { cookie: product });
  check("DELETE /api/sessions/[id] removes the session", del.status === 200 && del.body?.id === idA, `status=${del.status} ${JSON.stringify(del.body)}`);
  const again = await call("DELETE", delUrl, { cookie: product });
  check("second DELETE returns 404", again.status === 404, `status=${again.status}`);
  const st = await call("GET", "/api/state", { cookie: lead });
  check("session gone from state", !(st.body?.sessions || []).some((s) => s.id === idA));
  check("its mappings are gone from state", !(st.body?.mappings || []).some((m) => m.session_id === idA));
  await sleep(2000); // a mapping scheduled before the delete must not bring a row back
  const st2 = await call("GET", "/api/state", { cookie: lead });
  check("no mapping row reappears after the delete", !(st2.body?.mappings || []).some((m) => m.session_id === idA));
  const bad = await call("DELETE", "/api/sessions/not-a-session-id", { cookie: lead });
  check("DELETE with a malformed id returns 400", bad.status === 400, `status=${bad.status}`);

  console.log("\n# B1-2 reset purges only sessions with no consent record (R1 default)");
  const idKeep = `claude-code:${sid("reset-keep")}`;
  const idPurge = `claude-code:${sid("reset-purge")}`;
  await grant(lead, OTHER_REPO);
  const k = await postEvent(event(idKeep.slice(12)));
  const p = await postEvent(event(idPurge.slice(12), OTHER_REPO));
  check("consented sessions created in two repos", k.status === 200 && p.status === 200, `keep=${k.status} purge=${p.status}`);
  await revoke(lead, OTHER_REPO);
  const reset = await call("POST", "/api/reset", { cookie: lead, json: { confirm: "reset" } });
  check("reset succeeds", reset.status === 200, `status=${reset.status}`);
  const after = await stateSessions(lead);
  check("reset keeps the session whose repo still has consent", after.some((s) => s.id === idKeep));
  check("reset purges the session whose consent was revoked", !after.some((s) => s.id === idPurge));
  const dk = await call("DELETE", `/api/sessions/${encodeURIComponent(idKeep)}`, { cookie: lead });
  check("kept session deleted", dk.status === 200, `status=${dk.status}`);
  await sleep(500);
  check("grep for the marker in data/state.json returns 0 after the deletes", existsSync(STATE_FILE) && markerCount() === 0, `count=${markerCount()}`);
}

// ---------------- B1-3 auth ----------------
console.log("\n# B1-3 auth");
{
  await grant(lead);
  const id = `claude-code:${sid("auth")}`;
  const e = await postEvent(event(id.slice(12)));
  if (e.status === 200) created.add(id);
  const anonS = await call("GET", "/api/sessions");
  check("GET /api/sessions signed out is refused with 401", anonS.status === 401 && !JSON.stringify(anonS.body).includes(MARKER), `status=${anonS.status}`);
  const foreignS = await call("GET", "/api/sessions", { cookie: lead, headers: { origin: "http://evil.example" } });
  check("GET /api/sessions from a foreign Origin is still refused (403)", foreignS.status === 403, `status=${foreignS.status}`);
  const badCookie = await call("GET", "/api/sessions", { cookie: "align_session=forged.value" });
  check("GET /api/sessions with a forged cookie is refused with 401", badCookie.status === 401, `status=${badCookie.status}`);
  for (const [role, cookie] of [["leadership", lead], ["product", product]]) {
    const r = await call("GET", "/api/sessions", { cookie });
    check(`GET /api/sessions signed in as ${role} returns the session`, r.status === 200 && r.body.sessions.some((s) => s.id === id), `status=${r.status}`);
  }
  const anonM = await call("GET", "/api/mappings");
  check("GET /api/mappings signed out is refused with 401", anonM.status === 401 && !("mappings" in (anonM.body || {})), `status=${anonM.status}`);
  const m = await call("GET", "/api/mappings", { cookie: product });
  check("GET /api/mappings signed in returns registry and mappings", m.status === 200 && Array.isArray(m.body.mappings) && Array.isArray(m.body.registry), `status=${m.status}`);
  // Known open by design until B1-6: /api/state spreads the whole state (flow.ts viewFor) to every caller.
  const leak = await call("GET", "/api/state");
  console.log(`INFO /api/state signed out still lists ${(leak.body?.sessions || []).length} session(s): open until B1-6 (viewFor allowlist)`);
}

// ---------------- cleanup ----------------
console.log("\n# cleanup");
for (const id of created) {
  const r = await call("DELETE", `/api/sessions/${encodeURIComponent(id)}`, { cookie: lead });
  check(`synthetic session deleted (${id})`, r.status === 200, `status=${r.status}`);
}
await revoke(lead, REPO);
await revoke(lead, OTHER_REPO);
await sleep(500);
check("final: grep for the marker in data/state.json returns 0", markerCount() === 0, `count=${markerCount()}`);

console.log(`\n${passes} passed, ${failures} failed`);
console.log(failures ? `${failures} FAILED` : "ALL PASS");
process.exit(failures ? 1 : 0);
