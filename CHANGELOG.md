# Changelog

## Unreleased

- A tester keeps their v1 invite code on v2: `align-admin codes import` loads unused codes as single-use creation codes,
  and hosted `/new` redirects to `/app`, where they sign in and enter it.
- The agent's folder-rule preview recognizes a folder through a filesystem alias, keeps its current goal unless
  another is requested, and says when the confirmation replaces that rule.
- The live-agent test client uses fresh HTTP connections after synchronous CLI calls so the offline-revocation
  scenario can finish without a stale keep-alive socket reset.
- Use qualified authentication configuration and sign-in callbacks through 52
  explicit host resources. Preserve session caps, code limits, delivery cleanup,
  configured schemas and migrations, all 13 public types and seven callers.
- Add independent ISO-expiry, getter, coercion and failure-order acceptance while
  preserving all prior expectations and the 32 existing qualified library pins.

- Preserve workspace admission and local first-account startup through typed
  service bindings, with the full reviewed immutable domain data.
- Carry the exact reviewed domain data into the hosted image as root-owned
  runtime data readable by the application user.

- Account and membership operations use qualified services through their existing
  typed interfaces. Account cleanup, session endings, shared transactions and
  public failures preserve their behavior. The complete local workflow passes
  1,845 application checks and all 36 image, header and startup checks.

- Storage checks read the schema version through its public runtime export while
  keeping the version and migration assertions unchanged.

- Core and event operations use a qualified library through their existing typed
  APIs, preserving transaction results, shared values, SQL and failure behavior.

- Client-key helpers use a qualified library through their existing typed API,
  preserving network normalization, mode changes, header defaults and failures.

- HTTP helpers use qualified bindings through their existing typed APIs,
  preserving response mapping, origin checks, credential paths and byte limits.

- Readiness uses a qualified library through its existing typed API, preserving
  shared promise identity, migration order, exact failures and retry behavior.

- Startup uses a qualified library through its existing typed API. PID ownership,
  file permissions, leftover cleanup, warning order and exit cleanup preserve the
  original behavior, including replacement ownership and propagated failures.

- Secret-file access and HMAC signing use a qualified library through the existing
  typed core and web APIs. Environment precedence, exact entropy bytes, file
  handling, signing and resource failures preserve the original behavior.

- Storage: bind the existing database interface to a qualified service, preserving
  shared connections, statement caching, atomic callbacks, migration behavior,
  workspace conditions and audit records.

- Qualified session wording preserves workspace stops after sharing ends or shared
  history is deleted, while goal holds keep their own release behavior. The typed
  consumers match 1,642,893 observations on macOS and Linux. The complete current-
  main workflow passes 1,845 checks, including the unchanged 150 ms serial hook
  requirement; all 36 image, header and startup checks pass.

- Identifier helpers use a qualified library through the existing typed API and
  real host resources. The original observations and operator commands match on
  macOS and Linux, including rollback and cancellation. The complete twenty-one-
  library workflow passes all 1,830 application and 36 image checks; the operator
  runtime matches its exact three-package closure.

- Rate limiting now uses a qualified library through the existing typed API.
  Shared memory, signed keys, durable accounting and caller transactions match
  the retained behavior on macOS and Linux, including oversized memory stores.
  The complete twenty-library workflow passes all 1,830 application checks and
  all 36 image, header and startup-refusal checks.

- SQLite schema programs come from a qualified library through a typed call.
  Historical shapes, populated upgrades, constraints and recovery match the
  retained baseline on macOS and Linux. Database execution stays with its caller.
  The complete workflow passes all 1,830 checks, and all 36 image checks pass.

- Sign-in rate-limit explanations use one time sample after transaction
  acquisition, so a clock tick preserves the machine-wide ceiling explanation.
  Admission limits, owner exemptions and retry headers retain their contracts.

- Server and operator settings now share one qualified library while preserving
  their public interfaces and observed behavior. Cold operator commands run with
  Node alone from a read-only checkout; the hosted operator uses the same pinned
  code as its application. The complete workflow passes 1,829 checks, and all
  36 image, header and startup checks pass.
- Contributor guides name the actual library Components, targets and pinned
  runtimes. All 72 validation, lock, plan and verification checks pass across the
  eighteen registered children.

