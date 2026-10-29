#!/usr/bin/env node
// scripts/align-import-sessions.mjs picks only the sessions of one folder (review M2). Claude Code names a project by its
// path with "/", "-" and "." all as "-", so /work/app-secret and /work/app.v2 share /work/app's prefix: the importer must
// go by each session's own cwd. Runs the importer with --dry-run against a fake HOME. No server is needed.
// Usage: node scripts/test-import-sessions.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${String(detail).slice(0, 600)}`}`);
}

const home = mkdtempSync(path.join(tmpdir(), "align-import-"));
const now = new Date().toISOString();
const DIR = "/work/app";
const slug = (p) => p.replace(/[^A-Za-z0-9]/g, "-");

/** A Claude Code session file whose lines carry `cwd` (or none, when cwd is null). */
function claude(project, id, cwd, prompt) {
  const d = path.join(home, ".claude", "projects", slug(project));
  mkdirSync(d, { recursive: true });
  const base = cwd === null ? {} : { cwd };
  const lines = [
    { type: "user", timestamp: now, ...base, message: { role: "user", content: prompt } },
    { type: "assistant", timestamp: now, ...base, message: { role: "assistant", content: [{ type: "text", text: "done" }] } },
  ];
  writeFileSync(path.join(d, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}
/** A Codex rollout whose session_meta names its cwd. */
function codex(id, cwd, prompt) {
  const d = path.join(home, ".codex", "sessions", "2026", "10", "29");
  mkdirSync(d, { recursive: true });
  const lines = [
    { type: "session_meta", timestamp: now, payload: { cwd } },
    { type: "event_msg", timestamp: now, payload: { type: "user_message", message: prompt } },
  ];
  writeFileSync(path.join(d, `rollout-${id.padStart(36, "0")}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

try {
  claude("/work/app", "c-own", "/work/app", "MARK_OWN fix the parser");
  claude("/work/app/sub", "c-sub", "/work/app/sub", "MARK_SUB tidy the subfolder");
  claude("/work/app-secret", "c-secret", "/work/app-secret", "MARK_SECRET rotate the keys");
  claude("/work/app.v2", "c-v2", "/work/app.v2", "MARK_V2 port to v2");
  claude("/work/app-x", "c-nocwd", null, "MARK_NOCWD no cwd recorded");
  // A session filed under the folder's own project name but whose lines say it ran elsewhere.
  claude("/work/app", "c-lies", "/work/app-secret", "MARK_LIES filed under app, ran in app-secret");
  codex("1", "/work/app", "MARK_CX_OWN codex in the folder");
  codex("2", "/work/app-secret", "MARK_CX_SECRET codex in a sibling");

  const out = execFileSync(process.execPath, [path.join(process.cwd(), "scripts/align-import-sessions.mjs"), "--dir", DIR, "--dry-run", "--days", "3"], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: "utf8",
  });
  const has = (m) => out.includes(m);
  check("the folder's own Claude Code and Codex sessions, and one in a folder inside it, are imported", has("MARK_OWN") && has("MARK_SUB") && has("MARK_CX_OWN"), out);
  check("M2 sibling folders whose names start the same (/work/app-secret, /work/app.v2) are not imported", !has("MARK_SECRET") && !has("MARK_V2") && !has("MARK_CX_SECRET"), out);
  check("a session with no cwd on any line, or whose cwd is outside the folder, is not imported", !has("MARK_NOCWD") && !has("MARK_LIES"), out);
  check("the count line matches: 3 sessions, 2 Claude Code, 1 Codex", /^3 session\(s\) in \/work\/app .*: 2 Claude Code, 1 Codex/m.test(out), out);
} catch (e) {
  check("the importer ran", false, e.stderr?.toString() || e.message);
} finally {
  rmSync(home, { recursive: true, force: true });
}

console.log(`\ntest-import-sessions: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
