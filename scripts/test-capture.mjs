#!/usr/bin/env node
// Capture hook test: pipes sample Claude Code hook payloads through align-capture.mjs and checks /api/sessions.
// Usage: node scripts/test-capture.mjs [baseUrl]   (default http://localhost:3100)
// B1: capture needs a consent record for the harness and repo, and GET /api/sessions needs a signed-in session.
// The hook reports repo = basename of the git toplevel, or of the cwd outside git. The test runs it from a temp
// directory named test-capture-b1 (outside any git repo), so the repo is synthetic and never a real one like align.
// It grants consent for that synthetic repo only if none existed, reads with a leadership cookie, then deletes its
// test session and puts consent back exactly as it found it (revoked if it granted it, untouched if it was there).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signIn } from "./lib/harness.mjs";

const BASE = (process.argv[2] || process.env.ALIGN_URL || "http://localhost:3100").replace(/\/$/, "");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "align-capture.mjs");
const SID = `test-capture-${Date.now()}`;
const KEY = "sk-test1234567890abcd";
const REPO = "test-capture-b1";
const TMP = mkdtempSync(path.join(tmpdir(), "align-test-capture-"));
const WORKDIR = path.join(TMP, REPO); // not a git repo: the hook reports basename(cwd) = REPO
mkdirSync(WORKDIR);

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` -- ${detail}` : ""}`);
}

function run(payload, env) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.on("close", (code) => resolve({ code, stdout, ms: Date.now() - started }));
    child.stdin.end(JSON.stringify(payload));
  });
}

const common = { session_id: SID, transcript_path: "/tmp/none.jsonl", cwd: WORKDIR, permission_mode: "default" };
const payloads = [
  {
    ...common,
    hook_event_name: "UserPromptSubmit",
    prompt: `close the stale support tickets oldest-first and reply to each LIN-412 ${KEY}`,
  },
  {
    ...common,
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: { file_path: path.join(WORKDIR, "lib", "mapper.ts"), old_string: "SECRET OLD", new_string: "SECRET NEW" },
    tool_response: { filePath: path.join(WORKDIR, "lib", "mapper.ts"), structuredPatch: "SECRET PATCH" },
    tool_use_id: "toolu_test",
  },
  { ...common, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Closed 3 tickets." },
];

const cookie = await signIn(BASE, "leadership");
const consent = (method) =>
  fetch(`${BASE}/api/sessions/consent`, { method, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ harness: "claude-code", repo: REPO }) });
const consentExists = async () => {
  const r = await fetch(`${BASE}/api/sessions/consent`, { headers: { cookie } }).then((x) => x.json()).catch(() => ({}));
  return (r.consents || []).some((c) => c.harness === "claude-code" && c.repo === REPO);
};
const hadConsent = await consentExists();
let granted = false;

try {
  if (hadConsent) {
    console.log(`capture consent for claude-code + ${REPO} already existed; leaving it as it is`);
  } else {
    const g = await consent("POST");
    granted = g.ok;
    check(`capture consent granted for claude-code + ${REPO}`, g.ok, `status=${g.status}`);
  }

  const env = { ALIGN_CAPTURE: "1", ALIGN_URL: BASE };
  for (const p of payloads) {
    const r = await run(p, env);
    check(`${p.hook_event_name} exits 0 with empty stdout`, r.code === 0 && r.stdout === "", `code=${r.code} stdout=${JSON.stringify(r.stdout)} ${r.ms}ms`);
  }

  const res = await fetch(`${BASE}/api/sessions`, { headers: { cookie } });
  const data = await res.json().catch(() => ({}));
  check("GET /api/sessions returns 200 with sessions/mappings/registry_version", res.ok && Array.isArray(data.sessions) && Array.isArray(data.mappings) && typeof data.registry_version === "string", `status=${res.status}`);
  const sess = (data.sessions || []).find((s) => s.id === `claude-code:${SID}`);
  check("session exists", !!sess, `claude-code:${SID}`);
  if (sess) {
    const blob = JSON.stringify(sess);
    check(`hook reported the synthetic repo ${REPO}`, sess.repo === REPO, `repo=${sess.repo}`);
    check("origin is linear LIN-412", sess.origin?.kind === "linear" && sess.origin?.ref === "LIN-412", JSON.stringify(sess.origin));
    check("key redacted", !blob.includes(KEY) && sess.prompts.some((p) => p.text.includes("[redacted]")), sess.prompts[0]?.text);
    check("file path recorded (repo-relative)", sess.files.includes("lib/mapper.ts"), JSON.stringify(sess.files));
    check("no tool input/output content stored", !blob.includes("SECRET"));
    check("no full home or temp path stored", !blob.includes(TMP) && !(process.env.HOME && blob.includes(process.env.HOME)));
    check("tools recorded", sess.tools.includes("Edit"), JSON.stringify(sess.tools));
    check("ended_at set on Stop", typeof sess.ended_at === "string");
    check("last_message captured", sess.last_message === "Closed 3 tickets.");
  }

  const dead = await run(payloads[0], { ALIGN_CAPTURE: "1", ALIGN_URL: "http://127.0.0.1:9" });
  check("dead ALIGN_URL: exits 0 in <1.5s with empty stdout", dead.code === 0 && dead.ms < 1500 && dead.stdout === "", `code=${dead.code} ${dead.ms}ms`);
} finally {
  // Cleanup: delete the test session, then put consent back exactly as it was.
  const del = await fetch(`${BASE}/api/sessions/${encodeURIComponent(`claude-code:${SID}`)}`, { method: "DELETE", headers: { cookie } });
  check("test session deleted", del.status === 200, `status=${del.status}`);
  if (granted) {
    const revoked = await consent("DELETE");
    check("capture consent revoked (it did not exist before the test)", revoked.ok, `status=${revoked.status}`);
  }
  const hasNow = await consentExists();
  check("capture consent is as it was before the test", hasNow === hadConsent, `before=${hadConsent} after=${hasNow}`);
  const left = await fetch(`${BASE}/api/sessions`, { headers: { cookie } }).then((r) => r.json()).catch(() => ({}));
  check("no test session left behind", !(left.sessions || []).some((s) => s.id === `claude-code:${SID}`));
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\nTest session id: claude-code:${SID} (deleted)`);
console.log(failures ? `${failures} FAILED` : "ALL PASS");
process.exit(failures ? 1 : 0);
