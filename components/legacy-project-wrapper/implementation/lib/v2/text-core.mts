// The invisible characters people's text never keeps (W3; E2E-WEB cycle 13 W3): one rule for one-line names
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

/** `v` with its invisible format characters and lone surrogates dropped, keeping emoji sequences whole. */
export function dropInvisible(v: string): string {
  const keep = new Set<number>();
  for (const m of v.matchAll(EMOJI_ZWJ)) keep.add(m.index);
  for (const m of v.matchAll(EMOJI_TAGS)) for (let i = 0; i < m[0].length; i++) keep.add(m.index + i);
  return v.replace(INVISIBLE, (c, at: number) => (keep.has(at) ? c : ""));
}

/** People's free text (a reason, note, condition or title), cleaned as a name is but keeping its line breaks: invisible
 *  format characters dropped (emoji kept whole), blank fillers made spaces, the ends trimmed. */
export const cleanProse = (v: string): string => dropInvisible(v).replace(FILLER, " ").trim();

/** Combining marks and spaces: text of only these (a variation selector such as U+FE0F, the combining grapheme joiner
 *  U+034F, an accent with no letter under it) renders as nothing (E2E-AGENT cycle 12, section 6). */
const MARKS_AND_SPACES = /[\p{M}\s]+/gu;

/** Whether `v`, once cleaned, has nothing a person can read: empty, or only spaces, invisible characters, blank fillers
 *  and combining marks. A required field holding such text is missing. */
export const isBlankText = (v: string): boolean => !cleanProse(v).replace(MARKS_AND_SPACES, "");
