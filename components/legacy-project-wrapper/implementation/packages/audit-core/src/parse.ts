// Parsing the pasted prompt output into runs (spec §2.1, §3.1 step 1). Deterministic; the model fallback for loose text
// lives on the server (slice 2) and must return the same Run shape, which validate() checks.
//
// Accepted shape (the participant prompt v2 asks for markdown; tools vary, so labels are matched loosely):
//   ## Run R1 (Oct 6)
//   Asked: ...
//   Sources: a, b
//   Changes requested: 6 (caption shorter x3, caption less formal x2, headline clearer x1)
//   Person's time: ~22 min
//   Used: yes
// A one-line run is also read: "## Run R4 (Oct 17) ... 7 changes, ~28 min, abandoned" (its changes are "unspecified").
// Sections before, between or after runs that name the agent's purpose, instructions, most-corrected things or a wish
// fill PasteContext. Anything else is kept in `skipped` so the page can show it.

import { categoryOf } from "./category.ts";
import type { Change, Parsed, PasteContext, Run, Used } from "./schema.ts";
import { UNSPECIFIED_CATEGORY } from "./category.ts";

const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const RUN_HEADING = /\b(?:run|attempt|session)\b\s*#?\s*([A-Za-z]?\d+)?|^\s*(R\d+)\b/i;
const FIELD = /^\s*(?:[-*+]\s+)?(?:\*\*|__)?([A-Za-z][A-Za-z' /()-]{1,40}?)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

type FieldKey = "asked" | "sources" | "changes" | "minutes" | "used" | "date";

function fieldKey(label: string): FieldKey | null {
  const l = label.toLowerCase();
  if (/^(date|when|day)\b/.test(l)) return "date";
  if (/\b(asked|task|request|prompt|what it was asked)\b/.test(l)) return "asked";
  if (/\b(sources?|references?|citations?|inputs?)\b/.test(l)) return "sources";
  if (/\b(changes?|corrections?|edits?|revisions?|rounds?)\b/.test(l)) return "changes";
  if (/\b(time|minutes?|mins?|duration|effort)\b/.test(l)) return "minutes";
  if (/\b(used|outcome|result|shipped|published|kept)\b/.test(l)) return "used";
  return null;
}

type ContextKey = "purpose" | "instructions" | "mostCorrected" | "wish";
function contextKey(heading: string): ContextKey | null {
  const h = heading.toLowerCase();
  if (/\binstruction|system prompt\b/.test(h)) return "instructions";
  if (/\bcorrect(ed|ions?)?\b.*\b(most|often)\b|\b(most|often)\b.*\bcorrect/.test(h)) return "mostCorrected";
  if (/\bwish\b/.test(h)) return "wish";
  if (/\b(for|purpose|what this agent|what it does|job)\b/.test(h)) return "purpose";
  return null;
}

/** Minutes from text like "~22 min", "about 1.5 hours", "20-25 minutes" (midpoint), "1h 10m". Null when absent. */
export function parseMinutes(s: string): number | null {
  const t = s.toLowerCase();
  const hm = t.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(\d+)\s*m/);
  if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2]));
  const range = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?)\b/);
  if (range) {
    const mid = (Number(range[1]) + Number(range[2])) / 2;
    return Math.round(range[3].startsWith("h") ? mid * 60 : mid);
  }
  const one = t.match(/(\d+(?:\.\d+)?)\s*(h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?)\b/);
  if (one) return Math.round(one[2].startsWith("h") ? Number(one[1]) * 60 : Number(one[1]));
  const bare = t.match(/^\s*~?\s*(\d+(?:\.\d+)?)\s*$/);
  return bare ? Math.round(Number(bare[1])) : null;
}

/** Used from "yes", "published", "abandoned", "not used". Unknown when unclear. */
export function parseUsed(s: string): Used {
  const t = s.toLowerCase();
  if (/\b(no|not used|unused|abandoned|discarded|dropped|rejected|scrapped|false)\b/.test(t)) return "no";
  if (/\b(yes|used|published|shipped|posted|kept|accepted|merged|true)\b/.test(t)) return "yes";
  return "unknown";
}

/** One change item: "caption shorter x3", "headline (x2)", "2× fact fix", "tone". */
function parseItem(raw: string): Change[] {
  let s = raw.trim().replace(/^[-*+]\s*/, "").replace(/\.$/, "");
  if (!s) return [];
  let n = 1;
  const tail = s.match(/\s*[(\[]?\s*[x×]\s*(\d+)\s*[)\]]?\s*$/i) ?? s.match(/\s*\(\s*(\d+)\s*\)\s*$/);
  const head = s.match(/^(\d+)\s*[x×]\s+/i);
  if (tail) { n = Number(tail[1]); s = s.slice(0, tail.index).trim(); }
  else if (head) { n = Number(head[1]); s = s.slice(head[0].length).trim(); }
  if (!s || n < 1 || n > 100) return [];
  const category = categoryOf(s);
  return Array.from({ length: n }, () => ({ category, note: s }));
}

