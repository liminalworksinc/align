# ADR 0008: Model limit checks and deliberate excerpts

- Status: Proposed, founder-reviewed 2026-11-25; awaiting her sign-off on the PR.
- Packet: LIM-2528. Rewritten under LIM-2529.
- Builds on [ADR 0006](0006-session-data-boundary.md), [ADR 0007](0007-goal-suggestion-consent.md) and the PR #117
  grant model.

The November 12 metadata default stays in force.

| Decision | Ruling | Alternatives considered |
| --- | --- | --- |
| Decision 3, model limit check | **Kept, under the new rules.** It needs the author's opt-in or a goal rule, secrets removed on the machine first, a named recipient, an entry on the weekly receipt, and an owner veto. It uses the **independent model** from ADR 0007 (Liminal's account, owner-picked provider, off until picked, bring-your-own key allowed), never the agent grading itself. Send only the bounded final reply and up to ten applicable limit types and statements. A finding it produces follows ADR 0006's findings rule. (Decided 2026-11-25.) | Keep deterministic checks only, or ask the existing session. |
| Decision 4, readers | **Kept as written.** One to five named current workspace members, including viewers if chosen. The sharer keeps access. An owner has access only when named or when sharing their own excerpt. (Decided 2026-11-25.) | One reader only, team audiences, or keep excerpts outside Align. |
| Decision 4, purpose | **Kept as written.** A short purpose written by the sharer, shown to readers. (Decided 2026-11-25.) | Preset purposes, or a blank reason. |
| Decision 4, lifetime | **Kept as written.** An explicit expiry of 1 to 168 hours. The sharer can revoke at any time. Text and grants are deleted on revocation or expiry cleanup. The opaque share id is kept until the workspace is purged, to prevent replay. (Decided 2026-11-25.) | A fixed lifetime, a longer maximum, or keeping redacted text. |
| Decision 4, consent | **Author-only.** Only the author shares their own excerpt, from the browser, one grant per excerpt. No standing rule covers excerpts. (Decided 2026-11-25.) | An owner-level rule. |
| Decision 5, transcripts | **Kept out of hosted.** Central transcript storage stays out of hosted workspaces. (Decided 2026-11-25.) | A separate hosted transcript store after a distinct decision. |
| Decision 9, consent | Keep metadata as the default. Each higher tier needs a grant (ADR 0006). Each excerpt needs a preview and confirmation. A newer consent choice or a deleted source invalidates the earlier excerpt preview. | Keep all higher tiers disabled. |

The provider the owner picks is listed as a subprocessor and disclosed before hosted use.

## Timing (unchanged, restated against PR #117)

A successful restriction, stop, role or recipient change voids outstanding grants. A window uses elapsed time, so a clock
step cannot release a save early. A final transcript record supplies the model reply. Excerpt confirmation stays tied to
the original selection and expires during lookup or refresh if ten minutes pass.
