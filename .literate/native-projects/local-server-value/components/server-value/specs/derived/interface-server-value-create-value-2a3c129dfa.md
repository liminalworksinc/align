# Public interface: server-value.create-value

## ADDED Requirements

### Requirement: server-value.create-value

# Decision value cards and reports

Own the approved change request's value-card projection and a reader's value
report or content-free product event. The consuming services decide whether the
caller may read the request, provide its accepted change and approval facts,
identify readable goals and connected apps, and own storage, transactions,
clock, identifiers, text cleanup and event deduplication.

Every reader of an approved request may see its value card and report their own
estimate, including workspace viewers. Refuse a request that is not approved or
lacks an approver or decision time. Preserve the caller's request-read refusal
and the exact not_approved conflict. Present the goal and team, accepted changes,
approver, readable parents and dependents, launch state, directive delivery
counts, connected apps, server-measured durations, the reader's report, permitted
other reports and the safe follow-up link. Show only readable goal identities.
Connected apps describe versions the service sent, without claiming what the app
did afterward. The supplied app service retains its existing reader filtering.

Every report is visible to workspace owners and the request's requester,
approver, approval set and revision authors. Other readers see only their own.
Keep the current report ordering. Reports contain the person's safe display
name, estimate, optional note, creation/update time and whether the reader may
edit it. A report is editable by its author for strictly less than the supplied
number of days since creation. At the exact boundary it is closed.

Record viewed, reported and follow-up actions. Validate a reported estimate
against the supplied shared choices. Clean notes through the supplied cleaner,
enforce the supplied maximum and store blank notes as null. Rate-limit each
person to thirty actions per minute. Viewing or following up records the
corresponding event in a transaction. Reporting inserts or edits one report per
workspace, request and person inside a transaction, then records the reported
event with the estimate alone. Never include the note, goal or request in those
event properties. The event result decides recorded, including when it was
already present. Preserve the existing edit_closed refusal and its exact time
boundary. Read and project the saved report after commit.

Durations use the supplied live Date provider with original parse/now lookup,
receiver, ordering and failure behavior. Clamp negative measured spans to zero.
Applied delivery uses server receipt recorded_at, and considers applied or
enforced receipts. Preserve existing nulls and legacy launch defaults.

Preserve the three owned runtime exports and three public TypeScript types.
The six original core/value-rule re-exports retain their original identities in
the caller binding. Do not duplicate those already qualified implementations.
Keep all SQL interfaces, field and service evaluation order, shared references,
function arities and synchronous/asynchronous kinds. The consumer owns real
provider/browser behavior, complete application and image acceptance, public
delivery, actual operator security acceptance and live smoke. This service alone
does not close B15.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:ea82ca35f27904634dc0`
