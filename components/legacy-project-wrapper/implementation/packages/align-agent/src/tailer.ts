// Incremental transcript/rollout tailer. Reads each file from its saved byte offset, detects rewrites and truncation
// (inode change, shrink, or a changed prefix), and keeps per-file parser state so a restart resumes exactly.
// A trailing line without a newline is parsed when it is complete JSON, but the offset stays before it so the next
// pass reads it again; request keys and root-turn uniqueness make that idempotent.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import { applyEvents } from "./ledger.ts";
import type { Harness } from "./shared/types.ts";
import { initClaudeState, parseClaudeLine, type ClaudeFileState } from "./spend/claude.ts";
import { initCodexState, parseCodexLine, type CodexFileState } from "./spend/codex.ts";
import type { ParsedEvent } from "./spend/events.ts";
import { tx } from "./db.ts";

const PREFIX_MAX = 64 * 1024;
const CHUNK_MAX = 16 * 1024 * 1024;

interface FileRow {
  path: string;
  harness: Harness;
  dev: number;
  ino: number;
  size: number;
  offset: number;
  prefix_len: number;
  prefix_hash: string;
  state_json: string;
  mtime_ms: number;
  rewrites: number;
}

function hashPrefix(fd: number, len: number): string {
  const buf = Buffer.alloc(len);
  const n = len ? fs.readSync(fd, buf, 0, len, 0) : 0;
  return crypto.createHash("sha256").update(buf.subarray(0, n)).digest("hex");
}

function walk(dir: string, match: (file: string) => boolean, minMtime: number, out: string[], depth = 0): void {
  if (depth > 6) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, match, minMtime, out, depth + 1);
    else if (e.isFile() && match(p)) {
      try {
        if (fs.statSync(p).mtimeMs >= minMtime) out.push(p);
      } catch {
        /* vanished */
      }
    }
  }
}

export function discover(ctx: Ctx): { file: string; harness: Harness }[] {
  const minMtime = Date.now() - ctx.config.tail_days * 86_400_000;
  const claude: string[] = [];
  walk(path.join(ctx.paths.claudeDir, "projects"), (f) => f.endsWith(".jsonl"), minMtime, claude);
  const codex: string[] = [];
  for (const sub of ["sessions", "archived_sessions"]) {
    walk(path.join(ctx.paths.codexHome, sub), (f) => /rollout-.*\.jsonl$/.test(path.basename(f)), minMtime, codex);
  }
  return [...claude.map((file) => ({ file, harness: "claude-code" as Harness })), ...codex.map((file) => ({ file, harness: "codex" as Harness }))];
}

type AnyState = ClaudeFileState | CodexFileState;

function freshState(harness: Harness, file: string): AnyState {
  return harness === "claude-code" ? initClaudeState(file) : initCodexState(`tc:${crypto.createHash("sha256").update(file).digest("hex").slice(0, 24)}`);
}

export interface TailResult {
  files: number;
  bytes: number;
  rewrites: number;
  events: number;
}

