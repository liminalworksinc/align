# Active work

Release scope is declared in [release goals](release-goals.json).

## P0

### [x] ONBOARD-001: Finish the qualified readiness library's local readiness

- **Owner:** local server-readiness Component and Node Flavor
- **Direction:** Preserve the existing readiness operation through a qualified resource binding.
- **Conclusion:** The Component owns the shared barrier. The Flavor owns the JavaScript representation and API. Database/authentication execution and complete application acceptance retain separate ownership.
- **Depends on:** none
- **Completion prerequisites:** none
- **Next action:** Local library readiness is complete; downstream consumption remains separately owned.
- **Implementation:**
  - [x] Qualify readiness through two distinct clean generations with all 40 observations each.
  - [x] Admit a third independent generation with ordinary acceptance and a current receipt.
  - [x] Reconcile project documentation and owned entrypoints without changing accepted runtime authority.
- **Evidence:**
  - [x] Decision d0f4c31b529d53a5af4bc28f5339e1a40364238f1d95dd5a5f09f4663668c4bd binds the exact snapshot and 80 passing observation records.
  - [x] Separate admitted generation passes 4 generated checks and ordinary independent acceptance.
  - [x] Copy the admitted entry to the declared project-committed cache through the normal CLI.
  - [x] Current authority, locks, documentation, receipt and owned-entrypoint checks pass; cache acceptance reuses admitted source.

## Parent integration

The consuming project's ADOPT-002 owns registration, typed consumer integration,
actual public API and caller checks, complete application/image parity and
deployment. Those remain pending. Closing local child readiness does not close
the 31-boundary program, public tester, operator security review or live smoke.
