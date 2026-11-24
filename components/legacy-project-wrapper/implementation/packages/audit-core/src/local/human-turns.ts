// Human-turn extraction for the local audit (release B, spec 2.9). What counts as one operator turn in Claude Code
// session logs and Codex rollouts.
//
// PORTED VERBATIM FROM liminal-desktop closure/ingest/agent-corrections.ts lines 183 to 556, at commit
// 41af8850 (main, Nov 24, 2026); not imported across repos. That file is itself a line-for-line port of the desktop
// goal-source parser (src-tauri/src/goal_sources/{parser,codex,claude_code}.rs). The shared golden fixtures from
// the same commit (tests/fixtures/human-turns/, synthetic text) are copied into test/fixtures/human-turns/ and pin
// the agreement: test/human-turns.test.ts must return exactly their expected turns.
//
// Local only. Nothing under src/local/ is exported from src/index.ts, so the hosted paste path cannot reach it.

// ---------------------------------------------------------------------------
// Human-turn extraction (pure, per line)
// ---------------------------------------------------------------------------
//
// These rules are a line-for-line port of the desktop goal-source parser
// (src-tauri/src/goal_sources/{parser,codex,claude_code}.rs), so the
// correction stream and the Goal Brief agree on what one human turn is. The
// shared golden fixtures in tests/fixtures/human-turns/ pin the agreement:
// each fixture lists the operator turns both parsers must return.

/** Wrapper prefixes that mark injected, non-human content. The same list, in
 * the same order, as `synthetic_wrapper` in goal_sources/parser.rs. */
export const SYNTHETIC_PREFIXES = [
  "<environment_context",
  "<ENVIRONMENT",
  "<INSTRUCTIONS>",
  "# AGENTS.md",
  "<in-app-browser-context",
  "<subagent_notification",
  "<heartbeat",
  "<command-args",
  "<bash-stderr",
  "<system-reminder",
  "<command-name",
  "<command-message",
  "<task-notification",
  "<teammate-message",
  "<agent-message",
  "<local-command",
  "<bash-input",
  "<bash-stdout",
  "<ide_",
  "<permissions",
  "<collaboration_mode",
  "<multi_agent_mode",
  "<turn_aborted",
  "<skills_instructions",
  "<codex_internal_context",
  "<goal_context",
  "<recommended_plugins",
  "<apps_instructions",
  "<plugins_instructions",
  "<user_instructions",
  "<image",
  "</image",
  "[SYSTEM NOTIFICATION - NOT USER INPUT]",
  // Also covers "[Request interrupted by user for tool use]".
  "[Request interrupted by user",
  "Caveat: The messages below",
] as const;

const OPENER_ROLES = new Set([
  "reviewer",
  "verifier",
  "auditor",
  "judge",
  "grader",
  "critic",
  "agent",
  "subagent",
  "assistant",
]);

const ALPHANUMERIC = /[\p{Alphabetic}\p{N}]/u;

/** The first 160 bytes of `value` when that is a UTF-8 boundary, else its
 * first 160 characters (Rust `str::get(..160)` with a `chars().take(160)`
 * fallback). */
function openerHead(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= 160) return value;
  // a UTF-8 continuation byte is 0b10xxxxxx
  if ((bytes[160]! & 0xc0) !== 0x80) return bytes.subarray(0, 160).toString("utf8");
  return Array.from(value).slice(0, 160).join("");
}

/** Openers of machine-written prompts that arrive in the human slot:
 * dispatched reviewer / agent prompts and resume summaries. A port of
 * `automated_opener` in goal_sources/parser.rs. */
