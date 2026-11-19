# Changelog

## Unreleased

- Goal owners can opt measures into CI readings or a command on a chosen machine. CI credentials can be
  revoked, and the machine runs a command only after its operator allows the exact executable and arguments.
  Readings show their source and time. Server migration 27 keeps existing hand readings.
- Command readings stay at the paired server, preserve exact decimals and retry without adding a duplicate.
  Goal forms keep source settings while asking for a missing measure label, and CI readings say they were
  reported with a CI credential. Briefs keep approved changes visible when many outcomes are due.
  Shared sessions show the measure's name from launch even after it has been replaced.
- Reported changes show readings and estimated spend from launch through the first report. Briefs also
  list unanswered expectations that are due, with a note in shared sessions on the affected goal.
- Workspace owners can review the goal list from Goals or Home, defer the review, and snooze questions about
  inactivity. The review asks about shared usage, measure readings and launch outcomes. Session owners can
  expand earlier goal bindings on Sessions. Server migration 28 records review decisions.
- The goal-list review requires records that establish five people before showing unbound usage. It shows
  unknown for the rest of the period if the reviewed usage changes after a figure is shown. Links bring goal
  controls into view, and proposal forms explain when new measures become available.
- Session analysis runs locally after sync and shows possible limit crossings from recorded activity or reply wording.
  Developers can inspect and delete findings and record false alarms or missed checks. Metadata remains the sharing
  default. Schema 29 adds workspace sharing restrictions and a proposed, default-off choice for sending derived findings
  to a local Align server. Hosted Align keeps findings on the machine. Consent applies to new turns only, and retrying an
  upload cannot restore a deleted or expired finding.
- Request reviews show the old and proposed limit anchors and examples. The CLI labels incomplete counts, shows how to
  inspect acknowledged records, and accepts feedback on reply-only notices.

- Sessions and in-session status show how a session came to count toward its goal. Spend can show each goal's
  request counts and list-price estimates by sharing source, with older rolled-up usage identified separately.
- Retrying a binding with changed details returns a conflict and leaves the original binding in place.
- Launchers can record an expectation for a goal measure and report its outcome from Home or the request.
  The goal page shows self-reported measure readings and their history. MCP includes these readings on goal
  and brief reads, and includes expectations and outcomes in decision records. Server migration 25 adds these records.
- The outcome form shows how to fix an invalid evidence link beside the field.
- When proposing or reviewing a goal change, open Earlier decisions to see up to five past decisions on the same items,
  with reasons where you have access and links to the records. Connected clients can read the same history on decision records.
  Server migration 26 indexes changed items on existing request revisions.
- Server tests finish each readiness response before stopping a phase, preventing a previous server from satisfying
  the next phase's readiness check.
- Failed transaction and preview setup releases database state so later writes, previews and sign-in mail work.
- Updated the web framework to 16.4.6 to remove the known cache disclosure advisory.
- A tester keeps their v1 invite code on v2: `align-admin codes import` loads unused codes as single-use creation codes,
  and hosted `/new` redirects to `/app`, where they sign in and enter it.
- The agent's folder-rule preview recognizes a folder through a filesystem alias, keeps its current goal unless
  another is requested, and says when the confirmation replaces that rule.
- The live-agent test client uses fresh HTTP connections after synchronous CLI calls so the offline-revocation
  scenario can finish without a stale keep-alive socket reset.
- The MCP paste lines (`lib/paste-lines.ts`: `shq`, `safeMcpUrl`, `claudeCodeLine`, `codexLine`) are specified as
  their own component in `.literate/native-projects/local-paste-lines`. Two clean builds generated from that
  specification alone pass their tests and match the original on 49 cases (hostile URLs, quoting edges), so the
  project's release authority is now its specification. CI checks this at the same tool revision it was produced with.
- End-to-end test cycles 1 to 14 (real browsers, the hosted edge, MCP clients, and the real `align` CLI and hooks under
  real Claude Code sessions). Every finding is fixed with a regression test, among them: directives fetched by cursor;
  the server's clock used for every timestamp an agent sends; device sign-out, member removal and re-pairing end or
  keep shares consistently, with pending revokes kept until the server confirms them; login, logout and sync passes
  serialised on one lock and bound to one device; session ids that start with "-" accepted everywhere; a deletion of
  shared history never reported as done when the server refused it, and allowed from any of the sharer's live
  devices; requests to ended sessions expire with the reason shown; no decision offered that the server would refuse
  (hidden dependencies, dependency loops); "Recorded:" confirmations on every decision; ingestion answers say what
  was accepted and refused; usage from while a session was not shared never leaves the machine (and the server
  refuses rows dated outside their sharing period); a change that would close a dependency loop is never approved or
  launched; devices with the same name are told apart.
- A re-invited person's paired devices can get the workspace back at invite accept (owner decision 2026-11-01): the
  invite page lists their devices, none ticked, behind a recent sign-in, each grant audited; `align` picks the
  workspace up at its next contact and says how to share again there.
  The same grant is available later from the Devices page, for a person's own live devices.
- Ported main's #53, #55, #56 and the merged #44 onto v2 (PORT4): the requester's Home shows their declined request
  (who declined it, the reason) until they send a newer one on that goal (#53); Align records which goal versions it
  sent each connected app, and a launched change's value card names the apps it sent the new version, "Align sent it
  version <n>", never what an app did with it (#56). The rest of the four was already true on v2 or is v1-only.
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
