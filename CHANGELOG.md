# Changelog

## Unreleased

- Ported main's #29 onto v2 (PORT3-001): goals carry a target share of agent time (active targets add up to 100% or
  less); the Spend tab shows each goal's share of the last 7 days against its target; an owner can turn on steering,
  a local line in the session when its goal is off target (never in a stopped or held session); target changes between
  goals need each goal's approval and reach agents only at launch; `align allocation` and `align steering status`.
- Ported Shruti's Lanes B and C (#43, #47, #49) onto v2 (PORT3-002): an open change request is understood, then
  decided: approved and proposed side by side, what would change (the request's own text, not evidence) beside its
  evidence, one decision from what the server allows, a confirmation of what will be recorded, and nothing recorded if
  the request changed meanwhile; an approver can decline while a counter waits. Home opens with a first-run card
  (explore the sample, or connect one agent) until Align sees an app.
- Ported #44 and audited the LIM-2455 acceptance checklist (PORT3-003): compact phone chrome and 44px tap targets;
  "Propose a change" comes from the server's permission flags; one evidence class on every agent-status item, also in
  `align_get_goal_activity`; every MCP tool's output schema is closed and tested. The audit is in
  `design/acceptance/LIM-2455.v2-audit.md`.
- Launch and conditions, the founder's required additions in #39 (LAUNCH-001, LAUNCH-002):
  - Approving a change request records the decision; agents get the new version only when someone in the goal's
    approval set or a workspace owner launches it. "Not yet" is recorded too, "Approve and launch" is one step when
    the same person may do both, and an unlaunched change is superseded if the goal gets a newer version or closes.
    The record reads "Approved, agents still on v<n> until launch", then "Launched, agents on v<n+1>"; MCP, the goals
    feed and directives show the launched version only.
  - "Accept if…": a counter can carry a condition that only the requester acknowledges, as a separate step; it never
    gates approval or launch, and nothing is called verified.
- Ported main's #22, #40, #41, #42 and #48 (PORT2-001): a workspace Home that shows what needs you, with one evidence
  class on every agent-status item; every page fits a 390px phone; the root README describes v2; an app's last
  connection is shown apart from its last goal read, and only a read counts as a delivery receipt.
- The owner decisions the spec cites by date are recorded in `docs/decisions/0003-owner-decisions-v2.md`.
- Requests and goal holds (REQ-001, REQ-002), the middle level between informing and instructing agents (owner
  decision 2026-10-30):
  - A goal's approvers and workspace owners can send running agents typed requests (replan, checkpoint, switch goal),
    worded by Align and naming the sender. Checkpoints and replan drafts run on their own; switching goal waits for
    the developer; the developer is always told and can decline any request; every answer is a receipt and audited.
  - A goal hold pauses every agent on a goal by blocking its tools, including sessions that bind later, until it is
    released (or the goal is achieved or dropped); it fails closed like the stop latch.
  - Requests expire when their goal is achieved or dropped. The goal page has an "Agents on this goal" card.
- Fixed: a release or binding-suspended notice reached only one of two sessions on the same device.
- Ported main's v1 work (PRs #32, #33, #35, #36: LIM-2437 and LIM-2445 / #30) onto v2 (PORT-001 … 005):
  - Limits (must / must not / out of scope, at most 5) are goal content, confirmed by the goal's approval set and
    delivered with goal versions; pasting meeting notes suggests limits and stores nothing.
  - Asks between teams (accept, decline, done, reopen, withdraw, "came up again"), an Asks tab and an owner import;
    goal activity from bindings, usage and work signals (never prompts) with a card on the goal page.
  - MCP tools `align_get_limits`, `align_get_asks`, `align_get_goal_activity` and `align_get_brief` under the
    2026-10-29 read rule in v2 terms; quoted paste lines on the Apps tab; strict Host for every derived origin.
  - The decision value card on approved change requests, with per-decision value reports (estimate and an optional
    note) and a follow-up link; access requests record where they came from.
  - The local agent puts the bound goal's limits and the team's accepted asks in context as quoted, attributed data;
    a local-only drift notice tells the user (never the model) when a reply may cross a limit; `align asks`; and
    `align share --dir --past` replaces the import script without ever backdating a live session.
  - A live test runs the real `align` CLI and hooks against a real server.
- Fixed: a goal-version directive that the goals feed delivered first was marked stale and never reported applied.
- Pre-seed build list (PRESEED-001 … 008):
  - Hosted Align no longer has a closing date (`ALIGN_DELETE_BY` is ignored); Fly volume snapshots are kept 7 days.
  - Hosted workspace creation is gated (`ALIGN_CREATION` = codes, open or closed): single-use creation codes, a global
    workspace cap, a public request-access page with a separate follow-up/LOI interest choice, and `align-admin`, the
    operator script for codes, requests, workspaces, retention, LOIs and the funnel report.
  - Abuse controls when hosted: Cloudflare Turnstile on email codes, access requests and creation; durable rate limits;
    a disposable-domain block; caps on owned workspaces, members and sessions per device per day.
  - Account deletion; workspace soft delete with a 30-day restore; a daily retention job (session roll-ups after 13
    months, audit log 1 year, former members pseudonymised after 30 days, purge of deleted workspaces, access requests
    and product events after 13 months), published in `docs/RETENTION.md`.
  - Passkeys, a 30-day absolute session cap, sign out everywhere, a fresh sign-in on every sensitive action, provider
    tokens encrypted at rest, and Better Auth's unused token and unlink routes turned off.
  - Evidence on change requests: typed links labelled self- or agent-reported, an Align-computed goal snapshot per
    revision, an audited approval without evidence, and an opt-in `changes:evidence` MCP scope (MCP stays read-only by
    default).
  - Content-free product funnel events and the operator report (time to first value, weekly active workspaces,
    retention, share of work bound to goals).
  - Security pack drafts for counsel review (privacy policy, DPA, subprocessors, security overview, questionnaire),
    `SECURITY.md`, and public `/privacy` and `/trust` pages.
  - `npm test` runs the full suite (lint, typecheck, syntax, test-v2, test-oauth, align-agent) with one exact count, so
    the retained test receipt covers the web app.
- Initialized the project with Literate AI's specification-led lifecycle and durable
  user-directed work queue.
