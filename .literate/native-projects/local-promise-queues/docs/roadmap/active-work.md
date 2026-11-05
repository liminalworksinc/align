# Active work

Release scope is recorded in the [release-goal manifest](release-goals.json).

## P0

### [x] QUEUES-001 - Qualify the shared keyed promise queue

- **Priority:** P0
- **Owner:** components/promise-queues
- **Direction:** Preserve same-key callback ordering and shared queues across route bundles through a source-bound specification.
- **Conclusion:** Keep the original generic Promise API, shared Map identity, callback results and errors, and exact cleanup behavior without adding timers or I/O.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Pass two clean qualification builds and a separately admitted build.
- **Evidence:**
  - [x] All 5,290 observations in 22 batches, five verifier controls, host and Linux baseline parity, project validation and owned entrypoints pass.

Application integration and source retirement remain with ADOPT-002 in the parent.

The first clean candidate matches the frozen source/generated command path, but
the original standalone worker used a raw node-eval context whose callback
receiver differed from the frozen encoded-eval launcher. The authored worker now
uses the same encoded-eval invocation, with every profile case and protected input
unchanged. A packaged-launcher control passes before the next clean attempt.

Both clean qualification builds pass the frozen profile. The separately admitted
build passes 3 tests and every one of the 5,290 observations in 22 batches.
Qualified projection: `sha256:8f54bce6767e112d43dcc6b34954322a236da2891f0551abb98f958c0b01ec1c`.
Admission decision: `sha256:d0c6e89e66367e41b72cb09805fdf43694b5f301f98c3db1101d97340760cdd6`.