/** Split on commas and semicolons that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** A changes value: "6 (a x3, b x2, c)", "a x3, b", "none", "0", or just "7". */
export function parseChanges(value: string): Change[] {
  const v = value.trim();
  if (!v || /^(none|no changes?|0|nothing|n\/a)\.?$/i.test(v)) return [];
  const lead = v.match(/^(\d+)\s*(?:changes?|rounds?|edits?)?\s*(?:\((.*)\))?\s*$/i);
  if (lead) {
    const items = lead[2] ? splitTop(lead[2]).flatMap(parseItem) : [];
    if (items.length) return items;
    return Array.from({ length: Math.min(Number(lead[1]), 100) }, () => ({ category: UNSPECIFIED_CATEGORY, note: "" }));
  }
  return splitTop(v).flatMap(parseItem);
}

const emptyContext = (): PasteContext => ({ purpose: null, instructions: null, mostCorrected: [], wish: null });

interface Draft { id: string | null; heading: string; fields: Partial<Record<FieldKey, string>>; changeLines: string[] }

/** Parse pasted markdown into runs and context. Never throws on odd input. */
export function parsePaste(text: string): Parsed {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const runs: Draft[] = [];
  const context = emptyContext();
  const skipped: string[] = [];
  let cur: Draft | null = null;
  let ctx: { key: ContextKey; buf: string[] } | null = null;
  let inChanges = false;

  const closeCtx = () => {
    if (!ctx) return;
    const body = ctx.buf.join("\n").trim();
    if (ctx.key === "mostCorrected") context.mostCorrected = ctx.buf.map((l) => (l.match(BULLET)?.[1] ?? l).trim()).filter(Boolean);
    else if (body) context[ctx.key] = body;
    ctx = null;
  };

  for (const line of lines) {
    const h = line.match(HEADING);
    if (h) {
      const title = h[1].replace(/[*_`]/g, "").trim();
      const rh = title.match(RUN_HEADING);
      const ck = contextKey(title);
      if (rh && !ck) {
        closeCtx();
        cur = { id: rh[1] ?? rh[2] ?? null, heading: title, fields: {}, changeLines: [] };
        runs.push(cur);
        inChanges = false;
        continue;
      }
      if (ck) {
        closeCtx();
        cur = null;
        ctx = { key: ck, buf: [] };
        continue;
      }
      // A heading that is neither: end the current block, keep it visible.
      closeCtx();
      cur = null;
      if (title) skipped.push(line.trim());
      continue;
    }
    if (ctx) { ctx.buf.push(line); continue; }
    if (!line.trim()) { inChanges = false; continue; }
    if (cur) {
      const f = line.match(FIELD);
      const key = f ? fieldKey(f[1]) : null;
      if (f && key) {
        cur.fields[key] = f[2].trim();
        inChanges = key === "changes" && !f[2].trim();
        continue;
      }
      const b = line.match(BULLET);
      if (inChanges && b) { cur.changeLines.push(b[1]); continue; }
    }
    skipped.push(line.trim());
  }
  closeCtx();

  const seen = new Set<string>();
  const out: Run[] = runs.map((d, i) => {
    let id = (d.id ?? `R${i + 1}`).toUpperCase();
    if (/^\d+$/.test(id)) id = `R${id}`;
    while (seen.has(id)) id = `${id}b`;
    seen.add(id);
    const after = d.heading.split(/\.\.\.|…|—|:/).slice(1).join(" ");
    const dateParen = d.heading.match(/\(([^)]+)\)/);
    let changes = d.fields.changes !== undefined ? parseChanges(d.fields.changes) : [];
    if (d.changeLines.length) changes = d.changeLines.flatMap(parseItem);
    if (d.fields.changes === undefined && !d.changeLines.length) {
      const n = after.match(/(\d+)\s*(?:changes?|rounds?|edits?)/i);
      if (n) changes = parseChanges(n[1]);
    }
    const minutesText = d.fields.minutes ?? after;
    const usedText = d.fields.used ?? after;
    return {
      id,
      date: (d.fields.date ?? dateParen?.[1] ?? "").trim(),
      asked: (d.fields.asked ?? "").trim(),
      sources: d.fields.sources ? splitTop(d.fields.sources).map((s) => s.replace(/\s*\(link\)\s*$/i, "").trim()).filter(Boolean) : [],
      changes,
      minutes: minutesText ? parseMinutes(minutesText) : null,
      used: usedText ? parseUsed(usedText) : "unknown",
    };
  });
  return { runs: out, context, skipped };
}
