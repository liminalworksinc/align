# Public interface: server-asks.create-asks

## ADDED Requirements

### Requirement: server-asks.create-asks

# Team asks and their history

Record what a team was asked to do, who recorded it, where it came from and each
later mention. Preserve the team's accept, decline, completion and reopening
decisions and the recorder's withdrawal. Viewers read and never act. Team members,
the recorder and workspace owners retain their existing read access and action
rules, with the same waiting-on-me behavior.

Keep text and real calendar-date validation, team-name matching, readable
same-team goal checks, field limits, workspace capacity and creation-rate bounds,
person-action throttles, exact SQL and transaction/audit/event order. Imports
validate every item first, then append or merge. Matching text ignores case and
whitespace runs. A same-date match stays unchanged, a different-date match on an
open or accepted ask may gain a mention, and closed asks are preserved.

Preserve web reads, sorting, listing-local person/team/goal caches, mention order,
brief selection and feed hashes. A device following another team's goal through
an approved alignment may additionally read that team's accepted asks through
the supplied followed-team mechanism. Such reads have no actions and carry their
alignment marker. Ordinary web reads retain their original access rule.

The consuming service supplies storage, policy, identity, clock, text helpers,
throttles, events and goal/person lookups. Preserve public names and types, live
arrays, references, failure identity and read/effect order. No ambient IO,
network, permission substitute, retry or hidden result cache is added. These
controls do not close B15 or accept the public tester.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:aae53e1c467ad4d00858`
