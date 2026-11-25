// Reading the person's own Claude Code and Codex session records for the local audit (release B, spec 2.9).
// Files only: no network. Nested subagent logs (<session>/subagents/) are never opened (golden fixture
// "refused: subagent_transcript"). Local only: not exported from src/index.ts.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { classifyClaudeLine, classifyCodexLine, codexSessionMeta, type HumanTurn } from "./human-turns.ts";

export interface Usage { at: number; model: string; input: number; output: number; cacheRead: number; cacheWrite: number }

export interface Session {
  /** sha256 of the file path, first 12 hex: never the path itself. */
  id: string;
  tool: "claude" | "codex";
  /** The repo or folder the session ran in (basename of its cwd), for "where the rework lives". */
  project: string;
  /** Absolute cwd when the log records one (for the outcomes reader); never sent anywhere. */
  cwd: string | null;
  /** Absolute folders the agent's own shell commands worked in (`git -C <path>`, `cd <path>`), for the outcomes reader
   *  when the session itself ran outside a repo. Local only; never sent anywhere. */
  touched: string[];
  /** Commit hashes git printed in this session's own tool output (`[branch abc1234] subject`): the session's own
   *  commits, attributed exactly rather than by time. */
  ownCommits: string[];
  turns: (HumanTurn & { at: number })[];
  /** Every timestamp in the file, ascending: the activity timeline the cost window is measured on. */
  activity: number[];
  usage: Usage[];
}

export interface ReadDiagnostics {
  filesSeen: number;
  sessionsRead: number;
  skipped: Record<string, number>;
  partiallyRead: number;
  malformedLines: number;
}

const hashId = (p: string) => createHash("sha256").update(p).digest("hex").slice(0, 12);

function jsonLines(path: string, diag: ReadDiagnostics): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let bad = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      if (v && typeof v === "object" && !Array.isArray(v)) out.push(v);
    } catch {
      bad++;
    }
  }
  if (bad) { diag.partiallyRead++; diag.malformedLines += bad; }
  return out;
}

const ts = (v: unknown) => (typeof v === "string" ? Date.parse(v) : NaN);

