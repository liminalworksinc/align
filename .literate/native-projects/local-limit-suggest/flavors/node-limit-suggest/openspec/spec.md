# Node-Limit-Suggest implementation Flavor

## ADDED Requirements

### Requirement: Node note suggestion binding [authored:node-limit-suggest-v2]

# Node binding for note suggestions

Export the named synchronous arity-one factory create_suggestions(resources) from
limit_suggest/create_suggestions in the dependency-free CommonJS package
limit_suggest. Capture exactly these resources once, in order: badRequest,
forbidden, V2Error, cleanText, isDay, limitsOf, LIMIT_SOURCE_TITLE_MAX,
LIMIT_TEXT_MAX, goalObj, goalRow, visibleGoals, takeAll, isBlankText, canReadGoal.
Do not enumerate or otherwise inspect the container. Call no service during
construction. Getter failures propagate unchanged before any later capture.
Invoke supplied functions with undefined receivers. V2Error is a supplied
constructor and is invoked with new.

Return exactly NOTES_MAX, sentences, limitType, keyWords, sameAs, goalFor and
suggestLimits, in that order. NOTES_MAX is 20000. The six synchronous named
functions have arities 1, 1, 1, 2, 3 and 2. Their result and input identities,
conditional property reads, short circuits and thrown values match this contract.
Use stable standard JavaScript intrinsics and no ambient configuration, IO,
network, clock, randomness or hidden original implementation.

sentences(text) splits with
`/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+|;\s+|\s+[-*•]\s+/`.
For each fragment remove `/^[-*•\d.)\s]+/` with empty text, then call cleanText.
Keep truthy cleaned results in order. This function adds no sentence limit.

limitType(sentence) first returns null when endsWith('?'). Count words with
`sentence.split(/\s+/).length`, without an extra trim. Return null below four or
above 45. Test the following expressions and branches in order:

1. `/\b(out of scope|out-of-scope|not in scope|outside (the|our|this) scope|not part of (the|this|our) (goal|project|scope|demo|work))\b/i` returns out_of_scope.
2. `/\b(ensure|make sure)\b|^(target|aim for)\b/i` returns must.
3. `/\b(must not|mustn't|must never|should not|shouldn't|should never|may not|not allowed to|never|do not|don't|cannot (all|be|exceed|go|use|run)|can not (all|be)|no more than|at most)\b/i` returns must_not.
4. `/\b(must|has to|have to|needs to|need to|should|is required to|are required to|at least|only use)\b/i` returns must.

Otherwise return null. These expressions are non-global and keep no lastIndex
state between calls.

keyWords(text) lowercases, splits on `/[^a-z0-9]+/` and inserts words of length at
least three into an ordinary fresh Set in first occurrence order unless in this
complete stop vocabulary, split on one space:

`the and all any are but can for from has have its may must need needs not nor our out own should that the their them then there this those was were what when which who will with would you your never only use used using scope part goal work team than more most least once also into onto been being does did don`

sameAs(limits,text) first computes the sentence word set, then finds the first
record for which its text word set overlaps by at least 0.6. The overlap is the
number of words in the first set present in the second divided by
Math.max(1, Math.min(first.size,second.size)). Return the original record or
undefined. Do not clone, sort or mutate caller arrays or records.

goalFor(goals,sentence,prefer) maps each original goal object to the words of
`[g.title,...JSON.parse(g.measures_json).map(m=>m.text)].join(' ')`, in that field
read order. Use a Map keyed by original objects, so a repeated reference updates
its prior Map entry. Count how many resulting goal sets contain each term. For
each goal term, the sentence says it if its word Set contains the term, otherwise
if any sentence word has greater length, starts with the term and the term length
is at least four. Sum one divided by the containing-goal count for said terms.
Stable-sort scores descending. Return null when there is no score or the first
score is below one. The tied set contains scores whose absolute difference from
the first is strictly below 1e-9. Return the one tied goal directly when alone.
Otherwise, only a truthy prefer starts the tied goals' id scan; return its first
matching original goal or null. No status or policy filter is added here.

suggestLimits(pp,b) uses this exact refusal and effect order:

