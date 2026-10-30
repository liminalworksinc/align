# Active work

This file is the durable resumption queue for user-directed and discovered work. Before
implementation, follow `skills/agent/record-user-directed-work/SKILL.md`.
Keep detailed designs in focused roadmap documents and link them here.
Record release scope in the [release-goal manifest](release-goals.json); the release
gate cross-checks it against this queue.

## Detailed-roadmap lifecycle

This file is the sole resumable queue. Create a supporting file beneath `docs/roadmap/`
only when one item cannot keep a program's rationale, ordering, and acceptance contract
readable. Put this visible header immediately after the detailed document's title:

```markdown
- **Status:** active
- **Owning queue item:** [AREA-NNN](active-work.md#area-nnn-heading)
- **Completion / archival evidence:** pending while AREA-NNN remains open
```

Status is exactly `active`, `partial`, `deferred`, `completed`, or `historical`. The
owner must resolve to a checkbox or named program heading in this file. A terminal state
requires linked evidence. Keep a completed plan here only when doing so preserves useful
inbound links; move substantial closed programs beneath `docs/history/roadmap/`, retain
their owner, and mark them `historical`. Do not create a separate file for an ordinary
queue item or let `docs/roadmap/` become a plan archive.

## P0

### [ ] ONBOARD-001 — Replace this starter item with the first project outcome

- **Owner:** project core
- **Direction:** Record the user's desired outcome without copying conversation noise.
- **Conclusion:** State the evidence-backed implementation boundary.
- **Depends on:** none
- **Implementation:**
  - [ ] Name the next concrete change.
- **Evidence:**
  - [ ] Name the build, test, execution, or review proof required for completion.

Check the parent only after every required subtask and evidence item passes. Add the
release-visible outcome to `CHANGELOG.md`; Git preserves prior queue states.

<a id="adopt-002"></a>
### [ ] ADOPT-002 — Native Literate AI rewrite

- **Completion prerequisites:** none
- **Owner:** project architecture / Components / Flavors / skills / assets
- **Direction:** Execute
  [ADR 0002](../decisions/0002-native-literate-ai-rewrite.md) through the
  [native rewrite program](native-rewrite-program.md), preserving retained source
  authority until each boundary independently qualifies.
- **Next action:** Produce the evidence-linked boundary inventory for
  `components/legacy-project-wrapper/implementation`.
- **Evidence:** Phase 1.2 lift-and-shift identity `sha256:316a4e6b641a46788febb1c21b004ad3c00b6d812c10006deb1d05a48207aa49`.

### [x] PRESEED-001 — Retire the hosted closing date

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (hosted config)
- **Direction:** Hosted Align must not require ALIGN_DELETE_BY or shut itself down; it was a demo-era restriction.
- **Conclusion:** Remove the closing-date check, the 410 close and their tests; data lifetime is governed by PRESEED-004's retention schedule.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Remove ALIGN_DELETE_BY from lib/config.ts, startup, proxy, Dockerfile, fly.toml and docs
  - [x] Update the hosted startup requirement in specs/align
- **Evidence:**
  - [x] test-v2 passes with no closing-date checks
  - [x] litai spec validate passes

### [x] PRESEED-002 — Hosted workspace creation gate and request access

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (workspaces)
- **Direction:** Gate hosted workspace creation behind single-use creation codes and a request-access form answered by hand; local mode stays open. Folds in the request-access and follow-up/LOI calls to action from GitHub issue #30.
- **Conclusion:** Codes are issued by an operator script (the v2 replacement for ws-admin); a global workspace cap and a creation kill switch are environment settings.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Creation codes: hashed, single-use, expiring; required to create a hosted workspace
  - [x] Request-access form under /app with a separate follow-up/LOI interest choice; operator script lists, approves and issues codes
  - [x] ALIGN_CREATION (codes|open|closed) and ALIGN_MAX_WORKSPACES
- **Evidence:**
  - [x] test-v2 checks: creation refused without a code, code single-use, cap and kill switch, request stored
  - [x] Spec requirements updated and validated

### [x] PRESEED-003 — Abuse controls for hosted sign-up

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (auth)
- **Direction:** Add cheap abuse controls before inviting outsiders: bot check, durable rate limits, disposable-domain block, per-account caps.
- **Conclusion:** Turnstile through Better Auth's captcha plugin when keys are set, including the email-code send route; database-backed rate limits; disposable-domain block at workspace creation and access requests; environment-tunable caps.
- **Depends on:** PRESEED-002
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Captcha plugin with Turnstile on email-code send, sign-in, access requests and workspace creation
  - [x] Database-backed rate limits with per-IP and per-email rules for code sends
  - [x] Disposable-domain list and block
  - [x] Caps: owned workspaces per account, members per workspace, sessions per device per day
- **Evidence:**
  - [x] test-v2 checks with a local captcha verify stub, rate limits, block and caps
  - [x] Spec requirements updated and validated

### [x] PRESEED-004 — Account deletion and the retention schedule

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (lifecycle)
- **Direction:** People can delete their account, and data has a published lifetime.
- **Conclusion:** Session rows 13 months then rolled up without the person; audit log 1 year; removed members shown as Former member after 30 days; deleted workspaces restorable for 30 days then purged; Fly snapshots 7 days.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Account deletion with fresh sign-in and last-owner guard
  - [x] Workspace soft delete, restore and purge
  - [x] Daily retention job: session roll-up, audit trim, former-member pseudonymisation, purge
  - [x] Published retention schedule (docs and spec); fly.toml snapshot retention
- **Evidence:**
  - [x] test-v2 checks with a controllable clock for every retention rule
  - [x] Spec requirements updated and validated

