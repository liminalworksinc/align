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

### [x] ONBOARD-001: Provide the qualified rate-limit library

- **Owner:** Component `local/rate-limits` and the Node and SQLite target Flavor
- **Direction:** Preserve existing memory and durable admission while supplying runtime dependencies explicitly.
- **Conclusion:** The library owns limiter decisions and ordering. The caller retains its shared Map, clock, signer, database helpers, qualified error constructor and transactions. Parent application integration remains in Align ADOPT-002.
- **Depends on:** none
- **Implementation:**
  - [x] Promote the source-bound portable contract and concrete target mapping.
  - [x] Qualify two independently generated clean workspaces against the frozen 45-case profile.
  - [x] Admit a separately generated package and inspect its actual runtime source.
  - [x] Check the proposed typed consumer and actual database transactions on macOS and Linux.
  - [x] Reconcile documentation and verify the current receipt and owned agent entry points.
- **Evidence:**
  - [x] Both clean qualifications pass 45 cases and 193 observations. Decision: `sha256:5dd64105de9b1f6e659aa3d1f3c0baadf100c102b1ad171973a7d0804a1c7203`.
  - [x] Separately admitted source: `sha256:8a59c398f806a0a692ccafcba18f7954fe19f6c5560c03ec9124bd9d611a1330`; accepted entry: `sha256:74fa3952ac67a55c465b4ffa05c0b4ea423b047fbcf886a04071fbbfc4d0d417`.
  - [x] Proposed public binding matches every retained observation on both platforms and detects six broken bindings.
  - [x] Six actual database transaction scenarios match the retained reference on both platforms and detect three broken wrapper controls each.
  - [x] Current project validation, documentation, receipt and owned entry-point checks pass.
