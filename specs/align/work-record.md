---
name: Work record
summary: Stamps that tie each commit, PR and file a shared agent session made to the plan version in force, and the work record of each shared session per plan version, with a review by the goal's approvers and the review time it measures. Specified, not built.
kind: area
---

# Work record

What each shared agent session did under each approved plan version, and a person's decision on that work. Two
features build it, in this order: stamps (LIM-2510), which tie each commit, PR and file an agent made to the plan
version in force when it made it; then the work record and its review (LIM-2508), which show the work against that
version and let the goal's approvers accept, reject or ask for changes.

Status: specified, not built. Founder decisions of 2026-11-12 (recorded on LIM-2508) govern the buyer, the privacy
default and who decides. Building starts after v2 is live for testers.

## Who it is for and the journey

The first buyer is the engineering lead of a small AI-native team (5 to 50 people, three or more coding agents). The
promise this part serves: "See what every agent on your team did, across Claude Code and Codex, against the plan you
approved." Its measure of value is review time per agent PR: from the moment an agent's work is ready to the moment a
person accepts it.

The journey the screens below support, in the person's words:

1. **"What did our agents do since I last looked?"** Home's Needs list holds one row per piece of agent work waiting
   on them, ranked with their decisions. Nothing new to learn: it is the list they already work from.
2. **"Is this safe to accept?"** The row opens a work review drawer over Home, built like the change request review
   drawer: the plan version the work was done under, what the agent worked on, what may have drifted from that plan,
   and the commits and PRs it made, each item saying where Align got it.
3. **"Decide and move on."** Accept, Needs changes or Reject, with an optional note, in the drawer. The row greys
   out in place, like a decided change request.
4. **"Which agents are on the old plan?"** The Work page's sessions panel shows each session's work grouped by plan
   version, with work done on a version older than the goal's current one marked as such.
5. **"Is this paying off?"** The goal page shows the median review time over the last 14 days, as a count-backed
   number, so the person can see whether review is getting faster.

What it never says: that an agent's work is correct, verified, compliant or that it followed the plan. A stamp
records which plan version was in force. A drift flag says the work may have drifted. A decision is a person's
judgment, recorded.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Stamp | A record that a commit, PR or file was made by a shared session while a given plan version (goal version) was in its context, and with which model |
| Work item | One shared session's work under one binding epoch, so under one plan version of one goal (the unit a person reviews) |
| Ready | A work item whose epoch ended (the session switched goal, its goal got a new launched version and the session moved on, it was stopped or ended) or whose developer marked it ready with `::align ready` |
| Drift flag | A stretch of a work item that the align CLI's word rules found may cross one of the goal version's limits (the local drift notice, `local-agent`) |
| Review | One person's decision on a work item: `accepted`, `needs_changes` or `rejected`, with an optional note |
| Review time | For a work item that was accepted, the time from Ready to the first `accepted` review |

## Requirements: stamps (LIM-2510)

### Requirement: The agent records a stamp for each commit a shared session makes

When the align CLI confirms that a shared, bound session made a commit (it already reads HEAD's reflog to confirm one),
it SHALL keep one local stamp: the commit SHA, a patch id that survives a rebase, the repository's id, the epoch id,
the goal id, the goal version the session had in its context at that moment (which can be older than the server's
current version while a launch is on its way), and the model of the session's last request before the commit. It
SHALL keep no stamp for a private or unshared session, and none when two shared sessions are bound in the same folder
(the stamp would be ambiguous; it records "ambiguous" locally instead).

#### Scenario: A commit under version 3

- **WHEN** a shared Claude Code session bound to "Ship v2 to testers" at version 3 runs `git commit`
- **THEN** the CLI keeps a stamp with that commit's SHA and patch id, the epoch, the goal, version 3 and the model; an unshared session in another folder keeps none

#### Scenario: A launch on its way

- **WHEN** version 4 of the goal is launched but the session has not yet received it when it commits
- **THEN** the stamp records version 3, the version the session had in context

### Requirement: Stamps leave the machine as ids and hashes only

The one-pass sync SHALL upload a shared session's stamps with ids and hashes only: no commit subject, file path, file
content or goal title. The server SHALL keep them as long as the shared session exists (not the 24-hour activity
window) and delete them with the session's shared history.

#### Scenario: Canary

- **WHEN** a commit's subject, a file's path and the goal's title each contain a canary string
- **THEN** none of the three appears in the server's stamp table or in the upload

### Requirement: Looking up which plan version a commit was made under

`GET /api/v2/workspaces/<ws>/stamps?commit=<sha>` (also `?patch_id=` and `?file_hash=`) SHALL return, for a person who
can read the goal, the goal, the version in the session's context, when that version was launched, the model or models,
the session's harness, and the source label "recorded by Align at commit time". A person who can't read the goal, or
another workspace, SHALL get 404. `align stamp <sha>`, `align stamp pr` (the stamps for the commits on the current
branch, as one line to paste into a PR) and `align stamp file <path>` SHALL answer the same from the local record,
offline. A commit with no stamp SHALL answer "no record", never a guess.

#### Scenario: After a rebase

- **WHEN** a stamped commit is rebased and its SHA changes
- **THEN** a lookup by its patch id still finds the stamp; after a squash merge, the squashed commit answers "no record"

## Requirements: the work record and its review (LIM-2508)

### Requirement: The agent records what a shared session worked on, per plan version

For a shared, bound session, the align CLI SHALL keep, per epoch, what its hooks and tailer already observe: the
number of files changed and their paths, the commands run (the command name only, no arguments), the commits made
(through stamps), and drift flags from the local drift notice. It SHALL keep nothing for a private or unshared session.

### Requirement: Metadata only leaves the machine by default

The sync SHALL upload a work item's paths, command names, counts, commit stamps, drift flags (the limit's id and the
crossing sentence's digest) and plan version ids. Reply text, command arguments, diffs and summaries SHALL leave the
machine only when the person turned on "share work signals" for that session (`local-agent`). Founder decision of
2026-11-12; a security review precedes the build.

#### Scenario: Signals off

- **WHEN** a shared session with "share work signals" off runs `npm test -- --grep secret` and writes a reply
- **THEN** the upload carries the command name `npm` and a count, never the arguments or the reply

### Requirement: Marking work ready

A work item SHALL become Ready when its epoch ends (the session switches goal, moves to a newer launched version, is
stopped, or ends) or when its developer runs `::align ready` in the session. The server SHALL record the time it became
Ready. A work item that is not Ready SHALL read "In progress" and SHALL not appear as something to review.

### Requirement: Who may review

A review SHALL be recorded only by someone in the goal's approval set or a workspace owner (founder decision of
2026-11-12). Nobody SHALL review a work item of their own session. A viewer SHALL get 403 `read_only`, another member
403 `not_approver`, and a person who can't read the goal or another workspace 404. Every route SHALL go through
`lib/v2/policy.ts`.

