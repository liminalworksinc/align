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

## Open pull-request landing queue

The 2026-11-10 publication check confirms draft PR #58 at `a902ae75`, with
56 qualified libraries and 26 closed boundaries: sixteen native and ten approved
retained boundaries. Both CI checks pass. The operator lifted the B17 attempt-limit
stop on November 10. Metrics qualifies on attempt four, passes separate admission,
both-host package and actual caller checks, and has a current child receipt.
Retention attempt two now qualifies, admits separately and passes both-host
core and scheduler caller checks, including fourteen additional timer cases. All original sources, private baselines and failures remain preserved.
Earlier peer statuses below remain historical and independently
owned. The current survey finds no collectable branches or worktrees.

- [#58](https://github.com/liminalworksinc/align/pull/58), native rewrite:
  the earlier eighteen-library head was published as `b55849d0`. The twenty-three-library candidate
  passes all 1,845 application and 36 image/header/startup checks locally. The
  review remains draft; publication requires the operator's specific go.
- [#63](https://github.com/liminalworksinc/align/pull/63), integrated v2 frontend:
  peer work, with its receipt/spec check failing at the surveyed head. It changes
  interface consumers and remains separate from the storage contract work.
- [#64](https://github.com/liminalworksinc/align/pull/64), refused usage uploads:
  draft peer work in the local agent.
- [#65](https://github.com/liminalworksinc/align/pull/65), refresh-lock ownership:
  draft peer work in the local agent.
- [#66](https://github.com/liminalworksinc/align/pull/66), team membership role checks:
  draft peer work in workspace authorization.
- [#59](https://github.com/liminalworksinc/align/pull/59), demo friction: draft peer
  work, outside this native rewrite step.
- [#62](https://github.com/liminalworksinc/align/pull/62), serial hook latency:
  draft peer work. Keep the 150 ms threshold; this native integration must pass the
  existing test conditions before claiming verification.

PR #60 is merged by its owner. PR #61 is closed; its folder-rule fix and stale-socket
repair are on the newer main, while its latency work continues in #62. ADOPT-002
reproduces the folder-rule failure on this older base and tracks the matching repair.

Open issue [#30](https://github.com/liminalworksinc/align/issues/30) remains covered
by the existing preseed, deployment and handoff items in this queue.

The 2026-11-06 continuation survey also finds draft peer PRs #67 (imported invite
codes), #68 (integrated v2 frontend) and #69 (workspace stop ownership). PR #62 is
green and mergeable at `a9a47a39`; it remains independently owned and unmerged by
this session. No collectable branches or worktrees were reported. These findings
do not authorize collecting or publishing peer changes.

The current survey also records [#71](https://github.com/liminalworksinc/align/pull/71)
(bindability), [#72](https://github.com/liminalworksinc/align/pull/72) (trust pages),
[#73](https://github.com/liminalworksinc/align/pull/73) (refresh grace) and
[#74](https://github.com/liminalworksinc/align/pull/74) (pending bindings) as draft
peer work with failing CI at the surveyed heads.
[#75](https://github.com/liminalworksinc/align/pull/75) (pinned CLI bootstrap) is
green and mergeable. PRs #59 and #67 are green drafts, #64 is a conflicting green
draft, and #68 has failing CI. None is merged or collected by this session.
Issues #76 and #77 remain covered by the B14 and B15 correction records below.
The operator continuation retains the full native rewrite scope through B31 and
its acceptance gates; the local checkpoint does not complete that work.

## P0

<a id="native-stop-001"></a>
### [x] NATIVE-STOP-001 - Preserve workspace stops in native session wording

- **Priority:** P0
- **Owner:** B10, local/agent-envelope and its typed consumers
- **Direction:** Complete the requested pull and rebase while preserving main
  `ba43c5b` and the accepted native rewrite scope.
- **Conclusion:** A stop set from a workspace now survives stopping sharing and
  deleting shared history. Main adds `STOP_HOLDS_NO_SHARE`, optional stopped and
  lost-workspace inputs, and new wording for those states. The earlier qualified
  library implemented the previous contract. Rebase preserves the incoming stop
  behavior and the earlier context-priority and ask-attribution corrections in a
  merged baseline. The two temporary retained modules are now typed consumers of
  the independently qualified replacement. No permanent retained-source exception
  is introduced.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Pull and rebase through `ba43c5b`, preserving all 188 staged paths.
  - [x] Merge the exact corrected retained baseline with the incoming stop fix
    without changing any generated package or immutable cache.
  - [x] Extend the authored interfaces, specification and independent observations
    for persistent stops, lost workspaces, the new constant and optional inputs.
  - [x] Generate and qualify the revised library through the ordinary lifecycle,
    including distinct clean builds and a fresh admitted build.
  - [x] Replace the temporary retained modules with the qualified typed consumers
    through supported registration and acceptance operations.
- **Evidence:**
  - [x] Preserve unchanged context priorities, attribution, public types, defaults
    and data identity; detect the earlier implementation on changed stop cases.
  - [x] Pass meaningful stop/share/delete/login/lost-workspace controls on both
    targets, plus the unchanged 150 ms hook requirement.
  - [x] Complete the full parent workflow, current receipt, both verification
    runtimes and fresh image checks for the resulting source before the next
    authority transfer or publication.

The revised library passes two independent clean generations, all 63 verifier
batches and 1,642,893 reference observations per run. The new generated suites
contain 72 and 20 tests. A separate normal admitted build passes 76 checks with
no failures or skips, has a current receipt and publishes one accepted local
cache entry. Qualification decision:
`sha256:8fc47e8f0115084d9d27c6cc879316ee36af06de895ae605d8f4bebab016d8ae`.
Both qualification runs exclude original implementation files from generation.

The ordinary replacement plan refuses the already-qualified registered child.
The operator approved [upstream issue #350](https://github.com/jordanhubbard/literate-ai/issues/350)
and accepted ADR 0065 for a reviewed registration revision that preserves both
qualified trees. Its local framework commit `ac436ed2` passes 118 managed checks
and the code, documentation, skill, layout and export gates. The exact clean wheel
is installed separately. Real qualified revision, failure rollback, process
interruption, guarded recovery and production consumer acceptance pass from that
wheel without mocking qualification readers or editing installed source. The
consumer manifest helper now accepts an explicit registered physical provider
path while retaining the existing logical component identity and qualification
checks. The verified parent is transferred byte for byte to this checkout and
consumes the replacement through its typed public API. All 63 actual-consumer
batches and 1,642,893 reference observations match on macOS and Linux, and both
TypeScript namespace directions pass. Production agent assembly accepts all 161
cases across six libraries. The other twenty consumer records remain unchanged.

The complete macOS build, test and package workflow passes 1,845 checks with no
failures or skips. Its unchanged serial test passes the 150 ms p95 requirement
with networking blocked. All three phases bind one 414-file application source:
`sha256:068a10ef8f8fd954a56193a41547d764826b591cb251be24988376219dfe8adb`.
All 36 Linux image, header and startup checks pass; the exact three-package
operator runtime contains 29 files. Current receipt:
`sha256:1ca7424a6afd0651105b555f4259d305f691602973f0aee2ca6d62545301abac`.
Both installed and CI-pinned verification pass three gates with two declared
optional skips. The original index and changed working files are backed up before
transfer. The checkpoint was staged after local acceptance. PR #58 records its
publication state; commit, push and PR publication require their separate operator
go. ADOPT-002 and the public tester gates remain open.


Check the parent only after every required subtask and evidence item passes. Add the
release-visible outcome to `CHANGELOG.md`; Git preserves prior queue states.

<a id="adopt-002"></a>
### [ ] ADOPT-002 - Native library rewrite

- **Completion prerequisites:** SEC-001, CONFIG-001, CONTEXT-001, NATIVE-BINDINGS-001, TRUST-PARSER-001, VERIFIER-LINT-001, NATIVE-STOP-001
- **Owner:** project architecture / Components / Flavors / skills / assets
- **Direction:** Execute
  [ADR 0002](../decisions/0002-native-literate-ai-rewrite.md) through the
  [native rewrite program](native-rewrite-program.md), preserving retained source
  authority until each boundary independently qualifies.
- **Current direction:** Complete all 31 boundaries on draft PR #58 under the
  operator's migration go. Normal review remains required. Diagnose each failed
  attempt before another launch and preserve original observations and outputs.
  Keep framework source unchanged and report a framework blocker. Deployment,
  tester configuration, upstream writes, merges and reviewer opt-out are outside
  scope. Rebase only after the cutover prerequisite is satisfied at a checkpoint.
- **Current correction:** The operator requested that every open finding be
  fixed before continuing the remaining boundaries. Shruti's feedback is
  optional and supplies no build gate. Follow the
  [finding remediation plan](native-findings-remediation.md); preserve normal
  review and distinguish implemented fixes from operator security acceptance.
  Checkpoint `51dd7e5e4c8ead355655f865987da415750abfcd` completed normal
  publication and review with 26 undecided findings. At that checkpoint the three newest concerned
  staging authorization and two evaluator escapes. Their local corrections and
  limits are in the [findings guide](native-authorization-findings.md) and
  [containment record](../architecture/native-evaluator-containment.md).
  Later normal reviews bring the current count to 35 undecided findings. The
  parser evaluator now separates candidate observations from private expected
  results, preserves the accepted hashes, rejects owned forgery and mutation
  controls, and passes cached child acceptance without changing generated source.
  Combined application/image acceptance and publication remain pending. The
  corrected core qualification is waiting for the coding CLI login refresh;
  the schema-24 child is admitted but has not been integrated. Two current-v2
  CLI packages are promoted for qualification with 54 and 75 original controls.
- **Next action:** Reconcile native providers with merged main
  `4d95f5befa36e98012e8ca69933124a0508a4aaf`, preserve the earlier goal-cap
  correction, complete current contained acceptance, then application/image
  acceptance, current receipt verification, normal publication and exact-head CI.
  The cutover prerequisites have merged and the local rebase is complete.
  Historical full-suite results do not attest this new candidate. Continue B22
  and deferred B18 without reopening unchanged source. All documentation and
  ledger preparation precede the integrated acceptance run. Closure remains 26 of 31 until
  every checkpoint gate passes. No independent or operator security approval is
  supplied by functional checks.
- **Current acceptance correction:** The trust punctuation regression is fixed.
  The next complete run passes 1,908 of 1,909 checks; the assembly recovery test
  instead hits the contained verifier's 50-second deadline. The two structural
  tests now reuse the existing two-provider fixture, preserving recovery checks
  and requiring the exact incorrect-result mismatch. Both focused checks pass.
  No runtime library, sandbox limit or timeout is changed. Complete the current
  application/image run, receipt and normal publication gates before closure.
  Read the [current checkpoint inputs](../../generated/native-checkpoints/current-recovery.json).
- **Current image assembly:** The Docker build deliberately has no nested
  daemon. Host-contained acceptance now produces a digest-bound input bundle;
  the builder checks its exact bytes and admitted runtime members. Ten transport
  controls and a real build pass. Canonical image, full application, current
  receipt and normal publication remain required. Ten admitted sync factories
  preserve all 803 original observations on both hosts. Read the
  [current checkpoint inputs](../../generated/native-checkpoints/current-container.json).
- **Current implementation evidence:** The normal registered-consumer assembly
  now passes all 1,259 contained library batches, preserving all 270 runtime
  package files. The caller batches checks within each library and omits unused
  expected-result metadata from verifier arguments while retaining every result
  assertion. The current-v2 directive replacement passed two clean generations,
  full emitted-source review and separate admission. Nine admitted sync factories
  match all 803 freshly executed composition observations on both hosts. These
  private B22 results still need product integration. Hot-state qualification
  passed its existing 258 observations, but source review found that both outputs
  change malformed legacy notice-key behavior. Both are held before admission;
  seven new original-backed controls reproduce the gap, with a clarified binding
  prepared for a new qualification. No generated runtime was patched.
- **Retained classification:** The operator approved the exact 280 paths in
  [the ten-boundary proposal](native-retention-proposal.md): B20, B21, B23 through
  B27, B29, B30 and B31. The supporting publication preserves current full application and image acceptance on unchanged source; all ten approved retained closures are now published.
  B17, B18, B19, B22 and B28 still require service or command migration. The
  [authorization findings guide](native-authorization-findings.md) preserves all
  26 undecided findings and provides main/materialized reading commands.
- **B14 prerequisite:** [Issue #76](https://github.com/liminalworksinc/align/issues/76)
  reproduces an existing invite-cap race while writers wait for SQLite. The local
  correction preserves the early check and rechecks under the transaction lock.
  All six corrected schedules pass on both hosts, while the preserved original
  fails all three held-lock schedules. The complete workflow passes 1,846 checks
  on 442 retained members, all 36 image checks and six static assets pass, and
  both readers verify the current receipt `sha256:6c802f17b8075718811e528aa317faf63fcd77d694f777a7f1a5547fe0275c41`.
  Git and the draft PR record publication. Native conversion starts from this
  deliberately corrected source, preserving the failing original controls.
- **B14 native candidate:** The two workspace/sample libraries pass distinct
  clean qualifications, separate admissions, complete source inspection and
  package checks on macOS and Linux. Both child receipts and ordinary committed
  caches are current. Actual production assembly preserves all 30 public value
  types and 72 unchanged compiling callers. Web materialization passes 866
  private batches across 29 libraries. Both-host production observations cover
  all 806 workspace records, 31 sample records, ten populated workspace controls,
  six contention schedules and 60 sample controls with 53 rollback positions.
  The canonical six-case invite-cap regression passes through the native factory.
  Read [admitted acceptance](../architecture/server-workspaces-admitted-acceptance.json)
  and [production consumer acceptance](../architecture/server-workspaces-consumer-acceptance.json).
  The complete 1,846-check workflow, 36 image checks, six static assets, both
  root-owned raw assets and 15 additional offline bundled HTTP controls pass.
  Both readers verify all 35 projections and the current receipt. Read
  [full local acceptance](native-boundary-transfers.json).
  B14 has earned local transfer acceptance. Publication is recorded in Git and
  the existing draft PR. The full native program and public tester remain open.
- **B15 source formatting:** The 47-library candidate passed 1847 application checks and 36 image checks, but the staged diff check caught 180 trailing spaces in compiler-produced type declarations. Candidate4 removes only those spaces from six bindings; complete syntax/type printing and emitted CommonJS/ESNext JavaScript are byte-identical. Preserve the passed candidate and require new full acceptance for the final source bytes before publication.
- **B15 integration reader:** The first complete 47-library run exposed a test
  reader that parsed action literals from retained bodies. Read actual public
  exports through the qualified bindings and preserve the route inventory and
  every-action stale-revision checks. Original and qualified arrays agree;
  missing exports, service calls and an extra uncovered action are refused.
  Preserve the failed candidate and require a fresh complete acceptance.
- **B15 admission correction:** [Issue #77](https://github.com/liminalworksinc/align/issues/77)
  reproduces the 1,000-goal admission race on both hosts using independent SQLite
  connections and a third held writer. Three held schedules per host leave 1,001
  goals with matching versions and audits; ordinary and full-cap controls pass.
  Preserve the early refusal and recheck inside the write transaction immediately
  before insertion. The existing low-level sample insertion remains unchanged.
  The corrected retained-source checkpoint passes all seven source controls on
  each host, the complete 1,847-check workflow, 36 fresh image checks and 18
  additional offline bundled HTTP controls on 447 members. Both readers verify
  current receipt `sha256:6c6de36e107fb2cf623606005829ea579b222c0d3be159cc122504add5d5cdfd`. The existing single-process
  HTTP path already preserves the cap and the runtime refuses a second server;
  the service gap is not labeled a proven public HTTP exploit. The old source
  and failed probes remain preserved. This accepts no partial B15 native transfer
  or public tester. Git and the draft PR record publication separately.
- **B15 native transfer:** All twelve qualified libraries have separate fresh
  admissions, complete source review, both-host package and actual binding
  acceptance, exact public types and unchanged compiling callers. The combined
  candidate passes 956 web batches, all 1,847 application checks, 36 fresh image
  checks and 18 additional offline bundled HTTP/SQLite controls. Both readers
  verify all 47 projections and the current receipt. Local transfer acceptance
  is recorded in [the exact ledger](native-boundary-transfers.json). This does
  not complete ADOPT-002 or any public tester gate.
- **B16 native transfer:** All nine libraries have current local readiness and
  both-host actual caller acceptance. The current 56-library candidate passes
  1,046 web batches, all 1,847 application checks, 36 fresh image checks and
  18 unchanged offline HTTP/SQLite controls. Twenty-one passed assertions cover
  fourteen required interaction groups. Both readers verify all 56 projections
  and the current receipt. The [exact ledger](native-boundary-transfers.json)
  records local acceptance; ADOPT-002 and public tester gates remain open.
- **Account and membership scope:** Preserve all seven account operations and
  both membership lifecycle operations through two supplied-service factories.
  Account captures 21 resources; lifecycle captures six. The caller retains SQL
  and transaction ownership. Account uses the explicit membership-removal port.
  The typed host bindings preserve the existing lifecycle/session/workspace cycle.
- **Account and membership evidence:**
  - [x] Preserve both complete sources and characterize 72 source records and
    37 altered-source controls on both hosts.
  - [x] Prepare original-free acceptance for 50 public records, 77 binding checks,
    seven adaptive fault operations and eleven provider-table boundary records.
  - [x] Normally promote the Component and target; qualify two distinct clean
    generations with four independent batches each. Inspect both live requests.
  - [x] Admit a separate generation with eight generated smoke tests; pass
    independent acceptance and all 50 public records on both hosts. Inspect its
    live request and preserve all 47 reviewed authority files.
  - [x] Complete child documentation, portable cache and current receipt through
    normal commands, with cache reuse and no additional generated source entry.
  - [x] Register the ready child and pin its admitted consumer through normal
    transactions. Preserve all 29 prior registry and consumer records.
  - [x] Execute actual typed host imports and production materialized routes on
    both hosts. Preserve all 50 public/provider records and seven adaptive faults.
  - [x] Prove exact public namespace types in both directions, nine value types
    and PasskeyRow. All seven external callers remain exact and compile.
  - [x] Load actual account, lifecycle, session and workspace modules from all
    four entry directions on both hosts; call actual session cleanup. Surrounding
    ports are controlled in this focused cycle check.
  - [x] Complete configured authentication/store/dependency composition through
    the unchanged full application workflow, with exact source membership.
  - [x] Pass the immutable production image and current parent receipt gates.
  - [x] Freeze helper transfer acceptance only after those complete gates pass.

See the [account and membership acceptance record](../architecture/server-account-lifecycle-admitted-acceptance.json).
That completed 30-library checkpoint is published at `a39a99b3`, with passing
remote CI, 1,845 application checks and 36 image checks. Its source, immutable
packages and receipt remain preserved.

- **Workspace admission and local startup scope:** The candidate registers 32
  independently qualified libraries. Workspace admission preserves all nine
  functions, three stable mutable arrays, Creator and the complete 217324-byte,
  10083-domain asset through three factories with 16, 18 and one resources.
  Local owner startup preserves one asynchronous zero-argument function through
  seven caller-owned resources. Four typed host modules retain configuration,
  stores, transactions, authentication, errors and operation-time host readers.
- **Independent helper evidence:**
  - [x] Preserve all four complete original modules and the full domain data.
  - [x] Promote reviewed intent through signed authorized-policy review with
    separate acceptance opt-in. Preserve raw source observations and drafts.
  - [x] Qualify two distinct clean generations for each helper. Workspace
    admission passes four batches per run and eight/four generated tests; local
    startup passes two batches and four generated tests per run.
  - [x] Admit a separate generation for each helper, with six/three generated
    smoke tests and all independent acceptance. Keep 51/46 protected files exact.
  - [x] Prove both admitted packages on macOS and Linux, including exact full
    asset bytes, named imports, 94 workspace observations, 64 bindings and
    three adaptive faults; startup passes 59 observations and seven capture
    failures. Inspect live requests without private source or acceptance payloads.
  - [x] Complete both children's normal documentation, project-committed cache,
    cache reuse, entrypoint, verification and current-receipt gates.
  - [x] Register both ready children through separate normal plan/apply
    transactions and preserve every previous registry and consumer record.
  - [x] Execute the four actual typed host modules on both hosts. Workspace
    retains all 94 observations and loads from three entry directions. Startup
    retains all 58 functional host observations; its resource-container capture
    case remains separately qualified and admitted.
  - [x] Preserve all 13 value types, Creator and three readonly tuple types.
    All five external callers remain exact and compile.
  - [x] Materialize 26 web libraries through 795 batches and five operator
    libraries through 218 batches. Both new packages and the domain asset are
    byte exact. Forty operator files and all five package entries remain exact;
    the parent-manifest marker binds the new manifest as required.
  - [x] Complete configured authentication/store/startup composition and every
    complete application build, test and package phase on one 438-member source.
  - [x] Pass all 36 image/header/startup checks and exact raw runtime-asset
    custody with app-user write refusal, against the same 438 implementation inputs.
  - [x] Complete parent receipt, source/image equivalence and both verification
    runtime gates before accepting either helper's source transfer.

The first image passes all 36 canonical, header and startup-refusal checks, but
its actual raw-asset scan finds no full original JSON file. That image and its
source remain preserved. The retained B26 Docker assembly now explicitly copies
the reviewed JSON into a root-owned runtime data directory. The corrected image passes all 36 checks and the exact raw-asset gate; the
root-owned regular file refuses writes by UID 1000. The selected child target already owns the runtime-custody contract;
complete B26 native conversion remains open.

See the [workspace and startup acceptance record](../architecture/server-identity-admission-admitted-acceptance.json).
The 32-library checkpoint passes the complete build, test and package workflow
with 1,845 checks, zero failures and zero skips on one 438-member source
`sha256:6af01984df14a122040f769df349ed7a82d7b157424ff0165a3213257c3bd1f1`. All 36 image checks, six static assets and the exact
root-owned runtime data pass. The operator closure retains five qualified
packages and 41 exact files. Current and CI-pinned verification each pass three
gates with two declared optional skips. Both readers verify all 32 qualified
projections using exact revision `7adbe112`. The tested build driver remains
pinned at `4d672137`. Current parent receipt: `sha256:7fa9ae736adce3b48aee21383419623656db736e50a6128a02cab10dbdafd0c6`.
The ordinary source artifact and previous publication remain preserved;
checkpoint publication is recorded separately in Git and the draft PR. Complete B13 and all 31 native boundary closures remain open. The historical
32-library run above remains evidence for that exact source and receipt. The
authentication candidate below supersedes its pending-intake status.

- **Authentication lifecycle scope:** Preserve the complete original module,
  four constants, nine functions and 52 caller-supplied resources. Signed policy
  review authorizes local static intake only; Sensitive classification remains.
  Two fresh clean generations pass 35 batches each. A separate admitted artifact
  passes the same batches and 264 source plus 68 binding observations on both hosts.
  The typed production assembly preserves all 13 public value types and seven
  unchanged callers. Actual configured Better Auth/passkey 1.7.10 checks preserve
  complete schemas, populated migrations and 12 code/sign-in records per host.
  The previous admitted candidate was refused after source review exposed
  uncovered getters, coercion and failure-order differences. 48 additional
  observations and six added batches now retain those original boundaries;
  all 23 prior expectations are unchanged.
- **Authentication lifecycle evidence:**
  - [x] Qualify two clean generations and admit a separate candidate.
  - [x] Verify exact signed intake, result binding, retained custody and input separation.
  - [x] Pass both-host package, binding, callback and configured-provider acceptance.
  - [x] Finish child readiness and register it normally, preserving prior 32 pins.
  - [x] Accept exact production host assembly, all 13 public types and seven callers.
  - [x] Pass the full application and 36 image checks against the final source.
  - [x] Record a current parent receipt and complete reviewed functional acceptance.
  - [ ] Obtain human confirmation of the moved authentication checks and close B13 transfer.

The complete build, test and package workflow passes 1,845 checks with
zero failures and skips on the same 441-member source `sha256:7e92a2b1db1b49f334a96b7ddb4cd5fb334d1e420b5c67b4093655b0e26e4112`.
All 36 image checks, six static assets and exact root-owned domain data pass.
Production and provider inputs are byte-exact with the checked image. Three test
fixtures changed to exercise admitted code; the original failed run is preserved.
The unchanged 150 ms p95 hook requirement passes with networking blocked.
Current and CI readers each pass three gates with two declared optional skips
and explicitly verify all 33 qualified projections. Current parent receipt:
`sha256:84b86b98e0b05ae2254a5512803c0b1832dc29d1101b11a863cd3a7448b43d6a`. Actual checkpoint publication is recorded
separately in Git and the draft PR.

See [authentication acceptance](../architecture/server-auth-admitted-acceptance.json).
No public tester URL, live QA or actual operator security acceptance is claimed.


- **Sign-in effects scope:** Continue B13 by transferring the complete mail and
  captcha helper surfaces. The five functions and two constants use 15 explicit
  caller-owned resources. The host keeps configuration, delivery, filesystem,
  configured middleware and its existing public error class. Preserve public
  names/types, detached calls, current values, effect order and failure identity.
  This routine child passes ordinary static source intake. The separate sensitive
  authentication intake now has its exact signed policy review and qualified
  child. This helper does not change those guards or close B13.
- **Sign-in effects evidence:**
  - [x] Preserve both source files and observe all public behavior on both hosts.
  - [x] Author and normally promote complete Component/Node contracts, then pass
    two independent clean qualifications with four acceptance batches each.
  - [x] Complete a distinct forced generation, retain all 46 authority files,
    and pass 73 behavior and 66 binding checks on each host. This includes six
    real filesystem and 17 actual configured middleware observations.
  - [x] Complete child documentation, local cache and current-receipt readiness.
  - [x] Register the exact ready child and materialize its locked public import.
  - [x] Integrate only the typed shared host binding and public aliases. Preserve
    all actual caller bytes, public types and prior provider records.
  - [x] Complete actual consumer checks, full application/image acceptance and
    current parent receipt before retiring retained source authority.
The complete 29-library build, test and package workflow passes
1,845 checks with zero failures or skips against the same 432-member
source `sha256:78959a3818d9160150f0d5c2342d8dcf5b22386a6f1ddc983d49d03afa3f7ddf`. This includes a fresh Next build and
application type checking. The unchanged serial hook test passes its 150 ms p95
requirement with networking blocked. All 36 image, response-header and startup
refusal checks pass against `sha256:610cd6bacd60287b521348c12cf9928b923db9bb41217c4a4233b8f2d29e9f4c`. The exact operator runtime
retains 41 files and five qualified packages. The image source copy matches the
full-workflow candidate. Both current and CI-pinned verification pass three gates
with two declared optional skips. Current parent receipt: `sha256:e76f566893882153d6c82180fbed7dc9579ce664d94ebe603fe65f2279d2f059`.

The sign-in-effects child has two clean qualifications, a distinct admitted
generation and normal local cache/registration custody. Actual consuming imports
pass all 73 controlled, filesystem and configured middleware observations on each
host. All seven public export types match and the three unchanged direct callers
compile. The supplied public error class and current host providers retain their
owners. The child package's separate 66 interface checks pass on both hosts.

This completes this helper's local transfer acceptance. The separate complete
authentication module, other identity helpers and full B13 closure remain open.
The full 31-boundary program, public tester URL, operator security review and live
smoke also remain open. Commit, push and deployment require specific approval.

The [admitted-package record](../architecture/server-identity-effects-admitted-acceptance.json)
binds the exact candidate/source identities and both host results. It proves the
child package checks. The [actual consumer record](../architecture/server-identity-effects-consumer-acceptance.json)
adds 73 behavior observations on each host through the three actual typed
binding/alias files, exact equality for all seven public export types and
compilation of all three unchanged direct callers. Complete application/image
acceptance and the current parent receipt pass as recorded above. Live gates remain
open.

- **Core/event scope:** Cover all of `lib/v2/core.mts` and `lib/v2/events.ts`:
  public types and mutable event data, existing qualified aliases, creation codes,
  access-request decisions, workspace deletion/purge, email delivery and formatting,
  and application event wrappers. Database transactions remain caller-owned.
  Authentication, domain callers, operator command dispatch, retention and UI keep
  their owners. Owned database, clock and email providers establish this boundary;
  no real email or external endpoint is used in source observations.
- **Core/event test correction:** The first complete parent run exposed a B27
  test reader coupled to a literal source declaration. Its schema parser returns
  NaN after the typed bridge delegates SCHEMA_VERSION, while the actual runtime
  export and real databases remain at version 22. Read the public runtime export
  without changing the expected version or migration assertions. The generated
  library, Component, target, qualification and provider pins remain unchanged.
  Preserve the failed run and repeat complete parent acceptance for this source.
- **Core/event type projection:** The first full lint gate rejected 12 explicit
  empty-object type literals in the exact public event-table projection. Preserve
  those non-nullish empty-record types as `Record<never, never>`, verify exact
  public type equality and byte-identical emitted JavaScript, and retain the
  existing lint rule. Generated source and behavioral authority remain unchanged.
- **Core/event evidence:**
  - [x] Preserve the exact two source files from reviewed tree 183485db.
  - [x] Enumerate the complete runtime and type surfaces, capture meaningful
    populated, failure and recovery observations on macOS and Linux, and reject
    altered controls before new specifications.
  - [x] Author Component, Node target and source-independent private acceptance.
  - [x] Qualify two clean generations, then a separate admitted build with original
    implementations and private verification commands excluded from generation.
  - [x] Preserve actual consumers, public types, all callers and prior 27 provider
    records, then complete production, application/image and current-receipt gates.
The complete build, test and package workflow passes 1,845 checks
with zero failures or skips against the same 429-member source
`sha256:6a376cfb42c38ef654975b5b40e25f05b7347ba7c07c023c9953507af6d8e1f0`. This includes a fresh Next build and its actual
application type checks. The unchanged serial hook test passes its 150 ms p95
requirement with networking blocked. All 36 image, response-header and startup
refusal checks pass against `sha256:c3b340a550ebf69b7d27c70c237105a396c5af8eb55dbaa5dd7f07fda30c2af7`. The exact operator runtime
contains 41 files and five qualified packages. The image source copy matches the
frozen candidate; Docker's declared allowlist selects its actual build inputs.
Both current and CI-pinned verification pass three gates with two declared
optional skips. Current parent receipt: `sha256:8877d1818e17addadd3f6e7023bfda6d055254c20ad1c7e9a99f488da39f3075`. The consumer observation
retains its pre-run snapshot; these are the subsequent complete acceptance results.

- **Client-key scope:** Preserve `clientNet` and `clientOf` together, including
  trimming, case, brackets, zones, IPv6 grouping, IPv4-mapped addresses, existing
  loose invalid-input behavior, fresh configuration reads and exact header
  presence/default handling. The caller owns the configuration provider and
  request headers. Rate-limit storage, thresholds, proxy trust, authentication
  and request handlers keep their existing owners.
- **Client-key evidence:**
  - [x] Freeze exact source, observe both public exports and effect failures on
    macOS and Linux, and reject meaningful altered controls before authoring specs.
  - Baseline: 11 matching batches cover 1,995 normalization inputs on each host;
    all 16 altered source controls are rejected. Configuration and header-access
    ordering, provider failure identity, real Requests and mode changes are observed.
  - [x] Author Component, target and source-independent acceptance contracts.
  - Private verifier and ordinary profile commands pass on macOS and Linux:
    four positive formats preserve all 11 batches; 16 semantic, 10 binding and
    18 ambient controls are rejected on each host. The first generated package
    correctly failed strict export-map admission because an authored capability
    implied `create` while the target requested `create_client_keys`. The corrected
    capability `server-client-keys.create-client-keys` now has that exact locked
    module and symbol. Its fresh oracle binds all 11 cases. Source algorithms and
    every profile argument and expected result remain unchanged. Two clean
    generations pass all 11 independent batches each, followed by separate
    admission. The admitted build passes 18 generated tests and ordinary library
    acceptance. Its current receipt, local cache and contributor readiness are
    complete, preserving all 46 reviewed authority files.
  - [x] Qualify two clean generations and a separate admitted build with original
    source and private verification commands excluded from generation requests.
  - [x] Preserve actual consumer observations on both hosts, public types and all
    six unchanged callers; keep the prior 26 registry and consumer records exact.
  - [x] Pass production assembly, complete application/image workflows and a current
    parent receipt before selecting another transfer.
- **Request scope:** Preserve both public helper namespaces, hosted and local
  origin checks, bounded body streaming and cancellation, credential selection,
  provider ordering, response identity, status/headers and hosted log redaction.
  Configuration, error constructors, authentication, device lookup, readiness
  and network-key providers retain their existing owners. No endpoint, session
  implementation, database operation or security policy changes in this transfer.
- **Request evidence:**
  - [x] Capture exact source and public types, then observe all public operations,
    effect ordering and meaningful rejected controls on macOS and Linux.
  - Source evidence: all 18 runtime exports, 46 matching batches and 24 rejected
    controls on macOS and Linux. Two clean generations pass all 46 batches each;
    a separate admitted build passes six generated tests and ordinary acceptance.
    All 47 reviewed child authority files remain exact. The current child has a
    portable local cache and completed contributor readiness. Both actual typed
    consumers preserve every source record on both hosts, and their public types
    assign both ways. Production web assembly accepts 717 batches in 20 libraries.
  - [x] Qualify two clean generations and a separate admitted build without
    original source or private verifier code in generation requests.
  - [x] Prove actual consumers and public types, preserving all prior provider records.
  - [x] Pass complete application/image workflows and current parent receipt gates.
- **Readiness scope:** Preserve one shared promise across callers and module
  instances, connection-before-auth-before-application migration ordering, exact
  rejection identity and retry after a failed attempt. Bind to caller-owned state,
  connection and migration providers. Authentication, schema, database execution,
  request handlers and later instrumentation retain their existing owners.
- **Readiness evidence:**
  - [x] Freeze the exact source, detached API and concurrent/failure observations
    on macOS and Linux; demonstrate meaningful rejected controls.
  - [x] Qualify two independent clean generations and a separate admitted build
    without including the original implementation in generation requests.
  - [x] Check actual callers and public types, then repeat the complete workflow,
    image and current receipt gates for the integrated source before continuing.
- **Evidence:** Phase 1.2 lift-and-shift identity `sha256:316a4e6b641a46788febb1c21b004ad3c00b6d812c10006deb1d05a48207aa49`.
- **Continuation direction (2026-11-04):** Finish the complete native rewrite program
  and resolve its litai follow-ups. Qualification of an isolated library is an
  intermediate result. Completion requires actual consumer integration, verified
  source retirement, every inventory classification, and full application parity.

The storage service completes local acceptance as the twenty-second qualified
library. Two distinct clean generations pass 44 independent cases each, followed
by separate admission. Its actual typed consumer preserves 43 frozen source cases
on macOS and Linux, and all thirteen public exports remain type compatible. The
other 21 consumer records remain exact. Build, test and package pass 1,845
application checks with zero failures or skips against the same 416-file source:
`sha256:0509b93cf46051b47cf1bc0d6983d579fe4694dd1ba5fa5bdd94f1b8cee36a1f`. All 36 image, header and startup checks pass against
`sha256:b4b81af81d8a0c83961f371ff47ff335328d0e7dbc67ac89be50a1dfe7f18701`. The image preserves the exact 29-file operator runtime and
three qualified packages. Both current and CI-pinned verification pass three
gates with two declared optional skips. The current parent receipt is
`sha256:16bb7dc363ffba4484d96546f879ae2b7786236f872dfd3461dda9ace180d55b`. The [consumer record](../architecture/storage-runtime-consumer-observation.json)
preserves the earlier pre-run observation snapshot; this queue records the later
complete acceptance. This candidate remains separate from the existing staged
publication checkpoint. ADOPT-002, the public tester URL, operator security review
and live smoke remain open. The draft PR remains at its existing published head.

The next isolated candidate adds qualified `local/server-secrets`. Two distinct
clean generations each pass 36 independent cases, followed by separate admission.
Its actual core and web consumers preserve all 35 original cases on macOS and
Linux, including both lexical signing callers. The complete core public namespace
remains type compatible. Both hosts pass all six operator signal comparisons.
All fifteen operator command comparisons also pass on each host, including
transaction rollback. Build, test and package pass 1,845 application checks
with no failures or skips against the same 419-file source `sha256:6cdce3f2f69691e7dceaef1d1437d1d5141fb3846f8106be9182f169bcfc2936`. All 36
image, header and startup checks pass against `sha256:8fe5ef017c0841ac45846cb2c78e6cbf62b1a18376202f07580e2593bac3c130`. The operator
runtime matches its exact 34 files and four packages. Both current and CI-pinned
verification pass three gates with two declared optional skips. Current receipt:
`sha256:512923c3c7cfef1a8a4c95920556da9f9eb9b88e7e87808a0e26aa7f6f0b0766`. The [secret consumer record](../architecture/server-secrets-consumer-observation.json)
preserves the pre-run snapshot; this queue records subsequent full acceptance.
Library counts do not measure completed boundaries in the full 31-boundary program.
This candidate remains local, and the public tester gates remain open.

The first container attempt rejects startup permission acceptance under the
root build user. A focused check reproduces that exact rejection. The corrected
build target owns its application files as `node` and runs native acceptance,
operator preparation and compilation as that unprivileged user. Runtime entry
behavior and the private permission checks remain unchanged. Full and image
acceptance now pass against this corrected source, as recorded below.

The isolated startup candidate adds the twenty-fourth qualified library. Two
clean generations each pass 40 batches covering 79 private observations. The
actual typed startup consumer preserves all 78 original source records on macOS
and Linux. Six natural-exit scenarios pass on each host, including replacement
ownership and captured paths. Namespace types assign in both directions, and the
unchanged instrumentation caller compiles. The production web adapter accepts
631 batches across 18 libraries. All prior 23 registry and consumer records stay
exact. See the [startup consumer record](../architecture/server-startup-consumer-observation.json).
The complete build, test and package workflow passes 1,845 checks with
zero failures or skips against the same 421-file source `sha256:66cded58e93ce4523fe1e60bd2b1a321a2815969f8af260f7df31a2598140a0f`.
All 36 image, response-header and startup-refusal checks pass against
`sha256:952d1958a7c7e62301f1dee4163b4a019083bf0f22dfb80715c97e190dd32251`. The operator runtime matches its exact 34 files and four
qualified packages. The build stage now runs acceptance and compilation as the
unprivileged node user; its runtime stage and private permission checks are unchanged.
Both current and CI-pinned verification pass three gates with two declared optional
skips. Current receipt: `sha256:35a1153632dd27cc4dd4e52e007a4397ba9cd8632361de57db42194959a35e90`. The consumer observation is the earlier
pre-run snapshot; this queue records subsequent full acceptance. No public tester
URL or live QA gate is complete. Library counts do not close the 31-boundary program.

The isolated readiness candidate adds the twenty-fifth qualified library.
Two distinct clean generations each pass 40 independent observations. A separate
admitted build passes generated tests and ordinary acceptance, and cached rebuilds
establish a current child receipt without new generation. The actual typed
consumer preserves all 40 original source records on macOS and Linux. Public
namespace types assign in both directions, and the unchanged instrumentation
caller compiles. The production web adapter accepts 671 batches across 19
libraries. All prior 24 registry and consumer records remain exact. See the
[readiness consumer record](../architecture/server-readiness-consumer-observation.json).
Authentication, schema, database execution, startup and request effects retain
their existing owners. The complete build, test and package workflow passes 1,845 checks
with zero failures or skips against the same 423-member source
`sha256:7bddf6f110d8876451eec06e3cb6a07728ec5463543d7034270b62392a704334`. The unchanged serial hook test passes its 150 ms p95
requirement with networking blocked. All 36 image, response-header and startup
refusal checks pass against `sha256:0d127f8d0767a518c632d8d58f9ae26d5da6c3b0f147ab44bfcd736111b342f8`. The image preserves the exact
34-file operator runtime and four qualified packages. Its source copy matches the
frozen candidate; Docker's declared allowlist selects its build inputs.
Both current and CI-pinned verification pass three gates with two declared
optional skips. Current parent receipt: `sha256:28e7a4bbf6f7947e610953ffcd3c5c15bc8c825baf01c6e2350a8ea62a9dc4fc`. The consumer record retains
the earlier pre-run observation; this record adds the later complete acceptance.
The complete 31-boundary program remains active. The public tester URL,
operator security review and live smoke gates remain open.

The isolated request-helper candidate registers the twenty-sixth qualified
library. It replaces both public HTTP helper modules with typed aliases to the
admitted provider. All 46 actual-consumer batches match on macOS and Linux.
Both public namespaces and principal types assign both ways; the unchanged
instrumentation and three actual request callers compile. Production web
assembly accepts 717 batches across 20 libraries. All prior 25 registry and
consumer records remain exact. See the
[request consumer record](../architecture/server-request-effects-consumer-observation.json).
Authentication, device storage, configuration, readiness, error implementations
and endpoints keep their existing owners. The complete build, test and package workflow passes 1,845 checks
with zero failures or skips against the same 425-member source
`sha256:bc5e80205c9d00b48cf95bd364a669565edc4e4f31090d6883f4b180d16556b0`. The unchanged serial hook test passes its 150 ms p95
requirement with networking blocked. All 36 image, response-header and startup
refusal checks pass against `sha256:2ad64297381e5c36955eedf3b34864c4433b8d7f96b2a3dce2cc5e340f5667ee`. The operator runtime preserves
the exact 34 files and four qualified packages. The image source copy matches
the frozen candidate; Docker's declared allowlist selects its actual build inputs.
Both current and CI-pinned verification pass three gates with two declared
optional skips. Current parent receipt: `sha256:37a6ceb01b22646cd53fd49e102e0ef2e27bead3a2f4c2e73c2feb1950e8f904`. The consumer record retains
its pre-run snapshot; these are the subsequent full acceptance results.
The complete 31-boundary program remains active. The public tester URL,
operator security review and live smoke gates remain open.

The isolated client-key candidate registers the twenty-seventh qualified
library. Its typed `lib/ratelimit.ts` binding preserves both public exports and
all 11 source observation batches on macOS and Linux, covering 1,995 normalization
inputs per host. The public namespace assigns both ways and all six unchanged
callers compile. Production web assembly accepts 728 batches across 21 libraries.
All prior 26 registry and consumer records remain exact. See the
[client-key consumer record](../architecture/server-client-keys-consumer-observation.json).
The complete build, test and package workflow passes 1,845 checks
with zero failures or skips against the same 427-member source
`sha256:2f1050746a1ca22c28f5f54545d9e6da233a81f6f53a23a2dba832a122e8ce6b`. The unchanged serial hook test passes its 150 ms p95
requirement with networking blocked. All 36 image, response-header and startup
refusal checks pass against `sha256:db5154af4a99f8cc39b7d125ed57b7a29665bea1bc3713b2abd1f2b88a807154`. The exact operator runtime
contains 34 files and four qualified packages. The image source copy matches
the frozen candidate; Docker's declared allowlist selects its actual build inputs.
Both current and CI-pinned verification pass three gates with two declared
optional skips. Current parent receipt: `sha256:7461673a27c26afd0a4401d25aabc25e2d24346210d7e1365ba4380ad017b5f3`. The consumer record retains
its pre-run snapshot; these are the subsequent full acceptance results.
The full 31-boundary program remains active. The public tester URL,
operator security review and live smoke gates remain open.

<a id="context-001"></a>

### [x] CONTEXT-001 - Preserve context priorities and ask attribution under clipping

- **Priority:** P1
- **Owner:** Agent envelope, B10
- **Direction:** Enforce the existing goal-envelope and accepted-ask delta requirements before native envelope qualification.
- **Conclusion:** The current budget loop keeps parent measures while dropping the bound goal's measures. The single-ask fallback drops both attribution and earlier closing counts. Preserve all limits, quote boundaries, attribution, closing counts and existing character budgets.
- **Depends on:** none
- **Implementation:**
  - [x] Drop parent measures before reducing the goal's own measures under budget pressure.
  - [x] Keep who asked, the date, who accepted and earlier closing counts in the clipped single-ask note.
  - [x] Add direct and hook regression cases, and recapture the corrected envelope baseline before qualification.
- **Evidence:**
  - [x] Canonical clipping priorities, attribution and closing counts pass with long legal field values, without enlarging any budget or removing limits.
  - [x] Complete retained application workflow and current receipt against the corrected source.
  - [x] Native envelope qualification against the corrected source.
- **Verification follow-up:** The first corrected full run passes 1,816 checks and fails the share-state property at seed `1630038945`, after `align stop-sharing` then an older build writes. The same seed reproduces locally. Diagnose its state preconditions and preserve stop/hold and private-session invariants before rerunning the full gate; do not skip the seed or relax the assertion.
- **Failure diagnosis:** The chosen fake-server session belongs to an earlier device pairing. The current pairing cannot receive its directive, and its local share has ended. Correct the property action's ownership precondition, keep the denial assertion for every deliverable stop/hold, retain the reported seed permanently and add a deterministic old-pairing isolation regression.
- **Reproduction:** Direct probes of the unchanged source show a limit-bearing envelope retaining parent measures while showing only six of eight own measures, and a long one-ask delta of 187 characters with no attribution or closing count. The implementation and canonical requirements are recorded in the [rewrite program](native-rewrite-program.md#b10-notice-helper-preflight). Tracker search finds no matching issue. No external issue is posted.

### [x] PRESEED-001 — Retire the hosted closing date

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (hosted config)
- **Direction:** Hosted Align must not require ALIGN_DELETE_BY or shut itself down; it was a demo-era restriction.
- **Conclusion:** Remove the closing-date check, the 410 close and their tests; data lifetime is governed by PRESEED-004's retention schedule.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Remove ALIGN_DELETE_BY from lib/config.ts, startup, proxy, Dockerfile, fly.toml and docs
  - [x] Update the hosted startup requirement in specs/align
- **Evidence:**
  - [x] test-v2 passes with no closing-date checks
  - [x] litai spec validate passes

### [x] PRESEED-002 — Hosted workspace creation gate and request access

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (workspaces)
- **Direction:** Gate hosted workspace creation behind single-use creation codes and a request-access form answered by hand; local mode stays open. Folds in the request-access and follow-up/LOI calls to action from GitHub issue #30.
- **Conclusion:** Codes are issued by an operator script (the v2 replacement for ws-admin); a global workspace cap and a creation kill switch are environment settings.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Creation codes: hashed, single-use, expiring; required to create a hosted workspace
  - [x] Request-access form under /app with a separate follow-up/LOI interest choice; operator script lists, approves and issues codes
  - [x] ALIGN_CREATION (codes|open|closed) and ALIGN_MAX_WORKSPACES
- **Evidence:**
  - [x] test-v2 checks: creation refused without a code, code single-use, cap and kill switch, request stored
  - [x] Spec requirements updated and validated

### [x] PRESEED-003 — Abuse controls for hosted sign-up

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (auth)
- **Direction:** Add cheap abuse controls before inviting outsiders: bot check, durable rate limits, disposable-domain block, per-account caps.
- **Conclusion:** Turnstile through Better Auth's captcha plugin when keys are set, including the email-code send route; database-backed rate limits; disposable-domain block at workspace creation and access requests; environment-tunable caps.
- **Depends on:** PRESEED-002
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Captcha plugin with Turnstile on email-code send, sign-in, access requests and workspace creation
  - [x] Database-backed rate limits with per-IP and per-email rules for code sends
  - [x] Disposable-domain list and block
  - [x] Caps: owned workspaces per account, members per workspace, sessions per device per day
- **Evidence:**
  - [x] test-v2 checks with a local captcha verify stub, rate limits, block and caps
  - [x] Spec requirements updated and validated

### [x] PRESEED-004 — Account deletion and the retention schedule

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (lifecycle)
- **Direction:** People can delete their account, and data has a published lifetime.
- **Conclusion:** Session rows 13 months then rolled up without the person; audit log 1 year; removed members shown as Former member after 30 days; deleted workspaces restorable for 30 days then purged; Fly snapshots 7 days.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Account deletion with fresh sign-in and last-owner guard
  - [x] Workspace soft delete, restore and purge
  - [x] Daily retention job: session roll-up, audit trim, former-member pseudonymisation, purge
  - [x] Published retention schedule (docs and spec); fly.toml snapshot retention
- **Evidence:**
  - [x] test-v2 checks with a controllable clock for every retention rule
  - [x] Spec requirements updated and validated

### [x] PRESEED-005 — Passkeys, session cap and sign-out everywhere

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (auth)
- **Direction:** Offer passkeys, cap sessions at 30 days absolute, add sign-out everywhere, and require a fresh sign-in for every sensitive action.
- **Conclusion:** Use @better-auth/passkey pinned to the better-auth version; keep 7-day rolling sessions.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Passkey add, list, delete and sign-in with autofill
  - [x] 30-day absolute session cap
  - [x] Sign out everywhere, optionally unpairing devices and disconnecting apps
  - [x] Fresh sign-in on device approval, MCP consent, role changes, removal, transfer and deletion
- **Evidence:**
  - [x] test-v2 checks including a virtual authenticator passkey sign-in
  - [x] Spec requirements updated and validated

### [x] PRESEED-006 — Evidence on change requests

- **Priority:** P1
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (change requests)
- **Direction:** Evidence is advisory: typed links labelled by who reported them, an Align-attached goal snapshot, and an audited approval without evidence.
- **Conclusion:** Evidence is frozen per revision; agent-reported evidence is never shown as verified.
- **Depends on:** PRESEED-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Typed evidence links per revision (pr, ci_run, incident, dashboard, doc, other), https only
  - [x] Server-computed goal snapshot per revision
  - [x] Approved without evidence recorded in the decision and audit log
  - [x] Requests tab and MCP show evidence and its source
- **Evidence:**
  - [x] test-v2 checks for links, freezing, snapshot and the audited approval
  - [x] Spec requirements updated and validated

### [x] PRESEED-007 — Funnel events and operator report

- **Priority:** P1
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (metrics)
- **Direction:** Measure activation and retention without content, following the funnel convention in GitHub issue #30.
- **Conclusion:** A content-free events table and an operator report: funnel counts, time to first value, weekly active workspaces, week-1 and week-4 retention, share of sessions and spend bound to goals.
- **Depends on:** PRESEED-002, PRESEED-004, PRESEED-005, PRESEED-006
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Events table and recording points from access request to first MCP read
  - [x] Operator-recorded LOI sent and signed events; nothing self-asserted counts as signed
  - [x] Operator report script
- **Evidence:**
  - [x] test-v2 checks that each event is recorded once and holds no content
  - [x] Spec requirements updated and validated

### [x] PRESEED-008 — Security pack and public trust pages

- **Priority:** P1
- **Release target:** 2.0.0
- **Owner:** documentation / components/legacy-project-wrapper/implementation (public pages)
- **Direction:** Publish what buyers and directories ask for: privacy policy, DPA, subprocessors, retention, security overview and questionnaire answers.
- **Conclusion:** Drafts marked for counsel review, accurate to the code; public /privacy and /trust pages so the hosted allowlist serves them.
- **Depends on:** PRESEED-004, PRESEED-007
- **Completion prerequisites:** none
- **Implementation:**
  - [x] docs/trust: privacy policy, DPA note, subprocessors, retention, security overview, questionnaire answers
  - [x] Public /privacy and /trust pages and allowlist entries
- **Evidence:**
  - [x] test-v2 checks the pages are served hosted
  - [x] Every claim cross-checked against the code

### [x] PORT-001 — Port foundation: schema, stubs and test slots

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (v2 schema)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** One additive migration (limits_json, asks, ask mentions, value reports, event indexes), stub modules and empty UI and test slots so the ports build in parallel.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Migration 11, SCHEMA_VERSION 11, EVENT_PROPS and PERSON_COLUMNS additions
  - [x] Stub modules and UI slots; test marker blocks
- **Evidence:**
  - [x] Full npm test passes on the foundation commit

### [x] PORT-002 — Port limits as goal content and suggestions from notes

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (goals)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** Limits (must / must not / out of scope, at most 5) are part of each goal version, confirmed by the approval set, delivered with goal versions; pasted notes return suggestions and store nothing.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Goal content, hash, change requests and directive snapshot carry limits
  - [x] Suggest route, Goals tab and goal page UI
- **Evidence:**
  - [x] test-v2 port:limits checks
  - [x] Spec requirements updated and validated

### [x] PORT-003 — Port asks and goal activity

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (asks, activity)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** Asks between teams with accept, decline, done, reopen, withdraw and mention; goal activity from bindings, usage and work signals, never prompts; retention for closed asks and value reports.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Asks routes, rules and Asks tab
  - [x] Goal activity data and card
  - [x] Retention rules
- **Evidence:**
  - [x] test-v2 port:asks, port:activity and port:retention checks
  - [x] Spec requirements updated and validated

### [x] PORT-004 — Port MCP tools, paste lines and the decision value card

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (MCP, app surface)
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** align_get_asks, align_get_goal_activity, align_get_limits and align_get_brief under the founder's 2026-10-29 read scoping in v2 terms; quoted paste lines; strict Host; the value card with per-decision value reports and notes; funnel reconciliation.
- **Depends on:** PORT-002, PORT-003
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Four MCP tools with scoping and instructions
  - [x] Paste lines and strict Host
  - [x] Value card, value reports, follow-up link, events and report section
- **Evidence:**
  - [x] test-oauth port:mcp and test-v2 port:value checks; paste-line tests
  - [x] Spec requirements updated and validated

### [x] PORT-005 — Port agent context: limits, accepted asks, drift notice, past sessions

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation/packages/align-agent
- **Direction:** Port the LIM-2437 and LIM-2445 / #30 features merged on main (PRs #32, #33, #35, #36) from the retired v1 app onto v2 without losing behaviour; owner decisions D1-D6 of 2026-10-30.
- **Conclusion:** The hook envelope carries the bound goal's limits and accepted asks as quoted, attributed data; a local-only drift notice shown to the user; align asks; align share --dir --past replaces the import script.
- **Depends on:** PORT-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Limits and accepted asks in the envelope and deltas
  - [x] Local drift notice with an off switch
  - [x] align asks and share --dir --past
- **Evidence:**
  - [x] align-agent tests for each behaviour
  - [x] Spec requirements updated and validated

### [x] REQ-001 — Requests and goal holds: server, app and spec

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (directives)
- **Direction:** Owner decision 2026-10-30: between informing and instructing agents, add typed requests (replan, checkpoint, switch goal) from a goal's approvers and workspace owners, plus an enforced goal hold; safe requests run on their own, anything that changes direction asks the developer first.
- **Conclusion:** New request, hold and release directives with per-session receipts (accepted, declined, auto-accepted), routes and UI on the goal page, audit, retention and MCP read-out; answers the instruct-or-inform open question.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Migration 12: directive kinds, requests, request targets, goal holds
  - [x] Routes, authorization, audit, events and retention
  - [x] Goal page card and hold banners; MCP directives output
- **Evidence:**
  - [x] test-v2 and test-oauth checks for every route, rule and receipt
  - [x] Spec requirements updated and validated

### [x] REQ-002 — Requests and goal holds: local agent

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation/packages/align-agent
- **Direction:** Owner decision 2026-10-30: between informing and instructing agents, add typed requests (replan, checkpoint, switch goal) from a goal's approvers and workspace owners, plus an enforced goal hold; safe requests run on their own, anything that changes direction asks the developer first.
- **Conclusion:** The agent tells the developer about every request, does checkpoints and replan drafts on its own, waits for the developer on switch goal, records accept or decline, and enforces goal holds like the stop latch.
- **Depends on:** REQ-001
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Request intake, notices and Align-written context
  - [x] ::align accept/decline and align requests
  - [x] Goal hold latch that fails closed
- **Evidence:**
  - [x] align-agent tests for each behaviour; live agent-to-server checks
  - [x] Spec requirements updated and validated

### [x] LAUNCH-001 — Launch releases an approved change to agents (#39 D1)

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (change requests)
- **Direction:** Founder ruling LIM-2454 33ad545d and owner answers 2026-10-31: approving records the decision; agents get the new version only at launch; anyone in the goal's approval set or a workspace owner may launch; one-step Approve and launch when the same person may do both; an unlaunched change is superseded if the goal gets a newer version or closes first.
- **Conclusion:** Split the approve transaction: approve holds the version unlaunched; launch (or not yet, replaceable) publishes through writeGoalVersion with goal_version directives in one transaction; MCP, feed and directives show the launched version only.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Approve without publishing; launch and not-yet routes; approve-and-launch
  - [x] Supersede unlaunched changes on a newer version or a closed goal
  - [x] Record wording, MCP outputs, value-card spans from the launch
- **Evidence:**
  - [x] The #39 D1 acceptance test (approve without launching, then launch; not yet; rebase) in test-v2, test-oauth and test-agent-live
  - [x] Spec requirements updated and validated

### [x] LAUNCH-002 — Accept if conditions on a counter (#39 D2)

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (change requests)
- **Direction:** Founder ruling LIM-2454 35376283 and owner answer 2026-10-31: a counter may carry a condition; only the requester acknowledges it, as a separate step from accepting the counter; it never gates approval or launch; no verified state.
- **Conclusion:** A condition field on counter revisions, an acknowledge action for the requester only, shown as Not confirmed yet until acknowledged, exposed through MCP as untrusted text.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Condition on counter revisions; acknowledge route
  - [x] Record UI and MCP outputs
- **Evidence:**
  - [x] The #39 D2 acceptance test in test-v2 and test-oauth
  - [x] Spec requirements updated and validated

### [x] PORT2-001 — Port main's Home attention queue, phone layout and README (#41, #42, #40, #22)

- **Priority:** P1
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (app surface) / README
- **Direction:** main's new v1 work, merged at 5b6d19f with v1 files resolved away, must not be lost on v2.
- **Conclusion:** A v2 Home that shows what needs you and others, active goals and which apps last read the plan, with one evidence class on every agent-status item (#39 E2); /app fits a 390px phone; the root README describes v2 in #22's structure.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Home attention queue on v2 data with evidence classes
  - [x] 390px layout checks
  - [x] Root README for v2
- **Evidence:**
  - [x] test-v2 checks for the queue, evidence classes and phone width
  - [x] Spec requirements updated and validated

### [x] PORT3-001 — Port main's #29: targets, allocation, steering, reallocation

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (allocation, agent)
- **Direction:** main merged #29 (7099ee1) on its old v2 layout; merged at db2be8c keeping the v2 tree, so its behaviour must be rebuilt on v2 without loss.
- **Conclusion:** Rebuild per-goal targets, the allocation view, steering and reallocations on v2's approval sets, directive path, launch and holds; agent-side allocation and steering in align-agent.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Server: targets, allocation, steering, reallocations with migration
  - [x] Agent: allocation and steering in hooks, sync and CLI
  - [x] UI: allocation on Spend, reallocations
- **Evidence:**
  - [x] test-v2 and align-agent tests for each behaviour
  - [x] Spec requirements updated and validated

### [x] PORT3-002 — Port Shruti's Lanes B and C: first run, understand then decide (#43, #47, #49)

- **Priority:** P0
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (app surface)
- **Direction:** main merged #43, #47 and #49 (v1 UI); v2 must keep their behaviour on its change-request page and Home.
- **Conclusion:** Change-request review: compare, what would change, one decision from the server's can flags, confirm before sending, freshness check; decline while a counter waits; a first-run card on Home until an app is seen.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Change-request review and decide flow
  - [x] Decline while a counter waits
  - [x] First-run card on Home
- **Evidence:**
  - [x] test-v2 checks including 390px and focus
  - [x] Spec requirements updated and validated

### [x] PORT3-003 — Port #44 cycle-2 layout fixes and audit the LIM-2455 checklist (#39)

- **Priority:** P1
- **Release target:** 2.0.0
- **Owner:** components/legacy-project-wrapper/implementation (app surface) / design/acceptance
- **Direction:** Shruti's draft #44 fixes phone chrome, Goals map stacking, tap targets and app copy on v1; her draft #39 is the founder's v2 acceptance checklist.
- **Conclusion:** Apply #44's intent where v2 has an equivalent; audit every #39 item to pass, fixed or open with a reason in design/acceptance/LIM-2455.v2-audit.md.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] #44 fixes on v2
  - [x] LIM-2455 audit with fixes
- **Evidence:**
  - [x] test-v2 checks for each fix
  - [x] Audit table committed
  - [x] Spec requirements updated and validated

### [ ] DEPLOY-001 — Merge #37 and deploy Align v2 hosted

- **Priority:** P0
- **Owner:** project core / hosting
- **Direction:** Founder ruling on #37 (2026-10-30): hold off main until after the Mon/Thu tester round on v1; then v2 replaces v1 on the hosted server. Target merge 2026-11-06, deploy the week of 2026-11-09.
- **Conclusion:** Merge #37 once the tester round and LIM-2454 review are done, tag v2.0.0 through litai release, and deploy only after the legal pages, secrets, image test and a backup and rollback rehearsal pass; v1 workspaces do not carry over.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Tester round on v1 done (Mon/Thu) and LIM-2454 questions answered
  - [ ] lib/trust/entity.ts and the [CONFIRM] answers filled in; counsel reviewed the privacy policy and DPA
  - [ ] Fly secrets set: ALIGN_SECRET, BETTER_AUTH_SECRET, ALIGN_EMAIL_API_KEY, Turnstile keys
  - [ ] main merged in again, fresh retained receipt, #37 merged
  - [ ] v2.0.0 planned, prepared, checked and published with litai release
- **Evidence:**
  - [ ] scripts/test-image.sh passes on a machine with Docker
  - [ ] Backup and rollback rehearsed on the hosted volume
  - [ ] Hosted smoke test after deploy, and fly ssh console shows the secrets set

Current forge and Git-ancestry audit: PR #37 merged on 2026-11-04 as
`ba8a18084195f6bf4795e5c53c4a70c67d8f89cb`; it is already included in main
`ba43c5b` and this branch. Another merge of that PR is not a remaining action.
The other tester, legal, operational, release and deployment prerequisites above
remain separately owned and unverified by the local native checkpoint.

### [ ] SPEND-001 — AI spend tracking across sessions that need alignment

- **Priority:** P0
- **Owner:** components/legacy-project-wrapper/implementation (metering, spend, allocation; align-agent)
- **Direction:** Owner question on #37 (2026-11-03): does Align track AI spend properly? The alignment E2E cycles (acycle1-3) tested how sessions coordinate, but not that every request's tokens and list-price estimate land once, under the right goal, as sessions move between goals.
- **Conclusion:** Show with real Claude Code sessions (and Codex through its rollouts) that each request is metered once and priced from the price table, uploaded only while shared and under the goal of its epoch through share, bind, alignment approve/revoke, switch_goal, hold, stop, goal close, re-share and sign-out; that the Spend tab (by goal, team, session), the allocation view, align allocation, MCP and the steering line agree with the local ledger; that private or unshared usage never leaves the machine; fix every difference with a regression test.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [ ] Spend tester added to the alignment E2E loop (two people, several sessions, moves between goals)
  - [ ] A reconciliation script: local ledger per session and epoch against the server's spend and allocation totals
  - [ ] Fixes for every spend difference found, each with a regression test and spec update
- **Evidence:**
  - [ ] An E2E cycle whose spend report finds no bugs, with the reconciliation totals matching to the micro-USD
  - [ ] test-v2 and align-agent tests for each fix; litai spec validate ok
  - [ ] Retained test receipt recorded on the commit that closes it

<a id="sec-001"></a>
### [x] SEC-001 - Keep viewer team leads read-only

- **Priority:** P0
- **Owner:** Authorization policy and team membership routes, B05
- **Direction:** Enforce the existing viewer restriction even when a workspace viewer retains a team lead role.
- **Conclusion:** The policy allows pod.manage_members through the team lead branch before checking the viewer restriction. Workspace role changes preserve team roles, and the HTTP team and pod routes use this decision directly. Deny viewers before granting team lead writes, preserve hidden-object behavior and normal owner/member permissions, and correct the baseline before native qualification.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Reject viewer team membership writes before granting team lead permissions; extend the existing policy matrix and add HTTP add/remove regressions that prove membership and audit state stay unchanged.
- **Evidence:**
  - [x] Direct policy reproduction, meaningful role matrix, HTTP write refusal on team and pod routes, unchanged membership and audit records, and the complete retained workflow before native policy qualification.
- **Evidence:** The original policy returns allow for a viewer team lead. The repair passes 24 focused role/object cases and a production-server HTTP probe: both aliases reject POST and DELETE with `read_only`, membership and audit rows stay unchanged, and owner/member team lead writes still succeed. The application suite includes four denied requests in three new assertions. Specification validation passes. The complete sealed build, tests and package pass all 1,813 checks, including 940 application, 183 OAuth, 62 live agent and 602 agent tests. Current receipt `sha256:5d3c5781b0b4cf01813855e45ef47e5dd92d42046f082db094520c44a54da9af` binds execution evidence `sha256:fb2dd937b466d2a5d8b6b7c2dea3a48510e7ba01523ae8f2e2ad195ff92bed6a`. Both the current and CI-pinned runtimes verify the parent; validation and owned agent-entrypoint audit pass.

### [x] NATIVE-BINDINGS-001 - Preserve package namespaces for overlapping native export names

- **Priority:** P1
- **Owner:** B31 native package admission and generated bindings
- **Direction:** Continue the full native rewrite without changing natural library APIs to satisfy a global flat export restriction.
- **Conclusion:** The proposed wording count overlaps spend-stream count, and Home data overlaps policy data. Existing package-specific bindings already distinguish them, but the compatibility index currently refuses all duplicate names across providers. Keep package namespaces, expose only unambiguous flat aliases, preserve current selected-agent aliases and retain within-package ambiguity and integrity refusals.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Generate explicit package namespace exports and unambiguous compatibility aliases.
  - [x] Retain package-local duplicate checks, exact package membership, independent acceptance and atomic installation.
- **Evidence:**
  - [x] Two verified cache fixture packages export the same name with distinct behavior; namespace calls resolve correctly and no flat alias silently chooses one. Selecting only one provider restores its flat alias.
  - [x] Existing eleven admission controls pass alongside the two new controls. The integrated web selection passes 105 batches across paste, policy and share-again.
  - [x] The complete retained workflow and hosted image checks pass after consumer integration. The sealed build, test and package workflow passes all 1,820 checks with zero failures or skips; the hosted image passes 24 checks.

### [x] TRUST-PARSER-001 - Terminate trust Markdown lists with indented root markers

- **Priority:** P1
- **Owner:** B08 trust Markdown reader
- **Direction:** Preserve public trust-document rendering while preparing the remaining native boundary.
- **Conclusion:** A root list marker indented by two or more spaces enters list parsing with no current item, then repeats the same line indefinitely. Two-space unordered and four-space ordered fixtures time out in isolated two-second probes, while zero- and one-space controls return. Record the termination rule and fix the source before capturing a qualified native baseline.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Specify a terminating root-list indentation rule and preserve existing unindented and nested-list output.
  - [x] Apply the smallest source correction before native qualification baseline capture.
- **Evidence:**
  - [x] A bounded child-process regression detects both current hangs; the repair returns expected trees and all seven existing trust documents retain identical parsed output.
  - [x] Direct Markdown tests, the complete retained application workflow and hosted image checks pass before native source promotion. The complete sealed workflow passes 1,821 checks with zero failures or skips, including 941 application checks, 183 OAuth checks, 62 live-agent checks, 609 agent tests, 23 shell checks and three static gates. The hosted image passes 24 checks.

### [x] VERIFIER-LINT-001 - Keep copied native verifiers valid under application lint

- **Priority:** P0
- **Owner:** native acceptance harness
- **Direction:** Resolve the new verifier lint failure without disabling the existing rule or changing qualified behavior.
- **Conclusion:** Rename only local import variables in the authored Markdown acceptance verifier, preserve the protected qualification profile and exact cases, rebuild through the normal lifecycle, and refresh consumer custody before full application verification.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Rename the two local module bindings and rebind the authored acceptance harness with every observation unchanged.
- **Evidence:**
  - [x] Controls, all 21 source and consumer batches, admitted rebuild, application lint, complete sealed workflow and hosted image gates pass with protected profiles, locks and qualified heads preserved.

The first ten-library workflow passes all functional suites and fails only the
Next-specific lint rule on two local import variables in the copied Markdown
verifier. Those two authored verifier bindings are renamed without changing any
case or protected profile. Its normal cached rebuild passes 8 tests, current
verification and validation pass, and all 21 original and consumer batches match.
The source cache entry, source bytes, component lock and qualified head remain
identical; only authored verification file hashes change in the consumer manifest.
The corrected complete workflow passes all 1,821 checks and 24 hosted image
checks. Its current receipt is `sha256:7f3b84e7019246bdb8bb2edfc9dd043135ce572822a25197073fabfe210db12e`.

<a id="sdk-followups-001"></a>
### [ ] SDK-FOLLOWUPS-001 - Resolve remaining framework integration followups

- **Priority:** P1
- **Owner:** parent framework application and adapter APIs
- **Direction:** Finish the native rewrite without private registry writes or unresolved verifier and cache-transport review findings.
- **Conclusion:** Supported qualified-child registration, generic Python import isolation and local cache scope are locally verified under their filed upstream issues. Commit `7f4e2406` also preserves reviewed callable metadata through ordinary promotion. Its clean non-editable wheel passes 128 managed installed checks. Two clean schema qualifications and a separate admitted build pass with the unchanged public API, case arguments and expected results. Publish the tested contribution only with specific approval and required upstream review.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Search upstream and prepare sanitized contracts and issue drafts for each remaining defect class.
  - [x] With explicit authorization, file or link upstream issues before implementation in the isolated parent checkout.
  - [x] Replace the private registry helper with the supported public operation; preserve stale-plan, qualification, collision and rollback refusals.
  - [x] Preserve main's generic Python import isolation and the separate verified-wheel dependency closure; document and test native-cache transport scope.
  - [x] Preserve reviewed zero-argument callable metadata through ordinary single-Component promotion under existing upstream issue #132, then qualify the schema without changing its public API or independent cases. Two clean builds and the separate admitted build pass all 51 cases and 212 observations each.
  - [ ] Publish the tested framework contribution with specific approval and reconcile its canonical design and required review outcomes.
- **Evidence:**
  - [x] Registration, Python isolation and cache-scope fixtures pass 93 focused installed regressions and the real two-library recovery journey without editing protected pins or generated implementations.
  - [x] The clean non-editable wheel from `7f4e2406` passes all 128 managed installed checks, including the complete original promotion regression set. Installed module origins and distribution bytes remain bound to the tested wheel.
  - [ ] The framework PR completes its required independent review and exact-head platform/CI qualification before landing.
  - [x] Current fifteen-library consumer integrity, all 1,821 application checks and owned project verification pass with the approved reconciled framework.

Current review audit: approved local framework commit `ac436ed2` provides the
qualified-child revision required by the persistent-stop transfer. Its clean wheel
and real installed transaction/recovery acceptance pass. The published PR #313 is
still at `d4bd72bf`. A paired installed fixture now confirms that its cache collector
still follows a redirected child ancestor even though the canonical registry reader
refuses it. Capture limits and custody through the read remain required by that
review. The specific sanitized issue-filing and correction approval is pending.
No framework source has changed for this finding. SDK-FOLLOWUPS-001 stays open.

See the [framework integration followups](framework-integration-followups.md) for
portable contracts, tracker findings and the next issue-first action.

Upstream issues [#315](https://github.com/jordanhubbard/literate-ai/issues/315) and
[#316](https://github.com/jordanhubbard/literate-ai/issues/316) are filed before
implementation. The operator accepted parent ADR 0060 before implementation; it is
now ADR 0064 after upstream reconciliation. Approved commit `4d672137` passes the
installed acceptance described in the linked followups. The operator has limited continuation to Align and the framework work it needs.
Publication and broader upstream qualification remain separate.

### Current-main integration

Main's security-header and folder-rule fixes from `b16f8d1` are reconciled with
the sixteen-library working tree. The interrupted earlier run does not count as
complete acceptance. A fresh sealed build, test and package workflow passes all
1,825 checks with zero failures or skips. Its current retained receipt is
`sha256:485aa67eedf4eacd3379ba5703d8265e2ffcf5fc0c2282df931aac5ab4eee871`.
The hosted image passes all 24 checks plus ten response-header checks on the
SSD-backed engine. The operator approved this checkpoint; commit `bb2605c` is
pushed to draft PR #58, its prepared title and body are verified, and both
exact-head CI workflows pass. The configured pre-push reviewer remains unavailable
under its API usage limit; the approved one-command opt-out was used.

### [x] VERIFY-001 - Repair the retained-test blockers for PR 60

- **Priority:** P1
- **Owner:** components/legacy-project-wrapper/implementation (agent hooks and retained test harness)
- **Direction:** Run PR 60 on this machine, investigate failures on main, repair demonstrated defects and refresh the branch receipt without merging or deploying.
- **Conclusion:** The initial PR run passed 1787 checks and failed two. Clean main reproduces the dead-proxy fetch reset and folder-rule goal loss through a filesystem alias. Normalize folder identity and avoid stale HTTP connections in the live-test client; preserve all assertions and the latency budget.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Reproduce the two failures on clean main and retain diagnostic logs (main `cff1d34`: live 46/1, focused folder rule 0/1; network cause `ECONNRESET`)
  - [x] Repair canonical folder-rule comparisons with a symlink regression (focused alias and unchanged latency tests 2/0 on macOS arm64 / Node 26.3.0)
  - [x] Use fresh connections in the live-agent test client
- **Evidence:**
  - [x] Focused folder-rule and unchanged latency tests 2/0; repaired live client against unchanged main 62/0, including offline revoke and re-pairing
  - [x] Full retained suite passes: lint/typecheck/syntax, paste-lines 23/0, v2 937/0, OAuth 187/0, live agent 62/0, CLI 592/0; supported receipt committed in `75420dd` and candidate check matches (the collector's 937 count is tracked in VERIFY-002)
  - [x] Historical checkpoint at `75420dd`: `litai verify`, spec validation, `litai-verify` and `rebased-on-main` pass ([verification run](https://github.com/liminalworksinc/align/actions/runs/41958037099)). The PR was draft at that checkpoint; its changes are now on main at `b16f8d1`.

### [x] VERIFY-002 - Preserve complete aggregate test-count reporting

- **Priority:** P2
- **Owner:** Align retained gate runner and its receipt-count interface
- **Direction:** Resolve the aggregate-count discrepancy carried by main while preserving failure handling in every stage.
- **Conclusion:** The pinned collector recognizes numeric passed/failed summaries and selects the largest count. Without the branch's existing final numeric footer, a nine-case diagnostic selects the 941-check sub-suite instead of the 1,825-check aggregate. The owning fix is the Align runner's machine-readable footer. Both the current installed and CI-pinned collectors accept its full total and reject all eight failing-stage controls. Preserve that interface with a portable local regression fixture.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Compare collector summary precedence with the Node 26 aggregate footer.
  - [x] Resolve ownership to the Align gate runner and preserve its existing aggregate footer.
  - [x] Add a portable standard-library fixture for the unchanged runner and all eight stage failures.
- **Evidence:**
  - [x] The portable fixture passes all nine cases with a 54-check synthetic aggregate and rejects a failure in each stage. Run `python3 tools/native-rewrite/test-aggregate-count.py`; the script uses only the standard library and exercises the actual runner unchanged.
  - [x] Both installed collector runtimes pass all nine diagnostic cases. The real sealed build, test and package workflow reports all 1,825 checks with zero failures or skips.

<a id="config-001"></a>
### [x] CONFIG-001 - Reject hosted data paths inside the application directory

- **Priority:** P1
- **Owner:** B12 configuration target binding in lib/config.ts
- **Direction:** Preserve the existing requirement that hosted data lives outside the application directory before freezing runtime configuration for native conversion.
- **Conclusion:** The actual retained hostedProblems function admits four synthetic inside paths whose first relative component begins with two dots. A name prefix does not establish a parent path segment. Compare normalized path relationships at segment boundaries, retain existing diagnostic order and outside-directory behavior, and use fixture settings only. This is independent of the pending schema SDK commit.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Record the exact retained-function reproduction, source hashes and existing outside-directory contract; prepare a local issue draft if no matching issue exists.
  - [x] Repair the path relationship check and add hosted startup regressions for direct and nested two-dot directory names without changing modes, secrets, database behavior or native children.
- **Evidence:**
  - [x] Pass all fifteen synthetic retained-function cases with legitimate outside controls and zero filesystem effects, retaining the failing predecessor record.
  - [x] Pass the complete build, test and package workflow, refresh the current receipt normally, and verify the hosted image and current project gates before publication.

- **Development evidence:** The unchanged function admits four forbidden paths in
  a 15-case fixture probe. The corrected function passes all 15 cases, loads the
  same 13 modules and attempts no filesystem effects. Existing issue search finds
  no matching report; a sanitized issue draft is retained locally and is not
  posted. Source before:
  `sha256:cf0e9177ffd7bc28aad8cd14f9728045a882ec53a89605b5a79ade3a386b913b`;
  source after:
  `sha256:77f863f64159431a36fc40a617e7befcacf2720e6da42b1df48c0391ec7f1184`.
  The complete sealed build, test and package workflow passes all 1,827 checks
  with zero failures or skips, including both new hosted-startup regressions.
  The normal receipt update records
  `sha256:16acdfd7a2fde0d5d3561470e6143bd8c99b31b4e50e607df9e73b7575be155c`.
  The installed and CI-pinned verification runtimes each pass three gates with
  two declared skips; project validation and owned agent-entrypoint checks pass.
  The same immutable image
  `sha256:99a3e9cddc958879213b798dd8b5dd10474e57fa4328f63ee7b2801076bf3062`
  passes 24 canonical image checks, ten response-header checks and both direct
  and nested inside-path startup refusals. The 15-case path matrix also matches
  on macOS and Linux. All 3,113 tracked native child files and the pending SDK
  staged tree remain unchanged. This is local acceptance; publication still
  requires specific operator approval.

<a id="auth-rate-001"></a>
### [x] AUTH-RATE-001 - Preserve the sign-in ceiling explanation across clock advances

- **Priority:** P2
- **Owner:** retained B13 sign-in admission caller and B27 regression harness
- **Direction:** Preserve the canonical Mode L explanation when the machine-wide ceiling keeps sign-in delivery waiting longest.
- **Outcome:** Local integration passes all 18 deterministic cases on macOS and Linux, the full 1,830-check application workflow and all 36 image, header and startup-refusal checks. Every build, test and package phase binds the same 405-member source, and all 4,201 committable paths remain unchanged through that run. Current receipt: `sha256:32407ec3ed6fccfc9aea6374c7a29b192db677e5317975d0270cb5176053b703`. Both verification runtimes pass three gates with two declared optional skips. Immutable image: `sha256:956a5ab5c8bc1c7afe9fb034fb05af3cb6deb4a093ea4d2998b7b160344cf9b4`. This result remains local; a new commit or publication needs its own specific go.
- **Conclusion:** The actual handler compares relative retry values sampled across an awaited transaction. A one millisecond advance produces the wrong explanation. Sample once inside the transaction after acquisition and return both wait values together. Keep thresholds, owner exemptions, status, code, retry headers and transaction ownership unchanged. This is an explanation defect, with no demonstrated admission bypass.
- **Depends on:** ADOPT-002
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Apply the reviewed caller correction and deterministic 18-case regression; invoke it from the ordinary application driver before server startup.
  - [x] Admit the new B27 harness through the ordinary retained-source scope workflow and refresh the normal receipt after complete checks.
- **Evidence:**
  - [x] The unfixed handler fails five of the 18 frozen cases, including a one millisecond clock advance. The fixed handler passes all 18 on macOS and Linux; seven broken-fix controls are detected on both targets.
  - [x] Full type, lint, application and immutable image checks pass without relaxed thresholds, timeouts, retry budgets, assertions or security policy.
  - [x] Record the outcome in the changelog. Actual integration and current receipt acceptance pass. Any new commit or publication requires a specific operator go.
