#!/usr/bin/env node
// Import past Claude Code and Codex sessions for one folder into an Align workspace (Mode L), so the workspace's Work
// view and align_get_goal_activity show what agents already did, not only what happens after capture is turned on.
//
// It sends each session as the capture hook would (scripts/align-capture.mjs): a few typed prompts, the files the
// agent edited, and its last message, with each event's real time. Nothing else leaves the session file; the server
// redacts and caps it (app/api/sessions/events). No model is called.
//
// Usage:
//   ALIGN_TOKEN_CLAUDE=agt.… ALIGN_TOKEN_CODEX=agt.… node scripts/align-import-sessions.mjs \
//     --base http://127.0.0.1:3198 --dir ~/academic/OMSCS/research [--days 30] [--exclude <regex>] [--dry-run]
// The tokens come from the workspace (leadership: POST /api/workspaces/agent-token with that harness and the folder's
// name as repo), which also records that folder's capture consent.

import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const DIR = path.resolve((arg("dir", process.cwd())).replace(/^~/, homedir()));
const BASE = arg("base", "http://127.0.0.1:3100");
const DAYS = Number(arg("days", "30"));
const DRY = process.argv.includes("--dry-run");
const EXCLUDE = arg("exclude", null) ? new RegExp(arg("exclude")) : null; // sessions whose first prompt matches are skipped
const REPO = path.basename(DIR);
const SINCE = Date.now() - DAYS * 86400000;
const MAX_PROMPTS = 8;
const MAX_FILES = 20;

// Text that a harness or an orchestrator injected, not something the person typed.
// Includes transcripts an approval reviewer pastes in as numbered turns ("[300] tool exec call: …").
const INJECTED = /^(<|#\s*AGENTS\.md|>>>|Assess the exact planned action|The following is the Codex agent history|Caveat:|\[SYSTEM|Base directory for this skill|This session is being continued|\[\d+\] (assistant|tool|user|developer)\b)/;
const typed = (t) => typeof t === "string" && t.trim().length > 1 && !INJECTED.test(t.trim());

async function* lines(file) {
  const rl = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const l of rl) {
    if (!l) continue;
    try {
      yield JSON.parse(l);
    } catch {
      /* a partial line at the end of a live session */
    }
  }
}

function newer(file) {
  try {
    return statSync(file).mtimeMs >= SINCE;
  } catch {
    return false;
  }
}

// ---- Claude Code: ~/.claude/projects/<folder path with / as ->/<session>.jsonl ----
async function claudeSessions() {
  const root = path.join(homedir(), ".claude", "projects");
  const slug = DIR.replace(/[^A-Za-z0-9]/g, "-");
  if (!existsSync(root)) return [];
  const out = [];
  // The folder itself and folders inside it (Claude Code names a project by its path with "/" as "-").
  for (const d of readdirSync(root).filter((n) => n === slug || n.startsWith(`${slug}-`))) {
    for (const f of readdirSync(path.join(root, d)).filter((n) => n.endsWith(".jsonl"))) {
      const file = path.join(root, d, f);
      if (!newer(file)) continue;
      const s = { harness: "claude-code", id: f.replace(/\.jsonl$/, ""), prompts: [], files: [], last: "", first: null, lastAt: null };
      for await (const e of lines(file)) {
        const at = e.timestamp;
        if (at) [s.first, s.lastAt] = [s.first ?? at, at];
        const c = e.message?.content;
        if (e.type === "user" && !e.isMeta && typeof c === "string" && typed(c) && s.prompts.length < MAX_PROMPTS) s.prompts.push({ at, text: c });
        if (e.type === "assistant" && Array.isArray(c)) {
          for (const b of c) {
            if (b.type === "text" && b.text?.trim()) s.last = b.text;
            const fp = b.type === "tool_use" && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name) ? b.input?.file_path : null;
            if (fp && !s.files.includes(fp) && s.files.length < MAX_FILES) s.files.push(fp);
          }
        }
      }
      if (s.prompts.length) out.push(s);
    }
  }
  return out;
}

