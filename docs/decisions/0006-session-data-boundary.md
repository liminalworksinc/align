# ADR 0006: Session data boundary

- Status: Proposed, founder-reviewed 2026-11-25; awaiting her sign-off on the PR.
- Packet: LIM-2526. Rewritten under LIM-2529.
- Contract: `specs/align/transfer-authorization.md` on PR #117 (not yet on main), the grant model
  every row below relies on.

The November 12 ruling keeps metadata as the default and gives people a session choice for work signals. The November
11 drift ruling keeps the reply on the machine. On November 25 the founder ruled that outside vendors are part of the
product ("we need outside vendors, otherwise no point") and that every transfer above metadata goes through the PR #117
grant model. This ADR sets the boundary; ADR 0007 covers goal suggestions and ADR 0008 covers model limit checks and
excerpts.

## The rule for anything above metadata

Every send above metadata needs a valid server-issued grant (PR #117). A grant is single use, names its recipient, and is
consumed in the same transaction as the write. A grant comes from one of two places:

- **A person in the browser.** Consent is turned on only by a person, signed in to Align in a browser, with a recent
  sign-in. A command-line confirmation, an MCP elicitation or a hook answer is not proof of a person, because hooks can
  answer them in headless runs. (Decided 2026-11-25.)
- **A standing rule a person set.** A goal default or "Always for this goal" issues the per-send grants with no click,
  for **metadata and findings only**. Excerpts and vendor sends always need their author. (Decided 2026-11-25.)

An agent can ask but never approve. A refused request becomes an outbox item (`202 awaiting_author`) that **expires after
72 hours**. When the owner's ceiling is the reason, the owner also gets an item, and that item can only widen the
ceiling. (Decided 2026-11-25.)

**Only the author consents to their own words** (excerpts and vendor sends), whatever the owner allows. (Decided
2026-11-25.)

`align share --yes` **needs no person, and shares metadata only.** Adding `--signals`, which names files, takes the same
person check as any other "on". (Decided 2026-11-25; test: `packages/align-agent/test/share-yes-metadata.test.ts`.)

## Decisions

| Decision | Ruling | Alternatives considered |
| --- | --- | --- |
| Metadata default | Keep tier 0 as the session-sharing default. Each higher tier needs a grant as above. | Change the default after a separate decision. |
| Findings (derived results) | **Allowed on hosted.** Findings may go to hosted Align, visible to whoever the goal's "visible to" line allows, within the owner's ceiling. Under the Regulated preset only the goal owner sees them. (Decided 2026-11-25; replaces "Hosted Align refuses it".) | Keep findings local, or Mode L only. |
| Owner ceiling | Three presets: **Private by default** (findings to the goal owner only, no excerpts, no AI analysis), **Open team** (findings flow to the team; words still need their author), **Regulated** (nothing leaves unless someone says so; vendor sends off). The ceiling only narrows. (Decided 2026-11-25.) | A free-form policy editor. |
| Model input within the session | The agent's own session does the analysis and hands Align only the structured result. See ADR 0007. (Decided 2026-11-25.) | Omit it. |
| Model input to an outside provider | Allowed under the vendor rules below. See ADR 0007 and ADR 0008. (Decided 2026-11-25.) | Keep everything in the existing session. |
| Deliberate excerpt | Kept as written in ADR 0008: named readers, a purpose, an expiry, a preview, author-only consent. | Keep excerpts outside Align. |
| Central transcript storage | **Kept out of hosted workspaces.** Local use in Mode L is permitted. (Decided 2026-11-25.) | A separate hosted transcript store after a distinct decision. |
| Release switch | Every capability above metadata ships off: `ALIGN_TRANSFER_CAPABILITIES` is empty by default, in Mode L too, where a local operator can enable it. | Ship on, with a workspace switch. |

## Vendor rules (every send to an outside model)

All of these were decided on 2026-11-25:

- **Secrets are removed on the machine first** (P0). Payloads that are mostly redactions are **refused**, not sent with
  a warning. (Agent side: PR #119.)
- **Every grant names its recipient and retention**, for example "Claude, via Anthropic, under Liminal's account · not
  kept after the answer".
- **Every send appears on the weekly receipt**, with an honest undo. Undo on a vendor send stops future sends and says
  the sent one can't be recalled.
- The author consents, or a goal rule covers it; the owner's ceiling can switch vendor sends off.

Unbound-time aggregation, expectation responsibility and reading-source permissions belong to their own packets.

## Ordering and offline choices (unchanged)

The derived-result option stays off until an active sign-in gives explicit consent. An offline opt-out takes effect on
the machine immediately and is delivered before a later opt-in. A repeated history deletion retains the recorded cutoff,
and a replacement pairing can confirm history already removed by that person. Under PR #117, any policy change voids
outstanding grants instead of holding the owner's writes: the migration 35 blocking triggers are removed.
