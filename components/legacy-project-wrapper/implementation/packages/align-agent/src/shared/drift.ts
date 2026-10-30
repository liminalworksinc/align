// Local drift notice (owner decision D5). At the end of a turn the Stop hook compares the agent's last reply with the
// bound goal's limits using plain word rules (ported from v1 lib/limits.ts `crossing()`; no model, no network). A
// possible conflict is shown to the *user* at the next prompt as a systemMessage naming the limit. Nothing is uploaded,
// nothing reaches the model, nothing blocks, and no reply text is kept: only the limit's id. It is a word check, so the
// notice says "may", and it prefers saying nothing over a false alarm. Hook-safe: node:fs only.
import fs from "node:fs";
import type { Limit } from "./types.ts";

const NEGATION = /\b(not|no|never|cannot|can't|won't|don't|doesn't|isn't|aren't|wouldn't|couldn't|without|nor)\b|n't\b/i;
const MODAL =
  /\b(must not|mustn't|must never|should not|shouldn't|should never|may not|not allowed to|never|do not|don't|doesn't|cannot|can not|can't|won't|must|has to|have to|needs to|need to|should)\b/i;
const FILLER = new Set(["all", "the", "any", "both", "ever", "explicitly", "always", "only", "simultaneously", "together"]);
const KEY_STOP = new Set(
  "the and all any are but can for from has have its may must need needs not nor our out own should that the their them then there this those was were what when which who will with would you your never only use used using scope part goal work team than more most least once also into onto been being does did don".split(" "),
);
const REPLY_MAX = 20_000;
const SENTENCES_MAX = 200;

/** Sentences of free text (v1 `sentences`): split after . ! ? before a capital, at newlines, "; " and bullets. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+|;\s+|\s+[-*•]\s+/)
    .map((x) => x.replace(/^[-*•\d.)\s]+/, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Words that carry a limit's meaning (v1 `keyWords`): 3 letters or more, minus common words. */
export function keyWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3 && !KEY_STOP.has(w)) out.add(w);
  return out;
}

/** The word a limit turns on: the first word after its "must" or "not" ("don't fit" -> "fit"), if it has one. */
function anchorOf(text: string): string | null {
  const m = MODAL.exec(text);
  if (!m) return null;
  for (const w of text.slice(m.index + m[0].length).toLowerCase().split(/[^a-z0-9]+/)) if (w && !FILLER.has(w) && w !== "be" && w.length >= 3) return w;
  return null;
}

/** Prose only: code blocks and inline code are full of identifiers that would match by accident. */
function prose(reply: string): string {
  return reply.slice(-REPLY_MAX).replace(/```[\s\S]*?(```|$)/g, "\n").replace(/`[^`\n]*`/g, " ");
}

/**
 * Whether a reply may cross a limit (v1 `crossing`): some sentence uses the limit's key word (the one after its
 * "must" or "not") and one more of its words, or half of its words, with the opposite sense (one says "not" where the
 * other doesn't); for out of scope, any such mention. Questions never count.
 */
export function crossing(l: Pick<Limit, "text" | "type">, reply: string): boolean {
  const key = keyWords(l.text);
  if (key.size < 2) return false;
  const anchor = anchorOf(l.text);
  return sentences(prose(reply))
    .slice(-SENTENCES_MAX)
    .some((sen) => {
      if (sen.endsWith("?")) return false;
      const w = keyWords(sen);
      let n = 0;
      for (const k of key) if (w.has(k)) n++;
      const about = anchor && w.has(anchor) ? n >= 2 : n >= Math.max(2, Math.ceil(key.size * 0.5));
      return about && (l.type === "out_of_scope" || NEGATION.test(sen) !== NEGATION.test(l.text));
    });
}

const TAIL_BYTES = 256 * 1024;

/** The last `TAIL_BYTES` of a transcript, split into complete lines (the first, possibly cut, is dropped). */
function tailLines(file: string): string[] {
  let fd: number | null = null;
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return [];
    const len = Math.min(st.size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fd = fs.openSync(file, "r");
    fs.readSync(fd, buf, 0, len, st.size - len);
    const lines = buf.toString("utf8").split("\n");
    if (len < st.size) lines.shift();
    return lines;
  } catch {
    return [];
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

const textOf = (content: unknown, kinds: string[]): string =>
  Array.isArray(content)
    ? content
        .filter((b) => b && typeof b === "object" && kinds.includes((b as { type?: string }).type || "") && typeof (b as { text?: unknown }).text === "string")
        .map((b) => (b as { text: string }).text)
        .join("\n")
    : typeof content === "string"
      ? content
      : "";

/**
 * The agent's last reply of this turn, read locally: the harness's own `last_assistant_message` when the Stop input
 * carries it, else the end of the transcript (Claude Code: the last assistant text after the last typed prompt;
 * Codex: the last `agent_message` or assistant `output_text`). Null when the turn has no reply text yet.
 */
export function lastReply(input: { last_assistant_message?: unknown; transcript_path?: unknown }): string | null {
  if (typeof input.last_assistant_message === "string" && input.last_assistant_message.trim()) return input.last_assistant_message;
  if (typeof input.transcript_path !== "string" || !input.transcript_path.endsWith(".jsonl")) return null;
  const lines = tailLines(input.transcript_path);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    let row: Record<string, any>;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== "object") continue;
    // Claude Code transcripts.
    if (row.type === "assistant" && !row.isSidechain) {
      const t = textOf(row.message?.content, ["text"]);
      if (t.trim()) return t;
      continue;
    }
    if (row.type === "user" && typeof row.message?.content === "string") return null; // a typed prompt: no reply after it yet
    // Codex rollouts.
    const p = row.payload;
    if (row.type === "event_msg" && p?.type === "agent_message" && typeof p.message === "string" && p.message.trim()) return p.message;
    if (row.type === "event_msg" && p?.type === "user_message") return null;
    if (row.type === "response_item" && p?.type === "message" && p.role === "assistant") {
      const t = textOf(p.content, ["output_text", "text"]);
      if (t.trim()) return t;
    }
    if (row.type === "response_item" && p?.type === "message" && p.role === "user") return null;
  }
  return null;
}