export function automatedOpener(value: string): boolean {
  const head = openerHead(value).replace(/[A-Z]/g, (c) => c.toLowerCase()); // ASCII only, as Rust
  const firstLine = (head.split("\n")[0] ?? "").replace(/\r$/, "");
  if (
    firstLine.startsWith("this session is being continued from a previous conversation") ||
    firstLine.startsWith("continue the conversation from where it left off")
  ) {
    return true;
  }
  for (const verb of ["review ", "audit ", "verify "]) {
    if (!firstLine.startsWith(verb)) continue;
    const rest = firstLine.slice(verb.length);
    for (const article of ["the ", "this "]) {
      if (!rest.startsWith(article)) continue;
      const object = rest.slice(article.length);
      for (const noun of ["diff", "pr", "pull request", "patch"]) {
        if (!object.startsWith(noun)) continue;
        const next = Array.from(object.slice(noun.length))[0];
        if (next === undefined || !ALPHANUMERIC.test(next)) return true;
      }
    }
  }
  for (const article of ["you are a ", "you are an ", "you are the "]) {
    if (!firstLine.startsWith(article)) continue;
    // The role word must sit in the same sentence, within the next 72
    // characters (the `{0,60}` bound of the original pattern plus a word).
    const sentence = firstLine.slice(article.length).split(".")[0] ?? "";
    const window = Array.from(sentence).slice(0, 72).join("");
    return window.split(/[^\p{Alphabetic}\p{N}]/u).some((word) => OPENER_ROLES.has(word));
  }
  return false;
}

/** True when a trimmed text fragment is injected or machine-written content
 * rather than something the operator typed (`synthetic_wrapper`). */
export function syntheticWrapper(value: string): boolean {
  return SYNTHETIC_PREFIXES.some((prefix) => value.startsWith(prefix)) || automatedOpener(value);
}

/** Human turns longer than this are long dispatched prompts or pastes. A
 * short turn is a correction typed at the agent; a long one can only be a
 * standing rule restated by hand (`restated_rule` evidence). */
export const MAX_HUMAN_TURN_CHARS = 1500;

/** Lines that are pasted material, not the operator's instruction: quoted
 * replies, email headers and address lines, reply and forward separators. */
const PASTED_LINE_PATTERNS: readonly RegExp[] = [
  /^\s*>/,
  /^\s*(?:from|to|cc|bcc|subject|sent|date|reply-to):\s/i,
  /<[^<>\s@]+@[^<>\s]+>/,
  /^\s*on .{0,200}\bwrote:\s*$/i,
  /^\s*-{2,}\s*(?:original|forwarded) message/i,
  /^\s*begin forwarded message/i,
];

/** Remove pasted material (pasted_content blocks, fenced code, quoted and
 * email-like lines), keeping the operator's own lines around it. */
export function stripPastedMaterial(text: string): string {
  return text
    .replace(/<pasted_content[\s\S]*?<\/pasted_content>/gi, " ")
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .split("\n")
    .filter((line) => line.trim() !== "" && !PASTED_LINE_PATTERNS.some((re) => re.test(line)))
    .join("\n")
    .trim();
}

/** Clean one human text fragment for detection, or null when it is not
 * human-typed (a wrapper or automated opener) or is only pasted material. */
export function cleanHumanText(text: string): string | null {
  const cleaned = text.trim();
  if (cleaned === "" || syntheticWrapper(cleaned)) return null;
  const stripped = stripPastedMaterial(cleaned);
  return stripped === "" ? null : stripped;
}

export interface HumanTurn {
  /** The operator's turn exactly as the goal-source parser reads it: typed
   * text fragments that are not wrappers, trimmed, joined by newlines. */
  readonly text: string;
  /** `text` minus pasted material: what theme detection reads. Can be empty
   * (a turn that is only a paste still counts as a human turn). */
  readonly detectText: string;
  readonly ts: string;
  /** `detectText` longer than MAX_HUMAN_TURN_CHARS: restatement evidence only. */
  readonly long: boolean;
}

/** Typed text fragments of a message's content (`text_fragments`): a bare
 * string, or `text` / `input_text` blocks. tool_result / tool_use / image
 * blocks never count. */
function textsOf(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const record = block as Record<string, unknown>;
    if ((record.type === "text" || record.type === "input_text") && typeof record.text === "string") {
      out.push(record.text);
    }
  }
  return out;
}

/** `genuine_user_text`: the non-wrapper fragments, trimmed, newline-joined. */
export function genuineUserText(content: unknown): string | null {
  const fragments = textsOf(content)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment !== "" && !syntheticWrapper(fragment));
  return fragments.length === 0 ? null : fragments.join("\n");
}

