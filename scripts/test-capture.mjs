#!/usr/bin/env node
// Capture hook test: pipes sample Claude Code hook payloads through align-capture.mjs and checks /api/sessions.
// Usage: node scripts/test-capture.mjs [baseUrl]   (default http://localhost:3100)
// B1: capture needs a consent record for the harness and repo, and GET /api/sessions needs a signed-in session.
// The test grants consent for this repo first, reads with a leadership cookie, and revokes the consent at the end.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signIn } from "./lib/harness.mjs";

const BASE = (process.argv[2] || process.env.ALIGN_URL || "http://localhost:3100").replace(/\/$/, "");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCRIPT = path.join(HERE, "align-capture.mjs");
const SID = `test-capture-${Date.now()}`;
const KEY = "sk-test1234567890abcd";

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

const common = { session_id: SID, transcript_path: "/tmp/none.jsonl", cwd: ROOT, permission_mode: "default" };
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
    tool_input: { file_path: path.join(ROOT, "lib", "mapper.ts"), old_string: "SECRET OLD", new_string: "SECRET NEW" },
    tool_response: { filePath: path.join(ROOT, "lib", "mapper.ts"), structuredPatch: "SECRET PATCH" },
    tool_use_id: "toolu_test",
  },
  { ...common, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Closed 3 tickets." },
];

// The hook reports repo = basename of the git toplevel (this worktree).
const REPO = path.basename(ROOT);
const cookie = await signIn(BASE, "leadership");
const consent = (method) =>
  fetch(`${BASE}/api/sessions/consent`, { method, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ harness: "claude-code", repo: REPO }) });
const granted = await consent("POST");
check(`capture consent granted for claude-code + ${REPO}`, granted.ok, `status=${granted.status}`);

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
  check("origin is linear LIN-412", sess.origin?.kind === "linear" && sess.origin?.ref === "LIN-412", JSON.stringify(sess.origin));
  check("key redacted", !blob.includes(KEY) && sess.prompts.some((p) => p.text.includes("[redacted]")), sess.prompts[0]?.text);
  check("file path recorded (repo-relative)", sess.files.includes("lib/mapper.ts"), JSON.stringify(sess.files));
  check("no tool input/output content stored", !blob.includes("SECRET"));
  check("no full home path stored", !blob.includes(ROOT));
  check("tools recorded", sess.tools.includes("Edit"), JSON.stringify(sess.tools));
  check("ended_at set on Stop", typeof sess.ended_at === "string");
  check("last_message captured", sess.last_message === "Closed 3 tickets.");
}

const dead = await run(payloads[0], { ALIGN_CAPTURE: "1", ALIGN_URL: "http://127.0.0.1:9" });
check("dead ALIGN_URL: exits 0 in <1.5s with empty stdout", dead.code === 0 && dead.ms < 1500 && dead.stdout === "", `code=${dead.code} ${dead.ms}ms`);

const revoked = await consent("DELETE");
check("capture consent revoked", revoked.ok, `status=${revoked.status}`);

console.log(`\nTest session id: claude-code:${SID}`);
console.log(failures ? `${failures} FAILED` : "ALL PASS");
process.exit(failures ? 1 : 0);
