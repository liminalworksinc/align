# Node-Goal-Limits implementation Flavor

## ADDED Requirements

### Requirement: Node goal-limit content binding [authored:node-goal-limits-v1]

# Goal limits Node binding

Target: CommonJS package `goal_limits`, named synchronous arity-one factory `create_goal_limits(resources)` at `goal_limits/create_goal_limits`. Capture `badRequest`, `cleanProse`, `isBlankText`, `rand32` and `readDate`, in that order, once during construction. Do not enumerate the resource container or call its services at construction. Getter failures propagate by identity. Invoke supplied services with undefined receivers. The zero-argument `readDate` supplies the current Date constructor for each original global Date lookup.

Return exactly these nine values in source order: `LIMIT_TYPES`, `LIMITS_MAX`, `LIMIT_TEXT_MAX`, `LIMIT_SOURCE_TITLE_MAX`, `cleanText`, `isDay`, `newLimitId`, `limitsOf`, `limitsIn`. Constants are the per-factory ordinary array `['must','must_not','out_of_scope']`, number 5, number 160 and number 120. Do not freeze the array or replace its identity during later calls. Functions have those exact names, are synchronous, and have arities one, one, zero, one and two respectively.

`cleanText(v)` first calls the string's replace with `/[\u0000-\u001f\u007f-\u009f]/g` and one space. Call `cleanProse` on that value, then collapse `/\s+/g` to one space and trim. Call `isBlankText` with that exact final string; return empty text for a truthy blank result, otherwise the final string. Preserve service order and failure identity.

`isDay(v)` returns false before Date access unless v is a primitive string matching `/^\d{4}-\d{2}-\d{2}$/`. Otherwise call `readDate().parse(v+'T00:00:00Z')`, with the supplied constructor as the method receiver. If the result is NaN, return false without the second Date lookup. Otherwise separately call `readDate`, construct it with the parsed value, call `toISOString`, take its first ten characters and compare strictly with v. Preserve both Date lookups, receivers and exceptions; do not replace the algorithm with a calendar library.

`newLimitId()` calls `rand32(8)`, takes `.slice(0,12)` on its result and returns the prefix `lim_` followed by that value. `limitsOf(row)` reads `row.limits_json` and parses that value or the literal `[]` when falsy. It adds no validation or repair.

`limitsIn(v,prev)` returns prev itself when v is undefined. For a present value, reject nonarrays with `limits must be a list`, then length over five with `limits: at most 5`. Map the request in index order. Each record uses field `limits[i]`. Reject a falsy value, nonobject or array with `FIELD must be an object with type and text`. Read type for its string test and again for membership in the live LIMIT_TYPES array, or reject with `FIELD.type must be one of ` followed by that array joined with comma-space. Check text is a string, call cleanText on its next text read, reject empty with `FIELD.text is required`, and length over160 with `FIELD.text is too long (max 160 characters)`.

After text validation construct an intermediate record in this property order: sentId is its id when the first id read is a string, requiring a second id read for that branch, otherwise null; type is read next; text is the already cleaned value; source is parsed from the next source read. Do not read source before id and type.

The source parser returns null for undefined or null. Reject a nonobject or array with `FIELD.source must be an object with kind, title and date`. Its kind must be meeting or manual, checked with the existing short circuit of separate kind reads, or reject `FIELD.source.kind must be meeting or manual`. Title may be undefined/null/string; otherwise reject `FIELD.source.title must be a string`. Preserve the source's repeated title reads for undefined, null and string tests, then the later string test and cleanText argument. Use empty title for a nonstring allowed value. Reject a cleaned title over120 with `FIELD.source.title is too long (max 120 characters)`. Call isDay on its date read, or reject `FIELD.source.date must be a day like 2026-10-22`. Return `{kind,title,date}` in that order, reading kind again and date again only after successful validation.

Only after all records parse, make the reserved identity set: for each parsed record with a truthy sentId, scan prev with `some`, reading each previous identity until a strict match. Add it if it has not already been reserved. Allocation then makes a separate taken set. Per record use its sentId only when truthy, reserved and not taken. Otherwise scan prev with `find`: check that each previous identity is unreserved and not taken, then compare previous type and intermediate type, previous text and intermediate text, then JSON.stringify(previous source) and JSON.stringify(intermediate source), with exact short-circuit order. The found record's identity is read again through optional lookup. Use null when absent. Generate only for a remaining falsy identity. Mark the chosen identity taken; return `{id,type,text,source}` in that order. Preserve references to parsed source objects, fresh output arrays/records and untouched caller arrays/records. Do not reorder previous arrays, normalize identities or sort results.

All badRequest calls receive exactly one message and their returned value is thrown unchanged. Exceptions from caller getters, supplied services, JSON parsing/stringification, Date operations or entropy processing propagate unchanged. Do not catch, wrap, recover or issue later effects after a failure. Keep original implementation and private commands out of generation requests. Use the ordinary generated test adapter `main.js`; manifest name `goal_limits`, type `commonjs`, export `./create_goal_limits` to `./create_goal_limits.js`.


#### Scenario: Limit parsing, calendar validation and stable content identities

- **WHEN** the Node goal-limit target is selected
- **THEN** Capture five ordered services once, preserve nine public values, exact validation and error messages, two live Date lookups, identity reservation and content reuse, and conditional property/service failure order.