function humanTurn(text: string, timestamp: unknown): HumanTurn {
  const detectText = stripPastedMaterial(text);
  return {
    text,
    detectText,
    ts: typeof timestamp === "string" ? timestamp : "",
    long: detectText.length > MAX_HUMAN_TURN_CHARS,
  };
}

/** Why a line is not a human turn, or the turn it carries. */
export type LineClass =
  | { readonly kind: "turn"; readonly turn: HumanTurn }
  /** a scripted run's prompt (Claude Agent SDK), skipped by default */
  | { readonly kind: "automated" }
  /** a subagent sidechain line inside an operator transcript */
  | { readonly kind: "sidechain" }
  /** something the harness wrote into the user slot */
  | { readonly kind: "synthetic" }
  /** not a user-slot line at all (assistant, tool traffic, metadata) */
  | { readonly kind: "other" };

const OTHER: LineClass = { kind: "other" };
const SYNTHETIC: LineClass = { kind: "synthetic" };

function flag(line: Record<string, unknown>, key: string): boolean {
  return line[key] === true;
}

function stringField(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

/** Claude lines the harness wrote into the user slot (`system_generated`). */
function claudeSystemGenerated(line: Record<string, unknown>): boolean {
  const originKind = stringField(line.origin, "kind");
  const userType = line.userType;
  return (
    flag(line, "isMeta") ||
    flag(line, "isCompactSummary") ||
    flag(line, "isVisibleInTranscriptOnly") ||
    line.promptSource === "system" ||
    originKind === "task-notification" ||
    originKind === "peer" ||
    line.turnOrigin === "task_notification" ||
    line.turnOrigin === "peer" ||
    (typeof userType === "string" && userType !== "external")
  );
}

/** Agent SDK runs (`entrypoint: sdk-cli`, `sdk-ts`, `sdk-py`). The IDE
 * extension also reports `promptSource: sdk` for typed prompts, so that
 * field only counts when no entrypoint is present (`automated_run`). */
function claudeAutomatedRun(line: Record<string, unknown>): boolean {
  const entrypoint = line.entrypoint;
  if (typeof entrypoint === "string") return entrypoint.startsWith("sdk");
  return line.promptSource === "sdk";
}

function countKind(content: unknown, kind: string): number {
  if (!Array.isArray(content)) return 0;
  return content.filter((part) => stringField(part, "type") === kind).length;
}

function interruptionText(content: unknown): boolean {
  if (typeof content === "string") return content.trim().startsWith("[Request interrupted");
  if (!Array.isArray(content)) return false;
  return content.some((part) => (stringField(part, "text") ?? "").trim().startsWith("[Request interrupted"));
}

export interface ClassifyOptions {
  /** Read Claude Agent SDK prompts as human turns (default false, as the
   * goal-source parser's `include_automated_sessions`). */
  readonly includeAutomated?: boolean;
}

/** Classify one Claude Code session line (`ClaudeCodeAdapter::classify`). */
export function classifyClaudeLine(line: Record<string, unknown>, options: ClassifyOptions = {}): LineClass {
  if (line.isSidechain === true) return { kind: "sidechain" };
  if (line.type !== "user") return OTHER;
  const message = line.message;
  const content =
    message !== null && typeof message === "object" && !Array.isArray(message)
      ? (message as Record<string, unknown>).content
      : undefined;
  // tool results (and an interruption riding on one) update the open turn
  if (countKind(content, "tool_result") > 0 || line.toolUseResult !== undefined) return OTHER;
  if (claudeSystemGenerated(line)) return SYNTHETIC;
  if (interruptionText(content)) return OTHER;
  const promptId = line.promptId;
  const text = typeof promptId === "string" ? genuineUserText(content) : null;
  if (text === null) return SYNTHETIC;
  if (options.includeAutomated !== true && claudeAutomatedRun(line)) return { kind: "automated" };
  return { kind: "turn", turn: humanTurn(text, line.timestamp) };
}

/** A Claude Code session line → the human turn it carries, if any. */
export function claudeHumanTurn(line: Record<string, unknown>, options: ClassifyOptions = {}): HumanTurn | null {
  const classified = classifyClaudeLine(line, options);
  return classified.kind === "turn" ? classified.turn : null;
}

/** Why a whole Codex rollout is not operator input (`SessionSkip`). */
export type CodexSkip = "subagent" | "forked_replay" | "automated";

export interface CodexSessionMeta {
  readonly sessionId: string;
  /** a reason the whole file is skipped, or null when it is a human session. */
  readonly skip: CodexSkip | null;
}

/** Classify a Codex rollout from its `session_meta` payload
 * (`codex_session_disposition`). Only interactive originators (CLI TUI, IDE,
 * Desktop) are operator input. */
export function codexSessionDisposition(payload: Record<string, unknown>, options: ClassifyOptions = {}): CodexSkip | null {
  const automated = options.includeAutomated === true ? null : "automated";
  if (typeof payload.forked_from_id === "string" && payload.forked_from_id !== "") return "forked_replay";
  const source = payload.source;
  // `{"subagent": ...}` and any other structured source is agent-spawned
  if (source !== null && typeof source === "object" && !Array.isArray(source)) return "subagent";
  if (source === "exec" || source === "mcp") return automated;
  const threadSource = payload.thread_source;
  if (threadSource === "subagent" || threadSource === "guardian_review") return "subagent";
  if (threadSource === "automation") return automated;
  return null;
}

/** Classify a Codex rollout from its first line. A `session_meta` header
 * decides the whole file; an older rollout with no header (or an unreadable
 * first line) is read, keyed on its path. Returns null only for a line that
 * is not a session_meta header. */
export function codexSessionMeta(line: Record<string, unknown>, options: ClassifyOptions = {}): CodexSessionMeta | null {
  if (line.type !== "session_meta") return null;
  const payload = (line.payload ?? {}) as Record<string, unknown>;
  const sessionId =
    typeof payload.id === "string" ? payload.id : typeof payload.session_id === "string" ? payload.session_id : "";
  return { sessionId, skip: codexSessionDisposition(payload, options) };
}

const CODEX_REQUEST_MARKER = "## My request for Codex:";

/** Codex Desktop and the IDE prepend context blocks ("# Files mentioned by
 * the user", "# Context from my IDE setup") and put the operator's words
 * under "## My request for Codex:". Keep only the request
 * (`operator_request`). */
export function codexOperatorRequest(text: string): string | null {
  if (!text.startsWith("# ")) return text;
  const index = text.indexOf(CODEX_REQUEST_MARKER);
  if (index === -1) return text;
  const request = text.slice(index + CODEX_REQUEST_MARKER.length).trim();
  return request === "" ? null : request;
}

/** Classify one Codex rollout line (`CodexAdapter::classify_response_item`).
 * Only `response_item` user messages count (`event_msg` echoes and
 * compaction `replacement_history` replays would double-count). */
export function classifyCodexLine(line: Record<string, unknown>): LineClass {
  if (line.type !== "response_item") return OTHER;
  const payload = (line.payload ?? {}) as Record<string, unknown>;
  const message = payload.message;
  const role = typeof payload.role === "string" ? payload.role : stringField(message, "role");
  if (payload.type !== "message" || role !== "user") return OTHER;
  const content =
    payload.content !== undefined
      ? payload.content
      : message !== null && typeof message === "object" && !Array.isArray(message)
        ? (message as Record<string, unknown>).content
        : undefined;
  const genuine = genuineUserText(content);
  const text = genuine === null ? null : codexOperatorRequest(genuine);
  if (text === null) return SYNTHETIC;
  return { kind: "turn", turn: humanTurn(text, line.timestamp) };
}

/** A Codex rollout line → the human turn it carries, if any. */
export function codexHumanTurn(line: Record<string, unknown>): HumanTurn | null {
  const classified = classifyCodexLine(line);
  return classified.kind === "turn" ? classified.turn : null;
}

