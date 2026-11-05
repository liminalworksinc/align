# Public interface: validation.create-validators

## ADDED Requirements

### Requirement: validation.create-validators

JavaScript module field_validation/create_validators exports create_validators(context):object.

# Field validation

Every displayed error message is a single line. Join words wrapped across lines
with one space; do not introduce newline characters into messages.

The factory receives an explicit context with callable `badRequest(message, code?)`,
`cleanProse(text)`, `dropInvisible(text)` and `isBlankText(text)`, plus the existing
`BLANK_FILLERS` string. Capture those references and that string when creating the
instance. Later replacement of context properties must not alter existing methods.
The normal context comes from the separately qualified wording and HTTP-error
libraries. Call the supplied functions rather than reproducing their behavior.

Return a new ordinary mutable object with exactly these 21 enumerable, writable,
configurable own properties: `str`, `cleanName`, `charCount`, `oneLine`, `optStr`,
`oneOf`, `optOneOf`, `nonNegInt`, `revisionRead`, `assertRevisionReached`, `optInt`,
`iso`, `optIso`, `b64url`, `strList`, `NAME_MARKS_PER_CHAR`, `NAME_PARTS_PER_CHAR`,
`NO_REVISION`, `B64URL`, `ID_RE`, and `SESSION_KEY_RE`. Every method is synchronous,
works when detached from the returned object, and uses its instance's lexical
functions and constants. Replacing an object's method or data property must not
replace the lexical binding used by its other methods. Separate factory instances
have distinct regular-expression objects and independent mutable regex state.

Methods receive natural JavaScript arguments and return natural values. Body
arguments are records with unknown field values. Read their properties normally,
including inherited properties and getters. Preserve getter short-circuit order
and propagate getter exceptions unchanged. Do not mutate inputs or arrays supplied
by callers. Use ordinary JavaScript numeric comparisons, UTF-16 string lengths,
string coercion in messages, and strict equality as specified below. Numeric
parameters retain JavaScript behavior for fractions, negative zero, NaN and
infinity. Do not clamp or reinterpret them. No JSON transport or wrapper belongs
in this public API.

Every validation error throws the exact object returned by the supplied
`badRequest` call. Do not construct, copy, wrap or translate it. Unless specified,
pass only the message argument so that the supplied factory owns its default code.
Preserve dependency-call order and avoid additional callback calls. Filesystem,
network, environment, wall-clock and persistent storage access are unnecessary.
The Node target supplies Buffer, Unicode property escapes, Date and Intl.

## String fields

`str(body, key, max=300, {min=1}={})` reads `body[key]` once. A non-string throws
`badRequest(key + ' must be a string')`. Call `cleanProse(value)` once to obtain
`text`. If its UTF-16 length is less than min, throw `badRequest(key + ' is
required')` without calling `isBlankText`. Otherwise, only when min is greater
than zero, call `isBlankText(text)` and throw the same required error if true.
Then, if text length is greater than max, throw `badRequest(key + ' is too long
(max ' + max + ' characters)')`. Return text unchanged otherwise. Omitted or
undefined max and min use their defaults; do not replace explicit zero, NaN or
negative bounds with defaults.

`optStr(body, key, max=300)` reads the field once. Undefined and null return null
without calling text dependencies. Other non-strings throw `badRequest(key + '
must be a string or null')`. Otherwise call `cleanProse`, then `isBlankText` on
its result. Blank text returns null before any maximum-length check. Excess
UTF-16 length throws the same too-long message as str; otherwise return the text.

`cleanName(value)` replaces each Unicode Cc control with one ASCII space, calls
the supplied `dropInvisible` once on that result, then replaces every nonempty
run of Unicode Cc, ECMAScript whitespace, U+2028, U+2029, or a supplied blank
filler with one ASCII space. Do not trim this result. The normal filler string
is U+115F, U+1160, U+3164, U+FFA0, U+2800. The injected callback still owns its
own behavior; do not add prose cleaning or blank checks to this operation.

## Names and target Unicode behavior

Create an Intl.Segmenter with an undefined locale and granularity `grapheme` for
the instance. `charCount(value)` returns the number of segments from that
segmenter. Preserve the target's Unicode and ICU behavior, including lone
surrogates, CR/LF, combining sequences, emoji, flags, jamo and script conjuncts.

`NAME_MARKS_PER_CHAR` is exactly 6 and `NAME_PARTS_PER_CHAR` exactly 16.
`oneLine(body, key, max=300)` reads its field once and uses the same non-string
error as str. Obtain `text` by calling its lexical cleanName and trimming the
result. Call the supplied `isBlankText(text)`; true throws the required error.
Segment text with the instance's grapheme segmenter. In this order:

1. More than max graphemes throws the same too-long message as str.
2. A grapheme containing more than six matches of
   `(?!\u200D)[\p{M}\p{Grapheme_Extend}\p{Emoji_Modifier}]` with global Unicode
   matching throws `badRequest(key + ' has a character with too many accents or
   marks on it (at most 6 on one character)')`.
