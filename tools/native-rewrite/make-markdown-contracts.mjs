// Authored public grammar and value contracts, separate from observations.
import fs from "node:fs";
import {createRequire} from "node:module";
const h=createRequire(import.meta.url)("./markdown-harness.cjs");
const prose=text=>text.trim().replace(/\n/g," ");
const common=prose(String.raw`
These are synchronous dependency-free JavaScript functions with no files, network,
clock, environment access or hidden mutable state. Use ordinary values without a
transport envelope. Preserve every argument, nested object, array, enumerable
property, prototype and input reference. Strings are opaque UTF-16 strings;
preserve exact text, order and node boundaries, including adjacent text nodes.
When nodes or arrays are constructed, each call returns a fresh ordinary graph,
including empty arrays; do not reuse result objects across calls. Never freeze
caller objects. Formatting/resolution callbacks run only where specified, in
order and with exact arguments. Propagate the original thrown callback value
unchanged. Do not sanitize, normalize or interpret extra syntax beyond this grammar.
Inline is {t:'text',v:string}, {t:'code',v:string}, {t:'strong',c:Inline[]},
{t:'em',c:Inline[]}, or {t:'link',href:string,c:Inline[]}.
ListItem is {c:Inline[],sub:List|null}. A List is
{t:'list',ordered:boolean,items:ListItem[]}.
Block is a List, {t:'heading',level:number,id:string,c:Inline[]},
{t:'para',c:Inline[]}, {t:'table',head:Inline[][],rows:Inline[][][]},
{t:'code',v:string}, {t:'quote',c:Block[]}, or {t:'rule'}.
DocPlace is {page:string,prefix:string}. ParseOptions has an opaque prefix:string, optional or nullish
resolve:(path:string)=>DocPlace|null, and optional or nullish
fill:Record<string,string>. The functions never alter fill or callback records.
`);
const filling=prose(String.raw`
When ordinary text is flushed, fillText uses opts.fill ?? {} and Object.keys in
native JavaScript property order, keeping only own keys included in the original
text. Inherited keys are ignored. With no matching keys, return one text node for
nonempty text and no nodes for empty text. Otherwise quote each key as a literal
regular-expression alternative, in that key order, and use a new global RegExp
with flag g and without u. Iterate the original text's native String.matchAll;
replacement values are never scanned again. Before each match emit one text node
for any nonempty gap; then emit the fill value as one node. A value matching
/^[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[A-Za-z]{2,}$/ becomes
{t:'link',href:'mailto:'+value,c:[{t:'text',v:value}]}; every other value becomes
{t:'text',v:value}. Append a nonempty remaining suffix as a text node.
Preserve alternative precedence and native numeric-key ordering, rather than
sorting by key length. Empty keys are valid: native global matchAll advances
through UTF-16 positions for zero-length matches, so even an empty flush can emit
a replacement. Preserve regex metacharacters in keys literally. Repeated flushes
remain separate; never combine adjacent text nodes.
`);
const inline=prose(String.raw`
Scan left to right with a text buffer. Flushing applies the fillText rule even to
an empty buffer, then clears it. A backslash escapes the next character only when
it is backslash, backtick, asterisk, underscore, either square bracket, either
parenthesis, hash, vertical bar, either angle bracket, exclamation or hyphen;
append that next character to the buffer and skip both. Other backslashes stay.
A backtick uses the first subsequent backtick as its end. Flush, emit
{t:'code',v:the exact interior}, and continue after it; the interior may be empty.
An unmatched backtick stays ordinary text. Two asterisks use the first later pair
searched after the opening pair; recognize strong only for a nonempty interior.
Flush and emit {t:'strong',c:parse_inline(interior,opts)}. Otherwise continue with
ordinary scanning. A single asterisk starts em only if its following character
exists and is neither ASCII space nor asterisk. Use the first subsequent asterisk;
the interior must be nonempty and its final character must not be ASCII space.
Flush and emit {t:'em',c:parse_inline(interior,opts)}. Searches do not skip escaped
delimiters or implement a different Markdown nesting algorithm.
At an opening square bracket, find the first subsequent closing-bracket/opening-
parenthesis pair, then the first closing parenthesis after that pair. Recognize a
link only when both exist and its label contains neither square bracket. Empty
labels and empty targets are permitted. Flush and recursively parse the label;
pass the exact interior target to safe_href. With a truthy safe href emit a link
node; otherwise append the parsed label nodes directly, discarding only the target.
Parentheses inside a target do not balance: the first closing one ends it.
At a less-than character, match /^<(https?:\/\/[^\s<>]+)>/i against the remaining
input. On a match flush and call safe_href on the captured URL. A truthy result
gives a link whose one text child is the captured URL. Otherwise emit a text node
containing the captured URL without its angle brackets. Continue after the match.
Every other character appends to the buffer; flush at end. Raw HTML delimiters
remain ordinary text characters and underscores add no emphasis. Only
parse_markdown removes comments; parse_inline treats comment delimiters as
ordinary characters and still recognizes supported inline syntax inside them.
`);
const blocks=prose(String.raw`
First normalize CR LF and remaining CR to LF. Remove whole-line comments with
/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*(?:\n|$)/gm, then remaining complete comments
with /<!--[\s\S]*?-->/g. Unclosed comments remain literal. Split on LF and parse
with one fresh heading-id Map shared by recursive quote blocks for this call.
Skip blank lines. The following block priority is exact: fence, heading, table,
rule, quote, list, paragraph. A fence begins with optional whitespace and three
backticks; any suffix is ignored. Collect following lines verbatim until the next
line with that same fence-start shape or EOF. Emit a code block joining body
lines with LF, adding no newline beyond those joins; an empty final body line
therefore preserves its trailing LF. No inline parsing or filling inside code.
Headings match /^(#{1,6})\s+(.*?)\s*#*\s*$/. Parse the captured text as inline;
level is the initial hash count. The base id is opts.prefix+'-'+slug(plain(c)).
Increment the shared Map count for that exact base. The first id is base, later
ones append '-'+count; quoted headings participate in the same count. A leading
indent or seven hashes does not match this heading grammar.
A table starts only when the current trimmed line begins with a vertical bar and
the next line matches /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/. The
first line supplies head cells; skip the separator line. Consume subsequent rows
while their trimmed line starts with a bar. For each cell line trim, remove one
leading bar, and remove a trailing bar only if the string does not end in a
backslash followed by bar. Split on bars, except each backslash/bar pair emits a
literal bar and skips both. Other backslashes stay. Trim each cell, include empty
cells, and parse each inline. Preserve row widths without padding or alignment
metadata. Emit {t:'table',head,rows}.
Rules match /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/ and emit {t:'rule'}.
Quotes gather consecutive lines starting with optional whitespace then '>'. Strip
the leading whitespace, one '>' and at most one following whitespace character.
Recursively parse those resulting lines using the same options and heading Map;
emit {t:'quote',c:blocks}. Other following lines stay for the outer parser.
List markers match /^(\s*)([-*+]|\d+[.)])\s+(.*)$/. A marker containing digits is
ordered; its numeric value is not stored. The root indentation limit is
max(1, the initial marker's whitespace width). At or before that limit, a marker
starts a new root item when its orderedness matches the list; otherwise end this
list without consuming that marker. Flush a previous item before starting another.
A deeper marker beneath a current item creates or appends to its single nested
list; that nested list's orderedness comes from its first marker. Further depth
does not create another level. A nonblank indented non-marker line continues the
latest nested item when one exists, otherwise the root item's text, trimming that
line. A blank line followed by any list marker is skipped without ending the list.
Any other line ends the list without consuming it. Join each root or nested item's
text lines with one ASCII space and parse inline. Each nested item's sub is null;
each root item's sub is that list or null. Include every item once. Indented root
markers must consume their line and terminate normally.
Paragraphs consume nonblank lines until the next recognizable block start after
at least one line. A block start means heading, fence, rule, list marker, quote,
or the table-start condition. Always consume the first paragraph line. Trim each
line, join with one ASCII space, parse inline, and emit {t:'para',c}. Maintain
all block ordering and the exact original node boundaries.
`);
const signatures={
  slug:prose(String.raw`slug(text:string):string. Use native ECMAScript toLowerCase,
    remove /[^a-z0-9\s-]/g, trim, collapse /[\s-]+/g to one ASCII hyphen, then return
    the result or 'section' when it is empty. Lowercasing precedes the ASCII
    restriction, including characters such as the Kelvin sign. No transliteration.`),
  safeHref:prose(String.raw`safe_href(href:string,opts:ParseOptions):string|null.
    Let h=href.trim(). Return null when h is empty or /[\u0000-\u001F\u007F\s]/
    matches it. Return h unchanged when /^https?:\/\/[^/]/i or /^mailto:[^:]+@/i
    matches. Otherwise an initial '#' returns '#'+opts.prefix+'-'+slug(h.slice(1))
    when it has more than one character, or null for '#' alone. Otherwise reject
    /^[a-z][a-z0-9+.-]*:/i and an initial '//'. Split h on '#' with limit two into
    rawPath and frag; discard later fragments. Remove one initial './' from rawPath.
    Call opts.resolve only for this relative case, with that exact path; a nullish
    resolver or nullish result yields null. Any falsy place yields null. Otherwise
    return place.page+'#'+(frag ? place.prefix+'-'+slug(frag) : place.prefix).
    Preserve opaque page and prefix values; do not revalidate callback records,
    use a URL parser, collapse paths or invoke resolution on absolute/anchor cases.`),
  parseInline:"parse_inline(text:string,opts:ParseOptions):Inline[]. "+inline+" "+filling,
  plain:prose(String.raw`plain(content:Inline[]):string. Map the array in order;
    for nodes whose t is exactly 'text' or 'code' take v, otherwise recurse on c.
    Join those results with no separator. Ignore href and every other property.
    Preserve ordinary Array.map/join behavior for sparse arrays and string coercion.
    Never change the input tree.`),
  parseMarkdown:"parse_markdown(markdown:string,opts:ParseOptions):Block[]. "+blocks+" Inline parsing follows this exact grammar: "+inline+" "+filling,
};
const capabilities={};
for(const op of h.FUNCTIONS){if(!signatures[op])throw new Error("missing Markdown contract");capabilities[h.CAPABILITY[op]]="JavaScript module trust_markdown/"+h.SYMBOL[op]+" exports "+signatures[op]+" "+common;}
if(Object.keys(signatures).length!==h.FUNCTIONS.length)throw new Error("unexpected Markdown contract");
if(fs.existsSync(process.argv[2]))throw new Error("refuse an existing Markdown contract draft");
fs.writeFileSync(process.argv[2],JSON.stringify({kind:"library",capabilities},null,2)+"\n");
console.log(JSON.stringify({capabilities:Object.keys(capabilities).length}));
