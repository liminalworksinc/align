// Local drift notice (owner decision D5). At the end of a turn the Stop hook compares the agent's last reply with the
// bound goal's limits using plain word rules (no model, no network). A possible conflict is shown to the *user* at the
// next prompt as a systemMessage naming the limit. Nothing is uploaded, nothing reaches the model, nothing blocks, and
// no reply text is kept: only the limit's id and a short digest of each crossing sentence, so one sentence is never told
// twice while a later, different one still is. It is a word check, so the notice says "may", and where a word rule
// can't tell it says nothing: a missed notice costs less than a false alarm (E2E acycle2 A2-cross-1, A2-cross-2).
// Hook-safe: node:fs and node:crypto only.
import crypto from "node:crypto";
import fs from "node:fs";
import type { Limit } from "./types.ts";

const MODAL =
  /\b(must not|mustn't|must never|should not|shouldn't|should never|may not|not allowed to|never|do not|don't|doesn't|cannot|can not|can't|won't|must|has to|have to|needs to|need to|should)\b/i;
/** Modals that turn a limit's text into a ban ("must not", "never", "do not"), as its first modal. */
const NEG_MODAL = /^(must not|mustn't|must never|should not|shouldn't|should never|may not|not allowed to|never|do not|don't|doesn't|cannot|can not|can't|won't)$/i;
/** A limit text that opens with a negation names what it forbids after it ("Not migrating ...", "Avoid dropping ..."). */
const NEG_LEAD = /^\W*(no|not|never|don't|do not|avoid)\b/i;
const FILLER = new Set(["all", "the", "any", "both", "ever", "explicitly", "always", "only", "simultaneously", "together", "also"]);
const KEY_STOP = new Set(
  "the and all any are but can for from has have its may must need needs not nor our out own should that the their them then there this those was were what when which who will with would you your never only use used using scope part goal work team than more most least once also into onto been being does did don before after until till during outside without".split(
    " ",
  ),
);
const REPLY_MAX = 20_000;
const SENTENCES_MAX = 200;

/** Sentences of free text (v1 `sentences`): split after . ! ? before a capital, at newlines, "; " and bullets. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+|;\s+|\s+[-*•]\s+/)
    .map((x) => x.replace(/^[-*•#>\d.)\s]+/, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Words that carry a limit's meaning (v1 `keyWords`): 3 letters or more, minus common words. */
export function keyWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3 && !KEY_STOP.has(w)) out.add(w);
  return out;
}

/** Past forms a suffix rule can't reach ("rewrote", "kept"), so "I rewrote the billing service" still matches. */
const IRREGULAR: Record<string, string> = Object.fromEntries(
  "wrote:write written:write ran:run kept:keep left:leave made:make took:take taken:take sent:send built:build broke:break broken:break began:begin begun:begin sold:sell threw:throw thrown:throw chose:choose chosen:choose brought:bring bought:buy held:hold led:lead paid:pay spent:spend stood:stand told:tell froze:freeze frozen:freeze drove:drive driven:drive rose:rise risen:rise fell:fall fallen:fall forgot:forget forgotten:forget got:get gotten:get gave:give given:give hid:hide hidden:hide lost:lose shook:shake shaken:shake"
    .split(" ")
    .map((p) => p.split(":")),
);

/** A crude stem, the same on both sides: "dropping", "dropped", "drops" -> "drop"; "rewrite", "rewriting", "rewrote" -> "rewrit". */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/'.*$/, "");
  const re = w.startsWith("re") && IRREGULAR[w.slice(2)] ? "re" : "";
  if (IRREGULAR[w.slice(re.length)]) w = re + IRREGULAR[w.slice(re.length)];
  if (/ie[sd]$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  for (const suf of ["ing", "ed", "es", "s", "e"]) {
    if (!w.endsWith(suf) || w.length - suf.length < 3 || (suf === "s" && w.endsWith("ss"))) continue;
    w = w.slice(0, -suf.length);
    if ((suf === "ing" || suf === "ed") && w.length >= 4 && /([^aeiouslz])\1$/.test(w)) w = w.slice(0, -1);
    break;
  }
  return w;
}

