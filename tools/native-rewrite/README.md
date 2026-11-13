# Native boundary qualification helpers

Use the Python interpreter from the project's pinned framework environment. These
helpers do not change that environment or publish anything.

`map-retained-boundaries.py SCOPE_PLAN_JSON OUTPUT_JSON` checks that every retained
source member has a boundary owner. It preserves the distinction between file
membership and the accepted authority classes. The reviewed class record is
`docs/architecture/native-authority-classification.json`; new unmatched paths fail
explicitly.

`litai-local.py` forwards the ordinary CLI arguments and adds conservative diagnostic
redaction. It preserves failure codes, phases and every lifecycle gate. Use the
framework runtime recorded in the B09 recovery section, which contains the existing
request-file reading fix. An older runtime can otherwise request a file read while
prohibiting the only available reading tool.

`source-module-extensions.patch` and `library-import-command.patch` preserve the
prepared parent fixes for inert module-source recognition and bounded library
import verification. Their owning queue items, issue drafts and wheel-proof gates
are recorded in the rewrite program. Apply them in parent authority and use a
clean non-editable wheel before qualification; existing child runtime pins remain
explicit lifecycle decisions.

`make-spend-profile.py INPUT OUTPUT` preserves every B09 case and expected result,
encoding the input arguments as JSON text. The evidence schema permits integer
numbers only; the parsers still receive the original fractional counter values.
The resulting profile embeds `spend-probe.mjs` and its syntax checker, so its
commands do not depend on helper scripts at an operator's absolute path. The 110
original inputs are grouped into 11 batches to fit the library oracle's 64-case
limit. Each batch retains every input and expected result. `make-spend-oracle.py`
binds the identical batches and `spend-library-harness.cjs` to the locked interfaces.

The incremental parser uses a separate `local/spend-stream` child. Capture its
baseline with `node make-stream-cases.mjs SOURCE_SNAPSHOT CASES_JSON`, then use
`make-stream-profile.py CASES_JSON PROFILE_JSON`. The capture reuses the 48 parser
transcripts in the qualified batch component and adds initializer, helper and
restored-state probes. It records 132 inputs, including 135 per-line observations,
in 19 capability batches. `make-stream-contracts.py OUTPUT_JSON` produces the
reviewable public contracts; `make-stream-oracle.py CHILD_ROOT` binds the exact
profile cases and verifier to the accepted interface identities.

`stream-harness.cjs` observes returned events and the caller's mutated state. Its
type-tagged values preserve absent properties, undefined, NaN, null and negative
zero. Traces restore the state from JSON between lines, allowing each line to be a
tailer checkpoint. Run `node --test tools/native-rewrite/test-stream-harness.cjs`
to check observation fidelity, snapshot isolation and detection of missing state
mutations. Keep these checks and every baseline case when regenerating the child.

`make-rounding-profile.mjs SOURCE_SNAPSHOT PROFILE_JSON CONTRACTS_JSON` captures
31 BigInt rounding cases for `local/spend-rounding`. Decimal text carries exact
inputs, and number results are compared as text to preserve overflow observations.
The corresponding `rounding-harness.cjs` runs both profile and acceptance calls.

After the corrected policy baseline has its full passing receipt, capture it with
`make-policy-profile.mjs SOURCE_SNAPSHOT PROFILE_JSON CONTRACTS_JSON`. The policy
verifier covers 331,937 observations in 43 batches: all supported actions and
object kinds, workspace roles, team membership Maps, visibility, ownership,
transfers, exported policy data and opaque identifier cases. Each fingerprint
binds type-tagged return or throw observations and the arguments after the call.
The package keeps its ordinary JavaScript Map and object API. Run
`node --test tools/native-rewrite/test-policy-harness.cjs` to check observation
fidelity, mutation detection, matrix coverage and empty-range refusal.

`make-share-again-profile.mjs SOURCE_SNAPSHOT PROFILE_JSON CONTRACTS_JSON` captures
1,163 observations across 13 batches for the three share-again wording functions.
It covers device states, null and opaque names, structured sentence parts, deleted
accounts, omitted options and explicit undefined defaults. The standalone verifier
preserves return/throw distinctions, argument mutations, nested references and
output prototypes. Its four controls run
with `node --test tools/native-rewrite/test-share-again-harness.cjs`.

