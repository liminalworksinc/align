# Active work

Release scope is declared in [release goals](release-goals.json).

## P0

### [x] ONBOARD-001: Finish the qualified startup library's local readiness

- **Owner:** local server-startup Component and Node Flavor
- **Direction:** Preserve the existing startup operation through a qualified resource binding.
- **Conclusion:** The Component owns observable behavior. The Flavor owns Node calls and public representations. Parent consumers and complete application acceptance retain separate ownership.
- **Depends on:** none
- **Completion prerequisites:** none
- **Next action:** Local library readiness is complete; downstream consumption remains separately owned.
- **Implementation:**
  - [x] Qualify startup through two distinct clean generations with all 79 observations in 40 acceptance batches each.
  - [x] Admit a third independent generation with real-resource acceptance and a current receipt.
  - [x] Reconcile project documentation and owned entrypoints without changing accepted runtime authority.
- **Evidence:**
  - [x] Decision 173cd119254eb00eb0c6383ea291eeb4b9a55357767a464c07ae255edfc94dde binds the accepted snapshot and 158 passing observation records.
  - [x] Separate admitted generation passes 3 generated checks and ordinary independent acceptance.
  - [x] Copy the admitted entry to the declared project-committed cache through the normal CLI.
  - [x] Current authority, locks, documentation, receipt and owned-entrypoint checks pass; cache acceptance reuses admitted source.

## Parent integration

The consuming project's ADOPT-002 owns registration, typed consumers, actual
process-listener checks, complete application and image acceptance, and deployment.
Those remain pending. Closing this child's local readiness does not close the
parent program, public tester, security review or live smoke gates.
