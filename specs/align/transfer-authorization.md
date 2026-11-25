# Transfer authorization (LIM-2529)

Status: **Ratified by the founder, Wed Nov 25, 2026** ("1. yes with hooks 2. yes 3. yes diagnose", relayed by the
reconciliation session), with the hooks below. Sean's review of the server half comes before any build. Merging, building,
deploying and releasing each need a separate go. Nothing in this spec is built. When ratified, it replaces the
dispatch-window mechanism added by PRs 104, 107, 108 and 110 (migration 35's `v2_model_send_windows` and its
blocking triggers) and closes the findings listed in [Findings this spec closes](#findings-this-spec-closes).

Built as a pair (founder ruling, Nov 25, 2026): **server side**, Sean; **agent side and tests**, the audit build lane.
Each side is reviewed by someone who did not write it. This spec is the contract both build to; a change to it needs
the founder's ratification again.

## Why

Three review rounds on the opt-in sharing work each found a dozen or more defects of one kind: the client checks
consent, policy or role, time passes, and data is sent or an answer is used after something changed. The server
grants a 750 ms window per workspace and capability, but no write handler checks it (`ingestActivity`,
`putFinding` and `shareExcerpt` never read it), the window is not tied to a device or payload, and the triggers that
hold policy changes while a window is open let any member's device keep an owner from revoking it. An independent
review on Nov 25 found that an agent can also switch every consent on by itself, and that nothing keeps these
paths off in hosted Align. Fixing one race at a time has not converged.

The fix moves the decision to the server and makes it once per transfer: the server issues a single-use
authorization for exactly what will be sent, consumes it in the same transaction as the write, and voids every
unconsumed authorization when anything that could change the answer changes.

## Terms

- **Transfer**: any data above tier 0 (metadata) leaving a machine, to Align or to a model recipient. The tiers are
  defined in [local-agent.md, "Nothing private leaves the machine"](local-agent.md).
- **Grant**: a server-issued, single-use, short-lived authorization for one transfer.
- **Policy revision**: one integer per workspace that increases on any change that could alter whether a transfer
  is allowed.
- **Consent sequence**: one integer per device and capability that increases on every consent change.

## Capabilities

| Capability | Tier | Recipient | What the digest covers |
| --- | --- | --- | --- |
| `activity_names` | 1 | Align | The canonical body of one `POST .../activity` batch |
| `finding` | 2 | Align (Mode L only) | The canonical list of `Wire` bodies sent in one flush (one grant per batch; each `POST .../analysis` in the batch carries it, and the grant is consumed when the last one is written) |
| `finding_delete` | 2 | Align | The canonical query of one `DELETE .../analysis` |
| `model_check` | 3 | Workspace decision service | The canonical request body sent to the service |
| `suggestion` | 3 | Chosen provider (workspace, typesafe, openai, google) | The canonical request body sent to the provider |
| `excerpt` | 4 | Align, for named readers | The canonical `POST .../excerpts` body |

Out of scope, with reasons: command measure readings and budget-request reasons are explicit, per-run human
actions already covered by Goals and Proposals and Budgets. The Level 1 session fork has no caller; it SHALL NOT be
given a caller without a capability row here. Tier 0 traffic needs no grant.

## Who decides: four layers (founder ruling, Nov 25)

Outside model vendors are part of the product ("we need outside vendors, otherwise no point"), so `model_check` and
`suggestion` to a fixed provider stay. The founder's clickable mock (her design canvas, private) sets four layers. This spec
gives each a server rule:

| Layer | Who sets it | What it can do | Server rule |
| --- | --- | --- | --- |
| 1. Ceiling | Workspace owner, as a preset | Only narrow: switch a capability or recipient off for everyone. The Regulated preset turns vendor sends off | Grants check it; it never turns anything on |
| 2. Goal default | The author, when the goal is approved | A standing rule: "always allow" a capability and recipient for sessions bound to that goal | A **standing rule** (below) |
| 3. Moment | The author, in their outbox | Allow once / Always for this goal / Not this | An **outbox item** decided in the browser |
| 4. Receipt | Everyone sees their own; the owner sees counts | A weekly list of every transfer, with undo where undo is possible | The **transfer log** (below) |

**Only the author decides about their own content.** The author is the person whose session the content comes from. For
`excerpt`, `model_check` and `suggestion`, consent, standing rules and outbox decisions SHALL come from that person only.
An owner or anyone else SHALL NOT consent for them, whatever the ceiling allows. An owner can only narrow.

## Requirements

### Requirement: Secrets are removed on the machine before any vendor send (P0)

Before computing the digest for a `model_check` or `suggestion` to any recipient other than Align, the CLI SHALL redact
secrets from the payload on the machine. That covers known token formats, private keys, `.env`-style assignments and
high-entropy strings, replaced by `[redacted]`. The digest, the request and the preview SHALL all be the redacted text. The
outbox and the receipt SHALL state "secrets removed on this machine first" and the number of redactions. A payload that
is mostly redactions (more than half its characters) SHALL NOT be sent. Redaction SHALL have its own test corpus, and a
missed pattern is a release blocker.

### Requirement: The recipient is named on every grant

Each grant SHALL carry a recipient record: the provider, the account it is sent under, and the retention it states.
For example: "Claude via Anthropic, under Liminal's account, not kept after the answer". The workspace decision service
is named by its owner-set address and revision. The outbox, the standing rule and the receipt SHALL show this record.
A change to a provider's record SHALL void standing rules that named the old one.

### Requirement: A person's standing rule issues grants without a click

A standing rule is `{author, workspace, goal (or "all my sessions"), capability, recipient}`. Only the author creates it,
in the browser with a recent sign-in, from a goal default or "Always for this goal". It never comes from a device token.
While a rule matches and the ceiling allows it, a grant request SHALL be issued with no further click. Every other check
in this spec still applies. The author can remove a rule at any time from the receipt or the goal; removal voids that
rule's outstanding grants.

### Requirement: A refused request becomes an outbox item

When a grant is refused only because no consent or standing rule covers it (not for the ceiling, a role, a block or a
mismatch), the server SHALL record an outbox item for the author. The item holds the capability, recipient record, goal,
session, the redacted preview the CLI submitted, its digest and an expiry of 72 hours. The response SHALL be
`202 awaiting_author` with the item id, not a bare `403`. The author decides in the browser: **Allow once** marks the
item so that one grant for exactly that digest can be issued within its expiry; **Always for this goal** also creates a
standing rule; **Not this** closes it. The CLI SHALL keep the payload until the item is decided or expires, then send it
under a grant or drop it. An agent's own request can therefore wait for a person, but can never decide.

When the refusal is because of the **ceiling**, the server SHALL also record an outbox item for the workspace owner: a
request to allow that capability and recipient at the ceiling. The owner's "allow" only widens the ceiling. The author
still decides about their own content, through their own item, which stays open until the ceiling allows it or it expires.

### Requirement: Every transfer is logged for the receipt

Each consumed or redeemed grant SHALL add a transfer log row: author, workspace, goal, capability, recipient record,
time, byte count and redaction count, never the content. The weekly receipt lists the author's rows. Undo SHALL delete
stored excerpts and findings and remove standing rules. For a vendor send, undo SHALL say plainly that the request was
already sent and can't be recalled, and offer to stop future ones. Owners see counts per capability and recipient, not
other authors' rows.

### Requirement: Released only when switched on

Hosted Align SHALL refuse every grant unless its capability is listed in the server setting `ALIGN_TRANSFER_CAPABILITIES`
(comma-separated, default empty). Mode L SHALL use the same setting with the same empty default. The setting SHALL be
read at start-up only. A refused grant SHALL return `403 capability_not_released`. The founder approves each
capability before it is listed; the decision records that approve tiers 2 to 4 (ADRs 0006, 0007, 0008) name the
capabilities they release.

#### Scenario: Default build

- **WHEN** a hosted server starts without `ALIGN_TRANSFER_CAPABILITIES` and a device asks for an `excerpt` grant
- **THEN** the response is `403 capability_not_released`, no grant row exists, and no excerpt is stored

### Requirement: A person turns consent on

Turning any tier 1 to 4 consent **on**, for a device or a session, SHALL require a browser request from the content's
author (the device's signed-in owner) with a sign-in in the last 15 minutes (`requireRecentSignIn`). A device token SHALL NOT turn a consent
on. A device token MAY turn a consent **off**. Changing a workspace restriction or the decision service address SHALL
also require a recent sign-in, and the decision service address SHALL be a public HTTPS host.

The CLI's `on` commands SHALL print a link to the device page with the choice filled in and SHALL NOT change any state
themselves. When the CLI runs inside an agent (the environment markers `agentMayRead` already recognizes), every `on`
command SHALL refuse with a message naming the person who must approve it. Preview or confirmation codes SHALL NOT be
printed to a non-terminal output.

#### Scenario: An agent tries to enable excerpts

- **WHEN** Claude Code runs `align data-sharing excerpts on` through Bash
- **THEN** the CLI exits non-zero without a request, and a direct `PUT /api/v2/devices/self/data-sharing {tier:4, enabled:true}` with the device token returns `403 consent_requires_person`

### Requirement: Consent changes apply in order

Every consent change SHALL carry the device's consent sequence for that capability, increased by one from the last the
device sent. The server SHALL store the highest sequence it has applied and SHALL ignore a lower or equal one,
returning the current state. Turning a consent off SHALL be accepted at any sequence higher than the last applied,
including after the device's local store is reset (the server returns the next sequence to use).

#### Scenario: A late enable after a newer off

- **WHEN** a device sends off with sequence 8, then an older on with sequence 7 arrives
- **THEN** consent stays off and the response says sequence 8 is current

### Requirement: The server issues one grant per transfer

Before every transfer the CLI SHALL request a grant: `POST /api/v2/workspaces/:ws/grants` with
`{capability, session_key, epoch_id, turn_started_at?, recipient, digest, consent_seq}`, where `digest` is the
SHA-256 of the RFC 8785 canonical JSON of exactly what will be sent and `recipient` is `align`, `workspace` with the
decision service revision, or a provider id.

The server SHALL issue a grant only when, in one transaction: the capability is released; the device is current and not
revoked; the person holds the needed role and owns the session; the session is shared; the tier is not restricted; the
device's consent for the capability is on at `consent_seq` and, for `excerpt`, `model_check` and `suggestion`, the author's
standing rule or an allowed outbox item for exactly this digest matches; the ceiling allows the capability and recipient;
for `workspace` the decision service revision matches; and
the per-capability rules already in local-agent.md hold. It SHALL record the grant with a random 128-bit id, the device,
workspace, session, capability, digest, recipient, the policy revision and consent sequence at issue, an expiry of
60 seconds, and state `issued`. Grants SHALL be rate-limited to 60 per device per minute per workspace.

#### Scenario: Grant bound to the payload

- **WHEN** a grant is issued for one excerpt body and the CLI posts a different body with it
- **THEN** the write is refused with `409 grant_mismatch`, the grant stays `issued` until it expires, and nothing is stored

### Requirement: A write consumes its grant in the same transaction

Every Align write for a capability in the table SHALL carry `Align-Grant: <id>`. In the same transaction as the write,
the server SHALL check that the grant is `issued`, unexpired, for this device, workspace, session and capability, that the
SHA-256 of the received canonical body equals the grant's digest, and that the workspace policy revision and the device's
consent sequence equal those recorded at issue. It SHALL then set the grant to `consumed` with a conditional update that
affects exactly one row, and only then write. Any failed check SHALL roll back the write and return `409` with a reason
from `grant_missing`, `grant_expired`, `grant_used`, `grant_void`, `grant_mismatch`. An identical replay of an
already-consumed grant's write SHALL return the original result without writing again.

#### Scenario: A send delayed across a block

- **WHEN** a grant for named activity is issued, the owner restricts tier 1, then the delayed batch arrives with the grant
- **THEN** the batch is refused with `409 grant_void` and no named activity is stored; the CLI resends the batch without names

### Requirement: A direct send's answer is used only after redemption

For `model_check` and `suggestion`, the CLI SHALL obtain a grant, send the request (no redirects) to the recipient before
the grant expires, and then call `POST /api/v2/grants/:id/redeem` with the digest. The server SHALL apply the same checks
and conditional consume as for a write. The CLI SHALL use the answer only after a `200` from redeem; otherwise it SHALL
discard the answer and anything derived from it. A grant SHALL be redeemed at most once.

#### Scenario: Role removed while the provider answers

- **WHEN** a suggestion grant is issued, the request is sent to the provider, and the person's role is removed before redeem
- **THEN** redeem returns `409 grant_void` and the suggestion is not saved or shown

### Requirement: Any change voids outstanding grants, without holding the change

Each of these SHALL increase the workspace policy revision and set every `issued` grant in the workspace to `void`, in the
same transaction as the change: a tier restriction or model-check block added or removed; the decision service address
changed; a member's role, team or membership changed; a device granted, revoked or its consent changed; a session's state,
device or deletion cutoff changed; a goal's status, title, visibility, owner or team changed; the workspace deleted. No
trigger SHALL abort or delay these changes because transfers are in flight; migration 35's `decision dispatch active`
triggers and `v2_model_send_windows` SHALL be removed.

When the change is a restriction or block, its response SHALL report how many direct-send grants were voided and the latest
of their expiries. The web UI SHALL show the block as confirmed at that time, stating that requests already sent may reach
the recipient but their answers will not be used.

#### Scenario: A device cannot hold off its own revocation

- **WHEN** a device requests grants as fast as the rate limit allows and the owner revokes it
- **THEN** the revocation commits on the first attempt, every grant it holds becomes `void`, and its next request is `401`

## Agent side (CLI) obligations

- Compute the digest from the exact bytes it will send, after all local checks, and request the grant immediately before
  the send. Never reuse a grant, never send without one, and never send after its expiry.
- On any `409 grant_*`, discard the in-flight result; for named activity, resend without names; for findings and excerpts,
  keep them local and report why.
- Keep local consent checks as an early refusal; the server's checks are the authority.
- Replace the preview-code confirmation for excerpts with the browser approval in "A person turns consent on", plus the
  existing per-excerpt preview on a terminal.

## Findings this spec closes

From PR 110's third review (8 serious): late writes across a block (grant void + consume), state overtaken by a late enable
(consent sequence), grants issued while a block drains (no holding triggers; void instead), the stored on/off flag being
overtaken (sequence), answers used after the final permission changed (redeem). Redirect on credential refresh, the bounded-read
excerpt source, the interim-text limit check, and the old-format deletion are **not** closed by this design and are fixed
directly, each with a test.

From the Nov 25 independent review (LIM-2529 comment): agent self-consent (A person turns consent on), no release switch
(Released only when switched on), owner blocked by dispatch triggers (Any change voids...), reusable send permission
(one grant per transfer, consumed with the write), vendor opt-in without preview (consent via browser; per-request grant),
excerpts-off refused after a local reset (server returns the next sequence), decision service changes without recent sign-in
(recent sign-in, public HTTPS host).

## Decided (founder, Nov 25)

1. A grant lives 60 seconds.
2. One grant per batch for named activity and findings; one per item for excerpts and vendor sends.
3. `ALIGN_TRANSFER_CAPABILITIES` applies in Mode L too, default off, and a local operator can enable it.
4. An outbox item expires after 72 hours ("use 72 hours"), and then the CLI drops the payload.

## Still open (the default stands until the founder changes it)

5. A payload that is mostly redactions is refused, not sent with a warning.
