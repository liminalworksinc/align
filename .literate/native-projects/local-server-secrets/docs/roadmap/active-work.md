# Active work

Release scope is declared in [release goals](release-goals.json).

## P0

### [x] ONBOARD-001: Finish the qualified helper library's local readiness

- **Owner:** local server-secrets Component and Node Flavor
- **Direction:** Preserve both existing secret and HMAC helpers through a qualified resource-bound service.
- **Conclusion:** Portable behavior belongs to the Component. Node calls and public representations belong to the Flavor. Parent consumers and application-wide acceptance retain separate ownership.
- **Depends on:** none
- **Completion prerequisites:** none
- **Next action:** Local library readiness is complete; downstream consumption remains separately owned.
- **Implementation:**
  - [x] Qualify both helpers through two distinct clean generations with all 36 independent cases each.
  - [x] Admit a third independent generation with real-resource acceptance and a current receipt.
  - [x] Reconcile project documentation and owned entrypoints without changing accepted runtime authority.
- **Evidence:**
  - [x] Decision 97f9007452de38d31fa88e0726147d132fd55ef5de9ceb28cbb165a54bb5f351 binds the accepted source snapshot and all 72 passing parity records.
  - [x] Separate admitted generation passes six generated checks and ordinary independent acceptance.
  - [x] Copy the admitted entry to the declared project-committed cache through the normal CLI.
  - [x] Current authority, locks, documentation, receipt and owned-entrypoint checks pass; cache acceptance reuses admitted source.

## Parent integration

The consuming project's ADOPT-002 owns registration, typed consumers, Node-only
operator packaging, complete application and image checks, and deployment.
Those remain pending. Closing this child's local readiness does not close the
parent program or its public tester, security review and live smoke gates.
