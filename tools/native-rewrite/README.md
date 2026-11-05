# Native boundary qualification helpers

Use the Python interpreter from the project's pinned framework environment. These
helpers do not change that environment or publish anything.

`litai-local.py` forwards the ordinary CLI arguments and adds conservative diagnostic
redaction. It preserves failure codes, phases and every lifecycle gate. Use the
framework runtime recorded in the B09 recovery section, which contains the existing
request-file reading fix. An older runtime can otherwise request a file read while
prohibiting the only available reading tool.

`make-spend-profile.py INPUT OUTPUT` preserves every B09 case and expected result,
encoding the input arguments as JSON text. The evidence schema permits integer
numbers only; the parsers still receive the original fractional counter values.
The resulting profile embeds `spend-probe.mjs` and its syntax checker, so its
commands do not depend on helper scripts at an operator's absolute path. The 110
original inputs are grouped into 11 batches to fit the library oracle's 64-case
limit. Each batch retains every input and expected result. `make-spend-oracle.py`
binds the identical batches and `spend-library-harness.cjs` to the locked interfaces.

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
