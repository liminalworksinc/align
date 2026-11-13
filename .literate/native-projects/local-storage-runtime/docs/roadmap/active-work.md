# Active work

Release scope is declared in [release goals](release-goals.json).

## P0

### [x] ONBOARD-001: Finish the qualified storage library's local readiness

- **Owner:** local storage-runtime Component and Node SQLite Flavor
- **Direction:** Preserve the complete existing database adapter through a source-free resource-bound service.
- **Conclusion:** Generic behavior belongs to the Component; backend operations and all thirteen public exports belong to the Node target. Application-wide acceptance remains with the consuming project.
- **Depends on:** none
- **Completion prerequisites:** none
- **Next action:** Local library readiness is complete; downstream consumption remains separately owned.
- **Implementation:**
  - [x] Qualify the complete service through two distinct clean generations with all 44 independent cases each.
  - [x] Admit a third independent generation with real-resource acceptance and a current receipt.
  - [x] Reconcile project documentation and owned entrypoints without changing accepted runtime authority.
- **Evidence:**
  - [x] Decision e0ce553b77b0759accd231fb4332ba2da10b3f1d63f5637bdfe8a7e7d28a2f76 binds the accepted source snapshot and all 88 passing parity records.
  - [x] Separate admitted generation passes three generated checks and all 44 independent cases. Entry 06c78cf9bb3153f888c6a322473527927e1be9d65fdd03f8742a0db793d0b01f is committed locally.
  - [x] Current authority, locks, documentation, receipt and owned-entrypoint checks pass; cache acceptance reuses admitted source.

The frozen source reference has 43 cases on macOS and Linux; the additional
constructor case covers the resource API. The verifier uses real SQLite and
filesystem resources with disclosed fixture-only faults. Its VM resource controls
are functional conformance checks. Public deployment and application-wide gates
remain separate consuming-project work.
