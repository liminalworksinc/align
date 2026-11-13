# Active work

Release scope is declared in [release goals](release-goals.json).

## P0

### [x] ONBOARD-001: Finish the qualified request library's local readiness

- **Owner:** local server-request-effects Component and Node Flavor
- **Direction:** Preserve both complete request-helper namespaces through qualified provider bindings.
- **Conclusion:** The Component owns request orchestration; the Node Flavor owns names, host APIs and exact JavaScript effects. Authentication, device storage, configuration, readiness and endpoints retain their own implementations.
- **Depends on:** none
- **Completion prerequisites:** none
- **Next action:** Local library readiness is complete; downstream consumption remains separately owned.
- **Implementation:**
  - [x] Qualify both capabilities through two distinct clean generations with all 46 batches each.
  - [x] Admit a separate independent generation with ordinary acceptance and a current receipt.
  - [x] Reconcile project documentation and owned entrypoints without changing accepted runtime authority.
- **Evidence:**
  - [x] Decision 2fcd7ef6382d71c016322a93acc4d52c076e19905dd16b1bbaa111a70cb17ede binds the exact source and 92 passing independent batches.
  - [x] Separate admission passes six generated tests and all 46 ordinary acceptance batches. All 47 reviewed authority files remain exact.
  - [x] Copy the admitted entry to the declared project-committed cache through the normal CLI.
  - [x] Current authority, locks, documentation, receipt and owned-entrypoint checks pass; cache acceptance reuses admitted source.

## Parent integration

The consuming project's ADOPT-002 owns supported registration, typed consumer
integration, actual caller checks on macOS and Linux, complete application/image
parity and deployment. These remain pending. Closing local child readiness does
not close its 31-boundary program, public tester, security review or live smoke.
