# ADR 0008: Model limit checks and deliberate excerpts

- Status: Proposed. Founder approval is pending.
- Packet: LIM-2528

The November 12 metadata default stays in force. These choices build on the separate machine choices and workspace
restrictions in [ADR 0006](0006-session-data-boundary.md).

| Decision | Proposal | Alternatives |
| --- | --- | --- |
| Decision 3, Level 2 limit check | Run the decision call on the person's machine after sync. Before enabling it, show the owner-configured workspace decision service address and the data it gets. A new address revision requires fresh consent. Send only the bounded final reply and up to ten applicable limit types and statements. Give workspace owners a veto. End dispatch permission before saving a block and discard answers that arrive after the block, even if the owner later clears it. Keep any resulting finding local unless tier 2 is separately allowed. | Keep deterministic checks only, ask the existing session under Level 1, or let each machine choose an address. |
| Decision 4, readers | Require one to five named current workspace members, including viewers if chosen. The sharer keeps access. An owner has access only when named or when sharing their own excerpt. | Share with one reader only, allow team audiences, or keep excerpts outside Align. |
| Decision 4, purpose | Require a short purpose written by the sharer and show it to readers. | Offer preset purposes, accept a blank reason, or keep excerpts outside Align. |
| Decision 4, lifetime | Require an explicit expiry of 1 to 168 hours. Let the sharer revoke at any time. Delete text and grants on revocation or expiry cleanup. Keep the opaque share id until the workspace is purged to prevent replay. | Fix a single lifetime, allow a longer maximum, or retain redacted text after expiry. |
| Decision 5, transcripts | Keep central transcript storage out of hosted workspaces. | Consider a separate hosted transcript store after a distinct decision. |
| Decision 9, consent | Keep metadata as the default. Require separate machine choices and a preview and confirmation for each excerpt. A newer consent choice or deleted source invalidates the earlier excerpt preview. | Keep all higher tiers disabled, or reconsider defaults in a later decision. |

The configured decision recipient has to be approved and disclosed before hosted use.

For the proposed model limit check and excerpts, a successful restriction, stop, role or recipient change ends
earlier permission. A window uses elapsed time so a clock step cannot release a save early. A final transcript
record supplies the model reply. Excerpt confirmation remains tied to the original selection and expires
during lookup or refresh if ten minutes pass. Alternatives are to check only at preview or permission request
time, infer final text from the last line on disk, or require a new analysis record after every upgrade.