const stems = (text: string): Set<string> => new Set([...keyWords(text)].map(stem));

/** Lower-case words (apostrophes kept: "won't", "i'll") and the punctuation that ends a clause, with the phrases the
 *  rule reads as one word folded: "ahead of" -> "before", "hold off" -> "avoid", "out of scope" -> "outofscope". */
function tokens(text: string): string[] {
  const s = ` ${(text.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9]+(?:'[a-z]+)?|[,;:—–]/g) || []).join(" ")} `
    .replace(/ (without waiting for|ahead of|prior to|in advance of) /g, " before ")
    .replace(/ (until|till) after /g, " until ")
    .replace(/ outside of /g, " outside ")
    .replace(/ (hold|holds|holding|held) off /g, " avoid ")
    .replace(/ (instead of|rather than|refrain from|refrained from|refraining from|stay away from|steer clear of) /g, " avoid ")
    .replace(/ out of scope /g, " outofscope ")
    .replace(/ no longer /g, " not ")
    .replace(/ can not /g, " cannot ");
  return s.trim().split(" ").filter(Boolean);
}

const isWord = (t: string) => /^[a-z0-9]/.test(t);
/** Words that say the agent won't do what follows them in its clause. */
const NEGATORS = new Set(
  "not no never cannot nor neither without avoid avoids avoided avoiding skip skips skipped skipping decline declines declined declining refuse refuses refused refusing outofscope".split(" "),
);
const negator = (t: string) => NEGATORS.has(t) || t.endsWith("n't");
/** Words that end a clause; a comma does when a new subject or a conjunction follows it ("No rush, we will drop ..."). */
const BOUNDARY_WORDS = new Set("so but because since although though whereas while then however therefore which".split(" "));
const AFTER_COMMA = new Set("i we i'll we'll i'm we're i've we've i'd we'd you they it it's he she let's there there's this that so but and then which or".split(" "));
/** Words that make the clause someone else's ask or a condition, not what the agent says it does. */
const NOT_A_STATEMENT = new Set("if unless whether suppose supposing asked asks ask asking requested requests request suggested suggests proposed proposes told tells wants wanted".split(" "));
/** The contrast a limit's qualifier turns on ("without downtime", "before the cutover"), and its opposite. */
const OPPOSITE: Record<string, string> = { with: "without", without: "with", before: "after", after: "before", during: "outside", outside: "during" };
const PREPS = new Set([...Object.keys(OPPOSITE), "until"]);

function boundary(toks: string[], i: number): boolean {
  const t = toks[i];
  return t === ";" || t === ":" || t === "—" || t === "–" || BOUNDARY_WORDS.has(t) || (t === "," && AFTER_COMMA.has(toks[i + 1] || ""));
}

/** What a limit says, for the word rule: whether it forbids (a ban) or requires, the word it turns on (`anchor`: the
 *  first word after its modal, or its first word), all its key words, and its qualifier ("without downtime"), if any. */
interface Shape {
  ban: boolean;
  anchor: string;
  key: Set<string>;
  qual: { prep: string; words: Set<string> } | null;
}

/**
 * What a limit forbids being done, as its sense: a `must_not` or `out_of_scope` limit's text names the forbidden thing
 * (usually without a "not": `Must not` "Drop the old ledger cluster before the cutover."; a text that says "Do not X"
 * still forbids X), and a `must` limit names the required thing unless its own modal is negative ("must never run",
 * "Do not drop"), which makes it a ban too.
 */
export function forbids(l: Pick<Limit, "text" | "type">): boolean {
  if (l.type !== "must") return true;
  const m = leadModal(l.text);
  return (!!m && NEG_MODAL.test(m[0])) || NEG_LEAD.test(l.text);
}

