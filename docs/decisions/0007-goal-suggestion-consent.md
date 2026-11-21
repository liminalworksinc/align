# ADR 0007: Consent for goal suggestions

- Status: Proposed. Founder approval is pending.
- Packet: LIM-2527

| Decision | Proposal | Alternatives |
| --- | --- | --- |
| Metadata default | Keep the November 12 default. Compute rules on this machine. Require independent, explicit opt-ins for a session question or an external decision. | Keep goal suggestions entirely local, or revisit the default in a separate decision. |
| Tier 3, session question | Ask a schema-constrained fork under the session's existing provider and account. Include the ids and titles of goals the person can bind to. Leave the live session alone. Let the workspace forbid tier 3. Abstain unless the harness can show and pin the original provider and account. Current harness integrations do not supply that proof. | Use the worker's current account, ask inside the live session, or omit this level. |
| Tier 3, decision provider | Use TypeSafe Jev when the machine owner enables external decisions without choosing another provider. Support OpenAI Decisions, Google Gemini Decisions and a workspace-provided endpoint. Name the configured recipient when enabling this choice and let the workspace forbid tier 3. The owner sets the workspace address, and a change expires the machine consent. Named vendors use the person's own provider choice and key. | Use only the existing session, use only a workspace-operated endpoint, let a member choose an arbitrary address under a separate consent, or choose another default after collecting labelled cases. |
| Proposed trust wording | TypeSafe, OpenAI or Google acts as a subprocessor for decision suggestions when selected. With your permission, your device sends the first prompt, branch, your saved repo alias if present, and eligible goal ids and titles directly to the selected service. A workspace-provided endpoint receives those same fields when you choose it. Align does not receive these inputs or store your provider key. Turn the choice off on this machine at any time. | Forbid external decisions, or negotiate a workspace-specific processing agreement before permitting them. |
| Dispatch permission | Authorize the current bindable goal set and workspace policy together. End dispatch permission before saving a block and discard answers that arrive after the block, even if the owner later clears it. | Require a relay that mediates each dispatch, or allow decisions using a cached policy. |
| Branch provenance | Use the local Git snapshot from the turn, with unknown branch when a snapshot is missing. | Send only the saved repo alias and prompt. |
| Abstention | Start with an independent fit answer, a choice including none and a conservative minimum score and margin. Keep any correction on the machine. | Require labelled calibration before enabling the option, or use a label-only fork. |

Tier 2, deliberate excerpts and central logs stay under ADR 0006. The model limit check is a separate capability.