`make-shell-profile.mjs SOURCE_SNAPSHOT PROFILE_JSON CONTRACTS_JSON` captures
11,108 observations in 23 batches for the heuristic shell reader. Its matrix covers
syntax combinations, heredocs, nested and opaque spans, malformed text, seeded
fragments and exact assignment/wrapper stripping. Strings remain parser data.
The matrix preserves all 11,048 initial inputs and adds 60 focused cases for pending
normal redirections followed by heredocs, including malformed input.
`shell-harness.cjs` observes returned structures and argument state, including array
properties. Run `node --test tools/native-rewrite/test-shell-harness.cjs` for the
coverage, mutation/isolation and range-refusal controls.

`make-notices-profile.mjs SOURCE_SNAPSHOT PROFILE_JSON CONTRACTS_JSON` captures
1,099 observations across 14 batches for the notice helper subset of B10. It
preserves exact wording, first-slash extraction, all nine share prefixes and the
public prefix array's shared mutable identity. Its three controls run with
`node --test tools/native-rewrite/test-notices-harness.cjs` and detect detached
copies, argument mutation, public-state mutation and invalid observation ranges.

The remaining B10 API uses `capture-envelope-baseline.mjs SOURCE_SNAPSHOT OUTPUT`
to observe its 49 functions and two metadata capabilities, including public record
and Set identity, returned aliases, clipping budgets, share-state combinations and
omitted defaults. The current matrix has 563,717 observations in 59 batches.
`make-envelope-profile.mjs CAPTURE OUTPUT` embeds the verifier and checks complete,
gap-free case coverage. The four controls run with
`node --test tools/native-rewrite/test-envelope-harness.cjs`. Complete reviewed
contracts and a passing corrected baseline are still required before acceptance.
`make-envelope-contracts.mjs OUTPUT` authors the 51 contracts and refuses a missing
or duplicate capability. `check-envelope-contracts.mjs SOURCE_SNAPSHOT CONTRACTS`
uses the retained application's installed TypeScript parser for inert AST checks:
all fixed share wording, public data values and authority headings must match.
It never executes the source. Semantic review remains separate from this literal
comparison and from the independent runtime observation profile.

For B02, run `capture-wording-baseline.mjs SOURCE_SNAPSHOT CAPTURE`, then
`make-wording-profile.mjs CAPTURE PROFILE`. The self-contained profile covers
4,598,945 observations in 49 batches, with every Unicode code point for all four
text cleaners, currency boundaries, launch and change wording, optional defaults,
callback traces and preserved input references. Four verifier controls run with
`node --test tools/native-rewrite/test-wording-harness.cjs`.
`make-wording-bindings.mjs` prepares all five typed public facades outside retained
source. It preserves sixteen function signatures, three public type declarations
and three scalar data names; it emits no runtime algorithms.
`make-wording-contracts.mjs OUTPUT` authors all 17 contracts and refuses omissions.
`check-wording-contracts.mjs SOURCE_SNAPSHOT CONTRACTS` checks exports, public data
and private limit labels with the TypeScript parser without executing source.
These remain preflight inputs until review, acceptance and qualification pass.

For B03, run `make-home-profile.mjs SOURCE_SNAPSHOT PROFILE CAPTURE` to observe
82,905 inputs across all eight functions and three public data values in nine
batches. The self-contained verifier preserves returned person aliases, callback
order and thrown error identity, alignment sorting, and shared public array/record
identity and mutations. Four controls run with
`node --test tools/native-rewrite/test-home-harness.cjs`.
`make-home-contracts.mjs OUTPUT` authors the nine contracts;
`check-home-contracts.mjs SOURCE_SNAPSHOT CONTRACTS` checks all exports and public
data through inert TypeScript AST inspection. B03 is qualified and consumed by the parent.

For B08, `make-markdown-profile.mjs SOURCE_SNAPSHOT PROFILE CAPTURE` preserves
1,153,547 observations in 21 batches, including all Unicode code points, exact
Markdown structures, callback and error identity, placeholders, sparse arrays
and seven cached real document fixtures. Four controls run with
`node --test tools/native-rewrite/test-markdown-harness.cjs`.
`make-markdown-contracts.mjs OUTPUT` authors all five contracts;
`check-markdown-contracts.mjs SOURCE_SNAPSHOT CONTRACTS` checks exports, six public
types and grammar literals with inert AST inspection. The qualified child and its
actual typed consumer match the complete profile.
`make-markdown-bindings.mjs SOURCE_FILE OUTPUT_FILE` prepares six public types and
five function aliases outside retained source for review before registration and
integration. `make-home-bindings.mjs` follows the same rule for Home's types,
function names and shared metadata.

