# Qualification source review

These are review copies of the historical authentication, sample and workspace
qualification commands. The accepted profiles remain unchanged so their evidence
identities are preserved. No file in this directory supplies generation authority.

Start with manifest.json. For each command it links the exact original profile,
its SHA-256, decompression hashes and a review.js template with compression
wrappers removed. Every executable segment is preserved. JSON literals are
replaced with named references: BODIES and privateFiles contain the exact
decoded module strings, while cases.index.json lists every case and hashes its
expected output data. Repeated expected output data stays in the immutable
profile. The exporter proves the template plus original JSON literals reproduces
the fully decoded command exactly. Do not execute these review templates.
The source command's
privateFiles include original baseline implementations, so keep this directory
outside every model generation input.

The exporter parses literals and decompresses bytes. It never evaluates a runner.
The copies are for reading and are not substituted for the historical commands.

Verify: python3 tools/native-rewrite/review-qualification-source.py
Refresh after a deliberate profile change: add --write to the same command.
