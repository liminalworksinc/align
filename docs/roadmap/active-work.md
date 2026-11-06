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

## Open pull-request landing queue

Tracker reconciliation on 2026-11-05 found seven open reviews. The native rewrite
checkpoint in #58 is published as `56848383` and remains draft. Its exact-head
receipt/spec and current-main checks pass. Peer work remains independently owned.

- [#58](https://github.com/liminalworksinc/align/pull/58), native rewrite:
  seventeen qualified libraries, including numbered storage upgrades. Current head
  `56848383` matches this worktree and passes hosted CI. The review remains draft.
- [#63](https://github.com/liminalworksinc/align/pull/63), integrated v2 frontend:
  peer work, with its receipt/spec check failing at the surveyed head. It changes
  interface consumers and remains separate from the storage contract work.
- [#64](https://github.com/liminalworksinc/align/pull/64), refused usage uploads:
  draft peer work in the local agent.
- [#65](https://github.com/liminalworksinc/align/pull/65), refresh-lock ownership:
  draft peer work in the local agent.
- [#66](https://github.com/liminalworksinc/align/pull/66), team membership role checks:
  draft peer work in workspace authorization.
- [#59](https://github.com/liminalworksinc/align/pull/59), demo friction: draft peer
  work, outside this native rewrite step.
- [#62](https://github.com/liminalworksinc/align/pull/62), serial hook latency:
  draft peer work. Keep the 150 ms threshold; this native integration must pass the
  existing test conditions before claiming verification.

PR #60 is merged by its owner. PR #61 is closed; its folder-rule fix and stale-socket
repair are on the newer main, while its latency work continues in #62. ADOPT-002
reproduces the folder-rule failure on this older base and tracks the matching repair.

Open issue [#30](https://github.com/liminalworksinc/align/issues/30) remains covered
by the existing preseed, deployment and handoff items in this queue.

## P0

Check the parent only after every required subtask and evidence item passes. Add the
release-visible outcome to `CHANGELOG.md`; Git preserves prior queue states.

<a id="adopt-002"></a>
### [ ] ADOPT-002 — Native Literate AI rewrite

- **Completion prerequisites:** SEC-001, CONFIG-001, CONTEXT-001, NATIVE-BINDINGS-001, TRUST-PARSER-001, VERIFIER-LINT-001
- **Owner:** project architecture / Components / Flavors / skills / assets
- **Direction:** Execute
  [ADR 0002](../decisions/0002-native-literate-ai-rewrite.md) through the
  [native rewrite program](native-rewrite-program.md), preserving retained source
  authority until each boundary independently qualifies.
- **Next action:** After the pending specific local SDK commit approval, build
  and verify its clean non-editable wheel, then recreate the schema project
  through ordinary signed promotion and run two clean qualifications. Preserve
  its natural zero-argument API and all frozen acceptance cases before consumer
  transfer or SQL retirement. The remaining storage, runtime and authority-class
  review stay open under the [native rewrite program](native-rewrite-program.md).
  Runtime settings completes local consumer acceptance across all 22 functions
  and both data values. Two distinct clean qualification runs and a separate
  admitted build pass all 62 cases, covering 18,156 observations and seven state
  traces. Actual macOS and Linux consumers match those results; typed namespaces
  remain assignable in both directions. Eight cold Node-only operator commands
  match the retained baseline from a read-only checkout. Explicit packaged code
  modes support the unprivileged operator, and owned process groups preserve
  SIGTERM, SIGINT and SIGHUP with cleanup. All 36 image/header/startup checks pass.
  The complete 404-member build, test and package workflow passes all 1,829 checks
  with zero failures or skips. Every phase binds the same source identity, and
  all 4,198 committable files remain unchanged through that run. Both installed
  verification runtimes pass three gates with two declared optional skips;
  project validation and owned entrypoints pass. Current receipt:
  `sha256:cb5556032abc5d569b3b8bb4a31809da4325c3f43078c09157dae7b7f7212a21`.
  All 18 native children pass 72 actual validate, lock, plan and verify commands.
  Three corrected contributor guides have fresh ordinary receipts, with accepted
  source reused and qualification profiles, locks, qualified heads and consumed
  packages unchanged. The test driver awaits subprocesses, decodes UTF-8 streams
  incrementally and checks event fields independently. Eighteen injected leak
  controls, two field/row boundary controls and a real split-byte child process
  preserve the intended assertions. No interrupted run supplies the current
  receipt. The registered settings child initially preserves all 17 prior
  registrations and 3,113 tracked files; later guide repairs change only their
  owned documentation, review markers and receipts. This local checkpoint remains
  uncommitted and unpublished. The separate SDK tree is excluded. No schema SQL
  is retired.
  The portable contract and SQLite Flavor pass source-bound review. Their verifier
  passes 212 observations in 51 cases with identical macOS/Linux results and
  detects all 15 broken variants. Source snapshot:
  `sha256:77c6c76403ced6b996f9236d3b304b692d86a1ae52b7e1ef93a5fd8e00e86bf5`.
  All 23 shape descriptions match the historical schemas on both targets,
  19 additional compatibility cases pass on each, and 16 model controls plus
  four capture refusals pass. The architecture documents and CONFIG-001 correction
  pass the full 1,827-check build/test/package workflow, with zero failures or
  skips. Its source remains a 398-member tree. All 36 hosted image,
  response-header and startup refusal checks pass against the same immutable
  image. Both installed and CI-pinned verification runtimes accept the refreshed
  local receipt:
  `sha256:16acdfd7a2fde0d5d3561470e6143bd8c99b31b4e50e607df9e73b7575be155c`.
  These local changes are uncommitted and unpublished. The schema itself is not
  natively qualified or transferred yet.
  The seventeen-library checkpoint is published as `56848383` in draft
  [PR #58](https://github.com/liminalworksinc/align/pull/58). Its exact-head
  [receipt and spec check](https://github.com/liminalworksinc/align/actions/runs/42141663499)
  and [current-main check](https://github.com/liminalworksinc/align/actions/runs/42141700921)
  pass. The complete build, test and package workflow passes all 1,825 application
  checks, with zero failures or skips. All 24 image checks and ten additional
  header checks pass. The coordinator passes two clean qualification builds,
  its separately admitted build, public registration, 213 actual storage checks
  on macOS and Linux, and 302 web-admission batches across eleven libraries.
  Sixteen prior registrations and 2,956 tracked child files are preserved.
  Current receipt: `sha256:5e61ae0fe5bebdf1b28e1ff2112135628f34d8d601ef99dcbd46444507da5547`.
  The normal pre-push review completed without an opt-out. Its old-Git admission
  concern is refuted by installed composition checks: effective constraints remain
  Git >=2.47 and Git LFS >=3.2. Inherited realization labels are unchanged.
  All 48 tables have observed consumers outside the schema module. The remaining
  schema, historical SQL, authentication, runtime boundaries and authority-class
  review remain open. The separate framework tree is excluded from publication.
  The sixteen-library checkpoint is published as `bb2605c` in draft
  [PR #58](https://github.com/liminalworksinc/align/pull/58). Its exact-head
  [receipt and spec check](https://github.com/liminalworksinc/align/actions/runs/42123356635)
  and [current-main check](https://github.com/liminalworksinc/align/actions/runs/42123419433)
  pass. B12 starts from that verified checkpoint.
  The combined build, test and package workflow includes main at `b16f8d1` and
  passes all 1,825 checks with zero failures or skips.
  B06 field validation is qualified, separately admitted, publicly registered and
  consumed through typed aliases. All 4,549,018 observations match the actual
  consumer; web admission passes 281 batches across ten libraries. The scope has
  395 members and no gaps. The hosted image passes all 24 checks, and ten additional
  HTTP cases verify exact framing headers and hosted HSTS on that same image.
  All fifteen prior registrations, manifest records and
  2,797 native child files remain unchanged. Continue the remaining authority
  classes after complete consumer-transfer acceptance. The complete fifteen-library application passes all 1,821 checks with
  zero failures or skips through the reconciled installed framework at `4d672137`.
  All 24 image checks pass on the SSD-backed Colima engine for that fifteen-library
  checkpoint. Last complete fifteen-library receipt:
  `sha256:8c7f0f604ba43f9185814c94b090480716700daed9fbe1c10e11c37d4c104f73`.
  Root and CI-pinned verification each pass three gates with two declared skips;
  project validation and owned-entrypoint checks pass. B07 value rules passes both
  clean qualification builds, its separate 15-test admitted build and all 1,168,597
  observations against the actual typed consumer. Namespace and EstimateId types
  remain compatible in both directions. Web admission passes 231 batches across
  nine libraries; agent admission passes 157 batches across six. All fourteen prior
  manifest entries remain identical. The scope has 393 members and no gaps.
  The accepted registration design, originally local ADR 0060 and now ADR 0064,
  is implemented in approved local merge commit `4d672137`. Its clean non-editable
  wheel passes 93 managed installed regressions. The real two-library public-CLI
  fixture proves read-only planning, stale-plan refusal, actual process interruption,
  ordinary verification refusal of mixed metadata, exact recovery and successful
  addition while preserving 525 child files. The former private helper is retired.
  The operator approved publishing the fifteen-library tree as `a598a6e` to
  draft PR #58. Only framework changes needed by Align remain in scope.
  Further commits and publication require specific
  operator approval. [SDK-FOLLOWUPS-001](#sdk-followups-001), remaining runtime
  boundaries and authority-class review stay open.
- **Evidence:** Phase 1.2 lift-and-shift identity `sha256:316a4e6b641a46788febb1c21b004ad3c00b6d812c10006deb1d05a48207aa49`.
- **Continuation direction (2026-11-04):** Finish the complete native rewrite program
  and resolve its litai follow-ups. Qualification of an isolated library is an
  intermediate result. Completion requires actual consumer integration, verified
  source retirement, every inventory classification, and full application parity.

<a id="context-001"></a>
### [x] CONTEXT-001 - Preserve context priorities and ask attribution under clipping

- **Priority:** P1
- **Owner:** Agent envelope, B10
- **Direction:** Enforce the existing goal-envelope and accepted-ask delta requirements before native envelope qualification.
- **Conclusion:** The current budget loop keeps parent measures while dropping the bound goal's measures. The single-ask fallback drops both attribution and earlier closing counts. Preserve all limits, quote boundaries, attribution, closing counts and existing character budgets.
- **Depends on:** none
- **Implementation:**
  - [x] Drop parent measures before reducing the goal's own measures under budget pressure.
  - [x] Keep who asked, the date, who accepted and earlier closing counts in the clipped single-ask note.
  - [x] Add direct and hook regression cases, and recapture the corrected envelope baseline before qualification.
- **Evidence:**
  - [x] Canonical clipping priorities, attribution and closing counts pass with long legal field values, without enlarging any budget or removing limits.
  - [x] Complete retained application workflow and current receipt against the corrected source.
  - [x] Native envelope qualification against the corrected source.
- **Verification follow-up:** The first corrected full run passes 1,816 checks and fails the share-state property at seed `1630038945`, after `align stop-sharing` then an older build writes. The same seed reproduces locally. Diagnose its state preconditions and preserve stop/hold and private-session invariants before rerunning the full gate; do not skip the seed or relax the assertion.
- **Failure diagnosis:** The chosen fake-server session belongs to an earlier device pairing. The current pairing cannot receive its directive, and its local share has ended. Correct the property action's ownership precondition, keep the denial assertion for every deliverable stop/hold, retain the reported seed permanently and add a deterministic old-pairing isolation regression.
- **Reproduction:** Direct probes of the unchanged source show a limit-bearing envelope retaining parent measures while showing only six of eight own measures, and a long one-ask delta of 187 characters with no attribution or closing count. The implementation and canonical requirements are recorded in the [rewrite program](native-rewrite-program.md#b10-notice-helper-preflight). Tracker search finds no matching issue. No external issue is posted.

### [x] PRESEED-001 — Retire the hosted closing date

- **Priority:** P0
- **Release target:** 2.0.0
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
- **Release target:** 2.0.0
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
- **Release target:** 2.0.0
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
- **Release target:** 2.0.0
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
- **Release target:** 2.0.0
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
- **Release target:** 2.0.0
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
- **Release target:** 2.0.0
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
- **Release target:** 2.0.0
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

### [x] PORT-001 — Port foundation: schema, stubs and test slots

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (v2 schema)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** One additive migration (limits_json, asks, ask mentions, value reports, event indexes), stub modules and empty UI and test slots so the ports build in parallel.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Migration 11, SCHEMA_VERSION 11, EVENT_PROPS and PERSON_COLUMNS additions
  - [x] Stub modules and UI slots; test marker blocks
- **Evidence:**
  - [x] Full npm test passes on the foundation commit

### [x] PORT-002 — Port limits as goal content and suggestions from notes

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (goals)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** Limits (must / must not / out of scope, at most 5) are part of each goal version, confirmed by the approval set, delivered with goal versions; pasted notes return suggestions and store nothing.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Goal content, hash, change requests and directive snapshot carry limits
  - [x] Suggest route, Goals tab and goal page UI
- **Evidence:**
  - [x] test-v2 port:limits checks
  - [x] Spec requirements updated and validated

### [x] PORT-003 — Port asks and goal activity

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (asks, activity)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** Asks between teams with accept, decline, done, reopen, withdraw and mention; goal activity from bindings, usage and work signals, never prompts; retention for closed asks and value reports.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Asks routes, rules and Asks tab
  - [x] Goal activity data and card
  - [x] Retention rules
- **Evidence:**
  - [x] test-v2 port:asks, port:activity and port:retention checks
  - [x] Spec requirements updated and validated

### [x] PORT-004 — Port MCP tools, paste lines and the decision value card

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (MCP, app surface)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** align_get_asks, align_get_goal_activity, align_get_limits and align_get_brief under the founder's 2026-10-29 read scoping in v2 terms; quoted paste lines; strict Host; the value card with per-decision value reports and notes; funnel reconciliation.
- **Depends on:** PORT-002, PORT-003
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Four MCP tools with scoping and instructions
  - [x] Paste lines and strict Host
  - [x] Value card, value reports, follow-up link, events and report section
- **Evidence:**
  - [x] test-oauth port:mcp and test-v2 port:value checks; paste-line tests
  - [x] Spec requirements updated and validated

### [x] PORT-005 — Port agent context: limits, accepted asks, drift notice, past sessions

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation/packages/align-agent
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** The hook envelope carries the bound goal's limits and accepted asks as quoted, attributed data; a local-only drift notice shown to the user; align asks; align share --dir --past replaces the import script.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Limits and accepted asks in the envelope and deltas
  - [x] Local drift notice with an off switch
  - [x] align asks and share --dir --past
- **Evidence:**
  - [x] align-agent tests for each behaviour
  - [x] Spec requirements updated and validated

### [x] REQ-001 — Requests and goal holds: server, app and spec

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (directives)
- **Direction:** Owner decision 2026-10-30: between informing and instructing agents, add typed requests (replan, checkpoint, switch goal) from a goal's approvers and workspace owners, plus an enforced goal hold; safe requests run on their own, anything that changes direction asks the developer first.
- **Conclusion:** New request, hold and release directives with per-session receipts (accepted, declined, auto-accepted), routes and UI on the goal page, audit, retention and MCP read-out; answers the instruct-or-inform open question.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Migration 12: directive kinds, requests, request targets, goal holds
  - [x] Routes, authorization, audit, events and retention
  - [x] Goal page card and hold banners; MCP directives output
- **Evidence:**
  - [x] test-v2 and test-oauth checks for every route, rule and receipt
  - [x] Spec requirements updated and validated

### [x] REQ-002 — Requests and goal holds: local agent

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation/packages/align-agent
- **Direction:** Owner decision 2026-10-30: between informing and instructing agents, add typed requests (replan, checkpoint, switch goal) from a goal's approvers and workspace owners, plus an enforced goal hold; safe requests run on their own, anything that changes direction asks the developer first.
- **Conclusion:** The agent tells the developer about every request, does checkpoints and replan drafts on its own, waits for the developer on switch goal, records accept or decline, and enforces goal holds like the stop latch.
- **Depends on:** REQ-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Request intake, notices and Align-written context
  - [x] ::align accept/decline and align requests
  - [x] Goal hold latch that fails closed
- **Evidence:**
  - [x] align-agent tests for each behaviour; live agent-to-server checks
  - [x] Spec requirements updated and validated

### [x] LAUNCH-001 — Launch releases an approved change to agents (#39 D1)

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (change requests)
- **Direction:** Founder ruling LIM-2454 33ad545d and owner answers 2026-10-31: approving records the decision; agents get the new version only at launch; anyone in the goal's approval set or a workspace owner may launch; one-step Approve and launch when the same person may do both; an unlaunched change is superseded if the goal gets a newer version or closes first.
- **Conclusion:** Split the approve transaction: approve holds the version unlaunched; launch (or not yet, replaceable) publishes through writeGoalVersion with goal_version directives in one transaction; MCP, feed and directives show the launched version only.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Approve without publishing; launch and not-yet routes; approve-and-launch
  - [x] Supersede unlaunched changes on a newer version or a closed goal
  - [x] Record wording, MCP outputs, value-card spans from the launch
- **Evidence:**
  - [x] The #39 D1 acceptance test (approve without launching, then launch; not yet; rebase) in test-v2, test-oauth and test-agent-live
  - [x] Spec requirements updated and validated

### [x] LAUNCH-002 — Accept if conditions on a counter (#39 D2)

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (change requests)
- **Direction:** Founder ruling LIM-2454 35376283 and owner answer 2026-10-31: a counter may carry a condition; only the requester acknowledges it, as a separate step from accepting the counter; it never gates approval or launch; no verified state.
- **Conclusion:** A condition field on counter revisions, an acknowledge action for the requester only, shown as Not confirmed yet until acknowledged, exposed through MCP as untrusted text.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Condition on counter revisions; acknowledge route
  - [x] Record UI and MCP outputs
- **Evidence:**
  - [x] The #39 D2 acceptance test in test-v2 and test-oauth
  - [x] Spec requirements updated and validated

### [x] PORT2-001 — Port main's Home attention queue, phone layout and README (#41, #42, #40, #22)

- **Priority:** P1
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (app surface) / README
- **Direction:** main's new v1 work, merged at 5b6d19f with v1 files resolved away, must not be lost on v2.
- **Conclusion:** A v2 Home that shows what needs you and others, active goals and which apps last read the plan, with one evidence class on every agent-status item (#39 E2); /app fits a 390px phone; the root README describes v2 in #22's structure.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Home attention queue on v2 data with evidence classes
  - [x] 390px layout checks
  - [x] Root README for v2
- **Evidence:**
  - [x] test-v2 checks for the queue, evidence classes and phone width
  - [x] Spec requirements updated and validated

### [x] PORT3-001 — Port main's #29: targets, allocation, steering, reallocation

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (allocation, agent)
- **Direction:** main merged #29 (7099ee1) on its old v2 layout; merged at db2be8c keeping the v2 tree, so its behaviour must be rebuilt on v2 without loss.
- **Conclusion:** Rebuild per-goal targets, the allocation view, steering and reallocations on v2's approval sets, directive path, launch and holds; agent-side allocation and steering in align-agent.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Server: targets, allocation, steering, reallocations with migration
  - [x] Agent: allocation and steering in hooks, sync and CLI
  - [x] UI: allocation on Spend, reallocations
- **Evidence:**
  - [x] test-v2 and align-agent tests for each behaviour
  - [x] Spec requirements updated and validated

### [x] PORT3-002 — Port Shruti's Lanes B and C: first run, understand then decide (#43, #47, #49)

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (app surface)
- **Direction:** main merged #43, #47 and #49 (v1 UI); v2 must keep their behaviour on its change-request page and Home.
- **Conclusion:** Change-request review: compare, what would change, one decision from the server's can flags, confirm before sending, freshness check; decline while a counter waits; a first-run card on Home until an app is seen.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Change-request review and decide flow
  - [x] Decline while a counter waits
  - [x] First-run card on Home
- **Evidence:**
  - [x] test-v2 checks including 390px and focus
  - [x] Spec requirements updated and validated

### [x] PORT3-003 — Port #44 cycle-2 layout fixes and audit the LIM-2455 checklist (#39)

- **Priority:** P1
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (app surface) / design/acceptance
- **Direction:** Shruti's draft #44 fixes phone chrome, Goals map stacking, tap targets and app copy on v1; her draft #39 is the founder's v2 acceptance checklist.
- **Conclusion:** Apply #44's intent where v2 has an equivalent; audit every #39 item to pass, fixed or open with a reason in design/acceptance/LIM-2455.v2-audit.md.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] #44 fixes on v2
  - [x] LIM-2455 audit with fixes
- **Evidence:**
  - [x] test-v2 checks for each fix
  - [x] Audit table committed
  - [x] Spec requirements updated and validated

### [ ] DEPLOY-001 — Merge #37 and deploy Align v2 hosted

- **Priority:** P0
- **Owner:** project core / hosting
- **Direction:** Founder ruling on #37 (2026-10-30): hold off main until after the Mon/Thu tester round on v1; then v2 replaces v1 on the hosted server. Target merge 2026-11-06, deploy the week of 2026-11-09.
- **Conclusion:** Merge #37 once the tester round and LIM-2454 review are done, tag v2.0.0 through litai release, and deploy only after the legal pages, secrets, image test and a backup and rollback rehearsal pass; v1 workspaces do not carry over.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Tester round on v1 done (Mon/Thu) and LIM-2454 questions answered
  - [ ] lib/trust/entity.ts and the [CONFIRM] answers filled in; counsel reviewed the privacy policy and DPA
  - [ ] Fly secrets set: ALIGN_SECRET, BETTER_AUTH_SECRET, ALIGN_EMAIL_API_KEY, Turnstile keys
  - [ ] main merged in again, fresh retained receipt, #37 merged
  - [ ] v2.0.0 planned, prepared, checked and published with litai release
- **Evidence:**
  - [ ] scripts/test-image.sh passes on a machine with Docker
  - [ ] Backup and rollback rehearsed on the hosted volume
  - [ ] Hosted smoke test after deploy, and fly ssh console shows the secrets set

### [ ] SPEND-001 — AI spend tracking across sessions that need alignment

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (metering, spend, allocation; align-agent)
- **Direction:** Owner question on #37 (2026-11-03): does Align track AI spend properly? The alignment E2E cycles (acycle1-3) tested how sessions coordinate, but not that every request's tokens and list-price estimate land once, under the right goal, as sessions move between goals.
- **Conclusion:** Show with real Claude Code sessions (and Codex through its rollouts) that each request is metered once and priced from the price table, uploaded only while shared and under the goal of its epoch through share, bind, alignment approve/revoke, switch_goal, hold, stop, goal close, re-share and sign-out; that the Spend tab (by goal, team, session), the allocation view, align allocation, MCP and the steering line agree with the local ledger; that private or unshared usage never leaves the machine; fix every difference with a regression test.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Spend tester added to the alignment E2E loop (two people, several sessions, moves between goals)
  - [ ] A reconciliation script: local ledger per session and epoch against the server's spend and allocation totals
  - [ ] Fixes for every spend difference found, each with a regression test and spec update
- **Evidence:**
  - [ ] An E2E cycle whose spend report finds no bugs, with the reconciliation totals matching to the micro-USD
  - [ ] test-v2 and align-agent tests for each fix; litai spec validate ok
  - [ ] Retained test receipt recorded on the commit that closes it

<a id="sec-001"></a>
### [x] SEC-001 - Keep viewer team leads read-only

- **Priority:** P0
- **Owner:** Authorization policy and team membership routes, B05
- **Direction:** Enforce the existing viewer restriction even when a workspace viewer retains a team lead role.
- **Conclusion:** The policy allows pod.manage_members through the team lead branch before checking the viewer restriction. Workspace role changes preserve team roles, and the HTTP team and pod routes use this decision directly. Deny viewers before granting team lead writes, preserve hidden-object behavior and normal owner/member permissions, and correct the baseline before native qualification.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Reject viewer team membership writes before granting team lead permissions; extend the existing policy matrix and add HTTP add/remove regressions that prove membership and audit state stay unchanged.
- **Evidence:**
  - [x] Direct policy reproduction, meaningful role matrix, HTTP write refusal on team and pod routes, unchanged membership and audit records, and the complete retained workflow before native policy qualification.
- **Evidence:** The original policy returns allow for a viewer team lead. The repair passes 24 focused role/object cases and a production-server HTTP probe: both aliases reject POST and DELETE with `read_only`, membership and audit rows stay unchanged, and owner/member team lead writes still succeed. The application suite includes four denied requests in three new assertions. Specification validation passes. The complete sealed build, tests and package pass all 1,813 checks, including 940 application, 183 OAuth, 62 live agent and 602 agent tests. Current receipt `sha256:5d3c5781b0b4cf01813855e45ef47e5dd92d42046f082db094520c44a54da9af` binds execution evidence `sha256:fb2dd937b466d2a5d8b6b7c2dea3a48510e7ba01523ae8f2e2ad195ff92bed6a`. Both the current and CI-pinned runtimes verify the parent; validation and owned agent-entrypoint audit pass.

### [x] NATIVE-BINDINGS-001 - Preserve package namespaces for overlapping native export names

- **Priority:** P1
- **Owner:** B31 native package admission and generated bindings
- **Direction:** Continue the full native rewrite without changing natural library APIs to satisfy a global flat export restriction.
- **Conclusion:** The proposed wording count overlaps spend-stream count, and Home data overlaps policy data. Existing package-specific bindings already distinguish them, but the compatibility index currently refuses all duplicate names across providers. Keep package namespaces, expose only unambiguous flat aliases, preserve current selected-agent aliases and retain within-package ambiguity and integrity refusals.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Generate explicit package namespace exports and unambiguous compatibility aliases.
  - [x] Retain package-local duplicate checks, exact package membership, independent acceptance and atomic installation.
- **Evidence:**
  - [x] Two verified cache fixture packages export the same name with distinct behavior; namespace calls resolve correctly and no flat alias silently chooses one. Selecting only one provider restores its flat alias.
  - [x] Existing eleven admission controls pass alongside the two new controls. The integrated web selection passes 105 batches across paste, policy and share-again.
  - [x] The complete retained workflow and hosted image checks pass after consumer integration. The sealed build, test and package workflow passes all 1,820 checks with zero failures or skips; the hosted image passes 24 checks.

### [x] TRUST-PARSER-001 - Terminate trust Markdown lists with indented root markers

- **Priority:** P1
- **Owner:** B08 trust Markdown reader
- **Direction:** Preserve public trust-document rendering while preparing the remaining native boundary.
- **Conclusion:** A root list marker indented by two or more spaces enters list parsing with no current item, then repeats the same line indefinitely. Two-space unordered and four-space ordered fixtures time out in isolated two-second probes, while zero- and one-space controls return. Record the termination rule and fix the source before capturing a qualified native baseline.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Specify a terminating root-list indentation rule and preserve existing unindented and nested-list output.
  - [x] Apply the smallest source correction before native qualification baseline capture.
- **Evidence:**
  - [x] A bounded child-process regression detects both current hangs; the repair returns expected trees and all seven existing trust documents retain identical parsed output.
  - [x] Direct Markdown tests, the complete retained application workflow and hosted image checks pass before native source promotion. The complete sealed workflow passes 1,821 checks with zero failures or skips, including 941 application checks, 183 OAuth checks, 62 live-agent checks, 609 agent tests, 23 shell checks and three static gates. The hosted image passes 24 checks.

### [x] VERIFIER-LINT-001 - Keep copied native verifiers valid under application lint

- **Priority:** P0
- **Owner:** native acceptance harness
- **Direction:** Resolve the new verifier lint failure without disabling the existing rule or changing qualified behavior.
- **Conclusion:** Rename only local import variables in the authored Markdown acceptance verifier, preserve the protected qualification profile and exact cases, rebuild through the normal lifecycle, and refresh consumer custody before full application verification.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Rename the two local module bindings and rebind the authored acceptance harness with every observation unchanged.
- **Evidence:**
  - [x] Controls, all 21 source and consumer batches, admitted rebuild, application lint, complete sealed workflow and hosted image gates pass with protected profiles, locks and qualified heads preserved.

The first ten-library workflow passes all functional suites and fails only the
Next-specific lint rule on two local import variables in the copied Markdown
verifier. Those two authored verifier bindings are renamed without changing any
case or protected profile. Its normal cached rebuild passes 8 tests, current
verification and validation pass, and all 21 original and consumer batches match.
The source cache entry, source bytes, component lock and qualified head remain
identical; only authored verification file hashes change in the consumer manifest.
The corrected complete workflow passes all 1,821 checks and 24 hosted image
checks. Its current receipt is `sha256:7f3b84e7019246bdb8bb2edfc9dd043135ce572822a25197073fabfe210db12e`.

<a id="sdk-followups-001"></a>
### [ ] SDK-FOLLOWUPS-001 - Resolve remaining framework integration followups

- **Priority:** P1
- **Owner:** parent framework application and adapter APIs
- **Direction:** Finish the native rewrite without private registry writes or unresolved verifier and cache-transport review findings.
- **Conclusion:** Keep the published export-map fix separate. The remaining parent-owned work needs issue-first authority: a supported qualified-child registration transaction, isolation of generic Python library imports, and accurate local-only native-cache scope. Prepare portable proposals and preserve every existing qualification gate and registered child pin. Obtain specific authorization for missing issue filings and later publication. Link matching existing issues before local parent changes.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Search upstream and prepare sanitized contracts and issue drafts for each remaining defect class.
  - [x] With explicit authorization, file or link upstream issues before implementation in the isolated parent checkout.
  - [x] Replace the private registry helper with the supported public operation; preserve stale-plan, qualification, collision and rollback refusals.
  - [x] Preserve main's generic Python import isolation and the separate verified-wheel dependency closure; document and test native-cache transport scope.
  - [ ] Preserve reviewed zero-argument callable metadata through ordinary single-Component promotion under existing upstream issue #132, then qualify the schema without changing its public API or independent cases.
  - [ ] Publish the tested framework contribution with specific approval and reconcile its canonical design and required review outcomes.
- **Evidence:**
  - [x] Registration, Python isolation and cache-scope fixtures pass 93 focused installed regressions and the real two-library recovery journey without editing protected pins or generated implementations.
  - [ ] The framework PR completes its required independent review and exact-head platform/CI qualification before landing.
  - [x] Current fifteen-library consumer integrity, all 1,821 application checks and owned project verification pass with the approved reconciled framework.

See the [framework integration followups](framework-integration-followups.md) for
portable contracts, tracker findings and the next issue-first action.

Upstream issues [#315](https://github.com/jordanhubbard/literate-ai/issues/315) and
[#316](https://github.com/jordanhubbard/literate-ai/issues/316) are filed before
implementation. The operator accepted parent ADR 0060 before implementation; it is
now ADR 0064 after upstream reconciliation. Approved commit `4d672137` passes the
installed acceptance described in the linked followups. The operator has limited continuation to Align and the framework work it needs.
Publication and broader upstream qualification remain separate.

### Current-main integration

Main's security-header and folder-rule fixes from `b16f8d1` are reconciled with
the sixteen-library working tree. The interrupted earlier run does not count as
complete acceptance. A fresh sealed build, test and package workflow passes all
1,825 checks with zero failures or skips. Its current retained receipt is
`sha256:485aa67eedf4eacd3379ba5703d8265e2ffcf5fc0c2282df931aac5ab4eee871`.
The hosted image passes all 24 checks plus ten response-header checks on the
SSD-backed engine. The operator approved this checkpoint; commit `bb2605c` is
pushed to draft PR #58, its prepared title and body are verified, and both
exact-head CI workflows pass. The configured pre-push reviewer remains unavailable
under its API usage limit; the approved one-command opt-out was used.

### [x] VERIFY-001 - Repair the retained-test blockers for PR 60

- **Priority:** P1
- **Owner:** components/legacy-project-wrapper/implementation (agent hooks and retained test harness)
- **Direction:** Run PR 60 on this machine, investigate failures on main, repair demonstrated defects and refresh the branch receipt without merging or deploying.
- **Conclusion:** The initial PR run passed 1787 checks and failed two. Clean main reproduces the dead-proxy fetch reset and folder-rule goal loss through a filesystem alias. Normalize folder identity and avoid stale HTTP connections in the live-test client; preserve all assertions and the latency budget.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Reproduce the two failures on clean main and retain diagnostic logs (main `cff1d34`: live 46/1, focused folder rule 0/1; network cause `ECONNRESET`)
  - [x] Repair canonical folder-rule comparisons with a symlink regression (focused alias and unchanged latency tests 2/0 on macOS arm64 / Node 26.3.0)
  - [x] Use fresh connections in the live-agent test client
- **Evidence:**
  - [x] Focused folder-rule and unchanged latency tests 2/0; repaired live client against unchanged main 62/0, including offline revoke and re-pairing
  - [x] Full retained suite passes: lint/typecheck/syntax, paste-lines 23/0, v2 937/0, OAuth 187/0, live agent 62/0, CLI 592/0; supported receipt committed in `75420dd` and candidate check matches (the collector's 937 count is tracked in VERIFY-002)
  - [x] Historical checkpoint at `75420dd`: `litai verify`, spec validation, `litai-verify` and `rebased-on-main` pass ([verification run](https://github.com/liminalworksinc/align/actions/runs/41958037099)). The PR was draft at that checkpoint; its changes are now on main at `b16f8d1`.

### [x] VERIFY-002 - Preserve complete aggregate test-count reporting

- **Priority:** P2
- **Owner:** Align retained gate runner and its receipt-count interface
- **Direction:** Resolve the aggregate-count discrepancy carried by main while preserving failure handling in every stage.
- **Conclusion:** The pinned collector recognizes numeric passed/failed summaries and selects the largest count. Without the branch's existing final numeric footer, a nine-case diagnostic selects the 941-check sub-suite instead of the 1,825-check aggregate. The owning fix is the Align runner's machine-readable footer. Both the current installed and CI-pinned collectors accept its full total and reject all eight failing-stage controls. Preserve that interface with a portable local regression fixture.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Compare collector summary precedence with the Node 26 aggregate footer.
  - [x] Resolve ownership to the Align gate runner and preserve its existing aggregate footer.
  - [x] Add a portable standard-library fixture for the unchanged runner and all eight stage failures.
- **Evidence:**
  - [x] The portable fixture passes all nine cases with a 54-check synthetic aggregate and rejects a failure in each stage. Run `python3 tools/native-rewrite/test-aggregate-count.py`; the script uses only the standard library and exercises the actual runner unchanged.
  - [x] Both installed collector runtimes pass all nine diagnostic cases. The real sealed build, test and package workflow reports all 1,825 checks with zero failures or skips.

<a id="config-001"></a>
### [x] CONFIG-001 - Reject hosted data paths inside the application directory

- **Priority:** P1
- **Owner:** B12 configuration target binding in lib/config.ts
- **Direction:** Preserve the existing requirement that hosted data lives outside the application directory before freezing runtime configuration for native conversion.
- **Conclusion:** The actual retained hostedProblems function admits four synthetic inside paths whose first relative component begins with two dots. A name prefix does not establish a parent path segment. Compare normalized path relationships at segment boundaries, retain existing diagnostic order and outside-directory behavior, and use fixture settings only. This is independent of the pending schema SDK commit.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Record the exact retained-function reproduction, source hashes and existing outside-directory contract; prepare a local issue draft if no matching issue exists.
  - [x] Repair the path relationship check and add hosted startup regressions for direct and nested two-dot directory names without changing modes, secrets, database behavior or native children.
- **Evidence:**
  - [x] Pass all fifteen synthetic retained-function cases with legitimate outside controls and zero filesystem effects, retaining the failing predecessor record.
  - [x] Pass the complete build, test and package workflow, refresh the current receipt normally, and verify the hosted image and current project gates before publication.

- **Development evidence:** The unchanged function admits four forbidden paths in
  a 15-case fixture probe. The corrected function passes all 15 cases, loads the
  same 13 modules and attempts no filesystem effects. Existing issue search finds
  no matching report; a sanitized issue draft is retained locally and is not
  posted. Source before:
  `sha256:cf0e9177ffd7bc28aad8cd14f9728045a882ec53a89605b5a79ade3a386b913b`;
  source after:
  `sha256:77f863f64159431a36fc40a617e7befcacf2720e6da42b1df48c0391ec7f1184`.
  The complete sealed build, test and package workflow passes all 1,827 checks
  with zero failures or skips, including both new hosted-startup regressions.
  The normal receipt update records
  `sha256:16acdfd7a2fde0d5d3561470e6143bd8c99b31b4e50e607df9e73b7575be155c`.
  The installed and CI-pinned verification runtimes each pass three gates with
  two declared skips; project validation and owned agent-entrypoint checks pass.
  The same immutable image
  `sha256:99a3e9cddc958879213b798dd8b5dd10474e57fa4328f63ee7b2801076bf3062`
  passes 24 canonical image checks, ten response-header checks and both direct
  and nested inside-path startup refusals. The 15-case path matrix also matches
  on macOS and Linux. All 3,113 tracked native child files and the pending SDK
  staged tree remain unchanged. This is local acceptance; publication still
  requires specific operator approval.