For B06's error subset, `make-http-errors-profile.mjs SOURCE_SNAPSHOT PROFILE
CAPTURE` covers 22,618 observations in nine batches. Source qualification requires
TypeScript 5.9.3's `tsc` on PATH and uses the existing ES2017 target in a disposable
directory. The generated API needs no TypeScript compiler. Five controls run with
`node --test tools/native-rewrite/test-http-errors-harness.cjs`.
`make-http-errors-contracts.mjs` authors the five contracts;
`check-http-errors-contracts.mjs` checks both constructors and all four factories
without executing source. `make-http-errors-bindings.mjs SOURCE_SNAPSHOT OUTPUT`
prepares two ambient class declarations and the original constructor/factory
names outside retained source. They preserve public types and subclassing without
runtime algorithms. The qualified child and actual consumers match all nine
batches, including class identity, descriptors, aliases and original errors.

For B12's promise queue, `make-queues-profile.mjs SOURCE_SNAPSHOT PROFILE CAPTURE`
records 5,290 asynchronous observations in 22 batches. The standalone
`queues-harness.cjs` isolates import modes, observes the shared global Map and
uses controlled promises and bounded microtask drains. Five controls run with
`node --test tools/native-rewrite/test-queues-harness.cjs`.
`make-queues-contracts.mjs` and `check-queues-contracts.mjs` keep authored meaning
separate from observations and check the one generic public API inertly.
Both clean qualification builds and the separately admitted build pass all queue inputs.
Consumer and complete application evidence belong to the parent program.

For B12's runtime settings,
`capture-runtime-settings.mjs IMPLEMENTATION SNAPSHOT RECORD_JSON` preserves both
configuration modules and extracts the five exact shared settings declarations
from `core.mts`. It checks the reviewed source hashes and public exports before
writing. Keep the record outside the source snapshot. The captured source leaves
the existing qualified follow-up dependency external and excludes unrelated core
cryptography, secrets, schema and storage code. Its isolated replay preserves all
18,156 retained observations and seven state traces. The
[proposed settings contract](../../docs/architecture/runtime-settings-contract.md)
records the complete stateful service and Node mapping. Qualification and consumer
transfer remain open.

For B12's migration coordinator,
`capture-migration-coordinator-source.mjs SOURCE_DB OUTPUT_DIRECTORY RECORD_JSON`
checks the complete reviewed `db.ts` baseline and extracts only its exact migration
function. Keep the extraction record outside the source snapshot. Retrieve that
baseline from checkpoint `bb2605c` after the retained runner has been replaced.
`make-migration-coordinator-profile.mjs SOURCE_SNAPSHOT PROFILE CAPTURE` executes
the exact frozen `migrate.ts` function with authored minimal schemas and the real
SQLite driver. It records 645 observations in 21 capability batches, including
original error identity, broken-reference errors, per-change commits and cleanup
precedence. The profile selects two clean runs. The same batch digests match on
macOS and Linux Node 24.22.2. Run
`node tools/native-rewrite/test-migration-coordinator-harness.cjs SOURCE_SNAPSHOT`
for all 13 observer controls. `make-library-oracle.py` binds these exact batches
and `migration-coordinator-harness.cjs` before generation. Both clean qualification
builds pass all 21 batches. The target adapter passes all 213 actual-consumer
storage checks. Complete application and image checks pass for this checkpoint;
their current receipts belong to the native rewrite program. Historical SQL, the schema,
connection management and auth retain their existing authority.

For the remaining B06 validation functions,
`make-field-validation-bindings.mjs SOURCE_SNAPSHOT OUTPUT_DIRECTORY` prepares
one context-bound native factory call, fifteen public function aliases, six data
aliases and the original Body type. It preserves generic choice inference and
both revision overloads. The draft must remain outside retained source until
normal qualification, admission and public child registration pass. The original
and drafted public namespaces pass TypeScript compatibility in both directions;
no validation consumer is transferred by this helper alone.

After each library has a current qualified projection and receipt, use the local
`litai cache publish --target project-committed` operation in its project to copy
verified cache records. This command copies local data only. Generate the reviewed
consumer pins with:

```sh
python tools/native-rewrite/make-consumer-manifest.py . \
  components/legacy-project-wrapper/implementation/native \
  spend-meter spend-stream spend-rounding paste-lines policy shell-words share-notices share-again home-attention trust-markdown http-errors promise-queues wording agent-envelope value-rules field-validation migration-coordinator runtime-settings storage-schema rate-limits identifier-tools \
  --provider agent-envelope=.literate/native-projects/local-agent-envelope-stop-v2