function finish(id: string, tool: Session["tool"], lines: Record<string, unknown>[], turns: Session["turns"], usage: Usage[], fallbackProject: string): Session {
  const activity = lines.map((l) => ts(l.timestamp)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const cwdLine = lines.find((l) => typeof l.cwd === "string") ?? lines.find((l) => typeof (l.payload as Record<string, unknown> | undefined)?.cwd === "string");
  const cwd = (typeof cwdLine?.cwd === "string" ? cwdLine.cwd : (cwdLine?.payload as Record<string, unknown> | undefined)?.cwd as string | undefined) ?? null;
  // A worktree's folder name says little; name the repo above .claude/worktrees or .worktrees when present.
  const project = cwd ? basename(cwd.replace(/\/\.(?:claude\/)?worktrees\/[^/]+.*$/, "")) : fallbackProject;
  return { id, tool, project, cwd, touched: touchedFolders(lines), ownCommits: printedCommits(lines), turns, activity, usage };
}

/** Commit hashes from `git commit` output in tool results: `[main 9a08f5f] subject` or `[branch (root-commit) 9a08f5f]`. */
function printedCommits(lines: Record<string, unknown>[]): string[] {
  const out = new Set<string>();
  for (const l of lines) {
    const content = (l.message as Record<string, unknown> | undefined)?.content;
    if (l.type !== "user" || !Array.isArray(content)) continue;
    for (const b of content as Record<string, unknown>[]) {
      if (b?.type !== "tool_result") continue;
      const parts = Array.isArray(b.content) ? (b.content as Record<string, unknown>[]).map((x) => (typeof x?.text === "string" ? x.text : "")) : [String(b.content ?? "")];
      for (const text of parts) for (const m of text.matchAll(/^\[[\w./-]+(?: \(root-commit\))? ([0-9a-f]{7,40})\] /gm)) out.add(m[1]);
    }
  }
  return [...out];
}

/** Absolute folders named by the agent's Bash tool calls: `git -C <path>` and `cd <path>`. */
function touchedFolders(lines: Record<string, unknown>[]): string[] {
  const out = new Set<string>();
  for (const l of lines) {
    const content = (l.message as Record<string, unknown> | undefined)?.content;
    if (l.type !== "assistant" || !Array.isArray(content)) continue;
    for (const b of content as Record<string, unknown>[]) {
      const cmd = b?.type === "tool_use" && b.name === "Bash" ? (b.input as Record<string, unknown> | undefined)?.command : undefined;
      if (typeof cmd !== "string") continue;
      for (const m of cmd.matchAll(/(?:git\s+-C|(?:^|[;&|]\s*)cd)\s+("[^"]+"|'[^']+'|\/[^\s;&|]+)/g)) {
        const p = m[1].replace(/^["']|["']$/g, "");
        if (p.startsWith("/")) out.add(p);
      }
    }
  }
  return [...out];
}

function readClaude(path: string, projectDir: string, diag: ReadDiagnostics): Session | null {
  const lines = jsonLines(path, diag);
  const turns: Session["turns"] = [];
  const usage: Usage[] = [];
  const seen = new Set<string>();
  let automated = 0;
  for (const l of lines) {
    const k = classifyClaudeLine(l);
    if (k.kind === "turn") turns.push({ ...k.turn, at: ts(k.turn.ts) });
    if (k.kind === "automated") automated++;
    const m = l.message as Record<string, unknown> | undefined;
    if (l.type === "assistant" && m && typeof m.usage === "object" && m.usage) {
      // Claude Code writes one line per content block with the same message id and usage: count each message once.
      const mid = typeof m.id === "string" ? m.id : "";
      if (mid && seen.has(mid)) continue;
      seen.add(mid);
      const u = m.usage as Record<string, number>;
      usage.push({ at: ts(l.timestamp), model: String(m.model ?? ""), input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
    }
  }
  if (!turns.length) { diag.skipped[automated ? "automated" : "no_human_turns"] = (diag.skipped[automated ? "automated" : "no_human_turns"] ?? 0) + 1; return null; }
  return finish(hashId(path), "claude", lines, turns, usage, projectDir.replace(/^-Users-[^-]+-/, ""));
}

function readCodex(path: string, diag: ReadDiagnostics): Session | null {
  const lines = jsonLines(path, diag);
  const meta = lines[0] ? codexSessionMeta(lines[0]) : null;
  if (meta?.skip) { diag.skipped[meta.skip] = (diag.skipped[meta.skip] ?? 0) + 1; return null; }
  const turns: Session["turns"] = [];
  for (const l of lines) {
    const k = classifyCodexLine(l);
    if (k.kind === "turn") turns.push({ ...k.turn, at: ts(k.turn.ts) });
  }
  if (!turns.length) { diag.skipped.no_human_turns = (diag.skipped.no_human_turns ?? 0) + 1; return null; }
  return finish(hashId(path), "codex", lines, turns, [], "codex");
}

function walk(dir: string, pick: (name: string) => boolean, out: string[]) {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    const p = join(dir, n);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, pick, out);
    else if (pick(n)) out.push(p);
  }
}

/** Sessions modified within the last `days`, from Claude Code (top level only) and Codex. */
export function readSessions(opts: { days: number; home?: string; now?: number }): { sessions: Session[]; diagnostics: ReadDiagnostics } {
  const home = opts.home ?? homedir();
  const since = (opts.now ?? Date.now()) - opts.days * 86_400_000;
  const diag: ReadDiagnostics = { filesSeen: 0, sessionsRead: 0, skipped: {}, partiallyRead: 0, malformedLines: 0 };
  const sessions: Session[] = [];
  const claudeRoot = join(home, ".claude/projects");
  let projects: string[] = [];
  try { projects = readdirSync(claudeRoot); } catch {}
  for (const proj of projects) {
    const dir = join(claudeRoot, proj);
    let files: string[] = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const p = join(dir, f);
      if (statSync(p).mtimeMs < since) continue;
      diag.filesSeen++;
      const s = readClaude(p, proj, diag);
      if (s) sessions.push(s);
    }
  }
  const codex: string[] = [];
  walk(join(home, ".codex/sessions"), (n) => n.startsWith("rollout-") && n.endsWith(".jsonl"), codex);
  for (const p of codex) {
    if (statSync(p).mtimeMs < since) continue;
    diag.filesSeen++;
    const s = readCodex(p, diag);
    if (s) sessions.push(s);
  }
  // Measure only the window: a long-lived session keeps turns from before it, which would leak older weeks in.
  const inWindow: Session[] = [];
  for (const s of sessions) {
    const turns = s.turns.filter((t) => t.at >= since);
    if (!turns.length) { diag.skipped.outside_window = (diag.skipped.outside_window ?? 0) + 1; continue; }
    inWindow.push({ ...s, turns, activity: s.activity.filter((t) => t >= since), usage: s.usage.filter((u) => u.at >= since) });
  }
  diag.sessionsRead = inWindow.length;
  return { sessions: inWindow, diagnostics: diag };
}