- Read pp.wsRole. Viewer throws the value from forbidden('read_only','Viewers can look but not change anything.').
- Test the first b.notes read is a string, then call isBlankText on the next notes read. A failure throws badRequest('notes is required: paste the notes, or type the limit'). Read notes again for its length; above 20000 throws badRequest('notes is too long (max 20000 characters)').
- Read b.source, coalescing null/undefined to a new empty object. Reject a nonobject or array with badRequest('source must be an object with title and date'). Preserve the title short circuit: undefined test, null test, type test; a failure throws badRequest('source.title must be a string'). Then separately test title type and pass its next read to cleanText for a string, otherwise use empty text. Above the supplied LIMIT_SOURCE_TITLE_MAX throws badRequest('source.title is too long (max '+LIMIT_SOURCE_TITLE_MAX+' characters)'). Call isDay on src.date; failure throws badRequest('source.date must be a day like 2026-10-22').
- Start prefer null. Preserve the separate b.prefer_goal_id undefined and null tests. If present, read its type, refusing a nonstring with badRequest('prefer_goal_id must be a goal id'). Call goalRow with pp.wsId and the next preferred-id read. Missing row skips policy calls. Otherwise call goalObj(g), then canReadGoal(pp,that exact result). Missing or unreadable throws new V2Error(404,'not_found','Not found'). Store the next g.id read as prefer.
- Call takeAll with exactly one array argument containing `{key:'limit-suggest:'+pp.userId,max:20,windowMs:60000}` followed by `{key:'limit-suggest-ws:'+pp.wsId,max:120,windowMs:3600000}`. A falsy return throws new V2Error(429,'rate_limited','Too many requests, try again later'). No visible goal query follows refusal.
- Call visibleGoals(pp), filter status strictly equal to active, then call sentences on the next b.notes read and slice its first 200 entries. typed is whether that sliced list has length one. Make one source record with keys kind,title,date in that order; kind is manual when typed, otherwise meeting, and date is a new src.date read. Only typed and truthy prefer scan active goals for the preferred id as fallback.

For each retained sentence, call limitType and skip null. Choose goalFor's result
or the fallback. Without a goal, increment dropped and continue. Otherwise read
g.id for Map lookup. Reuse an existing entry or create `{g,current:limitsOf(g),
limits:[]}`. Read g.id again and call Map.set unconditionally for every selected sentence, including an already existing group and a sentence later dropped as duplicate or over the ten-limit bound. The second id read and Map.set occur immediately after entry selection and before text transformation or duplicate checks. Do not cache that id or put Map.set only inside the new-entry branch. Transform text by
removing `/^[A-Za-z][\w ]{0,24}:\s+/`, then replacing `/^\w/` with the uppercase
match. clip(v,max) returns v when length is at most max, otherwise v.slice(0,max-1)
followed by the single character U+2026. Clip saved text to supplied LIMIT_TEXT_MAX.
Evaluate sameAs(entry.limits,text) before entry.limits.length>=10. A truthy match
or full group increments dropped and skips insertion. Otherwise append exactly
`{type,text,quote,source,already}`. quote clips the original sentence to 200.
source is the same per-call record. already is sameAs(entry.current,text)?.id
coalesced to null, preserving an empty string id.

After all sentences, map group entries in insertion order. Read g.owner_id and
pp.userId for ownership before the projection. Return each group with goal keys
id,title,version in that order, then can_edit, can_propose, limits. can_propose is
the negation of that ownership comparison. The outer result keys are suggestions
then dropped. Do not read hidden goal facts, write state, catch errors, wrap
caller failures or issue later effects after a failure. Errors from caller
getters, services, JSON and native operations propagate as in the declared flow.
Keep the original implementation and private comparison commands outside all
generation requests. Use the normal main.js generated test adapter and the
package export ./create_suggestions to ./create_suggestions.js.

Require Node24 or later on macOS and Linux. The runtime package contains exactly
create_suggestions.js and package.json. Its manifest name is limit_suggest, type
is commonjs and exports is exactly {"./create_suggestions":"./create_suggestions.js"}.
It has no runtime dependency. Keep generated build, test, main adapter and SBOM
files outside this two-file package.


#### Scenario: Exact rule extraction, readable-goal matching and proposal projection

- **WHEN** the Node suggestion target is selected
- **THEN** Capture fourteen services and constants once. Preserve seven synchronous public values, exact sentence and vocabulary rules, weighted matching and preferred ties, validation and quota order, active readable facts, shared provenance, duplicate and size bounds, reference identity and failures.
