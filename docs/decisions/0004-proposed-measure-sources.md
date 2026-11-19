# Proposed measure source and disclosure rules

- Status: Proposed, pending ratification
- Packet: LIM-2524
- Design: Outcomes, attribution and local analysis, decisions 8 and 9

| Choice | Proposal | Alternatives |
| --- | --- | --- |
| Configure a source | Let the goal owner set or disable it in a goal version. Preserve settings on retained measures in change requests. | Limit configuration to workspace owners, or allow anyone in the goal's approval set to configure it through a request. |
| Choose and permit a machine | Let the goal owner name a paired device whose operator can read the goal and has a role that can submit command readings. Require its local operator to allow the exact executable and arguments and start runs explicitly. Keep requests at the paired server origin. | Limit devices to the goal owner's own machines, or allow remote or scheduled execution after approval. |
| Ingest from CI | Let a workspace owner issue a revocable, write-only reading credential. Require a matching measure source before accepting a result. Describe the credential used to report it. | Use a provider-issued identity or a repository installation. |
| Keep the metadata-only default | Leave automated sources off until the goal owner opts in. CI additionally needs a credential and command execution needs local consent. Accept only the parsed number or unknown, with the source metadata needed to interpret it. | Enable authorized collection by default, or allow selected snippets of process output. |