- Hosted startup rejects data directories inside the application even when a
  directory name starts with two dots. Valid outside directories remain allowed.

- The retained runner reports the complete test aggregate to the receipt
  collector. A portable nine-case regression fixture preserves that count and
  failure handling in every stage.

- Field validation now comes from its qualified library. The typed public API
  preserves all 4,549,018 compatibility observations, both revision overloads,
  shared error constructors and data references. The combined application with
  the latest security fixes passes 1,825 checks with no failures or skips. The
  hosted image passes 24 checks plus ten response-header checks.

- Value-card wording, note cleaning, follow-up links and measured spans now come
  from their qualified library. The typed consumer preserves all 1,168,597
  observations, including shared estimate data and environment defaults. The
  complete application passes 1,821 checks and all 24 image checks.

- Agent envelope and ended-session wording now come from their qualified
  library. Both typed consumers preserve all 563,717 observations, and the
  complete application passes 1,821 checks with all 24 image checks passing.
  The web test harness prepares agent bindings before importing those consumers
  in a fresh retained workspace.

- Shared text cleaning, counts, currency and change wording now come from their
  qualified library. All 4,598,945 observations match through the five typed
  consumers, and the full application passes 1,821 checks with all 24 image
  checks passing.

- Shared keyed callback queues now come from their independently qualified
  library. The original generic API preserves all 5,290 observations, and the
  complete application workflow passes 1,821 checks with all 24 hosted image
  checks passing.

- Shared HTTP error constructors and factories now come from their independently
  qualified library. Both typed consumers preserve all 22,618 observations, and
  the complete application workflow passes 1,821 checks with all 24 hosted image
  checks passing.

- Trust-document parsing now comes from its independently qualified Markdown
  library. The typed consumer preserves all 1,153,547 observations in 21 batches,
  and the complete application workflow passes 1,821 checks with all 24 hosted
  image checks passing.

- Home evidence and attention rules now come from their independently qualified
  library. The typed consumer preserves all 82,905 observations, including shared
  metadata and original person references. The complete application workflow
  passes 1,821 checks, and all 24 hosted image checks pass.
- Trust-document lists with indented root markers now terminate and preserve
  their root and nested items. The seven existing trust documents render the
  same parsed structure.
- Share-again wording now comes from its independently qualified library. The
  typed consumer preserves all 1,163 observations, and the complete application
  workflow passes 1,820 checks with 24 hosted image checks passing.
- Native libraries retain their package namespaces when exports share a name.
  Flat aliases are available only for unambiguous names; existing integrity,
  acceptance and installation rollback checks remain enforced.
- Clipped session context keeps the goal's own measures before its parent's
  measures. Single-ask notices retain who asked, who accepted and earlier closing
  counts within the existing character budgets.
- The local agent consumes qualified shell-reading and session-notice libraries
  through typed public names. Their original algorithms are retired after direct
  consumer parity and the complete application workflow pass.
- Authorization policy now has an independently qualified specification. Two clean
  builds and the typed application binding match all 331,937 observations from the
  corrected baseline. The retained file preserves the public types and names while
  the native package owns the implementation. The complete sealed workflow passes
  all 1,814 checks, and all 24 hosted image checks pass.
- A viewer's team lead role no longer allows them to change team membership.
  Both the team route and its pod alias return `read_only` and leave membership
  and its audit records unchanged.
- The Apps tab now consumes the qualified paste-line library. Its original
  implementation is replaced by typed consumer names. Browser builds and clean
  container builds verify package files and rerun all 49 independent cases; the
  complete application workflow and hosted image checks pass.
- Incremental spend parsing has its own reviewed specification in
  `.literate/native-projects/local-spend-stream`. Two clean builds match the
  original on 132 inputs, including 135 observations of parser state after a line.
  The agent now consumes its qualified package through verified immutable files.
- Spend parsing and pricing have their own reviewed specification in
  `.literate/native-projects/local-spend-meter`. Two clean builds pass their tests
  and match the original on all 110 inputs. The agent now uses this package and the
  separately qualified rounding helper. The four replaced implementation files
  are retired after the complete sealed application workflow passes, including
  all 600 agent tests. Builds verify every package file and rerun independent
  acceptance before installing the native libraries.

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
