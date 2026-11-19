# ADR 0006: Session data boundary

- Status: Proposed. Founder approval is pending.
- Packet: LIM-2526

The November 12 ruling keeps metadata as the default and gives people a session choice for work signals.
The November 11 drift ruling keeps the reply on the machine. The current packet proposes opt-ins above this
baseline and keeps raw transcript content in its source files.

| Decision | Proposal | Alternatives |
| --- | --- | --- |
| Derived results | In Mode L, allow a machine owner to opt in to recording a fixed finding with the local Align server for their own inspection. Hosted Align refuses it. A workspace owner may bar it. | Keep all findings local, or give goal readers access with separate consent. |
| Model input within a session | Reserve a separate machine opt-in to a short question in the existing session. | Keep suggestions entirely deterministic, or omit suggestions. |
| Model input to a provider | Reserve a separate machine opt-in with a named recipient, minimal input and a workspace veto. List the provider as a subprocessor before use. | Keep questions in the existing session only, or operate an approved workspace model. |
| Deliberate excerpt | Reserve a machine opt-in and require a preview and confirmation for each excerpt with named readers, a purpose and an expiry. | Keep excerpts outside Align, or let people share a broader portion of their history. |
| Central logs | Exclude them from hosted workspaces. Permit local use in Mode L. | Exclude them everywhere, or consider dedicated storage after a separate hosted decision. |
| Metadata default | Keep tier 0 as the session-sharing default. Each available higher tier requires separate consent on the machine. | Keep the current boundary permanently or change the default after a separate decision. |

Unbound-time aggregation, expectation responsibility and reading-source permissions belong to their own packets.