/** The limit's own modal: its first one, unless a clause of its own comes first ("Keep it readable so readers don't
 *  fail" requires keeping it readable; the "don't" belongs to the reason). */
function leadModal(text: string): RegExpExecArray | null {
  const m = MODAL.exec(text);
  return m && !/,|;|\b(so|because|since|until|while|which|unless)\b/i.test(text.slice(0, m.index)) ? m : null;
}

function shapeOf(l: Pick<Limit, "text" | "type">): Shape | null {
  const text = l.type === "out_of_scope" ? l.text.replace(/\b(?:is|are)?\s*(?:explicitly\s+)?out of scope\b/gi, " ") : l.text;
  const key = stems(text);
  if (key.size < 2) return null;
  const m = leadModal(text);
  let rest = tokens(m ? text.slice(m.index + m[0].length) : text.replace(NEG_LEAD, " "));
  // A qualifier first ("Without downtime, cut over the ledger"): the head follows its comma.
  let lead: string[] = [];
  if (PREPS.has(rest[0]) && rest.includes(",")) {
    lead = rest.slice(0, rest.indexOf(","));
    rest = rest.slice(rest.indexOf(",") + 1);
  }
  const at = rest.findIndex((w) => isWord(w) && w.length >= 3 && !FILLER.has(w) && !KEY_STOP.has(w));
  if (at < 0) return null;
  const anchor = stem(rest[at]);
  let qual: Shape["qual"] = null;
  const qualFrom = (part: string[]) => {
    const end = part.findIndex((w, j) => j > 0 && (w === "," || w === ";" || PREPS.has(w)));
    return new Set(part.slice(1, end < 0 ? undefined : end).filter((w) => isWord(w) && w.length >= 3 && !KEY_STOP.has(w)).map(stem));
  };
  if (lead.length && OPPOSITE[lead[0]]) qual = { prep: lead[0], words: qualFrom(lead) };
  else {
    const p = rest.findIndex((w, j) => j > at && OPPOSITE[w]);
    if (p > 0) {
      const head = new Set(rest.slice(0, p).filter(isWord).map(stem));
      const words = new Set([...qualFrom(rest.slice(p))].filter((w) => !head.has(w)));
      if (words.size) qual = { prep: rest[p], words };
    }
  }
  return { ban: forbids(l), anchor, key, qual };
}

/** Prose only: code blocks and inline code are full of identifiers that would match by accident, and quoted text is
 *  someone's words (a limit, a measure, an ask, a request's note), not what the agent says it does. */
function prose(reply: string): string {
  return reply
    .slice(-REPLY_MAX)
    .replace(/```[\s\S]*?(```|$)/g, "\n")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/"[^"\n]{2,}"|“[^”\n]{2,}”/g, " ")
    .replace(/\*\*|__/g, "");
}

/** Words a list of limits puts around one ("Limits: ...", "out of scope: ...", "(must not)"). */
const LIST_LABELS = new Set(["limit", "limits", "constraint", "constraints", "rule", "rules", "out", "scope", "listed", "following", "these", "type", "types", "done", "criteria", "boundary", "boundaries", "goal", "goals", "set", "version", "approvers"]);

/** Words that make a sentence about the agent's own action rather than a list of limits. */
const INTENT = /\b(i|we|i ll|we ll|ll|will|shall|going|gonna|now|today|tonight|let s|let me|did|doing)\b/;

