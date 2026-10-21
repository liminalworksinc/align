#!/usr/bin/env node
// B1 privacy gates over HTTP, with SYNTHETIC capture events only. Every synthetic prompt and command carries MARKER.
// Usage: node scripts/test-b1.mjs <baseUrl> [--expect-mapper=off|no-key]   (refuses port 3100)
// Run it against a server started from this worktree: the marker grep reads this worktree's data/state.json.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

/** Sessions as /api/state shows them to a signed-in caller (B1-6: signed out, it has no sessions key). */
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
  check("revoke purged the repo's captured session", rv.body?.purged_sessions >= 1 && !(await stateSessions(lead)).some((s) => s.id === `claude-code:${okId}`), `purged=${rv.body?.purged_sessions}`);
  created.delete(`claude-code:${okId}`);
}

// ---------------- Revoke stops mapping and purges (PR #2 review item 1) ----------------
console.log("\n# revoke stops mapping and purges the repo's sessions");
{
  const src = readFileSync(path.join(ROOT, "lib", "mapper.ts"), "utf8");
  const body = (name) => src.slice(src.indexOf(name), src.indexOf("\n}\n", src.indexOf(name)));
  check("mapSession checks consent before the model call", /hasCaptureConsent[\s\S]*callJev\(/.test(body("export async function mapSession")));
  check("mapSession re-checks consent in its final mutate", /await mutate\([\s\S]*hasCaptureConsent/.test(body("export async function mapSession")));
  check("remapAll skips sessions without consent", /hasCaptureConsent/.test(body("export function remapAll")));
  check("ensureRegistryFresh skips sessions without consent", /hasCaptureConsent/.test(body("export async function ensureRegistryFresh")));

  await grant(lead, OTHER_REPO);
  const ids = [`claude-code:${sid("revoke-a")}`, `claude-code:${sid("revoke-b")}`];
  const posted = await Promise.all(ids.map((id) => postEvent(event(id.slice(12), OTHER_REPO))));
  check("two consented sessions created in the repo to revoke", posted.every((r) => r.status === 200), posted.map((r) => r.status).join(","));
  const rv = await revoke(lead, OTHER_REPO);
  check("revoke reports both sessions purged", rv.status === 200 && rv.body?.purged_sessions === 2, JSON.stringify(rv.body));
  const remap = await call("POST", "/api/mappings", { cookie: lead, json: { action: "remap" } });
  check("leadership remap after the revoke answers 200", remap.status === 200, `status=${remap.status}`);
  for (let i = 0; i < 3; i++) await call("GET", "/api/state", { cookie: lead }); // ensureRegistryFresh runs on every poll
  await sleep(3500); // past the 1.5 s debounce
  const st = (await call("GET", "/api/state", { cookie: lead })).body || {};
  check("the revoked repo's sessions are gone", !(st.sessions || []).some((s) => s.repo === OTHER_REPO), JSON.stringify((st.sessions || []).filter((s) => s.repo === OTHER_REPO).map((s) => s.id)));
  check("no mapping row exists or was written for the revoked repo's sessions", !(st.mappings || []).some((m) => ids.includes(m.session_id)));
  const late = await postEvent(event(ids[0].slice(12), OTHER_REPO));
  check("a late event for a purged session is refused and does not recreate it", late.status === 403 && !(await stateSessions(lead)).some((s) => ids.includes(s.id)), `status=${late.status}`);
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
  const del = await call("DELETE", delUrl, { cookie: lead });
  check("DELETE /api/sessions/[id] removes the session", del.status === 200 && del.body?.id === idA, `status=${del.status} ${JSON.stringify(del.body)}`);
  const again = await call("DELETE", delUrl, { cookie: lead });
  check("second DELETE returns 404", again.status === 404, `status=${again.status}`);
  const st = await call("GET", "/api/state", { cookie: lead });
  check("session gone from state", !(st.body?.sessions || []).some((s) => s.id === idA));
  check("its mappings are gone from state", !(st.body?.mappings || []).some((m) => m.session_id === idA));
  await sleep(2000); // a mapping scheduled before the delete must not bring a row back
  const st2 = await call("GET", "/api/state", { cookie: lead });
  check("no mapping row reappears after the delete", !(st2.body?.mappings || []).some((m) => m.session_id === idA));
  const bad = await call("DELETE", "/api/sessions/not-a-session-id", { cookie: lead });
  check("DELETE with a malformed id returns 400", bad.status === 400, `status=${bad.status}`);

  console.log("\n# B1-2 revoke purges at once; reset keeps sessions whose repo still has consent (R1 default)");
  const idKeep = `claude-code:${sid("reset-keep")}`;
  const idPurge = `claude-code:${sid("reset-purge")}`;
  await grant(lead, OTHER_REPO);
  const k = await postEvent(event(idKeep.slice(12)));
  const p = await postEvent(event(idPurge.slice(12), OTHER_REPO));
  check("consented sessions created in two repos", k.status === 200 && p.status === 200, `keep=${k.status} purge=${p.status}`);
  const rvp = await revoke(lead, OTHER_REPO);
  check("revoke purges the other repo's session immediately", rvp.body?.purged_sessions === 1 && !(await stateSessions(lead)).some((s) => s.id === idPurge), JSON.stringify(rvp.body));
  const reset = await call("POST", "/api/reset", { cookie: lead, json: { confirm: "reset" } });
  check("reset succeeds", reset.status === 200, `status=${reset.status}`);
  const after = await stateSessions(lead);
  check("reset keeps the session whose repo still has consent", after.some((s) => s.id === idKeep));
  check("the session whose consent was revoked is still gone after reset", !after.some((s) => s.id === idPurge));
  const dk = await call("DELETE", `/api/sessions/${encodeURIComponent(idKeep)}`, { cookie: lead });
  check("kept session deleted", dk.status === 200, `status=${dk.status}`);
  await sleep(500);
  check("grep for the marker in data/state.json returns 0 after the deletes", existsSync(STATE_FILE) && markerCount() === 0, `count=${markerCount()}`);
}

// ---------------- Leadership only, with audit (PR #2 review item 2) ----------------
console.log("\n# consent and session delete are leadership only, and audited");
{
  const security = await signIn(BASE, "security");
  const AUDIT_REPO = "b1-synthetic-audit";
  await revoke(lead, AUDIT_REPO);
  for (const [role, cookie] of [["product", product], ["security", security]]) {
    const g = await grant(cookie, AUDIT_REPO);
    check(`consent POST as ${role} is refused with 403 and a plain sentence`, g.status === 403 && /^Only leadership .+\.$/.test(g.body?.error || ""), `status=${g.status} ${JSON.stringify(g.body)}`);
    const r = await revoke(cookie, AUDIT_REPO);
    check(`consent DELETE as ${role} is refused with 403`, r.status === 403, `status=${r.status}`);
    const l = await call("GET", "/api/sessions/consent", { cookie });
    check(`consent GET as ${role} still answers 200`, l.status === 200 && Array.isArray(l.body?.consents), `status=${l.status}`);
  }
  const listed = await call("GET", "/api/sessions/consent", { cookie: lead });
  check("refused grants recorded nothing", !listed.body.consents.some((c) => c.repo === AUDIT_REPO));

  const auditBefore = ((await call("GET", "/api/state", { cookie: lead })).body?.audit || []).length;
  const g = await grant(lead, AUDIT_REPO);
  check("consent POST as leadership answers 200", g.status === 200, `status=${g.status}`);
  const idD = `claude-code:${sid("audit-delete")}`;
  const e = await postEvent(event(idD.slice(12), AUDIT_REPO));
  check("consented session created for the audited delete", e.status === 200, `status=${e.status}`);
  const delUrl = `/api/sessions/${encodeURIComponent(idD)}`;
  for (const [role, cookie] of [["product", product], ["security", security]]) {
    const d = await call("DELETE", delUrl, { cookie });
    check(`session DELETE as ${role} is refused with 403 and a plain sentence`, d.status === 403 && /^Only leadership .+\.$/.test(d.body?.error || ""), `status=${d.status} ${JSON.stringify(d.body)}`);
  }
  check("refused deletes left the session in place", (await stateSessions(lead)).some((s) => s.id === idD));
  const d = await call("DELETE", delUrl, { cookie: lead });
  check("session DELETE as leadership answers 200", d.status === 200, `status=${d.status}`);
  const r = await revoke(lead, AUDIT_REPO);
  check("consent DELETE as leadership answers 200", r.status === 200 && r.body?.revoked === true, `status=${r.status}`);

  const audit = ((await call("GET", "/api/state", { cookie: lead })).body?.audit || []).slice(auditBefore);
  const row = (action, target) => audit.find((a) => a.action === action && a.target === target && a.actor === "leadership");
  check("audit row for the grant carries harness/repo only", !!row("grant_capture_consent", `claude-code/${AUDIT_REPO}`), JSON.stringify(audit));
  check("audit row for the session delete carries the session id only", !!row("delete_session", idD), JSON.stringify(audit));
  check("audit row for the revoke carries harness/repo only", !!row("revoke_capture_consent", `claude-code/${AUDIT_REPO}`), JSON.stringify(audit));
  check("refused attempts wrote no audit rows", audit.length === 3, `${audit.length} new row(s): ${audit.map((a) => a.action).join(",")}`);
  const blob = JSON.stringify(audit);
  check("audit rows carry no prompt text", !blob.includes(MARKER) && !blob.includes("synthetic prompt") && audit.every((a) => Object.keys(a).sort().join(",") === "action,actor,at,id,session_id,target"));
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
}

// ---------------- B1-6 per-role allowlist on /api/state ----------------
console.log("\n# B1-6 /api/state per-role allowlist");
{
  // A consented synthetic session with MARKER exists from B1-3, plus a consent record.
  const security = await signIn(BASE, "security");
  const anon = await call("GET", "/api/state");
  const keys = Object.keys(anon.body || {});
  check("anonymous GET /api/state answers 200 with me: null", anon.status === 200 && anon.body?.me === null, `status=${anon.status}`);
  for (const k of ["sessions", "mappings", "audit", "org_draft", "capture_consents"]) {
    check(`anonymous /api/state has no ${k} key`, !keys.includes(k), `keys=${keys.join(",")}`);
  }
  const allowed = new Set(["company", "scenario", "teams", "me"]);
  check("anonymous /api/state carries only the sign-in labels (company, scenario, teams, me)", keys.every((k) => allowed.has(k)), `keys=${keys.join(",")}`);
  check("anonymous /api/state does not contain the captured marker", !JSON.stringify(anon.body).includes(MARKER));
  const forged = await call("GET", "/api/state", { cookie: "align_session=forged.value" });
  check("a forged cookie gets the anonymous view", forged.status === 200 && forged.body?.me === null && !("sessions" in (forged.body || {})), `keys=${Object.keys(forged.body || {}).join(",")}`);

  const views = {};
  for (const [role, cookie] of [["product", product], ["security", security], ["leadership", lead]]) {
    views[role] = (await call("GET", "/api/state", { cookie })).body || {};
  }
  const p = views.product;
  const screenKeys = ["company", "timeframe", "goals", "relations", "work_items", "plans", "simulations", "brief", "proposals", "acceptances", "timer", "audit", "manual_baseline", "private_constraints", "pushes", "sessions", "mappings", "registry_version"];
  const missing = screenKeys.filter((k) => !(k in p));
  check("product still sees every key its screens read", p.me === "product" && missing.length === 0, `missing=${missing.join(",")}`);
  check("product sees goals, relations and work items", p.goals?.length > 0 && p.relations?.length > 0 && p.work_items?.length > 0);
  check("product sees the captured session and the consent record (signed-in only)", (p.sessions || []).some((x) => JSON.stringify(x.prompts || []).includes(MARKER)) && (p.capture_consents || []).some((c) => c.repo === REPO));
  check("product sees only its own private constraints", (p.private_constraints || []).every((c) => c.owner === "product"));
  check("security sees only its own private constraints", (views.security.private_constraints || []).every((c) => c.owner === "security"));
  check("product view has no org_draft key", !("org_draft" in p));
  check("security view has no org_draft key", !("org_draft" in views.security));
  check("leadership view keeps the org_draft key", "org_draft" in views.leadership);
  const shared = (v) => (v.goals || []).every((g) => g.visibility === "shared");
  check("every goal reaching product and security is shared (Northstar has no private goals)", shared(p) && shared(views.security));
  const m = await call("GET", "/api/mappings", { cookie: product });
  const goalIds = new Set((views.leadership.goals || []).filter((g) => g.visibility === "shared").map((g) => g.id));
  check("GET /api/mappings registry lists only shared goals (A-7)", m.status === 200 && m.body.registry.every((e) => e.goal_id === null || goalIds.has(e.goal_id)));
}

// ---------------- B1-4 external model off by default ----------------
console.log(`\n# B1-4 external model off by default (server expected: ${EXPECT_MAPPER})`);
{
  const src = readFileSync(path.join(ROOT, "lib", "mapper.ts"), "utf8");
  check("lib/mapper.ts no longer reads the Sparta team-inbox .env", !/team-inbox|readFileSync|\.env["'`]/.test(src));
  check("lib/mapper.ts has the explicit ALIGN_MAPPER_EXTERNAL=1 control", /process\.env\.ALIGN_MAPPER_EXTERNAL === "1"/.test(src));

  await grant(lead);
  const id = `claude-code:${sid("mapper")}`;
  const e = await postEvent(event(id.slice(12)));
  if (e.status === 200) created.add(id);
  check("consented event accepted", e.status === 200, `status=${e.status}`);
  for (let i = 0; i < 3; i++) await call("GET", "/api/state", { cookie: lead }); // ensureRegistryFresh runs on every poll
  const anonR = await call("POST", "/api/mappings", { json: { action: "remap" } });
  check("POST /api/mappings remap signed out is refused with 401", anonR.status === 401, `status=${anonR.status}`);
  for (const [role, cookie] of [["product", product], ["security", await signIn(BASE, "security")]]) {
    const r = await call("POST", "/api/mappings", { cookie, json: { action: "remap" } });
    check(`POST /api/mappings remap as ${role} is refused with 403 (leadership only)`, r.status === 403, `status=${r.status}`);
  }
  const lr = await call("POST", "/api/mappings", { cookie: lead, json: { action: "remap" } });
  check("POST /api/mappings remap as leadership is accepted but not attempted", lr.status === 200 && lr.body?.attempted === false, `status=${lr.status} ${JSON.stringify(lr.body)}`);
  await sleep(3500); // past the 1.5 s debounce: a scheduled mapping would have written a row by now
  const m = await call("GET", "/api/mappings", { cookie: lead });
  check("no mapping row was written for the new session (event, poll and remap paths)", m.status === 200 && !m.body.mappings.some((x) => x.session_id === id), JSON.stringify(m.body?.mappings?.find((x) => x.session_id === id) ?? null));
}

// ---------------- B1-5 key presence ----------------
console.log(`\n# B1-5 key presence (server expected: ${EXPECT_MAPPER})`);
{
  const message = EXPECT_MAPPER === "off" ? "external model off" : "no key";
  const m = await call("GET", "/api/mappings", { cookie: lead });
  check(`GET /api/mappings reports mapper "${message}"`, m.body?.mapper?.status === EXPECT_MAPPER && m.body?.mapper?.message === message, JSON.stringify(m.body?.mapper));
  const s = await call("GET", "/api/sessions", { cookie: lead });
  check(`GET /api/sessions reports mapper "${message}"`, s.body?.mapper?.status === EXPECT_MAPPER && s.body?.mapper?.message === message, JSON.stringify(s.body?.mapper));
  const r = await call("POST", "/api/mappings", { cookie: lead, json: { action: "remap" } });
  check(`remap reports "${message}" and is not attempted`, r.status === 200 && r.body?.attempted === false && r.body?.reason === message, JSON.stringify(r.body));

  const id = `claude-code:${sid("keycheck")}`;
  const e = await postEvent(event(id.slice(12)));
  if (e.status === 200) created.add(id);
  await call("GET", "/api/state", { cookie: lead });
  await sleep(3500);
  const after = await call("GET", "/api/mappings", { cookie: lead });
  const unavailable = (after.body?.mappings || []).filter((x) => x.state === "MAPPER_UNAVAILABLE");
  check("no MAPPER_UNAVAILABLE rows are written", after.status === 200 && unavailable.length === 0, `${unavailable.length} row(s)`);
  check("no mapping row at all for the new session", !(after.body?.mappings || []).some((x) => x.session_id === id));
}

// ---------------- B1-7 custom setup keeps capture consent ----------------
console.log("\n# B1-7 setting up a custom scenario keeps capture consent");
{
  await grant(lead);
  // PR #2 review item 3: setup applies reset's consent filter to sessions.
  const idKeep = `claude-code:${sid("setup-keep")}`;
  const k = await postEvent(event(idKeep.slice(12)));
  if (k.status === 200) created.add(idKeep);
  check("consented session created before the setup", k.status === 200, `status=${k.status}`);
  // An unconsented session cannot be created over HTTP any more (events need consent; revoke purges), so plant one
  // the way older state could hold it: a copy of the consented session in a repo with no consent record.
  const LEGACY_REPO = "b1-synthetic-legacy";
  const idDrop = `claude-code:${sid("setup-drop")}`;
  {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const src = raw.sessions.find((x) => x.id === idKeep);
    raw.sessions.push({ ...src, id: idDrop, session_id: idDrop.slice(12), repo: LEGACY_REPO, cwd_name: LEGACY_REPO });
    const tmp = `${STATE_FILE}.b1test.tmp`;
    writeFileSync(tmp, JSON.stringify(raw, null, 2));
    renameSync(tmp, STATE_FILE);
  }
  check("planted an unconsented session in state", (await stateSessions(lead)).some((s) => s.id === idDrop));
  const fixture = JSON.parse(readFileSync(path.join(ROOT, "data", "scenarios", "example-custom.json"), "utf8"));
  const setup = await call("POST", "/api/scenario", { cookie: lead, json: fixture });
  check("leadership sets up the Fernway scenario", setup.status === 200 && setup.body?.scenario === "custom", `status=${setup.status} ${JSON.stringify(setup.body)}`);
  const kept = await stateSessions(lead);
  check("setupScenario keeps the session whose harness+repo has consent", kept.some((s) => s.id === idKeep));
  check("setupScenario drops the session whose harness+repo has no consent", !kept.some((s) => s.id === idDrop || s.repo === LEGACY_REPO));
  const list = await call("GET", "/api/sessions/consent", { cookie: lead });
  check("the consent record survives the custom setup", list.status === 200 && list.body.consents.some((c) => c.harness === "claude-code" && c.repo === REPO), JSON.stringify(list.body));
  const id = `claude-code:${sid("after-setup")}`;
  const e = await postEvent(event(id.slice(12)));
  if (e.status === 200) created.add(id);
  check("a consented event is still accepted after the custom setup", e.status === 200, `status=${e.status}`);
  const reset = await call("POST", "/api/reset", { cookie: lead, json: { confirm: "reset" } });
  const back = (await call("GET", "/api/state", { cookie: lead })).body || {};
  check("leadership resets back to Northstar", reset.status === 200 && back.company === "Northstar Security" && !("scenario" in back), `status=${reset.status} company=${back.company}`);
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