### [x] PRESEED-005 — Passkeys, session cap and sign-out everywhere

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (auth)
- **Direction:** Offer passkeys, cap sessions at 30 days absolute, add sign-out everywhere, and require a fresh sign-in for every sensitive action.
- **Conclusion:** Use @better-auth/passkey pinned to the better-auth version; keep 7-day rolling sessions.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Passkey add, list, delete and sign-in with autofill
  - [x] 30-day absolute session cap
  - [x] Sign out everywhere, optionally unpairing devices and disconnecting apps
  - [x] Fresh sign-in on device approval, MCP consent, role changes, removal, transfer and deletion
- **Evidence:**
  - [x] test-v2 checks including a virtual authenticator passkey sign-in
  - [x] Spec requirements updated and validated

### [x] PRESEED-006 — Evidence on change requests

- **Priority:** P1
- **Owner:** components/legacy-project-wrapper/implementation (change requests)
- **Direction:** Evidence is advisory: typed links labelled by who reported them, an Align-attached goal snapshot, and an audited approval without evidence.
- **Conclusion:** Evidence is frozen per revision; agent-reported evidence is never shown as verified.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Typed evidence links per revision (pr, ci_run, incident, dashboard, doc, other), https only
  - [x] Server-computed goal snapshot per revision
  - [x] Approved without evidence recorded in the decision and audit log
  - [x] Requests tab and MCP show evidence and its source
- **Evidence:**
  - [x] test-v2 checks for links, freezing, snapshot and the audited approval
  - [x] Spec requirements updated and validated

### [x] PRESEED-007 — Funnel events and operator report

- **Priority:** P1
- **Owner:** components/legacy-project-wrapper/implementation (metrics)
- **Direction:** Measure activation and retention without content, following the funnel convention in GitHub issue #30.
- **Conclusion:** A content-free events table and an operator report: funnel counts, time to first value, weekly active workspaces, week-1 and week-4 retention, share of sessions and spend bound to goals.
- **Depends on:** PRESEED-002, PRESEED-004, PRESEED-005, PRESEED-006
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Events table and recording points from access request to first MCP read
  - [x] Operator-recorded LOI sent and signed events; nothing self-asserted counts as signed
  - [x] Operator report script
- **Evidence:**
  - [x] test-v2 checks that each event is recorded once and holds no content
  - [x] Spec requirements updated and validated

### [x] PRESEED-008 — Security pack and public trust pages

- **Priority:** P1
- **Owner:** documentation / components/legacy-project-wrapper/implementation (public pages)
- **Direction:** Publish what buyers and directories ask for: privacy policy, DPA, subprocessors, retention, security overview and questionnaire answers.
- **Conclusion:** Drafts marked for counsel review, accurate to the code; public /privacy and /trust pages so the hosted allowlist serves them.
- **Depends on:** PRESEED-004, PRESEED-007
- **Completion prerequisites:** none
- **Implementation:**
  - [x] docs/trust: privacy policy, DPA note, subprocessors, retention, security overview, questionnaire answers
  - [x] Public /privacy and /trust pages and allowlist entries
- **Evidence:**
  - [x] test-v2 checks the pages are served hosted
  - [x] Every claim cross-checked against the code

### [ ] PORT-001 — Port foundation: schema, stubs and test slots

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (v2 schema)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** One additive migration (limits_json, asks, ask mentions, value reports, event indexes), stub modules and empty UI and test slots so the ports build in parallel.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Migration 11, SCHEMA_VERSION 11, EVENT_PROPS and PERSON_COLUMNS additions
  - [ ] Stub modules and UI slots; test marker blocks
- **Evidence:**
  - [ ] Full npm test passes on the foundation commit

### [ ] PORT-002 — Port limits as goal content and suggestions from notes

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (goals)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** Limits (must / must not / out of scope, at most 5) are part of each goal version, confirmed by the approval set, delivered with goal versions; pasted notes return suggestions and store nothing.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Goal content, hash, change requests and directive snapshot carry limits
  - [ ] Suggest route, Goals tab and goal page UI
- **Evidence:**
  - [ ] test-v2 port:limits checks
  - [ ] Spec requirements updated and validated

### [ ] PORT-003 — Port asks and goal activity

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (asks, activity)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** Asks between teams with accept, decline, done, reopen, withdraw and mention; goal activity from bindings, usage and work signals, never prompts; retention for closed asks and value reports.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Asks routes, rules and Asks tab
  - [ ] Goal activity data and card
  - [ ] Retention rules
- **Evidence:**
  - [ ] test-v2 port:asks, port:activity and port:retention checks
  - [ ] Spec requirements updated and validated

### [ ] PORT-004 — Port MCP tools, paste lines and the decision value card

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (MCP, app surface)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** align_get_asks, align_get_goal_activity, align_get_limits and align_get_brief under the founder's 2026-10-29 read scoping in v2 terms; quoted paste lines; strict Host; the value card with per-decision value reports and notes; funnel reconciliation.
- **Depends on:** PORT-002, PORT-003
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Four MCP tools with scoping and instructions
  - [ ] Paste lines and strict Host
  - [ ] Value card, value reports, follow-up link, events and report section
- **Evidence:**
  - [ ] test-oauth port:mcp and test-v2 port:value checks; paste-line tests
  - [ ] Spec requirements updated and validated

### [ ] PORT-005 — Port agent context: limits, accepted asks, drift notice, past sessions

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation/packages/align-agent
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** The hook envelope carries the bound goal's limits and accepted asks as quoted, attributed data; a local-only drift notice shown to the user; align asks; align share --dir --past replaces the import script.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Limits and accepted asks in the envelope and deltas
  - [ ] Local drift notice with an off switch
  - [ ] align asks and share --dir --past
- **Evidence:**
  - [ ] align-agent tests for each behaviour
  - [ ] Spec requirements updated and validated
