import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openCtx, type Ctx } from "../src/context.ts";

export const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = path.join(PKG, "dist");
export const HOOK = path.join(DIST, "hook.js");
export const CLI = path.join(DIST, "cli.js");

export interface TestEnv {
  root: string;
  env: NodeJS.ProcessEnv;
  home: string;
  claudeDir: string;
  codexHome: string;
  cleanup: () => void;
}

/** A sandbox: HOME, ALIGN_HOME, CLAUDE_CONFIG_DIR, CODEX_HOME and LaunchAgents all point into a temp dir. */
export function makeEnv(extra: NodeJS.ProcessEnv = {}): TestEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "align-test-"));
  const home = path.join(root, "home");
  const claudeDir = path.join(home, ".claude");
  const codexHome = path.join(home, ".codex");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: home,
    ALIGN_HOME: path.join(home, ".align"),
    CLAUDE_CONFIG_DIR: claudeDir,
    CODEX_HOME: codexHome,
    ALIGN_NO_BROWSER: "1",
    ALIGN_TAIL_DAYS: "3650",
    ALIGN_NO_AUTOSTART: "1",
    ...extra,
  };
  return { root, env, home: env.ALIGN_HOME as string, claudeDir, codexHome, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export function ctxFor(t: TestEnv): Ctx {
  return openCtx(t.env, () => undefined);
}

export interface HookRun {
  stdout: string;
  stderr: string;
  code: number | null;
  ms: number;
}

export function runHook(t: TestEnv, harness: "claude" | "codex", event: string, input: unknown, extraEnv: NodeJS.ProcessEnv = {}, nodeArgs: string[] = []): HookRun {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [...nodeArgs, HOOK, harness, event], { input: JSON.stringify(input), env: { ...t.env, ...extraEnv }, encoding: "utf8", timeout: 10_000 });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}

export function runCli(t: TestEnv, args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { env: { ...t.env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

export function writeLines(file: string, lines: unknown[], trailingNewline = true): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + (trailingNewline ? "\n" : ""));
}

export function appendLines(file: string, lines: unknown[]): void {
  fs.appendFileSync(file, lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n");
}

export async function waitFor<T>(fn: () => T | Promise<T>, ms = 5000, label = "condition"): Promise<NonNullable<T>> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

// ---------- synthetic transcript lines (same shape as real files, invented content) ----------
export function claudeUser(sessionId: string, promptId: string, ts: string, extra: Record<string, unknown> = {}) {
  return { type: "user", sessionId, promptId, uuid: `u-${promptId}-${ts}`, timestamp: ts, cwd: "/tmp/synthetic-repo", message: { role: "user", content: "synthetic prompt" }, ...extra };
}

export function claudeAssistant(
  sessionId: string,
  requestId: string | null,
  ts: string,
  usage: Record<string, unknown>,
  opts: { stop?: string | null; model?: string; msgId?: string; sidechain?: boolean; uuid?: string } = {},
) {
  return {
    type: "assistant",
    sessionId,
    ...(requestId ? { requestId } : {}),
    uuid: opts.uuid || `a-${requestId}-${ts}`,
    timestamp: ts,
    isSidechain: !!opts.sidechain,
    cwd: "/tmp/synthetic-repo",
    message: {
      model: opts.model || "claude-opus-5-5",
      id: opts.msgId || `msg_${requestId || "x"}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "synthetic" }],
      stop_reason: opts.stop === undefined ? "end_turn" : opts.stop,
      usage,
    },
  };
}

export function usage(input: number, output: number, cacheRead = 0, w5 = 0, w1 = 0, total?: number) {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: total ?? w5 + w1,
    cache_creation: { ephemeral_5m_input_tokens: w5, ephemeral_1h_input_tokens: w1 },
  };
}

export function codexMeta(id: string, sessionId: string, opts: { parent?: string; threadSource?: string; source?: unknown; model?: string } = {}) {
  return {
    timestamp: "2026-10-20T10:00:00.000Z",
    type: "session_meta",
    payload: {
      id,
      session_id: sessionId,
      parent_thread_id: opts.parent ?? null,
      cwd: "/tmp/synthetic-repo",
      source: opts.source ?? "exec",
      thread_source: opts.threadSource ?? "user",
      model_provider: "openai",
    },
  };
}

export function codexTurnContext(turnId: string, model: string, ts = "2026-10-20T10:00:01.000Z") {
  return { timestamp: ts, type: "turn_context", payload: { turn_id: turnId, root_turn_id: turnId, model, cwd: "/tmp/synthetic-repo" } };
}

export function codexTaskStarted(turnId: string, ts = "2026-10-20T10:00:00.500Z") {
  return { timestamp: ts, type: "event_msg", payload: { type: "task_started", turn_id: turnId, root_turn_id: turnId } };
}

export function tok(input: number, cached: number, output: number) {
  return { input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output };
}

export function codexTur(responseId: string, threadId: string, sessionId: string, turnId: string, u: ReturnType<typeof tok>, ts = "2026-10-20T10:00:02.000Z") {
  return { timestamp: ts, type: "token_usage_record", payload: { thread_id: threadId, turn_id: turnId, session_id: sessionId, root_turn_id: turnId, response_id: responseId, usage: u, turn_token_usage: u, thread_token_usage: u } };
}

export function codexTokenCount(total: ReturnType<typeof tok> | null, last: ReturnType<typeof tok> | null, ts = "2026-10-20T10:00:03.000Z") {
  return { timestamp: ts, type: "event_msg", payload: { type: "token_count", info: { ...(total ? { total_token_usage: total } : {}), ...(last ? { last_token_usage: last } : {}), model_context_window: 400000 } } };
}

export function rows(ctx: Ctx, sql = "SELECT * FROM requests ORDER BY ts, request_key", ...params: (string | number | null)[]): any[] {
  return ctx.db.prepare(sql).all(...params) as any[];
}