### Requirement: Recording a review

`POST /api/v2/workspaces/<ws>/work/<session_key>.<epoch_id>/reviews` with `{decision, note?}` (`decision` one of
`accepted`, `needs_changes`, `rejected`; `note` at most 280 characters, shown quoted) SHALL store one review row: the
reviewer, the time, the decision, the note, the work item and its plan version. Reviews SHALL be append-only: a changed
mind is a new review that supersedes the reviewer's earlier one, and both are kept. Feature E (LIM-2512) adds more
reviewers to the same rows, so this is the only decision record. A review SHALL write a `v2_audit` row and a
content-free product event.

#### Scenario: Accept

- **WHEN** a goal's lead accepts a Ready work item of a teammate's session
- **THEN** the review is stored with the lead, the time and `accepted`, the work item's review time is from its Ready time to now, and its Needs row leaves the lead's list

#### Scenario: Own session

- **WHEN** the goal's owner tries to review a work item of their own session
- **THEN** 403 `own_work`

### Requirement: Agent work in the Needs list

Home's Needs list (`interface` "Workspace Home") SHALL gain the kind "Agent work", one row per Ready work item without
a review, waiting on the goal's approval set and workspace owners, except the session's own person. The row SHALL show
the goal's title, "<person>'s <harness> session, v<n>", how long it has waited since Ready, its evidence class ("Agent
reported", from the align CLI), "May have drifted (<n>)" when it has drift flags, "On an older version" when its version
is older than the goal's latest launched one, and **Review work**, which opens the work review drawer over the Home
(`?work=<session_key>.<epoch_id>`). Ranked with decisions: work with drift flags or on an older version first, then by
how long it has waited.

### Requirement: Work review drawer

The work review drawer SHALL show, in this order: the goal and the plan version the work was done under, with "Newer
version v<m> launched <time>" when there is one; "What the agent worked on" (files changed with paths when shared,
otherwise their count; commands by name; commits and PRs from stamps); "May have drifted" (each flagged limit's text and,
when signals are on, the sentence; "Nothing flagged" otherwise, never "followed the plan"); and the decision buttons
**Accept**, **Needs changes** and **Reject** with an optional note. Each item SHALL carry one evidence class ("agent
reported" for what the CLI reported, "not observed" where nothing was reported). After a decision the drawer SHALL say
what was recorded, and the Needs row SHALL grey out in place as "Reviewed", like a decided change request.

### Requirement: Work on the Work page

The Work page's sessions panel (`interface` "Live workspace", `app/app/_ui/ds/work.tsx`) SHALL list, for the goal,
each shared session's work items grouped by plan version, newest first, each with its state: "In progress", "Waiting
for review", "Accepted", "Needs changes" or "Rejected" (with the reviewer and time), "May have drifted (<n>)" and "On an
older version" where they apply, and **Review work** for a person who may review. Other people's sessions show counts
and states only; their paths only when shared with signals on.

### Requirement: Review time on the goal page

The goal page's Agent activity card SHALL add "Agent work reviewed, last 14 days": "<a> accepted, <w> waiting, <r>
needs changes or rejected" and "Median review time <duration> (<n> accepted)". Below 5 accepted work items it SHALL show
the counts and no median. It SHALL never say "faster" or compare without a baseline the person recorded.

## Open questions

- Should Reject also send the agent a directive (the Lane C path, LIM-2505), or only record the decision?
- Should a commit trailer be offered at all (LIM-2510), given the rule against attribution lines in commits?
- Stamp retention: as long as the session, or a fixed period such as one year?
- Should a developer be able to mark work ready from the web as well as with `::align ready`?

## Sources

LIM-2508, LIM-2510 (scopes and founder decisions, 2026-11-12); `interface` "Workspace Home", "Live workspace", "Evidence
class on every agent-status item", "Agent activity on the goal page"; `local-agent` (drift notice, work signals);
`app/app/_ui/ds/work.tsx`; `packages/align-agent/src/hooks/evidence.ts`, `shared/drift.ts`, `activity.ts`;
`lib/v2/sessions.ts` (`v2_epochs`).
