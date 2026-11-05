# Active work

Release scope is recorded in the [release-goal manifest](release-goals.json).

## P0

### [x] FIELD-VALIDATION-001 - Qualify input field validation with explicit dependencies

- **Priority:** P0
- **Owner:** components/field-validation
- **Direction:** Preserve fifteen natural validation methods, six data exports, supplied errors and wording, getter order and shared regex state.
- **Conclusion:** One context-bound factory preserves existing providers and leaves consumer transfer to the parent program.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Pass two clean qualification builds and an independently admitted build.
- **Evidence:**
  - [x] All 4549018 observations in fifty batches, eight observer controls, Linux baseline parity and ordinary child gates pass.

Consumer integration and source retirement remain with the parent ADOPT-002 program.

**Qualification:** Both independent clean builds pass all fifty parity batches.
Their generated suites pass 15 and 6 tests. A separate admitted build passes 10
with no failures or skips. All 4,549,018 observations retain their original
fingerprints. Eight observer controls pass; the unchanged original baseline also
matches Linux Node 24.22.2. Host and Linux baseline use Unicode 17 and ICU 78.3.
Qualified projection:
`sha256:00672343a1d9a30405d1a1497f0f4e08d4f70fe02b9e747b08cb4ebf1be6888d`.
Qualification decision:
`sha256:1132bcad4fd7b43fa4d42ad995ca731c8c7a15efbe1f4906930df5e46d6bd8c1`.