3. A grapheme containing more than sixteen JavaScript string-iteration code
   points throws `badRequest(key + ' has a character joined from too many parts
   (at most 16 in one character)')`.
4. More than max times sixteen bytes under `Buffer.byteLength(text, 'utf8')`
   throws `badRequest(key + ' is too long to store: emoji such as families and
   flags take much more room than letters, so use fewer of them')`.

Return text otherwise. The byte limit applies to the complete text. Do not turn
it into a per-grapheme byte cap or count UTF-16 units as graphemes. U+200D never
counts toward the mark limit; other grapheme extenders and emoji modifiers do.

## Choices and integers

`oneOf(body, key, allowed)` reads the field once. It must be a string present
under ordinary `allowed.includes(value)`. Otherwise throw
`badRequest(key + ' must be one of ' + allowed.join(', '))`. Retain the supplied
choice order and duplicates in the error. Return the same string otherwise.
`optOneOf` first checks `body[key] === undefined`, then, if necessary,
`body[key] === null`; either returns null. Otherwise call lexical oneOf, which
reads the field again. Preserve these distinct reads and their order.

`nonNegInt(body, key)` reads the field once. It must have typeof number, satisfy
Number.isSafeInteger, and not be less than zero. Otherwise throw
`badRequest(key + ' must be a non-negative integer')`. Return the original value,
including negative zero, when accepted. `optInt` checks undefined, then null
through separate short-circuit property reads, returning null for either, and
otherwise calls lexical nonNegInt, which performs its own read.

## Revisions

`NO_REVISION` is exactly `This decision doesn't say which revision you read, so
nothing was recorded. Read it again and decide again.` as one line with spaces.
`revisionRead(body, optional=false)` reads body.revision once. Undefined returns
undefined only when optional is truthy. Otherwise require a number satisfying
Number.isSafeInteger and not less than zero; failure throws
`badRequest(NO_REVISION)`. Return the original numeric value when accepted. The
consumer binding preserves overloads for optional true versus absent or false.

`assertRevisionReached(what, sent, current)` accepts what as request or proposal.
Only when sent is not undefined and is greater than current, throw
`badRequest('This ' + what + ' has no revision ' + sent + ': it is at revision ' +
current + ', so nothing was recorded. Read it again and decide again.',
'unknown_revision')`. Otherwise return undefined without a callback. Preserve
ordinary number comparisons and message coercion.

## Timestamps

Use the original timestamp regular expression
`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$`
with no flags. `iso(body, key)` reads the field once. Require a string matching
that expression and a Date.parse result that is not NaN; evaluate those checks
in that short-circuit order. Failure throws `badRequest(key + ' must be an ISO
8601 time')`. Return `new Date(value).toISOString()` otherwise. Preserve native
calendar, timezone-offset, fractional-second, rollover and year-boundary behavior.
Do not substitute a stricter parser, round fractional milliseconds or read now.
`optIso` separately checks undefined, null and the empty string in that order,
returning null for any, then delegates to lexical iso for its separate field read.

## Tokens and lists

The three public RegExp objects initially have these exact source strings and
no flags: B64URL is `^[A-Za-z0-9_-]+$`; ID_RE is
`^[a-z]{1,4}_[A-Za-z0-9_-]{8,64}$`; SESSION_KEY_RE is `^[A-Za-z0-9_-]{43}$`.
Retain ordinary mutable RegExp behavior, including lastIndex, compile, source,
flags and repeated tests. b64url must use the same B64URL object exposed by its
instance. Cloning a regex or resetting caller-visible state changes the contract.

`b64url(body, key, minLen, maxLen)` reads the field once. In short-circuit order,
require a string, a successful test using the instance's shared B64URL, length
not less than minLen, and length not greater than maxLen. Failure throws
`badRequest(key + ' must be base64url (' + minLen + ' to ' + maxLen + '
characters)')`. Return the original string otherwise.

`strList(body, key, {max=50, itemMax=300}={})` reads the field once and uses an
empty array for null or undefined. A non-array throws `badRequest(key + ' must
be a list')`. Check the original array length before iterating: more than max
throws `badRequest(key + ' has too many items (max ' + max + ')')`. Each element
must be a string or throw `badRequest(key + ' must be a list of strings')`.
Trim that string with ECMAScript trim. A trimmed UTF-16 length greater than
itemMax throws `badRequest(key + ' items are too long (max ' + itemMax + '
characters)')`, including for an empty item when itemMax is negative. Append a
nonempty trimmed value only when the output does not already include it. Return
a fresh ordinary array, preserving first occurrence order. Do not clean prose,
drop invisible characters, change case, sort, mutate input, or count only unique
items for the original length bound.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:aeaa4d7a46244a72edd0`