```

When the reviewed revision operation registers a replacement in a different
physical directory, keep the logical component name and pass its exact registered
provider path with `--provider COMPONENT=PATH`. For example, a registered envelope
replacement can be selected with
`--provider agent-envelope=.literate/native-projects/local-agent-envelope-stop-v2`.
The helper checks that registration against the child's project definition, then
performs the existing qualification, lock, cache and verifier checks. The default
directory convention remains available for other providers. This option does not
register a child, revise authority or grant execution.

The retained agent build runs `scripts/native-libraries.mjs` from the retained
implementation. It verifies the pinned package bytes and replays all 161 independent
acceptance cases before writing the source and distribution copies. Development
builds check live provider locks and authority heads; sealed builds receive the
reviewed manifest and the same immutable cache bytes. The full sealed harness
receipt remains necessary before claiming application integration. Keep all consumed
libraries in the manifest. The web build selects paste-lines, policy, share-again,
home-attention, trust-markdown, http-errors, promise-queues, wording, value-rules,
field-validation, migration-coordinator, runtime-settings, storage-schema,
rate-limits and identifier-tools, replaying their 511 independent batches. The
agent selects the three spend libraries and shell-words, share-notices and
agent-envelope, replaying 161 batches. `npm run prepare:container` exports the exact
verified web inputs locally.
The Docker build checks them and reruns web acceptance before compiling, while
the runtime image contains only the application build and operator files.
Mechanical package-specific bindings live under `.bindings/`. Browser consumers
import only their own package binding; adding a server library never adds it to
the paste helper's import graph. The root index exports each package namespace
and only unambiguous flat aliases. Overlapping names never silently select a
provider, while duplicate names within one package still refuse.

Register new children before editing retained consumer source. The addition helper
requires the parent's current retained receipt and correctly refuses a stale one.

Qualify the promoted child through the ordinary command with `CODING_CLI=codex`:

```sh
litai spec qualify .literate/native-projects/local-spend-meter/components/spend-meter \
  --source SOURCE_SNAPSHOT \
  --profile .literate/native-projects/local-spend-meter/components/spend-meter/qualification/profile.json \
  --target host --output QUALIFICATION_RECORD --scratch-root SCRATCH \
  --allow-host-execution
