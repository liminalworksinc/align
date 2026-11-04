// The invisible characters people's text never keeps (W3; E2E-WEB cycle 13 W3, cycle 14 C14-1): one rule for one-line names
// (lib/v2/validate.ts cleanName) and for free text (reasons, notes, conditions, titles), so text that renders as nothing
// is never recorded as if something were written. Plain module (no imports), so client components can load it and
// their forms stop such text before it is sent.

/** Invisible format characters (category Cf: bidirectional marks, embeddings, overrides and isolates, the Arabic letter
 *  mark, zero-width spaces, the zero-width non-joiner, word joiners, invisible operators, the byte order mark, the
 *  Mongolian vowel separator, soft hyphens) and lone surrogates (Cs), by Unicode property rather than a list. */
const INVISIBLE = /[\p{Cf}\p{Cs}]/gu;
/** The only Cf characters kept are those an emoji is made of (E2E-WEB cycle 8 W5): a zero-width joiner between two
 *  pictographs (`👩‍💻`), and the tag characters of a tag sequence after one (U+E0020 to U+E007E ended by U+E007F, a
 *  subdivision flag such as Scotland's). */
const EMOJI_ZWJ = /(?<=\p{Extended_Pictographic}[︎️\u{1F3FB}-\u{1F3FF}]?)‍(?=\p{Extended_Pictographic})/gu;
const EMOJI_TAGS = /(?<=\p{Extended_Pictographic}️?)[\u{E0020}-\u{E007E}]+\u{E007F}/gu;
/** Blank fillers that render as nothing: the Hangul fillers U+115F, U+1160, U+3164, U+FFA0 and the Braille blank U+2800. */
export const BLANK_FILLERS = "ᅟᅠㅤﾠ⠀";
const FILLER = new RegExp(`[${BLANK_FILLERS}]`, "g");

/** Control characters (category Cc: C0, DEL, C1) other than the tab and the line feed: they draw nothing, or a box
 *  (E2E-WEB cycle 14 C14-1). A carriage return ends a line, so CR LF and a lone CR are first made one line feed. */
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** `v` with its control characters dropped but tabs and line breaks (as line feeds); a one-line field makes those
 *  spaces itself. */
export const dropControls = (v: string): string => v.replace(/\r\n?/g, "\n").replace(CONTROL, "");

/** `v` with its control characters (`dropControls`), invisible format characters and lone surrogates dropped, keeping
 *  emoji sequences whole. */
export function dropInvisible(v: string): string {
  const t = dropControls(v);
  const keep = new Set<number>();
  for (const m of t.matchAll(EMOJI_ZWJ)) keep.add(m.index);
  for (const m of t.matchAll(EMOJI_TAGS)) for (let i = 0; i < m[0].length; i++) keep.add(m.index + i);
  return t.replace(INVISIBLE, (c, at: number) => (keep.has(at) ? c : ""));
}

/** People's free text (a reason, note, condition or title), cleaned as a name is but keeping its line breaks: control
 *  characters (but tabs and line breaks), invisible format characters dropped (emoji kept whole), blank fillers made
 *  spaces, the ends trimmed. */
export const cleanProse = (v: string): string => dropInvisible(v).replace(FILLER, " ").trim();

/** Combining marks and spaces: text of only these (a variation selector such as U+FE0F, the combining grapheme joiner
 *  U+034F, an accent with no letter under it) renders as nothing (E2E-AGENT cycle 12, section 6). */
const MARKS_AND_SPACES = /[\p{M}\s]+/gu;

/** Whether `v`, once cleaned, has nothing a person can read: empty, or only spaces, control and invisible characters,
 *  blank fillers and combining marks. A required field holding such text is missing, and every web form's blank check
 *  is this one (E2E-WEB cycle 14 C14-2), so a form never sends what the server would refuse as missing. */
export const isBlankText = (v: string): boolean => !cleanProse(v).replace(MARKS_AND_SPACES, "");
