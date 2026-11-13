# Active work

Release scope is recorded in the [release-goal manifest](release-goals.json).

## P0

### [x] MARKDOWN-001 - Qualify the trust-document Markdown grammar

- **Priority:** P0
- **Owner:** components/trust-markdown
- **Direction:** Preserve all five natural JavaScript APIs against the repaired and fully passing original reader.
- **Conclusion:** Qualify exact Unicode slugging, URL handling, structural Markdown, placeholder rules, callback identity and fresh result graphs without changing caller data.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Pass two clean qualification builds and a separately admitted build.
- **Evidence:**
  - [x] All 1,153,547 observations in 21 batches, four verifier controls, all embedded source commands, final verification, project validation and owned entrypoints pass.

The two clean qualification suites pass 9 and 12 tests. The separately admitted
build passes 8 tests. Every build matches all 21 independent batches.
Qualified projection: `sha256:8e169fd629cb9604bfa829b14da35eec0432a24984d4adf0d1d8508aca6fc354`.
Admission decision: `sha256:184ec395a69d75391bfb765585b8850dd4d6d94dd15b093bdf60056e25a507df`.

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
