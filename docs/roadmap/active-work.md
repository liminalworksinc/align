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

Tracker reconciliation on 2026-11-04 found three open reviews. None has been merged
or updated by this continuation.

- [#58](https://github.com/liminalworksinc/align/pull/58), native boundary inventory:
  its head is already an ancestor of this worktree. Keep its review separate from
  the unpublished native implementation changes.
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

- **Completion prerequisites:** SEC-001, CONTEXT-001
- **Owner:** project architecture / Components / Flavors / skills / assets
- **Direction:** Execute
  [ADR 0002](../decisions/0002-native-literate-ai-rewrite.md) through the
  [native rewrite program](native-rewrite-program.md), preserving retained source
  authority until each boundary independently qualifies.
- **Next action:** Rebind the unqualified B10 envelope child through the reviewed
  lifecycle plan to the independently installed framework fix `05d07fe6`, then retry
  its two clean Codex qualification builds. Its first attempt stopped before
  generation because the complete 51-capability import surface exceeded the
  bounded verifier argument; the installed correction now passes that projection.
  CONTEXT-001's repaired
  baseline passes all 1,818 checks
  and 24 hosted image checks. Its three new direct/hook regressions fail against
  the old implementation and pass against the repair. The B10 notice
  helper is integrated: both clean builds, the admitted build and its actual typed
  consumer pass all 1,099 observations; its original algorithm is retired. All
  seven registered native children are qualified. The remaining B10 envelope,
  ended-state wording and shared types have source snapshots and 563,717 observations.
  B11 is integrated: its two clean builds and typed consumer match all 11,108
  observations, and its complete sealed workflow passes.
  B04's source-extension correction and the envelope's bounded import-command
  correction are committed as framework `05d07fe6`. Its clean non-editable wheel
  proves unchanged `.mts` derivation and the full 51-capability projection.
  B02's 17-capability
  preflight covers 4,598,945 observations in 49 batches; B03's nine-capability
  preflight covers 82,905 observations in nine batches. Both pass their verifier
  controls and SDK profile checks, with contracts still pending source-bound review.
  B01, B09, B05, B11 and B10's notice subset are integrated.
  Their latest completed parent receipt is
  `sha256:08cf7b053511bde9938ffcc6ab12ef329fcd35b264688eb55de264c1d5ca9367`,
  with all 1,818 checks and 24 hosted image checks passing. That milestone also
  passes root and seven-child verification, root validation and the owned entrypoint
  audit. The remaining inventory boundaries and class review stay open. See the
  [integration evidence](native-rewrite-program.md#integration-execution) and
  [next boundary](native-rewrite-program.md#proposed-next-boundary).
- **Evidence:** Phase 1.2 lift-and-shift identity `sha256:316a4e6b641a46788febb1c21b004ad3c00b6d812c10006deb1d05a48207aa49`.
- **Continuation direction (2026-11-04):** Finish the complete native rewrite program
  and resolve its litai follow-ups. Qualification of an isolated library is an
  intermediate result. Completion requires actual consumer integration, verified
  source retirement, every inventory classification, and full application parity.

<a id="context-001"></a>
### [ ] CONTEXT-001 - Preserve context priorities and ask attribution under clipping

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
  - [ ] Native envelope qualification against the corrected source.
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
