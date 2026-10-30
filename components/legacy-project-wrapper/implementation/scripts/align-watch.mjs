#!/usr/bin/env node
// Align watcher: a Claude Code background hook ("asyncRewake": true) that waits for an authority change
// relevant to this session and wakes the agent with a replan directive.
//   - Holds an SSE connection to Align (/api/directives/stream); falls back to polling /api/directives.
//   - On the first directive: acknowledges it, prints it to stderr, exits 2 (Claude Code wakes the session).
//   - Exits 1 with one stderr line if Align refuses the agent token (401/403: expired, revoked, or minted on another
//     build), instead of polling a refusal silently until the window ends.
//   - Exits 0 silently otherwise (no change within the window, Align unreachable, not opted in, or another watcher is live).
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ALIGN = process.env.ALIGN_URL || "http://localhost:3100";
// ALIGN_AGENT_TOKEN (a workspace's agent token, Mode L): wake-ups come from that workspace instead of the default store.
const AUTH = process.env.ALIGN_AGENT_TOKEN ? { authorization: `Bearer ${process.env.ALIGN_AGENT_TOKEN}` } : {};
const WINDOW_MS = Number(process.env.ALIGN_WATCH_WINDOW_MS || 55 * 60 * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    const done = () => resolve(data);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", done);
    process.stdin.on("error", done);
    setTimeout(done, 1500);
  });
}

function optedIn(cwd) {
  if (process.env.ALIGN_CAPTURE === "1") return true;
  let dir = cwd;
  for (let i = 0; i < 8 && dir; i++) {
    const f = path.join(dir, ".claude", "settings.json");
    if (existsSync(f) && /align-watch/.test(readFileSync(f, "utf8"))) return true;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return false;
}

function takeLock(sessionId) {
  const file = path.join(tmpdir(), `align-watch-${sessionId.replace(/[^A-Za-z0-9_-]/g, "_")}.pid`);
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, "utf8"));
    try {
      if (pid && pid !== process.pid) {
        process.kill(pid, 0);
        return null; // another watcher is live for this session
      }
    } catch {
      /* stale lock */
    }
  }
  writeFileSync(file, String(process.pid));
  const release = () => {
    try {
      if (Number(readFileSync(file, "utf8")) === process.pid) unlinkSync(file);
    } catch {
      /* gone */
    }
  };
  process.on("exit", release);
  return release;
}

async function deliver(session, d) {
  try {
    await fetch(`${ALIGN}/api/directives/ack`, {
      method: "POST",
      headers: { "content-type": "application/json", ...AUTH },
      body: JSON.stringify({ session, event_id: d.event_id }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* still wake the agent; the next poll would re-deliver otherwise */
  }
  process.stderr.write(d.text + "\n");
  process.exit(2);
}

/** Align refused the token: say so once and stop, so the agent's user knows wake-ups are off. */
function refused(status) {
  process.stderr.write(`align-watch: Align refused this session's token (${status}); wake-ups are off. Mint a new one with scripts/agent-session.sh.\n`);
  process.exit(1);
}

async function viaStream(session, deadline) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(0, deadline - Date.now()));
  try {
    const res = await fetch(`${ALIGN}/api/directives/stream?session=${encodeURIComponent(session)}`, { headers: AUTH, signal: ctl.signal });
    if (res.status === 401 || res.status === 403) refused(res.status);
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (event === "directive" && data) await deliver(session, JSON.parse(data));
      }
    }
  } catch {
    /* dropped: fall back to polling */
  } finally {
    clearTimeout(timer);
  }
}

async function viaPoll(session, until) {
  while (Date.now() < until) {
    try {
      const r = await fetch(`${ALIGN}/api/directives?session=${encodeURIComponent(session)}`, { headers: AUTH, signal: AbortSignal.timeout(3000) });
      if (r.status === 401 || r.status === 403) refused(r.status);
      const j = await r.json();
      if (j.pending?.length) await deliver(session, j.pending[0]);
    } catch {
      /* Align unreachable: keep waiting quietly */
    }
    await sleep(2000);
  }
}

const raw = await readStdin();
let input = {};
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}
const cwd = input.cwd || process.cwd();
if (!input.session_id || !optedIn(cwd)) process.exit(0);
const session = `claude-code:${input.session_id}`;
if (!takeLock(input.session_id)) process.exit(0);

const deadline = Date.now() + WINDOW_MS;
while (Date.now() < deadline) {
  await viaStream(session, deadline);
  await viaPoll(session, Math.min(deadline, Date.now() + 20000)); // brief poll window before reconnecting
}
process.exit(0);
