# Public interface: limit-suggest.create-suggestions

## ADDED Requirements

### Requirement: limit-suggest.create-suggestions

# Suggest goal limits from notes

Turn a caller's pasted notes into proposed goal limits without storing, auditing,
recording events or calling any remote service. A person saves a suggestion in a
new goal version or proposes a change through the consuming application's existing
approval process. This service does not accept or launch a limit.

Expose the existing notes bound, sentence splitting, rule classification,
meaningful-word extraction, current-limit matching, goal matching and suggestion
operations. Preserve synchronous results, reference identities and refusal order.

Only owners and members may request suggestions. A viewer receives the existing
read_only refusal before body or service access. Notes must be a nonblank string
of at most 20,000 UTF-16 code units. A source has an optional cleaned title of at
most 120 code units and a valid supplied calendar day. An optional preferred goal
must exist in this workspace and pass the supplied read policy before quota use.
Consume both the person and workspace quota together, in order, using the current
20-per-minute and 120-per-hour descriptors. A refusal stores nothing and names no
hidden goal.

Split text at the declared sentence, newline, semicolon and bullet boundaries.
Clean each fragment and discard empty fragments. Examine at most 200 sentences.
A rule has four through 45 whitespace-separated words and does not end in a
question mark. Classify out-of-scope wording first, then ensure/make-sure or
initial target/aim-for wording as must, then must-not and must wording. A plain
can't does not classify a rule. Preserve the exact target vocabulary and order.

Extract distinct meaningful ASCII alphanumeric words in first-seen order after
lowercasing, discarding words shorter than three and the complete target stop
vocabulary. Current-limit matching returns the first original record whose word
set overlaps the sentence by at least 0.6, using the smaller set size and a
minimum denominator of one. It does not compare limit types or mutate records.

Score each supplied goal using its own title and measure text. Each matching
meaningful term contributes one divided by the number of goals containing that
term. A longer sentence word may extend a goal term only when the goal term has
at least four characters. A score below one has no match. An untied winner is the
original goal object. For scores within the declared tolerance of the leading
score, choose the preferred goal only if it is among those tied; otherwise return
null. Preserve duplicate object identity and input order behavior.

Suggestion requests first obtain the current readable goals and retain active
ones. Hidden goals and their words never enter matching. When the split list has
one sentence, use manual provenance and allow the active preferred goal as a
fallback for a rule that matches no goal. Otherwise use meeting provenance and
no fallback. A rule without a goal adds one to dropped. Non-rules and sentences
past the first 200 do not add to dropped.

Group suggestions by goal identity string in first-occurrence order. Read a
selected goal's current limits once when its group is first created. Remove only
the declared short heading, capitalize the leading ASCII word character and clip
the saved text to 160 code units and the quote to 200, using the original ellipsis
behavior. Match duplicates against that group's existing suggestions before
checking its ten-limit bound. Repeated or excess rules add one to dropped. The
already field names the first overlapping current limit, or null. Every emitted
limit in one request shares the same newly created source record. Keep goal,
limit and suggestion ordering, and retain the first group's original goal facts.

Project each group's goal id, title and version. can_edit reflects exact caller
ownership; can_propose is its negation. The consuming application owns browser
session authentication, request size, same-origin checks, policy facts, current
goal queries, text services and quota storage.

Preserve all seven runtime exports and both public interfaces through the target
binding. Exact signatures, regular expressions, constants, property/query/service
order, errors and caller-reference behavior are part of the Node contract. Two
clean qualifications, separate admission, full source review, both-host package
and actual typed application acceptance remain required. This helper alone does
not close the twelve-file B15 boundary or accept a public tester.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:b13a133365274c358e5b`