```

Use the public framework commands to add an already-qualified child to a qualified
parent. Accepted parent ADR 0064, originally reviewed locally as ADR 0060, and
issue #315 own this operation. Approved local
framework commit `4d672137` supplies it; that commit is not yet published or released.
Select its separately verified non-editable installation when running these commands:

```sh
litai project native-child plan-add .literate/native-projects/CHILD --project . > PLAN.json
# Inspect the exact plan before applying it.
litai project native-child apply-add PLAN.json --project . --acknowledge
litai project native-child recover-add JOURNAL --project .
```

The canonical plan binds the current receipt, parent authority, exact registry,
child definition, authority heads and qualified evidence union. Apply rechecks
these under the registry and authority locks. Ordinary failures roll back; process
interruption leaves a guarded journal beneath `.literate/native-child-additions`.
Recovery refuses unrelated input changes and restores only the known transaction.
Source retirement, consumer wiring and execution remain separate operations.

The former local transaction and its five tests are retired after 25 framework
transaction controls pass from source and from the installed wheel. All 93 focused
installed regressions pass at `4d672137`. The real public operation
adds the fifteenth child, preserves all 14 prior registrations and 421 protected
files, and passes ordinary parent verification. Its planning and completed recovery
preserve protected bytes, modes and modification times. Exact copies of both old
helper files remain in the external recovery directory. Earlier
`.literate/native-additions` journals remain unchanged; the new command does not
reinterpret that historical format. A separate public-CLI fixture qualifies two
fresh libraries, interrupts the process after registry publication, observes ordinary
verification refusing the stale qualification and recovers exact prior metadata.
Reapplication retains the first child and all 525 protected files. The complete
fifteen-library application then passes all 1,821 checks through that installed SDK.

`source-module-extensions.patch` contains the staged source inventory correction
against parent commit `4548261e3c2293c75b22dcfafd831821c80179a6`: JavaScript/TypeScript
module and JSX extensions, preserved exclusion classifications, focused controls
and user documentation. Check and apply its zero-context diff with
`git apply --check --unidiff-zero` and `git apply --unidiff-zero` against that exact
base. Fourteen conversion regression tests, lint and formatting pass. Commit
`05d07fe6` includes this correction and the bounded import command. Its separate
non-editable wheel proves unchanged module derivation and all 51 import mappings.
The later export-map correction is published in draft framework PR #313 at
`d4bd72bf`; its clean wheel passes the import regression and normal qualification
of the unchanged wording profile. Existing registered children retain their pins.

`retained-scope-qualified-children.patch` is a portable diff against parent revision
`d935813eba84b391cacd842be848b31dae17a582`. It uses zero-context hunks, so review
and check it with `git apply --check --unidiff-zero` before applying it to that
exact base. The isolated parent checkout also retains the source commit and its
later verification record.


`library-export-order.patch` compares exact own export keys independently of
insertion order. Its tests retain wrong-target, symbol, dependency and path
refusals, including an inherited missing key replaced by a same-count extra key.
Upstream issue #314 and draft PR #313 own this correction. The rewrite program
records its source commit, wheel identity and real qualification evidence.

## Aggregate count regression

Run `python3 tools/native-rewrite/test-aggregate-count.py` to exercise the actual
retained gate runner with synthetic command results. The fixture uses only the
Python standard library. Its nine cases check the complete numeric aggregate and
a nonzero exit for a failure in each of the eight stages. The synthetic results
are isolated from application acceptance and create no receipt.

## Storage contract preparation

The proposed [entity and upgrade contract](../../docs/architecture/storage-entity-contract.md)
separates portable obligations from the SQLite target description. The
[contract observations](../../docs/architecture/storage-contract-observation.json)
record exact helper identities and the current diagnostic results. These tools
do not generate or qualify the application's replacement storage implementation.

Use Node with its SQLite module and Python 3.11 or newer. Set
`ALIGN_SCHEMA_BASELINE_DIR` to a new directory outside this project. Capture reads
the exact historical source from Git, checks its identities before executing SQL,
and uses isolated in-memory databases. It refuses an existing output directory.

```sh
node --no-warnings tools/native-rewrite/capture-storage-schema.cjs . bb2605c80db29e03862ac2a2a9affe134184a7da "$ALIGN_SCHEMA_BASELINE_DIR"
python -B tools/native-rewrite/schema-target-model.py "$ALIGN_SCHEMA_BASELINE_DIR/inventory.json" "$ALIGN_SCHEMA_BASELINE_DIR/target-proposal.json"
python -B tools/native-rewrite/test-schema-target-model.py "$ALIGN_SCHEMA_BASELINE_DIR/inventory.json" "$ALIGN_SCHEMA_BASELINE_DIR/model-check.json"
node --no-warnings tools/native-rewrite/probe-schema-compatibility.cjs "$ALIGN_SCHEMA_BASELINE_DIR/inventory.json" "$ALIGN_SCHEMA_BASELINE_DIR/source/migrations" "$ALIGN_SCHEMA_BASELINE_DIR/compatibility.json"
```

Capture reproduces all 23 historical shapes and 22 frozen SQL bodies. The model
checker describes constraints as structured data, reconstructs each shape through
the real SQLite engine and compares its observations. Sixteen mutation/refusal
controls check the description boundary. The additional 19 compatibility cases
cover nulls, affinity, Unicode length, reference scope, partial uniqueness,
statement rollback and sequence allocation. The seed factory contains only
explicit synthetic fixtures. The reconstructor remains an observer control;
candidate generation must use separately reviewed Component and Flavor authority.


## Bound storage consumer

The isolated twenty-two-library candidate adds `storage-runtime` to the web and
container preparation list. Agent preparation remains six libraries. The complete
web preparation accepts 555 cases across sixteen libraries; the actual typed
storage adapter preserves 43 source cases on macOS and Linux and all thirteen
public export types assign in both directions.

Before pinning a newly admitted child, copy its accepted runtime entry into its
already-declared portable target with the ordinary local command:

```sh
litai cache publish --project PATH_TO_CHILD --target project-committed
```

The manifest helper reads `generated/committed-source-cache`. It deliberately
refuses an absent or ambiguous entry. Cache transfer preserves the accepted entry;
the consumer still runs the independent acceptance contract for every hit.
Keep the explicit registered envelope provider selection when rebuilding all
consumer records:

```sh
--provider agent-envelope=.literate/native-projects/local-agent-envelope-stop-v2
```

This local storage checkpoint leaves complete application, image and current
parent-receipt acceptance to ADOPT-002. Full 31-boundary and public tester gates
remain open.