const norm = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** A list item's label: `Must not:`, `Out of scope:`, `Limits (must not):`, `The goal's limits are:`. */
const LABELED = /^[^:]{0,60}?\b(must not|must never|must|should not|out of scope|limits?|constraints?|boundaries|rules?)\b[^:]{0,30}:/i;

/**
 * The sentence only restates limits (the agent listing the goal's limits, word for word or under a list's labels): it
 * opens with a label (`Must not:`, `Out of scope:`, `The limits are:`) and what follows has no word of the agent's own
 * action, or it is one or more of the goal's limit texts with nothing around them but a list's labels. Not a crossing
 * of any limit (E2E-AGENT cycle 12, section 6; E2E acycle2 A2-cross-1).
 */
function lists(sen: string, texts: string[]): boolean {
  if (LABELED.test(sen) && !INTENT.test(norm(sen.slice(sen.lastIndexOf(":") + 1)))) return true;
  let s = norm(sen);
  let found = false;
  for (const t of texts) {
    const l = norm(t);
    if (!l.trim() || !s.includes(l)) continue;
    s = s.split(l).join(" ");
    found = true;
  }
  return found && !INTENT.test(s) && [...keyWords(s)].every((w) => LIST_LABELS.has(w));
}

/** A goal title or measure is a name, not a plan: a reply that names one as it is written ("Retire the old ledger
 *  cluster", in quotes or not) says nothing about doing what a limit with the same words forbids (E2E acycle1
 *  A1-cross-1, acycle2 A2-cross-1). Case counts, so prose that describes the act in lower case still does. */
function withoutTitles(sen: string, titles: string[]): string {
  let s = sen;
  for (const t of titles) if (keyWords(t).size >= 2) s = s.replace(wordsRe(t, "g"), " ; ");
  return s;
}

/** A text's words as a pattern that matches them in another text whatever lies between them (spaces, quotes). */
function wordsRe(text: string, flags: string): RegExp {
  const esc = (text.match(/[A-Za-z0-9']+/g) || []).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![A-Za-z0-9'])${esc.join("[^A-Za-z0-9']+")}(?![A-Za-z0-9'])`, flags);
}

/** The goal's limit texts word for word (any case) where nothing of the agent's own action comes before them in their
 *  clause ("The note reads: ... Drop the old ledger cluster before the cutover."): a restatement, taken out. "We will
 *  drop the old ledger cluster before the cutover." keeps them. */
function withoutRestated(sen: string, texts: string[]): string {
  let s = sen;
  for (const t of texts) {
    if (keyWords(t).size < 2) continue;
    s = s.replace(wordsRe(t, "gi"), (m: string, at: number, all: string) => {
      const before = all.slice(0, at);
      const from = Math.max(...[",", ";", ":", "—", "–", "(", '"', "“"].map((c) => before.lastIndexOf(c)));
      return INTENT.test(norm(before.slice(from + 1))) ? m : " ; ";
    });
  }
  return s;
}

/** Of the Q words, the contrast word just before the first one that has one ("with two hours of downtime" -> "with"). */
function qualPrep(toks: string[], words: Set<string>): string | null {
  for (let j = 0; j < toks.length; j++) {
    if (!isWord(toks[j]) || !words.has(stem(toks[j]))) continue;
    for (let k = j - 1; k >= Math.max(0, j - 6); k--) {
      if (toks[k] === ";" || toks[k] === ":") break;
      if (PREPS.has(toks[k])) return toks[k];
    }
  }
  return null;
}

