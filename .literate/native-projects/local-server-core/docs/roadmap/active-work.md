# Active work

Release scope is declared in [release goals](release-goals.json).

## P0

### [x] ONBOARD-001: Finish the qualified core and event library's local readiness

- **Owner:** local server-core Component and Node Flavor
- **Direction:** Preserve the complete core and event surfaces through qualified provider bindings.
- **Conclusion:** The Component owns operation behavior; the Node Flavor owns exact JavaScript semantics and packaging. Database handles, transactions, settings, cryptography, identifiers and current host services retain their existing caller owners.
- **Depends on:** none
- **Completion prerequisites:** none
- **Next action:** Local library readiness is complete; downstream consumption remains separately owned.
- **Implementation:**
  - [x] Qualify both complete factory capabilities through two distinct clean generations with all 53 batches each.
  - [x] Admit a separate independent generation with ordinary acceptance and a current receipt.
  - [x] Reconcile project documentation and owned entrypoints without changing accepted runtime authority.
- **Evidence:**
  - [x] Decision e62992bea3a818d8eeb6dfdb667817ea7dc7882ff440e3e7c6caf7f53caa45d6 binds exact source and 106 passing independent batches, with eight generated tests per run.
  - [x] Separate admission passes 9 generated tests and all 53 ordinary acceptance batches. All 47 reviewed authority files remain exact.
  - [x] Copy the admitted entry to the declared project-committed cache through the normal CLI.
  - [x] Current authority, locks, documentation, receipt and owned-entrypoint checks pass; cache acceptance reuses admitted source.

## Parent integration

The consuming project's ADOPT-002 owns supported registration, typed consumer
integration, actual callers on macOS and Linux, package closure, complete
application/image acceptance and deployment. These remain pending. Local child
readiness does not close its 31-boundary program, public tester, security review
or live smoke.