/** Tail one file. Exposed for tests. */
export function tailFile(ctx: Ctx, file: string, harness: Harness): { bytes: number; rewrite: boolean; events: ParsedEvent[] } {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { bytes: 0, rewrite: false, events: [] };
  }
  const row = ctx.db.prepare("SELECT * FROM files WHERE path=?").get(file) as unknown as FileRow | undefined;
  // Cheap skip for the common case: same inode, same size, same mtime.
  if (row && row.ino === st.ino && row.dev === st.dev && row.size === st.size && row.offset === st.size && row.mtime_ms === Math.floor(st.mtimeMs)) {
    return { bytes: 0, rewrite: false, events: [] };
  }
  const fd = fs.openSync(file, "r");
  try {
    let offset = row ? row.offset : 0;
    let state: AnyState = row ? JSON.parse(row.state_json) : freshState(harness, file);
    let rewrite = false;
    if (row) {
      const prefixLen = Math.min(row.prefix_len, st.size);
      if (st.ino !== row.ino || st.dev !== row.dev || st.size < row.offset || prefixLen < row.prefix_len || hashPrefix(fd, prefixLen) !== row.prefix_hash) {
        rewrite = true;
        offset = 0;
        state = freshState(harness, file);
      }
    }
    if (!rewrite && row && st.size === row.offset) return { bytes: 0, rewrite: false, events: [] };
    const len = Math.min(st.size - offset, CHUNK_MAX);
    const buf = Buffer.alloc(len);
    const n = len > 0 ? fs.readSync(fd, buf, 0, len, offset) : 0;
    const text = buf.subarray(0, n);
    const events: ParsedEvent[] = [];
    let consumed = 0;
    let start = 0;
    for (;;) {
      const nl = text.indexOf(0x0a, start);
      if (nl < 0) break;
      const line = text.subarray(start, nl).toString("utf8");
      events.push(...parseLine(harness, line, state));
      start = nl + 1;
      consumed = start;
    }
    // A complete JSON object without a trailing newline (writer finished or paused) is read but not consumed.
    if (start < text.length && offset + n === st.size) {
      const tail = text.subarray(start).toString("utf8");
      try {
        JSON.parse(tail);
        const scratch = JSON.parse(JSON.stringify(state)) as AnyState;
        events.push(...parseLine(harness, tail, scratch));
      } catch {
        /* partial line: wait for the rest */
      }
    }
    const newOffset = offset + consumed;
    const prefixLen = Math.min(newOffset, PREFIX_MAX);
    const prefixHash = hashPrefix(fd, prefixLen);
    tx(ctx.db, () => {
      applyEvents(ctx, events);
      ctx.db
        .prepare(
          `INSERT INTO files(path, harness, dev, ino, size, offset, prefix_len, prefix_hash, state_json, mtime_ms, rewrites) VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(path) DO UPDATE SET dev=excluded.dev, ino=excluded.ino, size=excluded.size, offset=excluded.offset, prefix_len=excluded.prefix_len,
             prefix_hash=excluded.prefix_hash, state_json=excluded.state_json, mtime_ms=excluded.mtime_ms, rewrites=files.rewrites+excluded.rewrites`,
        )
        .run(file, harness, st.dev, st.ino, st.size, newOffset, prefixLen, prefixHash, JSON.stringify(state), Math.floor(st.mtimeMs), rewrite ? 1 : 0);
    });
    return { bytes: consumed, rewrite, events };
  } finally {
    fs.closeSync(fd);
  }
}

function parseLine(harness: Harness, line: string, state: AnyState): ParsedEvent[] {
  return harness === "claude-code" ? parseClaudeLine(line, state as ClaudeFileState) : parseCodexLine(line, state as CodexFileState);
}

/** One pass over all files; with budgetMs, keep passing until caught up or the budget runs out. */
export function tailAll(ctx: Ctx, budgetMs = 0): TailResult {
  const res = tailPass(ctx);
  const until = Date.now() + budgetMs;
  let last = res.bytes;
  while (budgetMs > 0 && last > 0 && Date.now() < until) {
    const r = tailPass(ctx);
    res.bytes += r.bytes;
    res.events += r.events;
    res.rewrites += r.rewrites;
    last = r.bytes;
  }
  return res;
}

function tailPass(ctx: Ctx): TailResult {
  const res: TailResult = { files: 0, bytes: 0, rewrites: 0, events: 0 };
  for (const { file, harness } of discover(ctx)) {
    try {
      const r = tailFile(ctx, file, harness);
      res.files++;
      res.bytes += r.bytes;
      res.events += r.events.length;
      if (r.rewrite) res.rewrites++;
    } catch (e) {
      ctx.log(`tail ${path.basename(file)} failed: ${(e as Error).message}`);
    }
  }
  return res;
}