/** Whether one sentence crosses the limit: see `crossings`. */
function crossesSentence(sh: Shape, sen: string): boolean {
  const toks = tokens(sen);
  const st = new Set(toks.filter(isWord).map(stem));
  if (!st.has(sh.anchor)) return false;
  let n = 0;
  for (const k of sh.key) if (k !== sh.anchor && st.has(k)) n++;
  if (n < Math.min(2, sh.key.size - 1)) return false;
  for (let i = 0; i < toks.length; i++) {
    if (!isWord(toks[i]) || stem(toks[i]) !== sh.anchor) continue;
    let a = i;
    while (a > 0 && !boundary(toks, a - 1)) a--;
    let b = i + 1;
    while (b < toks.length && !boundary(toks, b)) b++;
    const before = toks.slice(a, i);
    if (before.some((t) => NOT_A_STATEMENT.has(t))) continue;
    const after = toks.slice(i + 1, b);
    let neg = before.filter(negator).length;
    if (after.includes("outofscope") || after.some((t, j) => /^(isn't|aren't|wasn't|weren't)$/.test(t) || (/^(is|are|was|were|be)$/.test(t) && /^(not|never)$/.test(after[j + 1] || "")))) neg++;
    let pos = neg % 2 === 0;
    let qual: "same" | "opposite" | "none" = "none";
    if (sh.qual) {
      let prep = qualPrep(toks, sh.qual.words);
      // "won't drop it until after the cutover" says it drops it after the cutover.
      if (prep === "until") {
        if (!pos) {
          pos = true;
          prep = "after";
        } else prep = null;
      }
      qual = !prep ? "none" : prep === sh.qual.prep ? "same" : OPPOSITE[sh.qual.prep] === prep ? "opposite" : "none";
    }
    const hit = sh.ban ? pos && (!sh.qual || qual === "same") : (!pos && qual !== "opposite") || (pos && qual === "opposite");
    if (hit) return true;
  }
  return false;
}

/** Align's own words a reply may restate: goal titles and measures (`titles`, matched as written) and the bound goal's
 *  limit texts (`texts`, matched in any case, as a list of them). A plain array is `titles`. */
export interface DriftKnown {
  titles?: string[];
  texts?: string[];
}

/**
 * The sentences of a reply that may cross a limit, normalized (lower-case words only; for a digest, never kept). A
 * sentence crosses when, outside code and quotes, it uses the limit's anchor word (the first word after its modal, or
 * its first word, as a stem: "dropping" is "drop") and two more of its key words (or all of them, when it has fewer),
 * in the sense the limit rules out. The sense is read from the clause that holds the anchor, never from a negation
 * elsewhere in the sentence: a negation word before the anchor in that clause ("not", "never", "won't", "without",
 * "avoid", "hold off on", "instead of"), or "is not" / "out of scope" after it, makes the clause say it won't (two
 * cancel). A limit whose text qualifies the act with with/without, before/after or during/outside is read with its
 * qualifier: the reply's contrast word before the qualifier's words is the same (it says that), the opposite (it says
 * the contrary: "with two hours of downtime" against "without downtime"), or absent. A ban (`must_not`,
 * `out_of_scope`, or a `must` whose own modal is negative) is crossed by a clause that says it will, and, when the ban
 * has a qualifier, says it with that qualifier; a requirement by a clause that says it won't (unless it says it won't
 * do the contrary), or says it will do it the contrary way. "won't X until (after) Q" says it will X after Q. Not a
 * crossing: a question; a clause that is a condition or someone else's ask ("if", "unless", "Milo asked to ..."); a
 * sentence that lists limits (see `lists`); the words of a goal title or measure as written.
 */
export function crossings(l: Pick<Limit, "text" | "type">, reply: string, known: string[] | DriftKnown = []): string[] {
  const k: DriftKnown = Array.isArray(known) ? { titles: known } : known;
  const sh = shapeOf(l);
  if (!sh) return [];
  const texts = [l.text, ...(k.texts || [])];
  return sentences(prose(reply))
    .slice(-SENTENCES_MAX)
    .filter((sen) => !sen.endsWith("?") && !lists(sen, texts) && crossesSentence(sh, withoutRestated(withoutTitles(sen, k.titles || []), texts)))
    .map((sen) => norm(sen).trim());
}

/** Whether a reply may cross a limit (see `crossings`). */
export function crossing(l: Pick<Limit, "text" | "type">, reply: string, known: string[] | DriftKnown = []): boolean {
  return crossings(l, reply, known).length > 0;
}

/** A short digest of one crossing sentence for one limit: what the session remembers instead of the text. */
export function crossingDigest(limitId: string, sentence: string): string {
  return crypto.createHash("sha256").update(`${limitId}\n${sentence}`).digest("hex").slice(0, 16);
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