// ---- Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl whose session_meta cwd is inside the folder ----
async function codexSessions() {
  const root = path.join(homedir(), ".codex", "sessions");
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (d, depth) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (depth < 3) walk(p, depth + 1);
      else if (n.startsWith("rollout-") && n.endsWith(".jsonl") && newer(p)) files.push(p);
    }
  };
  walk(root, 0);
  const out = [];
  for (const file of files) {
    const s = { harness: "codex", id: path.basename(file).replace(/^rollout-|\.jsonl$/g, "").slice(-36), prompts: [], files: [], last: "", first: null, lastAt: null };
    let inside = null;
    for await (const e of lines(file)) {
      if (inside === null && e.type === "session_meta") {
        const cwd = e.payload?.cwd ?? "";
        inside = cwd === DIR || cwd.startsWith(`${DIR}/`);
        if (!inside) break;
        continue;
      }
      if (!inside) continue;
      const at = e.timestamp;
      if (at) [s.first, s.lastAt] = [s.first ?? at, at];
      const p = e.payload ?? {};
      // Older rollouts carry user_message/agent_message events; newer ones only the response items. Read both.
      const msg = e.type === "response_item" && p.type === "message" ? (p.content ?? []).map((c) => c.text ?? "").join(" ") : null;
      const said = e.type === "event_msg" && p.type === "user_message" ? p.message : msg !== null && p.role === "user" ? msg : null;
      if (typed(said) && s.prompts.length < MAX_PROMPTS && !s.prompts.some((x) => x.text === said)) s.prompts.push({ at, text: said });
      const reply = e.type === "event_msg" && p.type === "agent_message" ? p.message : msg !== null && p.role === "assistant" ? msg : null;
      if (reply?.trim()) s.last = reply;
      // Edits arrive as apply_patch, or as a patch inside another tool's input (newer Codex runs them through exec).
      if (e.type === "response_item" && (p.type === "custom_tool_call" || p.type === "function_call") && typeof (p.input ?? p.arguments) === "string") {
        p.input = p.input ?? p.arguments;
        for (const m of p.input.matchAll(/\*\*\* (?:Update|Add) File: ([^\n"\\]{1,300})/g)) {
          const f = m[1].trim();
          if (f && !s.files.includes(f) && s.files.length < MAX_FILES) s.files.push(f);
        }
      }
    }
    if (inside && s.prompts.length) out.push(s);
  }
  return out;
}

async function send(token, ev) {
  const res = await fetch(`${BASE}/api/sessions/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(ev),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()} (${ev.hook_event}, ${JSON.stringify(ev).length} bytes)`);
}

const sessions = [...(await claudeSessions()), ...(await codexSessions())].filter((x) => !EXCLUDE || !EXCLUDE.test(x.prompts[0].text)).sort((a, b) => String(a.first).localeCompare(String(b.first)));
console.log(`${sessions.length} session(s) in ${DIR} from the last ${DAYS} days: ${sessions.filter((s) => s.harness === "claude-code").length} Claude Code, ${sessions.filter((s) => s.harness === "codex").length} Codex`);
if (DRY) {
  for (const s of sessions) console.log(`${String(s.first).slice(0, 16)} ${s.harness} ${s.prompts.length} prompt(s), ${s.files.length} file(s): ${s.prompts[0].text.replace(/\s+/g, " ").slice(0, 90)}`);
  process.exit(0);
}
const tokens = { "claude-code": process.env.ALIGN_TOKEN_CLAUDE, codex: process.env.ALIGN_TOKEN_CODEX };
let sent = 0;
let skipped = 0;
for (const s of sessions) {
  const token = tokens[s.harness];
  if (!token) {
    skipped++;
    continue;
  }
  const base = { harness: s.harness, session_id: s.id, cwd: DIR, repo: REPO };
  await send(token, { ...base, hook_event: "SessionStart", at: s.first });
  for (const p of s.prompts) await send(token, { ...base, hook_event: "UserPromptSubmit", prompt: p.text.slice(0, 1000), at: p.at });
  for (const f of s.files) await send(token, { ...base, hook_event: "PostToolUse", tool_name: "Edit", file_path: f, at: s.lastAt });
  // A session last touched within the hour may still be running: leave it open, as the live hook would.
  const recent = Date.now() - Date.parse(s.lastAt) < 3600000;
  await send(token, { ...base, hook_event: recent ? "Notification" : "Stop", last_message: s.last.slice(0, 1000), at: s.lastAt });
  sent++;
}
console.log(`Imported ${sent} session(s)${skipped ? `; skipped ${skipped} without a token for their harness` : ""}.`);
