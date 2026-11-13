# Active work

Release scope is recorded in the [release-goal manifest](release-goals.json).

## P0

### [x] ERRORS-001 - Qualify shared HTTP error classes and factories

- **Priority:** P0
- **Owner:** components/http-errors
- **Direction:** Preserve the two original Error subclasses and four factory APIs through a source-bound specification.
- **Conclusion:** Keep constructor identity, native Error inheritance, field assignment and aliases without changing validation or transport behavior.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Pass two clean qualification builds and a separately admitted build.
- **Evidence:**
  - [x] All 22,618 observations in nine batches, five verifier controls, host and Linux baseline parity, project validation and owned entrypoints pass.

Both clean qualification suites pass 4 tests. The separately admitted build
passes 7 tests. All 22,618 observations in nine independent batches match.
Qualified projection: `sha256:d6e18ee61d9b2a34bd1034ad0a7f6d18092b84b6fb2633f3eeae671e3b275ecc`.
Admission decision: `sha256:8f65243ab72adcad334f80f065f5fa68368d12648737bdabb01568a72e656f3f`.

Application integration and source retirement remain with ADOPT-002 in the parent.
