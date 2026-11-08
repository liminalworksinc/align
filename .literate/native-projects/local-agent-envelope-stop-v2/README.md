# Agent Envelope

This library defines the session envelope and sharing notices used by Align's
local agent. Workspace stops survive the end of sharing and deletion of shared
history. Goal holds retain their separate release rules.

Intent lives in [the Component](components/agent-envelope/component.md) and its
public interface contracts. The host target uses the project's declared
JavaScript and macOS Flavors. Original implementation files are excluded from
the generation inputs recorded by the source-promotion audit.

Use the installed CLI from this directory. Project defaults already select the
Flavors, so commands do not repeat those selectors:

```sh
litai project validate .
litai lock components/agent-envelope --target host
CODING_CLI=codex litai plan components/agent-envelope --target host
litai verify
```

Compilation and execution require the operator's acknowledgement. With that
acknowledgement, the ordinary lifecycle builds and checks the library:

```sh
litai test components/agent-envelope --target host --allow-host-execution
```
Current authority and receipts are inspected with `litai status` and
`litai verify`; this README does not substitute for those results.

The independent reference consists of `ended.ts`, `envelope.ts` and `types.ts`
from `components/legacy-project-wrapper/implementation/packages/align-agent/src/shared`
at Align commit `b97a9ab53a2104576f067abf9f9832de21767c3b`. Qualification uses
that separate reference, the pinned profile and independent clean generations.
The profile preserves all earlier cases and covers persistent stops, sign-in,
lost workspaces, mutable public wording data and omitted optional inputs.


<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
