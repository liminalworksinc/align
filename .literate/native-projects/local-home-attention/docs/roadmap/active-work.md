# Active work

Release scope is recorded in the [release-goal manifest](release-goals.json).

## P0

### [x] HOME-001 - Qualify Home evidence and attention rules

- **Priority:** P0
- **Owner:** components/home-attention
- **Direction:** Preserve the original evidence attribution and attention rules through reviewed specifications and independent source observations.
- **Conclusion:** Qualify all nine JavaScript capabilities with exact wording, callback behavior, returned aliases and shared mutable data preserved.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Pass two clean qualification builds and a separately admitted build.
- **Evidence:**
  - [x] All 82,905 observations, verifier controls, final verification, project validation and owned entrypoint readiness pass.

Both clean builds and the admitted build match all nine independent batches.
Their generated suites pass 27, 6 and 16 tests respectively. Qualified projection
`sha256:23a85f32f791a895d0b55eb26f5a2041137dac0518f225e6d1ea48c7691b15ce`
is admitted by decision
`sha256:6742e6cd342689658d12eef7363baf3f4b613d93f4dd4de42a00315f759fa5f5`.

Application integration and source retirement remain with ADOPT-002 in the parent.

### [x] DOCS-001 - Reflect qualified status on the contributor front pages

- **Priority:** P1
- **Owner:** project documentation
- **Direction:** Remove stale pending-qualification language after the library has qualified and its parent consumes the verified package.
- **Conclusion:** Repair only owned documentation while preserving the exact qualification profile, component lock, qualified projection and committed package bytes.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Update the front page and API availability to state the qualified component and actual parent consumption.
- **Evidence:**
  - [x] The cached rebuild, verification, validation and owned entrypoints pass with all protected inputs and committed cache bytes unchanged.
