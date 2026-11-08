# Active work

This file is the durable resumption queue for user-directed and discovered work. Before
implementation, follow `skills/agent/record-user-directed-work/SKILL.md`.
Keep detailed designs in focused roadmap documents and link them here.
Record release scope in the [release-goal manifest](release-goals.json); the release
gate cross-checks it against this queue.

## Detailed-roadmap lifecycle

This file is the sole resumable queue. Create a supporting file beneath `docs/roadmap/`
only when one item cannot keep a program's rationale, ordering, and acceptance contract
readable. Put this visible header immediately after the detailed document's title:

```markdown
- **Status:** active
- **Owning queue item:** [AREA-NNN](active-work.md#area-nnn-heading)
- **Completion / archival evidence:** pending while AREA-NNN remains open
```

Status is exactly `active`, `partial`, `deferred`, `completed`, or `historical`. The
owner must resolve to a checkbox or named program heading in this file. A terminal state
requires linked evidence. Keep a completed plan here only when doing so preserves useful
inbound links; move substantial closed programs beneath `docs/history/roadmap/`, retain
their owner, and mark them `historical`. Do not create a separate file for an ordinary
queue item or let `docs/roadmap/` become a plan archive.

## P0

### [x] ONBOARD-001: Provide the qualified identifier library

- **Owner:** Component `local/identifier-tools` and the Node identifier target Flavor
- **Direction:** Preserve the five existing helpers and their natural public signatures through real entropy, hash and clock dependencies.
- **Conclusion:** The library owns identifier encoding and helper decisions. The parent retains the other mixed-core algorithms, actual operator assembly, full application acceptance and publication under ADOPT-002.
- **Depends on:** none
- **Implementation:**
  - [x] Capture the exact original ID module and bounded base32 declarations without unrelated core algorithms.
  - [x] Promote the portable contract and concrete Node resource binding through the normal CLI.
  - [x] Qualify two distinct clean source trees and admit a separate freshly generated package.
  - [x] Verify actual typed consumers, canonical bindings and public type compatibility.
  - [x] Verify the actual Node-only operator package closure and command behavior.
  - [x] Reconcile documentation, current receipt and owned agent entrypoints without changing accepted source or authority.
- **Evidence:**
  - [x] Both clean qualifications pass 51 cases and 166 observations. Decision: `sha256:4a1a526bd69742a14e9332bd5b3059d659956cc06dca612d2e04d7d6197a42d7`.
  - [x] Separate admitted source: `sha256:f0e58e3c69efe21296a1764f97a0448043167ae66740919b1db0bbc846405ab1`; accepted entry: `sha256:c20277071ebce5a9765f0fb8539d7df3402fa173881898c5812a16ab98f8e60a`.
  - [x] The actual admitted package passes all 51 cases on macOS and Linux. Ten bad bindings, 38 forbidden-effect controls and eleven original-source semantic controls remain detectable on both platforms.
  - [x] Actual complete core, ID module and typed host binding match all 45 original cases and 143 observations on both platforms, including the real cross-module function identity.
  - [x] Strict checks accept both complete public module namespaces in both assignment directions and preserve the seventeen-prefix type. Two type-regression controls remain rejected.
  - [x] Fifteen actual operator command scenarios match on macOS and Linux from non-root read-only source, including creation, purge and rollback after entropy failures. Exit status, stdout, stderr, schema, rows, rowids and allocators match.
  - [x] All three signals match in preparation and database-lock phases on both platforms. Owned process groups stop, temporary directories are removed, and database and source bytes remain unchanged. The preparation barrier is a disclosed test-only resource.
  - [x] Image `sha256:94b543c17160943ec4c399453e57f7c57ac618e32a973a190adfe8f6588304b5` passes all 36 container, header and startup-refusal checks. The non-root operator runtime contains exactly 29 reviewed files and three qualified packages.
  - [x] Current validation, documentation, receipt and owned-entrypoint gates pass with three passing verification gates, two declared optional skips and no failures. Normal cache acceptance reuses the admitted source without creating a new cache entry.
