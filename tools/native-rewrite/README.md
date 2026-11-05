# Native boundary qualification helpers

Use the Python interpreter from the project's pinned framework environment. These
helpers do not change that environment or publish anything.

`map-retained-boundaries.py SCOPE_PLAN_JSON OUTPUT_JSON` checks that every retained
source member has a boundary owner. It preserves the distinction between file
membership and pending authority-class review. The current 377-file scope maps
without gaps; new unmatched paths fail explicitly.

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
preserves return/throw distinctions and argument mutations. Its three controls run
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
data through inert TypeScript AST inspection. These are preflight inputs too.

After each library has a current qualified projection and receipt, use the local
`litai cache publish --target project-committed` operation in its project to copy
verified cache records. This command copies local data only. Generate the reviewed
consumer pins with:

```sh
python tools/native-rewrite/make-consumer-manifest.py . \
  components/legacy-project-wrapper/implementation/native \
  spend-meter spend-stream spend-rounding paste-lines policy shell-words share-notices
```

The retained agent build runs `scripts/native-libraries.mjs` from the retained
implementation. It verifies the pinned package bytes and replays all 98 independent
acceptance cases before writing the source and distribution copies. Development
builds check live provider locks and authority heads; sealed builds receive the
reviewed manifest and the same immutable cache bytes. The full sealed harness
receipt remains necessary before claiming application integration. Keep all consumed
libraries in the manifest. The web build selects paste-lines and policy, replaying
their 92 independent batches; the agent selects the three spend libraries and
shell-words and share-notices, replaying 98 batches. `npm run prepare:container` exports the exact
verified web inputs locally.
The Docker build checks them and reruns web acceptance before compiling, while
the runtime image contains only the application build and operator files.
Mechanical package-specific bindings live under `.bindings/`. Browser consumers
import only their own package binding; adding a server library never adds it to
the paste helper's import graph.

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

`register-qualified-child.py` is a local extension for adding an already-qualified
child to a qualified parent. It uses the pinned framework's current-evidence,
safe-path, registration and storage routines. It never changes the stage order or
permits an unqualified child. Generate a plan with `--project` and `--child`, inspect
it, then apply that exact file with `--apply`. The child must be a direct directory
under `.literate/native-projects` and have no coordinate or project-ID collision.
This registers component authority; wiring the application to consume its package
and retiring retained source are later, separately reviewed work.

The extension holds both framework metadata locks, checks that the reviewed plan
is current, registers the child, and revalidates every qualified component before
renewing the parent's exact evidence. It retains the previous registry and authority
under `.literate/native-additions`. Exceptions restore both metadata files. An abrupt
process or machine interruption between file writes leaves a stale parent claim,
which the ordinary framework gate rejects. Preserve that journal and recover its
prior metadata before retrying; do not treat an interrupted application as success.

Run the transaction failure tests with:

```sh
python -m unittest discover -s tools/native-rewrite -p 'test_*.py'
```

The portable upstream defect draft is part of the native rewrite program. Filing
it requires the operator's explicit go.

`source-module-extensions.patch` contains the staged source inventory correction
against parent commit `4548261e3c2293c75b22dcfafd831821c80179a6`: JavaScript/TypeScript
module and JSX extensions, preserved exclusion classifications, focused controls
and user documentation. Check and apply its zero-context diff with
`git apply --check --unidiff-zero` and `git apply --unidiff-zero` against that exact
base. Fourteen conversion regression tests, lint and formatting
pass. A new non-editable runtime remains pending an explicitly approved source
commit because the wheel backend requires a clean exact checkout.

`retained-scope-qualified-children.patch` is a portable diff against parent revision
`d935813eba84b391cacd842be848b31dae17a582`. It uses zero-context hunks, so review
and check it with `git apply --check --unidiff-zero` before applying it to that
exact base. The isolated parent checkout also retains the source commit and its
later verification record.
