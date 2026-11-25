# Transfer authorization (LIM-2529)

Status: **Proposed. Founder ratification is pending.** Nothing in this spec is built. When ratified, it replaces the
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
| `finding` | 2 | Align (Mode L only) | The canonical `Wire` body of one `POST .../analysis` |
| `finding_delete` | 2 | Align | The canonical query of one `DELETE .../analysis` |
| `model_check` | 3 | Workspace decision service | The canonical request body sent to the service |
| `suggestion` | 3 | Chosen provider (workspace, typesafe, openai, google) | The canonical request body sent to the provider |
| `excerpt` | 4 | Align, for named readers | The canonical `POST .../excerpts` body |

Out of scope, with reasons: command measure readings and budget-request reasons are explicit, per-run human
actions already covered by Goals and Proposals and Budgets. The Level 1 session fork has no caller; it SHALL NOT be
given a caller without a capability row here. Tier 0 traffic needs no grant.

## Requirements

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

Turning any tier 1 to 4 consent **on**, for a device or a session, SHALL require a browser request from the device's
signed-in owner with a sign-in in the last 15 minutes (`requireRecentSignIn`). A device token SHALL NOT turn a consent
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
device's consent for the capability is on at `consent_seq`; for `workspace` the decision service revision matches; and
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

## Questions for the founder

1. Grant lifetime: 60 seconds. Shorter reduces exposure for direct sends; longer tolerates slow providers.
2. Named activity: one grant per batch of up to 200 items (one extra request per batch). Alternative: per item.
3. Should `ALIGN_TRANSFER_CAPABILITIES` exist in Mode L too (recommended, same default off), or only in hosted Align?
