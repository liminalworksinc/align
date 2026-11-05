# Native rewrite program

- **Status:** active
- **Owning queue item:** [ADOPT-002](active-work.md#adopt-002)
- **Completion / archival evidence:** pending while ADOPT-002 remains open

The retained implementation at `components/legacy-project-wrapper/implementation` remains source-authority
until each boundary earns transfer under ADR 0002.

## Ordered work

1. [x] Produce a boundary inventory: deployables, public interfaces, data schemas,
   runtime state, build targets, tests, packages, CI/release jobs, assets, and target
   variance. Every row names source/test/document evidence and an owner.
   See [Boundary inventory](#boundary-inventory) (2026-11-04, main at `cff1d34`).
2. [ ] Classify each row as Component intent, Flavor requirement, conversion skill,
   immutable asset, repository-only harness, or intentionally retained source.
   Proposed classes are in the inventory's Class column; they need owner review.
3. [ ] Select the smallest independently buildable/testable boundary and author its
   native authority; leave later boundaries retained. B09, B01 and B05 are integrated.
   B04's parity verifier and contracts are prepared; its source-extension framework
   correction awaits a clean committed runtime.
4. [ ] Generate, build, test, execute, and package the candidate through the ordinary
   lifecycle; compare observable results with the Phase 1.2 parity record.
5. [ ] Independently accept and regeneratively qualify the candidate before authority
   transfer.
6. [ ] Remove only the replaced retained files (`git rm`/`rm`), rerun the full E2E
   workflow, record evidence, then repeat from step 3.
7. [ ] Prove no unclassified retained file remains; archive this program only after
   full parity and current project verification. Audit each child's contributor
   commands against its actual components and refresh affected current receipts.

## B09 recovery

The operator requested continuation with the Codex provider on 2026-11-04. The prior
session accepted B09's specification and prepared 110 verifier-owned parity cases,
but did not qualify a generated implementation. The installed framework refuses
`spec accept --integrate-project` after the parent reaches `qualified`.

The recovery first creates the native child through `spec accept --project-target`,
then runs the ordinary two-clean-build qualification. Parent registration must verify
the parent's existing qualification, the child's fresh qualification, and the exact
registry identities before updating the registry and its qualified evidence together.
An unqualified child must never leave a current qualified parent claim. Keep the
shared framework installation unchanged and retain a reviewable local extension if
the framework lacks this operation.

The resumed qualification uncovered two verifier-format constraints. Fractional
invalid-counter inputs must be carried as JSON text because canonical evidence
permits integer numbers only. The independent library oracle permits at most 64
cases and must exactly match the qualification profile. The revised verifier keeps
all 110 original inputs and expected results in 11 capability batches. A baseline
replay passed every input; canonical profile identity:
`sha256:7c8b80c90909e24be01db863d327e5eaaff6d78d89462366aeb11dd6ba610b67`.

Codex's lifecycle invocation exposed contradictory request transport guidance: the
request must be read from a file, while the source-generation prompt prohibited
shell access needed for bounded file reads. The existing local framework commit
`162fc7ab66cb2acef9d6baaa27005a8a6c2bc2e7` permits read-only access to that one
request file. A separate non-editable runtime was built from the existing local
framework revision `d935813eba84b391cacd842be848b31dae17a582`; wheel identity:
`sha256:2354a32fa3ffdaaab041b32c8f58c2c0ca0af08259bad03b527b8b9824786f50`.
The shared installed runtime remains unchanged. The unqualified promotion is
recreated with this runtime through ordinary acceptance; no lifecycle pin is edited
by hand. The framework revisions are local and have not been published by this work.

The old lifecycle formatter also rejected its own redacted failure diagnostic,
obscuring the actual failure code. The optional `litai-local.py` launcher performs
additional redaction and retains the original failure code and phase. It changes no
validation, execution, build or acceptance gate. Seven helper tests pass, covering
metadata rollback, retry after rollback, stale-plan refusal and diagnostic redaction.

- [x] Confirm the accepted specification, review, and 110 baseline cases are intact.
- [x] Search upstream issues for the integration-stage defect. No exact match was
  found; issues #48 and #307 cover adjacent update and retained-library concerns.
- [x] Draft the portable upstream defect report locally; filing needs operator go.
- [x] Generate and qualify B09 with the Codex provider on two independent clean builds.
  Both runs pass all 110 inputs in 11 parity batches. Their independently generated
  test suites pass 16 and 23 cases. The
  [qualification decision](../../.literate/native-projects/local-spend-meter/provenance/qualification/5700553ab7a6564e3fb5a17ad316a79d405ad9fd21e547305aa4573aa8bb431b.json)
  has decision identity
  `sha256:5700553ab7a6564e3fb5a17ad316a79d405ad9fd21e547305aa4573aa8bb431b`.
  The current [qualified projection](../../.literate/native-projects/local-spend-meter/provenance/component-authority/41c451dbfd63af666ef2488dacdf5fe4a61a795f97e4a16c52cebb54a02bf8e5/current.json) is
  `sha256:2c4c1bd11ee8b83467797ce174fa77974575d32b950c6c66dcfda8c2f129b45b`.
- [x] Verify and register the qualified child without weakening existing gates.
  The reviewed local addition binds both current qualified projections in the
  [parent authority](../../.literate/conversion-authority.json), identity
  `sha256:8fd6f24346024776d6aecb5d8d6f09e5e05f3500beee6510638624a6aca5f53c`.
  Prior registry and authority metadata are preserved under `.literate/native-additions`.
- [x] Run project verification, validation, and owned agent-entrypoint audits.
  Root and child `verify` pass with current receipts, current locks and no failed
  gates. Root verification also passes with the existing CI-pinned runtime. Both
  project validation and agent-entrypoint audits pass; the child's parent README
  links are current. Its recorded host build passes 11 acceptance batches with
  receipt identity `sha256:cde8c4ad554c7aee5bc20e4233faa6618fd4cd396a0ab1e4b261804dba21b59c`.
- [x] Review application consumption and full parity before removing retained files.

Qualification and the receipt above cover macOS arm64. The agent still uses the four
retained TypeScript files. Package consumption, end-to-end spend accounting and
deployment remain separate unfinished work; this result does not close ADOPT-002,
SPEND-001 or DEPLOY-001.

The qualified surface has seven capabilities, including whole-file batch parser
functions. The retained agent consumes incremental parser state:
`packages/align-agent/src/tailer.ts:11-12,74,157` uses `initClaudeState`,
`parseClaudeLine`, `initCodexState` and `parseCodexLine`. Those interfaces, the
remaining helper exports and the shared event types need a reviewed compatibility
mapping and direct probes before switching the agent to the native package. Batch
qualification alone does not establish that the four retained files can be retired.

### Upstream defect draft

**Title:** Allow verified native child additions after an adopted project qualifies

An adopted project can qualify its first native library, but adding a second library
through `spec accept --integrate-project` then fails with
`promotion.integration_stage_invalid`. Conversion stages only advance, so the
documented one-boundary-at-a-time migration cannot continue after its first success.
Allow an explicit reviewed addition of an already-qualified native child. Validate
the current parent evidence, child evidence, registry and project-definition identities;
update registry and qualified evidence together; preserve prior state for rollback.
Reject unqualified children, stale evidence, collisions, unsafe paths and source drift.
Use a portable fixture with two tiny JavaScript libraries and prove that a failed
addition leaves both parent authority and registry unchanged. Do not permit a
qualified parent claim to cover an unqualified child.

## B09 incremental state

The operator approved committing the qualified spend-meter work and continuing on
2026-11-04. Commit `6066e30` preserves that result. The next child,
`local/spend-stream`, owns the two parser initializers, the two single-line parsing
operations, counter splitting, count validation and timestamp normalization.
The parser calls mutate the caller's state object and return events, matching the
live tailer's existing calling convention. Its verifier must observe each mutation,
preserve absent and undefined properties, distinguish invalid numeric values from
null, and resume using a JSON-restored state after every line.

- [x] Review the incremental contracts against the retained source and consumer.
  Seven capabilities preserve in-place state changes, omitted optional state keys,
  explicitly undefined event properties and the original numeric helper behavior.
- [x] Capture direct initializer/helper cases and per-line traces from the retained code.
  The 132-input corpus includes all 48 prior parser transcripts and 135 state
  transitions. All 19 baseline batches pass. Four verifier regression tests establish
  distinct observations for values JSON normally conflates and reject hidden state.
  Canonical profile identity:
  `sha256:3530e5c27955c92159173033930fb40be3f211658054b11bd14e12cb8bb6a744`.
- [x] Accept and qualify the child through two clean generations with the selected provider.
  Both runs pass all 132 inputs in 19 batches; their generated suites pass 3 and
  9 tests. The [qualification decision](../../.literate/native-projects/local-spend-stream/provenance/qualification/453eb494724947a6b14e7df6e587066e82928de2c8a7765a3777d4f3c2a1305a.json)
  is `sha256:453eb494724947a6b14e7df6e587066e82928de2c8a7765a3777d4f3c2a1305a`;
  the qualified projection is
  `sha256:f15e318a4824a8c67d3798ab667053d0dca3e6d711e32c2d1b918ffab423bbca`.
  An earlier attempt stopped at dependency validation because one generated source
  SBOM declared an unresolved Node runtime range. The successful retry used the
  same contracts, profile and gates, with fresh generated source.
- [x] Record a current child receipt, register qualified authority and verify both projects.
  The separate host receipt passes 17 generated tests and all 19 acceptance batches:
  `sha256:9eff34ba3454ce5527add145a30784641039b79b330f71b8970a841374241df3`.
  The reviewed addition registers the third qualified component and renews the
  [parent authority](../../.literate/conversion-authority.json) to
  `sha256:7982347739c4fa03610b0ee84e14e90fcfa5b453b4e5d8e4c00dff39242e0421`.
  The journal at `.literate/native-additions/72aef9ba24cc16ed-zm5vg5k0` preserves
  the prior state. Parent verification passes with the existing CI runtime; child
  verification passes with the recorded local runtime. Each has 3 passing gates,
  0 failures and 2 configured skips (source intelligence and HTML observability).
  Project validation and agent-entrypoint checks pass for both; the child's
  parent README check reports no remaining change. The seven metadata helper tests
  and four incremental verifier tests pass.
- [x] Map the remaining pricing constants, event types and package consumption.

This qualification covers macOS arm64. The retained agent still imports its
TypeScript parsers and pricing implementation. This step does not close ADOPT-002,
SPEND-001 or DEPLOY-001. The end-of-cycle peer survey and cleanup plan completed
read-only; no worktrees were collectable and no branches qualified for deletion.
Unmerged peer branches and their work remain untouched.

### Retained consumer map

Paths below are relative to the retained implementation.

| Retained surface | Current consumer | Native mapping / remaining work |
|---|---|---|
| `initClaudeState`, `parseClaudeLine`, `initCodexState`, `parseCodexLine` | `packages/align-agent/src/tailer.ts:11-12,74,157` | The four corresponding `spend-stream` capabilities; qualification is required before binding them into the agent. |
| `count`, `isoOrNull`, `codexCounts` | Internal parser calls in `src/spend/claude.ts` and `codex.ts` | Direct `spend-stream` capabilities, including exact invalid-number and timestamp behavior. |
| `claudeCounts` | `src/spend/claude.ts` | The existing `spend-meter.claude-counts` contract; the streaming parser also specifies the same private normalization rule. |
| `PRICE_TABLE_VERSION`, `priceRequest` | `packages/align-agent/src/ledger.ts:10` | `spend-meter.price-table-version` and `spend-meter.price-request`; provide reviewed TypeScript bindings and materialize the exact verified library package. |
| `picoToMicros` | `packages/align-agent/test/metering.test.ts:9,316-317` | Direct test-only helper coverage remains a compatibility decision. Keep the half-micro rounding checks when replacing the implementation. |
| `PRICES`, `OPENAI_LONG_CONTEXT_INPUT` | Internal to `src/spend/prices.ts` in the current tree | Their rules are in the reviewed pricing contracts. Review the remaining exported surface before retiring the file. |
| Parser state, `Counts`, `ParsedEvent`, `UsageEvent`, `QuerySource` and other event types | Type-only imports in the tailer, ledger and parser modules | Preserve the TypeScript data contract in the package bindings; runtime qualification alone does not type-check those consumers. |

The agent's `scripts/postbuild.mjs` hashes `.js` files recursively into its build
identity. Package integration must include every native implementation and any
behavior-affecting package data in that identity. The retained harness must also
receive the same verified package bytes as the development build before full parity
can be claimed. No consumer source has changed in this step.

## Integration execution

The operator requested completion of all litai follow-ups on 2026-11-04. Continue
through the ordered program above, retaining its complete acceptance scope.
The immediate B09 integration owns these checks:

- [x] Cover the directly tested `picoToMicros` helper with a qualified native contract.
  `local/spend-rounding` passes 31 parity cases on two independent clean builds,
  with 8 and 9 generated tests. Its [qualification decision](../../.literate/native-projects/local-spend-rounding/provenance/qualification/061ae65c12b6b02491cbe33e036b7ca188d14dea87b45b3ad3431c806c29240d.json)
  covers BigInt arithmetic, negative values, rounding boundaries and overflow.
  The current host receipt passes 6 generated tests and all 31 independent cases:
  `sha256:5943b176b79bf3e8bff0082f70120b93e6cc1f46bc95f2206ed63d341c36dbdd`.
  Registration adds the fourth native child and renews qualified component evidence
  to `sha256:9c4312bf3b7ea947ab8576dc1eb6546112c16383f8637c59b477845e3dc9beaf`.
- [x] Copy verifier-admitted source caches through the framework's local cache command.
- [x] Bind exact current locks, qualified projections, cache entries and native files
  in a reviewed consumer manifest. Missing or changed inputs must fail closed.
  `implementation/native/libraries.json` pins the three spend libraries and their
  independent acceptance inputs. The build adapter verifies cache entry and blob
  digests, exact package file membership, import surfaces and all acceptance cases.
  Development builds also check the current provider lock and authority head.
- [x] Preserve the caller's TypeScript state, event and pricing result contracts.
  The type-only `src/spend-types.ts` and naming adapter `src/spend.ts` pass the
  agent's existing strict type check. No parsing or pricing algorithm lives there.
- [x] Materialize the same pinned native files for development and sealed harness builds.
- [x] Include all native package files and data in the agent build identity.
  `postbuild.mjs` hashes every built regular file except its own output receipt.
  A regression changes native package data without changing JavaScript and proves
  the build identity changes. Eight bridge controls pass, including changed input,
  stale provider authority, symlink refusal and rollback on a second-output conflict.
- [x] Replace the retained runtime imports, run existing agent and application tests,
  and retire only the implementation that those checks prove replaced.
- [x] Refresh the retained harness receipt, verify every registered child and parent,
  and reconcile the boundary inventory before beginning the next boundary.
- [x] Resolve the reproduced folder-rule baseline failure before final consumer
  qualification. The current hook compares a symlinked working folder with the
  real path stored in the rule, so it loses the existing goal and replacement
  notice. The single existing `findings8.test.ts` case reproduces the failure.
  [PR #61](https://github.com/liminalworksinc/align/pull/61) covers the same defect.
  The local repair matches current main's canonical path comparisons. The existing
  test now uses an explicit symlink and passes. No peer branch was merged.

The first integrated agent run passed 599 of 600 tests; the sole failure was the
folder-rule baseline defect above. All 17 existing metering tests pass against the
native naming adapter, as does the focused symlink regression after its repair.
With no remaining runtime import of the four retained spend modules, those modules
are removed from the candidate. The complete sealed consumer run now passes and
the resulting retained receipt is current.

The direct full workflow passes lint, type checking, syntax, all 23 paste-line
checks, all 937 production-app checks and all 183 OAuth checks. Its live agent test
then reaches the known stale keep-alive socket failure after the deliberate
offline-proxy step. The test client's per-request connection setting now matches
current main; the API assertions and test counts are unchanged. Its focused rerun
passes all 62 checks. The subsequent complete sealed workflow passes lint, type
checking, syntax, 23 paste-line checks, 937 application checks, 183 OAuth checks,
62 live agent checks and all 600 agent tests, then packages successfully.

The parent receipt recorded at B09 closure is
`sha256:2b883528374f56bef8faf25ed5f629fb2f6ba641754c8cc17ef5fb6b4547a9ba`,
finalized from candidate
`sha256:ce0856bcb824edc6c187d200a2094fe69daaa703b6436fb4bbcf85c56bd9dde4`.
Its evidence identity is
`sha256:53e3df3280004f62adc354af6692a3efb61b10982498454985464c857f787bcc`.
The framework's compact test count is the application suite's 937 tests; the
complete command also ran the other suites listed above. Both the current runtime
and the CI-pinned runtime verify the parent. All four child projects pass
verification, validation and owned agent-entrypoint audits.

The private agent package has no consumer of the old `PRICES` and
`OPENAI_LONG_CONTEXT_INPUT` exports outside its pricing module. Their table and
threshold behavior stay in the qualified pricing contracts. Those unused module
exports retire with the old implementation; the existing CLI and caller API stays
covered by its original tests. The directly tested rounding helper keeps its native
binding rather than being replaced by test-only arithmetic.

Register new qualified children while the parent retained receipt is current,
before changing consumer source. Registration correctly refuses stale parent
receipts. During this integration, all 16 consumer edits were checkpointed and
verified on restoration so the rounding addition could validate the exact prior
parent before consumer verification resumed.

The generic retained-library bridge remains framework-owned work under issue #307.
This project-specific integration binds local immutable cache bytes and consumer
parity; it does not claim delivery of the framework's generic bridge.

### Retained scope follow-up

The normal `project retained-scope refresh` plan currently refuses with
`retained_scope.source_not_authoritative` because the aggregate parent is qualified.
Its retained wrapper has no source-promotion projection; the four qualified
projections belong to independent registered children outside that wrapper's source.
The stale scope still names the four retired modules and omits the new bindings and
verifier inputs. A fresh sealed receipt therefore needs an authority-aware scope
refresh before it can run the current implementation.

Upstream search found adjacent issues [#22](https://github.com/jordanhubbard/literate-ai/issues/22),
[#48](https://github.com/jordanhubbard/literate-ai/issues/48) and
[#307](https://github.com/jordanhubbard/literate-ai/issues/307), without an exact
retained-scope fix. The portable draft below remains local because outbound issue
creation has not been authorized.

**Draft title:** Refresh retained wrapper membership beside independently qualified children

An adopted project can qualify registered native children while its original
wrapper implementation remains retained. The scope refresh command rejects that
aggregate stage before checking which source actually owns the qualified authority.
Provide a reviewed refresh path only when the retained wrapper has no native
source-promotion projection, registered children are outside the retained source,
and every current child qualification exactly matches the aggregate claim. Bind
those projections into the reviewed plan, revalidate them under the existing lock,
retain conversion and qualification history, and make the parent receipt stale.
Never permit this path for qualified source inside the wrapper or for missing,
unqualified, stale, colliding or substituted children. Test read-only planning,
stale-plan refusal, rollback, source/metadata drift and preservation of all native
authority. Earn a new complete retained harness receipt after applying the plan.

- [x] Implement and test the framework-owned scope fix in an isolated parent checkout.
  The reviewable [patch](../../tools/native-rewrite/retained-scope-qualified-children.patch)
  passes 11 focused scope checks and 21 retained receipt, readmission and remote
  harness checks. Formatting, lint and host-path checks pass. The shared source
  checkout and shared installed runtime are unchanged. With explicit operator go,
  the isolated fix was committed locally as `4548261e3c2293c75b22dcfafd831821c80179a6`.
  Its clean-checkout wheel has SHA-256
  `6bc6c124985ca80e85ee375142266579f8d08cff6ec409eeae6f554a560b1d12`.
  The separate non-editable installation reports the exact commit and passes a
  read-only no-change scope plan against all four real qualified children.
  Upstream publication still requires separate operator go.
- [x] Review the exact added/removed source membership and apply its guarded refresh.
  The isolated source CLI applies the reviewed plan
  `sha256:70883c11b5df1a96781da76ae597275464bc98a6cad0404b8936385dde15d85b`.
  The new scope contains 369 files, adding exactly 11 consumer/verifier inputs and
  removing exactly four retired source modules. Its transaction preserves all four
  qualified projections and the prior conversion evidence. Actual consumer
  execution continues through the existing non-editable runtime.
- [x] Run and record the complete sealed consumer workflow against the refreshed scope.

### Integration inventory delta

The baseline inventory below contains 362 files. B09 retires its four runtime
implementation files and adds 11 source members, leaving 369 retained files.
`src/spend.ts` and `src/spend-types.ts` are retained consumer bindings and types.
`scripts/native-libraries.mjs` is a retained build adapter. `test/native.test.ts`,
the three `native/*.json` acceptance oracles and three verifier scripts are harness
inputs. `native/libraries.json` is the reviewed package pin manifest. The generated
runtime package files remain outside retained source scope and are admitted through
the three native children's immutable source caches. No added file is unclassified.

## B01 application integration

- [x] Rebuild the qualified paste-line child through its original pinned lifecycle.
  The build passes all generated tests and all 49 independent acceptance cases.
  Its projection, lock and accepted source contracts are unchanged. Local cache
  publication retains entry
  `acb577e4e07d90b4bff9752dbfd8f03688b26291f4ec33e7f27fd079e48768a0`.
- [x] Replace the original algorithm with typed consumer names for the native library.
  The existing browser callers keep their imports and argument/result contracts.
  All 23 shell-execution checks pass in sh, bash and zsh with hostile input.
- [x] Materialize only paste-line files for the web build and only spend files for
  the local agent. The package adapter emits mechanical type declarations and
  rejects empty, missing or duplicate consumer selections. Ten adapter controls
  pass, including isolated reconstruction from the exported web input cache.
- [x] Preserve the hosted container build. `npm run prepare:container` stages only
  the exact checked paste-line cache bytes. The clean Docker build checks those
  bytes and reruns all 49 independent cases before compiling the app. The hosted
  image test passes every check, including explicit absence of source caches and
  acceptance inputs from the runtime image, route restrictions, startup refusal,
  unprivileged PID 1, volume ownership and operator commands.
- [x] Replace template identity text in the root and four child project guides.
  Each child records a reviewed documentation marker and earns a new current
  receipt through an acceptance-checked source-cache hit. Committed consumer
  package pins stay unchanged.
- [x] Refresh the source scope through the installed framework fix.
  Reviewed plan
  `sha256:7f703e5dd202257b004ae2b61ab3dc4c9a256ebc559b82b95fe4128166c13f6a`
  adds only `native/paste-lines.json` and its verifier, leaving 371 source members.
  Generated `lib/native` and `.native-inputs` are excluded outputs. All four
  qualified child projections and the registry identity remain unchanged.
- [x] Finish the complete sealed build, test and package workflow, publish its
  local receipt, and verify root and child projects before starting B05.
  Build, lint, type checking, syntax, all 23 shell checks, 937 application checks,
  183 OAuth checks, 62 live agent checks, 602 agent tests and packaging pass.
  The current parent receipt is
  `sha256:41dbba2aa4a272ebd70cc4d016049ba93931cd9e1a56766a00471d16d86546f1`,
  finalized from candidate
  `sha256:56119749deb449297395fb69d93c786227f34b34cbf4421bd20feabc11b48a55`.
  Execution evidence is
  `sha256:0af211ce26983e8e746aa24dde26c486598750b26510a2afdd171df31be8220e`.
  Root verification, validation and agent-entrypoint audits pass. All four native
  children also verify and validate with zero documentation advisories.

The two added B01 source members are independent acceptance inputs, classified as
harness. The 371 retained source members include `lib/paste-lines.ts` as a type and
naming binding; its original quoting and validation algorithms are retired.

The retained test runner printed a complete Node-style aggregate, while the
current framework observer recognized the largest `N passed, M failed` subsuite
line. That undercounted the compact receipt while preserving the full command's
exit status. The SEC-001 baseline now emits the supported summary format for the
existing aggregate too. Suite selection, assertions and thresholds are unchanged.
The SEC-001 receipt reports all 1,813 checks, with source logs remaining the check
on every constituent suite.

### B05 baseline prerequisite

The original policy preflight reproduced `authorize(viewerWithTeamLeadRole,
"pod.manage_members", team)` returning `{ok:true}`. The team and pod HTTP routes
call that decision directly, and workspace role changes preserve team membership.
The workspace specification requires viewer writes to fail with `read_only`.
[SEC-001](active-work.md#sec-001) corrects the defect. Its complete baseline passes
before native derivation and qualification. The denied-object 404 behavior and
authorized owner/member team lead actions are preserved.

The repaired baseline passes 24 focused role/object cases and a production-server
HTTP probe. Both team and pod aliases reject viewer POST and DELETE with
`read_only`; membership and membership-write audit records are unchanged. Owner
and member team lead writes still succeed. Three permanent HTTP assertions and
24 additional cases in the existing policy matrix cover this behavior. The full
sealed baseline passes all 1,813 checks. Its current receipt is
`sha256:5d3c5781b0b4cf01813855e45ef47e5dd92d42046f082db094520c44a54da9af`,
from candidate `sha256:e4af448adf34eee0a5befa67b4acabdec357a625520b6e1e66cf582c274c42ef`.

The independent policy verifier was prepared while that receipt ran. Six verifier
controls pass. Its matrix has 331,937 observations across 43 bounded batches,
covering all supported actions and object kinds, role and visibility combinations,
team Maps, ownership, transfers, six policy data exports and opaque IDs. Fingerprints
retain return/throw distinctions and argument state, including Map entries, rather
than dropping mutation behavior during JSON transport. The corrected source is
captured as `policy.ts`, SHA-256
`ba6cd81638c73668ce588fc85ff7027ed0c38de4c017a18b7407d03b8c4f3781`, and
all 331,937 baseline observations are recorded in the profile. The consumer binding
must preserve the existing Map/object function API and isolate each package's
imports so browser callers depend on their own library.

The qualified native child `local-policy` is registered by the parent.
Its four callable contracts cover authorization, goal readability, goal binding
and a projection of all six public policy data values. The accepted Component lock
is `sha256:ee9471acad1dc0ddb5cb885acc0ac15cfedfa7528e290c029aa5434c4df678a7`.
The independent library oracle binds all 43 batches to the exact interface and
import-surface identities. Its profile and verifier bytes are checked to match.
The first qualification command stopped before execution because the explicit
scratch directory was absent. Subsequent preflight checks require canonical case
ordering in both profile and oracle. All 43 cases and expected values are preserved
when canonicalized. The prior unqualified child is retained outside the repository
with a 146-file hash and mode manifest; no registered or qualified child was
replaced. The ordinary acceptance command creates the corrected child. The oracle
generator now validates its output through the SDK and checks exact typed profile
equivalence before qualification. Explicit removed build selectors are omitted
because those Flavors are absent from the new catalog. Qualification attempt v5
passes two independent clean builds through Codex, with 38 and 28 generated tests.
Both match all 331,937 reference observations. The qualified authority projection is
`sha256:5cb892eb4650084e8f8686741788b350d0eff31e0595af0290a782a7da8ceb77`,
from decision `sha256:5f1fb6c442863c38f8c99e39d6265b382bda09f3fa75a469ea8f459c47aded46`.

The initial admitted production build passes its generated tests and independent acceptance;
its receipt is
`sha256:1386f3e9c0ccaf404b657c11d458ee2b5bc42de36affead143957233682cac56`.
The local project cache preserves the exact accepted package. Parent registration
preserves all five qualified projections under the existing metadata locks.

The retained policy file now contains its ten public type declarations and typed
bindings for its three functions and six data values. Its original algorithm is
retired. All 331,937 observations pass through this actual consumer binding too,
with no exceptions or argument mutation. Package-specific generated bindings keep
the browser paste helper independent of the server policy package; an isolation
control deletes the policy package before importing and calling the paste binding.
All eleven adapter controls, six verifier controls and the application type check
pass. Web and container builds select the paste and policy packages, rerunning
92 oracle batches. The complete sealed build, tests and package pass all 1,814
checks: 940 application, 183 OAuth, 62 live agent, 603 agent tests, 23 shell checks,
and lint/type/syntax gates. Zero checks fail or skip. All 24 hosted image checks
pass, including exclusion of source caches and oracle inputs from the runtime.
The refreshed retained scope has 373 files and preserves every qualified child
projection.

An isolated agent installation preserves all 30 native files from its three spend
libraries, including package-specific bindings and data. All 15 exported functions
load from the installed copy, and that copy's CLI `--help` exits successfully.

The current parent receipt is
`sha256:8c34bb32f82723b76a250c3a06d074478b75fb19da2beb3cd2c49128726db9c5`,
finalized from candidate
`sha256:25c9a367415bad5bbeedf35a5a06d3d36f32732e5401a5dba61ea6ec422fd0b4`.
Execution evidence is
`sha256:aeb9d9e93d52994416ea5f462c3a6b6995b29be4497fe390d159a5d407381cc3`,
binding project revision
`sha256:b7b8b213914b444ddeb21edf3984a4ca50c3cee85e81e91605b091848413a5c4`.
The root and all five native children pass verification; root validation and owned
entry-point audit pass, as does root verification with the CI-pinned runtime.
B05's consumer integration and source retirement are complete. The remaining
inventory boundaries and whole native application rewrite stay open.

### B04 source-extension prerequisite

The next pure boundary is the three share-again wording functions. Its unchanged
`share-again.mts` snapshot has SHA-256
`3830cc5edc94b7715badb514ad03dce2629ef7246bf8bad6d9132db3fad4419c`.
The verifier captures 1,163 observations across 13 batches, including device states,
opaque names, exact structured parts, deleted accounts, omitted options and explicit
undefined defaults. Three observation controls pass.

Static derivation stops with `workflow.inventory_excluded`: the framework's source
suffix map lacks `.mts`, `.cts`, `.mjs`, `.cjs`, `.tsx` and `.jsx`. The file remains
at its original name with unchanged bytes. The isolated parent work item
`SOURCE-MODULE-EXTENSIONS-001` owns the correction and installed-wheel proof.
Upstream issue searches for `mts inventory` and `source inventory extension` find
no matching issue. The following portable draft remains local pending explicit
authorization to file it:

**Title:** Recognize JavaScript and TypeScript module and JSX source extensions

**Problem:** Static source derivation classifies standard module-extension files
as `other`, then refuses a source tree consisting of those files with
`workflow.inventory_excluded`. An inert fixture containing only `example.mts` with
`export function calculate(value) { return value + 1; }` reproduces the refusal.

**Required behavior:** Recognize `.mjs`, `.cjs` and `.jsx` as JavaScript, and `.mts`,
`.cts` and `.tsx` as TypeScript. Preserve source names, bytes, sensitive-content
refusal, binary/generated exclusions and test/minified classification. Static
derivation must not execute the source. Qualify the correction through inventory,
derivation, negative controls and an independently installed wheel.

The parent correction is committed in `05d07fe6`. Its focused controls cover all eight
source extensions, 24 test/minified names and 24 exclusion cases; the focused and
existing conversion suites pass 14 tests. Lint and formatting pass. The portable
[source patch](../../tools/native-rewrite/source-module-extensions.patch) is retained
with the downstream recovery. The clean wheel has SHA-256
`24389b995bea8fcfaaa73d7d3db567f06eb02b86a03d7a6cb41b953b475eeafb`
and embeds exact origin `05d07fe60b2d4acbb740b059fc131c7bc160375d`.
A separate non-editable installation derives the unchanged `.mts` source as
TypeScript without executing it. No build-origin pin is overridden.
The adjacent upstream #307 concerns a Python consumer bridge and
does not own this extension defect.

The corrected development CLI derives the unchanged `.mts` source without
execution or model egress. Its inventory identity is
`sha256:cf400830059e0a13328875543008048d3d9e091a5e611294019159bfd3f728a8`.
The source-bound Component graph and signed delegated review are prepared. The
installed runtime confirms this same inventory identity; native acceptance and
qualification remain open.

### B11 independent preflight

While B04's specific framework commit approval is pending, preflight the independent
shell parser boundary using the current pinned runtime. Its original `shell.ts`
has no imports and exposes `parseShell` and `commandWords`. Capture direct parser
observations before authoring or accepting its native contracts. Preserve the
heuristic parser's exact command order, quote and expansion markers, redirections,
heredoc exclusion, malformed-input behavior and wrapper/assignment stripping.
The application and agent parity gates remain unchanged.

The original 7,659-byte `shell.ts` snapshot has SHA-256
`5db3bf25f9f6e325d4e670bbf39d8a47ed443c21cebf87294c3ced4c0ce9710c`.
Fifteen direct semantic probes pass. Its initial deterministic verifier captures 11,048
observations in 23 batches: 9,422 parser inputs and 1,626 wrapper/assignment arrays.
The matrix combines quoting, separators, redirects, heredocs, opaque/nested spans,
malformed text and seeded text fragments. Command strings are data throughout.
Three verifier controls pass, including detection of added undefined array
properties and isolation from mutated earlier observations. The same added-property
control strengthens B04's unpromoted verifier; its first profile is preserved and
all original 1,163 observations are recaptured. Existing qualified profiles remain
unchanged.

The ordinary static derivation preserves `shell.ts` as TypeScript source, with
inventory identity
`sha256:b99a61ef1fa01d6569b5605a9fad84df48cd43fef57bd2fe6b9b71db57137d53`.
The two reviewed contracts preserve parser behavior and exact prefix stripping.
Source-bound review and the first ordinary acceptance complete. Registration and
source retirement still require successful native
qualification, an admitted build and the current parent receipt.

The first clean generated parser fails independent batch `shell-words.parse-016`.
Direct differential comparison finds two mismatches among 9,422 parser inputs and
none among 1,626 wrapper inputs. Both clear a pending normal redirection when a
heredoc is appended. The source instead preserves that pending operator for its
next target or command boundary. The revised contract states the exception and
ordering explicitly. Sixty targeted probes cover every normal operator with both
heredoc forms and with missing, deferred or supplied targets. All 11,048 prior
inputs preserve their order and exact expected values; the expanded matrix has
11,108 observations in 23 batches. Verifier controls and all 60 direct probes pass.

The unregistered v1 child remains `derived-source-retained`. Its 145 files are
preserved outside the repository with a hash/mode manifest and verified unchanged
after relocation. No qualified or registered project is replaced. The ordinary
signed review and acceptance flow creates v2 from the unchanged source snapshot,
the clarified contracts and expanded profile. Its accepted lock is
`sha256:ce8d5aa1404c8ade73c55032533940b2cc93ee82a75c26101229bff02aad2f07`.
The oracle binds all 23 cases to import surface
`sha256:3ac81a49e2e782427d145c556867096cab03b08d9fa33d1ea8b2579a9298e70d`.
SDK oracle validation, exact typed profile comparison, project validation and
agent-entrypoint readiness pass. V2 uses the pinned runtime and a new scratch root
for two clean qualification runs through Codex.

Both v2 clean builds pass all 11,108 observations. Their generated test suites pass
20 and 16 cases. Qualified projection
`sha256:d60617189a4f02dbd213d6f0f9b7d7bbfeadf2954601106e18d10a1b5aae96b8`
comes from decision
`sha256:055f7a5587539d599e27c7b34fe0c5e672e46706666034d65204360a7d2fe809`.
The independently generated admitted build passes 14 generated tests and its
independent acceptance. Its current receipt is
`sha256:00a80ff0de2b0390859ffe9c3deded7a5dc3abceb21889d76735728a241dae5f`.
Its exact source cache is copied locally for consumption, and guarded registration
preserves all six qualified child projections.

The retained `hooks/shell.ts` now contains only `ShellCmd` and typed bindings for
the original `parseShell` and `commandWords` names. Its original algorithm is
retired. All 11,108 observations pass through this actual consumer too, without
throws or argument mutation. The agent build verifies four native libraries and
84 independent batches. All eleven adapter controls pass. A normal guarded scope
refresh adds only the shell oracle and verifier, for 375 retained files. Complete
sealed application verification and hosted image checks are the remaining B11
integration gates.

The first sealed integration run passes all application, OAuth, live-agent and
603 agent checks, but lint rejects the standalone verifier's local `module`
variable. The repository-owned verifier now uses `modulePath`. Old and renamed
verifiers produce identical results on all 23 batches. The protected qualification
profile, case values, interfaces, component lock and qualified projection remain
unchanged. SDK validation binds the renewed standalone verifier identity, and an
ordinary cached rebuild passes all 14 generated tests and independent acceptance.
Its current receipt is
`sha256:43827b7e93c321d3b136b7f79f7810db9e7c1b31c4717fd24cfc4eb802d2d8a2`.
Lint passes with its existing rules. The corrected complete sealed workflow passes
all 1,814 checks, with zero failures and zero skips. The hosted image passes all
24 checks. Current root receipt
`sha256:6b521b4b5eda0f88aa12174947645d2ecfc84f54dcca293fd9a923eb1b04b34b`
binds candidate
`sha256:f667701a1944b627bd645c1fcd9091d64357f2f96af591d5231e24233879f440`,
execution evidence
`sha256:bec5784a376876e91019d5b1e121cc4acad564f84757ad2e5761f7b4d4fb3e6d`
and project revision
`sha256:d17bbf29a0acfdbff81b9b6dadbeba403f3a061b3ac206987321015c39daec6a`.
The root and all six native children verify. Root validation, owned entrypoint
readiness and CI-pinned verification pass. B11's consumer integration and source
retirement are complete. The end-of-cycle peer survey finds no collectable
worktrees; other branches remain with their owners.

The documentation pass found retained hello-component commands in the five
earlier children's getting-started documents even though those children have no
hello component. Their owned scaffold examples now name each actual library.
All five ordinary rebuilds reuse their accepted source and rerun independent
acceptance; no source generation is needed. Their receipts are current, and the
root's existing receipt remains current. Root and all five children verify again.
The new shell reader's
entry documents already use its actual component and retain the required guide
links. Each accepted child must bind its independent oracle through SDK validation
and exact typed profile comparison before clean qualification through Codex.

The B05 end-of-cycle survey records twelve nonterminal local branches and five
merged terminal candidates, with no collectable worktrees. The boundary inventory
branch is already an ancestor of this work. Older product and preservation branches
remain with their owners; collecting or deleting them is outside this boundary
integration. The survey evidence is retained with the execution records.

### B10 notice helper preflight

While B11's complete verification runs, preflight the independent
`packages/align-agent/src/shared/notices.ts` subset of B10. This file has no imports
and contains three functions and two public constants. A separate `local/share-notices`
library can preserve notice-kind extraction, exact prefix matching and resumed/held
wording without depending on B04's source-extension fix. Preserve the public prefix
array's shared mutable identity and its effect on matching, as well as ordinary
function outputs and input state. The remaining envelope, ended-state wording and
shared type files stay open under B10.

The unchanged 2,168-byte source snapshot has SHA-256
`790a368fd198ad406755a72d1c2de41fb847cdec76c1d9bc6c4468c9d9eafaf7`.
Static derivation records source inventory
`sha256:99114b9fd32f0c51db35a169cac3d6428874c24d5ea329a114a337e33af25a4d`.
The independent verifier captures 1,099 observations in 14 batches: 345 notice IDs,
204 prefix inputs, 542 held-title/reader combinations and eight shared-state
scenarios. Its three controls pass, including detection of detached prefix copies,
argument mutation and un-restored public-state mutation. The contracts preserve
the shared array across constant wrappers and matching calls. Signed review and
ordinary spec acceptance precede native qualification; no consumer source is
changed by this preflight.

Ordinary acceptance creates a source-free child with lock
`sha256:078fa8c1d61b7aa0250178dd553e6277ad0b1750a0ad112197301ca319d18e60`
and import surface
`sha256:6c871ff6cb8cab1fab5776524f737a78672086324a6188ac8c063b633361ba38`.
Both clean Codex builds pass all 1,099 independent observations; their generated
suites pass 14 and 10 tests. Qualified projection
`sha256:9a910b03662b9eb113a9e24db7775fb4e06f91c42aa8b4a9b6797b8fcf37a5ad`
is admitted by decision
`sha256:6a752a2bbad8252398bffe9f20aa79ffcc6433fe2f32bc0e6c707c1d8f451b9e`.
The separate admitted generation passes 11 generated tests and independent
acceptance. Its own API guide and completed qualification queue are reviewed;
the final documentation rebuild reuses that accepted source and passes again.
Current child receipt is
`sha256:9fdedc23bbe7a7034d3a119c54f4d57b877f64df1bc5c7f74182d5640f9ef2af`.
Guarded registration preserves all seven qualified projections. The actual
`shared/notices.ts` consumer now holds only typed public names, including the
original literal type for `RESUMED_NOTICE` and the mutable string-array type.
All 1,099 observations pass through that consumer, including shared-prefix
mutation and restoration. The original notice algorithm is retired. The agent
build passes with five native libraries and 98 independent batches; all eleven
adapter controls pass. A reviewed scope update adds only the new oracle and
verifier, preserving the seven qualified children and expanding retained membership
to 377 files. The complete sealed application workflow passes all 1,814 checks;
the hosted image passes all 24 checks. Root receipt
`sha256:c436599daacda20b1f56d263acc7cf426039d6527f902c99aebd79e886a9195a`
binds candidate
`sha256:91e5dd6c33e31606a6c28163c3ee6c7106be8453a85a1e9dd834cf37345a408f`,
execution evidence
`sha256:595f8c2c6cc355f29a15e3767ebe71bfb8c9df2153c91a83808c737a99049368`
and project revision
`sha256:c58ffc7d28bdb59bfed4bee648de1cddb0c7e0b677eed7034742ac430e6fba51`.
The root and all seven children verify, as do root validation, owned entrypoints
and CI-pinned root verification. The end-of-cycle survey finds no collectable
worktrees. The notice subset is integrated; the rest of B10 remains open.

Unchanged snapshots of the remaining `envelope.ts`, `ended.ts` and `types.ts`
are also preserved, at 41,404, 29,404 and 20,756 bytes. Their inert static inventory
identity is
`sha256:189f1f580ebfd40e75543202b2e288bf77b95ced23b92ac5f912f047c8650464`.
It identifies 92 source observations and three unresolved behavioral uncertainties.
Those uncertainties require direct observations and complete reviewed contracts
before acceptance. No native child or application edit exists for that remainder.

The expanded source capture records 563,650 observations in 59 batches over all
51 planned callable/data capabilities. It preserves all 562,903 initial inputs in
their original order and appends 747 omitted/undefined default probes. Four
verifier controls cover returned aliases, Set order, unusual values, input mutation,
public metadata sharing/restoration and the 64-case bound. SDK profile validation
and five embedded source-verifier batches pass. These are source observations,
not native qualification.

Review against `specs/align/local-agent.md` exposes two baseline contradictions,
owned by [CONTEXT-001](active-work.md#context-001). Under pressure, `goalEnvelope`
keeps parent measures while dropping own measures; the ratified order removes
parent measures first. A long single-ask delta falls back to 187 characters but
drops both its required attribution and the earlier closing count. Direct probes
preserve both outputs. Fix and fully verify this baseline before accepting or
qualifying the remaining envelope contracts. Preserve the old snapshots, captures
and all existing native projections. A tracker search finds no matching issue;
external filing remains unrequested.

The isolated repair passes 30 clipping probes. Three permanent regressions fail
against the original implementation and pass against the corrected retained source,
including the actual hook delivery and its once-only behavior. Parent measures now
remain only while the full own-measure set fits at the current limit-text bound.
Single-ask notes progressively clip their fields while keeping attribution, date,
closing counts and the fixed authority sentence. All character budgets remain
unchanged. The new 41,750-byte `envelope.ts` snapshot has SHA-256
`81eaae14312dcc1474fcf607c2725693466873371a230f6c7aef2728791851c4`.
`ended.ts` and `types.ts` retain their original bytes. Corrected inventory identity
is `sha256:8dc44b1db4cfc4a6048837ef95756634259d6487b8ebb381f04a697d1d03484e`.
The complete baseline now has 563,717 observations in 59 batches. It adds 67 long
single-ask probes to the previous 563,650 inputs, preserving all prior positions.
Original and repaired sources receive the identical matrix: only the
`render-envelope` and `render-asks-delta` batches change, while 57 batches remain
identical. The corrected self-contained profile passes SDK validation. At this
preflight stage, no envelope contracts had been accepted and no envelope child
existed. The corrected hosted image passed all 24 checks; the complete retained
workflow was still running with the three new regressions. The passing full receipt
and subsequent acceptance are recorded below.
The seven existing native projections are unchanged.

All 51 public callable/data contracts are now drafted against that corrected
source, with the state-transition priorities, exact word catalogue, clipping
searches, mutable metadata and returned aliases stated explicitly. The source-bound
graph binds all 92 static observations. An inert AST audit proves all 21 catalogue
keys and their literal templates, 14 metadata values and the fixed envelope
authority/limit headings match the source exactly. These are reviewed-input
preparations; acceptance and qualification still wait for the corrected full
baseline and final semantic contract review.

The first repaired full workflow passes 1,816 checks and fails one randomized
share-state case, seed `1630038945`. Three direct reproductions show the test
addressing a session still marked shared on the fake server but owned by an earlier
device pairing; this pairing cannot receive that directive. Its local share is
already stopped, with no stop or hold latch. The property action now selects this
pairing's live server sessions for its enforcement assertion. That assertion stays
unchanged for deliverable stops/holds. The reported seed is permanent, and a new
deterministic regression proves an earlier pairing's unheard stop does not reblock
the freed local session. Both the seed and that isolation regression pass; the
existing older-build stop-and-hold enforcement regression also passes. The full
workflow reruns with all checks and fresh random seeds. No failure is waived.

The second corrected full workflow passes all 1,818 checks, including 607 agent
checks, the permanent reported seed and fresh random seeds. Current root receipt
`sha256:08cf7b053511bde9938ffcc6ab12ef329fcd35b264688eb55de264c1d5ca9367`
binds candidate
`sha256:5138bfe43edfda8b2328e0735fced500db246ce5bce3fbbe453a3eb110363262`,
execution evidence
`sha256:f0feea790b6340264df9c4c9e3307dffd4f30f9e5d69f209cf30d797000f440e`
and project revision
`sha256:16ab719dc516e02112aeb76d10e48c8c5bc2a14bf47dcc566259e0f5d9a121c9`.
Root verification, CI-pinned verification, validation and owned entrypoint readiness
pass. The end-of-cycle peer survey finds no collectable worktrees.

The exact corrected source is copied under the intended `agent-envelope` source-root
name, preserving all earlier snapshots and the same inventory identity. Normal
source-bound review resolves all three behavioral uncertainties. Ordinary acceptance
creates `local/agent-envelope` with lock
`sha256:4baaa0e1f8af1a6697b13634ad581c00c16ed81fb31aa53d583b5f1e739cb9fd`
and import surface
`sha256:cd9f8cb8b9737fc6e7a439dc19480ea76c461325032605eea1a4d9b6a4316af3`.
All 59 oracle cases match the typed protected profile exactly. The actual child
API guide, qualification queue and parent links replace its starter scaffolds;
project validation and owned entrypoint readiness pass. Qualification stops before
generation with `standard_command.library_import_surface_oversized`: the full
51-capability import surface exceeds the bounded verifier argument. The child is
not registered and its consumers remain on the corrected
retained implementation until qualification and package admission succeed.

Mechanical binding drafts preserve all 49 function signatures, 16 data exports and
the original type declarations, including inferred primitive defaults and literal
constant types. They contain no runtime algorithms and remain outside retained
source. Shared TypeScript declarations still require the program's class review.

The parent-owned `LIBRARY-IMPORT-COMMAND-001` item records this command projection
defect. A tracker search finds no matching issue. The sanitized upstream draft is:

**Title:** Large library import surfaces exceed the verifier command bound

**Reproduction:** Construct a dependency-free library with 51 distinct capability
imports, each bound to its own interface identity. Project its ordinary Standard
execute command. Compression of the full typed surface exceeds the 4,096-character
argument limit before generation or execution.

**Required behavior:** Keep the complete typed surface in locked authority. Pass
every capability, module and symbol to the import verifier together with the full
surface identity, so interface-only changes still invalidate the command. Preserve
the existing argument limit and exact package, export and path checks. Prove the
correction with a portable fixture and retain refusal for genuinely oversized
import mappings. The operator authorized the current commits, pushes and pull
requests. Separate issue filing remains outside this publication request.

The prepared parent correction preserves the complete surface identity and every
import mapping while shrinking this argument from 4,440 to 1,396 characters. Four
new regression tests and four existing Standard projection tests pass. They cover
real imports, missing symbols, undeclared package exports, declared dependencies,
path escapes, interface-only invalidation and refusal of truly oversized mappings.
The additional local command and build-authority regression passes seven tests
with one existing macOS persistent-service skip. Lint and formatting pass. Framework
commit `05d07fe6` is built from a clean checkout and installed separately as a
non-editable wheel. That installation projects the exact accepted 51-capability
surface into 1,396 characters with every mapping and the original surface identity
preserved. The unqualified child still needs a reviewed execution rebind before
retrying qualification; the seven existing consumer pins remain unchanged.

### B02 wording helper preflight

All five source files retain their original names and bytes. The development
source inventory classifies the four `.mts` files and `launch-words.ts` as
TypeScript source, with snapshot
`sha256:7bca67baa82f36c8968e5621dedc9a34c7d7a20242b7ff29cdadb1fba7880e66`.
This is an editable development proof of the source-extension correction;
refresh derivation with the independently installed `05d07fe6` runtime before acceptance.
Static derivation leaves five behavioral uncertainties for source-bound review.

The independent matrix covers all 16 functions and the three scalar data exports
through 17 capabilities. It has 4,598,945 observations in 49 gap-free batches. Each
of the four text helpers receives every Unicode code point, including lone
surrogate code units, plus composed emoji, formatting, control and whitespace
contexts. Other cases cover currency rounding, count formatting, launch wording,
hidden dependency counts, measure/limit changes, fixed field order, optional
defaults and quoting/title callbacks. Callback traces preserve invocation order,
arguments and the original exception object's identity. Reference anchors detect replacement of a nested object
with an otherwise equal object. A separate metadata probe detects shared mutable
wrappers and restores the observed state.

The first capture's inputs remain in the final matrix. Additional callback option
combinations and the wrapper probe extend coverage. Four verifier controls pass;
SDK profile validation accepts every batch. Eight independently launched embedded
source batches match the capture, including all four 131,072-observation text
batches, callback batches and metadata. Each finishes in under one second on this
host, within the existing 30-second budget. Inert TypeScript AST checks verify all
runtime exports, three public values and three limit labels without executing
source. The 17 authored contracts remain a review draft. No wording child exists,
no consumer has changed and no source has been retired.

### B03 Home attention preflight

The unchanged 8,337-byte `home-core.mts` snapshot has SHA-256
`12bd33bd3bea025fc7b8a9774d4459a6199f163e2822bac5242f309037225620`.
Its development inventory identity is
`sha256:bb8956f01bf19b934f7c3b2c8bb1cc52ee9fefab2b786031dd508fee6f7128c8`.
The extension correction recognizes it as TypeScript source without a
filename or content change. This remains an editable development proof, with one
behavioral uncertainty left for source-bound review after refreshing derivation
with the independently installed `05d07fe6` runtime.

The full runtime surface is eight functions and three public data exports, beyond
the earlier inventory's abbreviated list. Nine authored contracts and nine
independent batches cover 82,905 observations. Cases cover evidence attribution,
goal-read versus connection precedence, callback order and original thrown errors,
change-request priority, alignment deduplication and locale sorting, returned person
aliases, launcher filtering and strict boolean permission. Metadata probes preserve
the shared mutable evidence array, label record and launch-state array, including
the launch check's response to external array edits. All probes restore their edits.

Four verifier controls pass, and inert AST checks verify every runtime export and
all three public data values. SDK profile validation and all nine embedded source
batches pass. No Home child exists, no consumer has changed and no source has been
retired. The contracts remain review drafts.

## Boundary inventory

Paths are relative to `components/legacy-project-wrapper/implementation/` unless they
start with `/`. Owner is the spec area in `/specs/align/` that states the boundary's
behavior. Class is one of: **intent** (a native Component specification), **flavor**
(target requirement), **skill** (conversion practice), **asset** (immutable input),
**harness** (repository-only), **retained** (intentionally retained source, with the
reason). "Pure" below means the module imports nothing, or only other pure modules and
types, and does not touch the database, files, network, clock or environment.

### Pure logic (native Component candidates)

| ID | Boundary | Files | Public interface | Evidence | Owner | Class |
|---|---|---|---|---|---|---|
| B01 | MCP paste lines | `lib/paste-lines.ts` is now a typed naming binding | `shq`, `safeMcpUrl`, `claudeCodeLine`, `codexLine` | All 49 native cases, 23 shell checks, complete sealed application workflow and hosted image checks | `mcp.md` | intent: integrated qualified Component `local/paste-lines`. The original algorithm is retired; web and container builds consume exact verified package files. |
| B02 | Wording helpers | `lib/v2/text-core.mts`, `plural.mts`, `money.mts`, `launch-words.ts`, `change-words.mts` | `cleanProse`, `isBlankText`, `dropInvisible`, `plural`, `count`, `usd`, `launchWords`, `changeWords`, `diffWords`, `counterSameAsBase` | direct imports in `scripts/test-v2.mjs:2271` (money), `:7337` and `:8203` (change-words), `:8225` (plural); text-core and launch-words only through the HTTP routes | `interface.md`, `goals-and-proposals.md` | intent: Component `local/wording` |
| B03 | Home attention and evidence classes | `lib/v2/home-core.mts` | `appEvidence`, `activityEvidence`, `answerEvidence`, `receiptEvidence`, `appStatusWords`, `changeWaits`, `alignmentWaits`, `launchWaits`; `EVIDENCE_CLASSES`, `EVIDENCE_WORDS`, `UNLAUNCHED_STATES` | 82,905 preflight observations in nine batches, plus original `scripts/test-v2.mjs:6456`, `:8118` cases | `workspaces.md`, `interface.md` | intent: Component `local/home-attention`; source-bound contract review, wheel proof and qualification remain open |
| B04 | Share-again wording | `lib/v2/share-again.mts` | `shareAgainText`, `shareAgainWords`, `sharingStoppedText` | `scripts/test-v2.mjs:3417` | `local-agent.md` | intent: Component `local/share-again` |
| B05 | Authorization policy | `lib/v2/policy.ts` is now a typed binding | Authorization, goal readability, goal binding, all six data values and the existing ten public types | 331,937 observations through two clean builds and the consumer; complete sealed workflow and hosted image checks | `workspaces.md`, `goals-and-proposals.md` | intent: integrated qualified Component `local/policy`; original algorithm retired |
| B06 | Input validation and error type | `lib/v2/validate.ts`, `lib/v2/errors.ts`, `lib/errors.ts` | `str`, `cleanName`, `oneLine`, `optStr`, `oneOf`, `nonNegInt`, `revisionRead`, `badRequest` | only through the HTTP routes in `test-v2.mjs` (no direct import) | `interface.md` | intent: Component `local/validate`, together with the error type it throws; needs direct probes first |
| B07 | Value card rules | `lib/v2/value-core.mts` (imports B02) | `estimateSaid`, `cleanValueText`, `safeFollowUpUrl`, `loiUrlOk`, `followUpUrl`, `spanWords` | `scripts/test-v2.mjs:5149` | `goals-and-proposals.md`, `metrics.md` | intent: Component `local/value-rules`. It reads `process.env` only as a default argument, which the spec can make an input. |
| B08 | Trust page Markdown renderer | `lib/trust/markdown.mts` | `parseMarkdown`, `parseInline`, `plain`, `slug`, `safeHref` | `scripts/test-v2.mjs:438` | `workspaces.md` (public trust pages) | intent: Component `local/trust-markdown` |
| B09 | Agent spend parsers and price table | Original `packages/align-agent/src/spend/*.ts` (4 files, retired); `packages/align-agent/src/spend.ts` and `packages/align-agent/src/spend-types.ts` hold the typed consumer names | Batch and line parsers, counts, pricing, version and rounding; event and state types preserved at the consumer | Existing metering and agent tests; complete sealed consumer receipt recorded above | `local-agent.md` | intent: integrated qualified Components `local/spend-meter`, `local/spend-stream` and `local/spend-rounding`. Only the type and naming bindings remain retained. |
| B10 | Agent envelope and share-state wording | `packages/align-agent/src/shared/envelope.ts`, `ended.ts`, `types.ts`; `notices.ts` is now a typed naming binding | `renderEnvelope`, `asksBlock`, `boundLimits`, `ENVELOPE_MAX`, `stateSituation`, `neverSentWords`, `SHARE_STATE_NOTICES`, the shared agent types | Notice helper matches 1,099 observations through two clean builds and its consumer, plus complete sealed workflow and hosted image checks | `local-agent.md`, `directives.md` | intent: integrated qualified `local/share-notices`; remaining envelope, ended wording and types stay open for `local/agent-envelope`, after CONTEXT-001 baseline verification |
| B11 | Shell command parser | `packages/align-agent/src/hooks/shell.ts` is now a typed naming binding | `ShellCmd`, `parseShell`, `commandWords` | Two clean builds and actual consumer match 11,108 observations; complete sealed workflow and hosted image checks | `local-agent.md` | intent: integrated qualified Component `local/shell-words`; original algorithm retired |

### Server, agent and UI (retained for now)

| ID | Boundary | Files | Evidence | Owner | Class |
|---|---|---|---|---|---|
| B12 | Storage, configuration and request plumbing | `lib/v2/core.mts`, `db.ts`, `node-sqlite.d.ts`, `ids.ts`, `events.ts`, `init.ts`, `config.ts`, `limits.ts`, `http.ts`; `lib/config.ts`, `secret.ts`, `startup.ts`, `locks.ts`, `http.ts`, `ratelimit.ts` | `test-v2.mjs` (opens the database directly with `node:sqlite`) | `workspaces.md` (rate limits, local and hosted edges) | retained: `node:sqlite` schema and migrations (`db.ts`, 1139 lines), secrets and environment. Every server module depends on it; the schema has to become its own data contract before anything that touches the database can transfer. |
| B13 | Identity and sign-in | `lib/v2/auth.ts`, `captcha.ts`, `mail.ts`, `local-owner.ts`, `access.ts`, `creation.ts`, `disposable.ts`, `account.ts`, `lifecycle.ts` | `test-v2.mjs` | `workspaces.md` | retained: Better Auth, passkeys, email delivery and the bot check |
| B14 | Workspaces and the sample | `lib/v2/workspaces.ts`, `sample.ts` | `test-v2.mjs` | `workspaces.md`, `goals-and-proposals.md` (Northstar sample) | retained: database |
| B15 | Goals, change requests, alignments, reallocations, requests, asks | `lib/v2/goals.ts`, `goal-limits.ts`, `changes.ts`, `changes-read.ts`, `approval.ts`, `evidence.ts`, `value.ts`, `limit-suggest.ts`, `alignments.ts`, `reallocations.ts`, `requests.ts`, `asks.ts` | `test-v2.mjs` | `goals-and-proposals.md`, `directives.md` | retained: database transactions; the main product logic, a candidate after B12's data contract |
| B16 | Sessions, devices, directives, steering, spend, allocation, activity, Home | `lib/v2/sessions.ts`, `devices.ts`, `directives.ts`, `steering.ts`, `spend.ts`, `allocation.ts`, `activity.ts`, `goal-activity.ts`, `home.ts` | `test-v2.mjs`, `scripts/test-agent-live.mjs` | `workspaces.md`, `directives.md` | retained: database and device credentials |
| B17 | Product metrics and retention | `lib/v2/metrics-core.mts`, `retention-core.mts`, `retention.ts` | `test-v2.mjs:7187` (retention-core) | `metrics.md`, `workspaces.md` (retention schedule) | retained: both cores import database helpers and the `Sql` type from `core.mts`; candidates once they take rows as input |
| B18 | MCP server, OAuth and the stdio relay | `lib/mcp/*`, `lib/oauth/*`, `app/api/mcp/*`, `app/api/oauth/*`, `app/oauth/*`, `app/.well-known/*`, `packages/align-connect/align-connect.mjs` | `scripts/test-oauth.mjs`, `scripts/oauth-test-net.mjs` | `mcp.md` | retained: OAuth 2.1 server, client registration with DNS and HTTPS checks, MCP transport |
| B19 | HTTP API | `app/api/v2/**` (76 route handlers) | `test-v2.mjs` | `interface.md` (each action's endpoint) | retained: Next.js route handlers over B12 to B17. The endpoint list is the interface contract a native server would have to match. |
| B20 | Web UI | `app/app/**` (54 files), `app/page.tsx`, `layout.tsx`, `error.tsx`, `global-error.tsx`, `globals.css`, `proxy.ts`, `instrumentation.ts` | `test-v2.mjs` browser cases (Puppeteer, `:2694`, `:3439`) | `interface.md` | retained: React and Next.js pages; parity needs browser runs, not probes |
| B21 | Public trust pages | `app/_trust/*`, `app/trust/*`, `app/privacy/*`, `lib/trust/docs.ts`, `entity.ts`, `md.d.ts` | `test-v2.mjs` page checks | `workspaces.md`, `interface.md` | retained: Next.js pages over B08 and the B23 documents. `entity.ts` still has the legal entity to fill in (DEPLOY-001). |
| B22 | Local agent CLI and hooks | `packages/align-agent/src/**` except B09 to B11 (37 files: `cli.ts`, `api.ts`, `db.ts`, `sync.ts`, `ledger.ts`, `tailer.ts`, `hooks/handlers.ts`, `siblings.ts`, `evidence.ts`, `private.ts`, the rest of `shared/`) | `packages/align-agent/test/*` (36 files), `scripts/test-agent-live.mjs` | `local-agent.md` | retained: files under `ALIGN_HOME`, macOS LaunchAgents, Claude Code and Codex hook wiring, device keys |
| B28 | Operator scripts | `scripts/align-admin.mjs`, `retention.mjs`, `sign-in-link.mjs` | `docs/HOSTING.md`; `align-admin.mjs` is copied into the image | `workspaces.md` | retained: run by an operator against the live database |

### Data, packaging, targets and harness

| ID | Boundary | Files | Evidence | Class |
|---|---|---|---|---|
| B23 | Legal documents and disposable-domain list | `docs/trust/*` (6), `docs/RETENTION.md`, `lib/v2/disposable-domains.json` | imported by `lib/trust/docs.ts` and `lib/v2/disposable.ts`; copied into the image by `Dockerfile` | asset |
| B24 | Static files | `public/*.svg` (5), `app/favicon.ico` | Only `file.svg` is referenced, by a route check in `test-v2.mjs:11787`; `globe`, `next`, `vercel` and `window.svg` look like unused Next.js template files | asset |
| B25 | Node and Next.js packaging | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`; `packages/align-agent/package.json`, `package-lock.json`, `tsconfig.json`, `scripts/postbuild.mjs` | `/litai.harness.mk` (`npm ci`, `npm run build`, `npm test`, `npm pack`) | flavor: `lang-typescript`, `ui-react`, `package-npm`, `build-make` (the project's current toolchain sources are `lang-javascript`, `package-npm`, `build-make`) |
| B26 | Container and hosting target | `Dockerfile`, `.dockerignore`, `fly.toml`, `docs/HOSTING.md` | `scripts/test-image.sh` | flavor: `deploy-docker`, `os-linux`. Target variance: Mode L serves `127.0.0.1:3100` for one person on macOS; hosted mode (`HOSTED=1`) runs the image on Fly with data in `/data` and secrets set by `fly secrets`. |
| B27 | Tests and test scripts | `scripts/test-*.mjs`, `test-all.sh`, `test-image.sh`, `oauth-test-net.mjs`, `packages/align-agent/test/**`; `native/*` except `libraries.json` holds the seven pinned oracles and verifiers | `/litai.harness.mk test`; latest completed parent receipt passes 1,818 checks | harness |
| B29 | Documents | `README.md`, `AGENTS.md`, `SECURITY.md`, `docs/*.md`, `docs/archive/**`, `docs/v2/WIRE.md`, `packages/align-agent/README.md`, `HARNESS_FACTS.md`, `packages/align-connect/README.md` | | harness (documentation for the retained code; `docs/archive` is v1 history) |
| B30 | Repository metadata | `.gitignore`, `.claude/settings.json`, `packages/align-agent/.gitignore` | | harness |
| B31 | Native package admission and build bindings | `scripts/native-libraries.mjs`, `native/libraries.json` | Eleven integrity/rollback controls, exact package membership, independent oracle replay and sealed consumer runs | harness |

### Runtime state, data schemas, CI and release

- **Server state:** one SQLite database under `ALIGN_DATA_DIR` (`/data` on Fly), with its schema and
  migrations in `lib/v2/db.ts` (B12) and the Better Auth tables created by `lib/v2/auth.ts` (B13).
  There is no separate schema file; extracting one is the prerequisite for B13 to B17.
- **Agent state:** the agent's database, ledger, keys and hook files under `ALIGN_HOME`
  (`packages/align-agent/src/paths.ts`), plus a macOS LaunchAgent (B22).
- **Wire formats:** the HTTP API (B19, endpoints listed in `interface.md`), the device and directive
  protocol (`docs/v2/WIRE.md`, `directives.md`), and the MCP tools (`mcp.md`).
- **CI:** `/.github/workflows/litai-verify.yml` (receipt, locks, authority, spec validation) and
  `/.github/workflows/rebased-on-main.yml`. Neither runs the test suite; the receipt records it.
- **Build entry point:** `/litai.harness.mk` (`build`, `test`, `run`, `package`).
- **Release and deploy:** no release or deploy job. Deploys follow `docs/HOSTING.md` by hand
  (DEPLOY-001).

A pattern check on 2026-11-04 mapped all 362 tracked files under the implementation to exactly one
row above (first matching row wins), with none left over. Rows B01 to B11 hold 23 files; B12 to
B22 and B28 hold 249; B23 to B30, excluding B28, hold 90.

The current 377-file scope is reconciled on 2026-11-05 by
`tools/native-rewrite/map-retained-boundaries.py`: every file maps to one boundary,
with no unmapped paths. Pure boundaries and their typed bindings hold 21 files;
server, agent, UI and operator boundaries hold 249; assets, targets, packaging,
harness and metadata hold 107. The new source-cache oracles and build admission
files are explicit harness rows. This membership check does not ratify the pending
authority-class review or close the remaining runtime boundaries.

`litai plan` takes a Component specification path; `.` has no `component.md` at the
root. The explicit `litai plan components/legacy-project-wrapper` succeeds. This
is a command-target distinction, with no outstanding root-plan defect.

### Proposed next boundary

The two framework corrections pass their installed-wheel proof at `05d07fe6`.
Rebind only the unqualified envelope child's
Standard execution authority through the reviewed lifecycle plan, then retry its
qualification and integrate its admitted package. The corrected CONTEXT-001
baseline already passes the full retained workflow. Accept and qualify B04's
share-again wording with its prepared 1,163 observations and contracts, then B02's
wording library with its reviewed source-bound contracts and 49-batch profile.
Retain the complete original application parity
gates as each boundary transfers. B10's remaining envelope, ended-state wording
and type boundaries, and the full program, stay open.
