# Public interface: server-secrets.create-tools

## ADDED Requirements

### Requirement: server-secrets.create-tools

# Bound server secret helpers

Capability `server-secrets.create-tools` binds persisted-secret selection and
message authentication to caller-owned configuration, storage, path and
cryptographic resources. Concrete names, representations and host calls belong
to the selected target.

## Binding

Capture supplied resource references without invoking them. Binding creates no
files, reads no configuration, requests no entropy and computes no digest.
Operations work as detached functions. Keep the public names and required arities
defined by the target.

## Secret selection and persistence

For each invocation, use the explicitly supplied environment or consult the
current environment resource when that optional argument is absent. A nonempty
configured secret bypasses storage and entropy completely. Return its exact
string, preserving whitespace and Unicode.

Otherwise resolve the target's secret file beneath the supplied data directory.
When it is absent, create its parent recursively, request 32 bytes from the real
cryptographic entropy resource and persist their lowercase hexadecimal form with
the target's creation permissions. Use those exact returned bytes. Fixed values,
counters and noncryptographic substitutes do not satisfy this contract.

Read the file after the existence and optional creation steps. Decode it with the
target's text representation and trim surrounding whitespace. Existing empty or
whitespace-only files return an empty string. Preserve internal whitespace.

Read existing content again on later calls; introduce no process-wide key cache.
Repeated calls reuse the persisted value, while independent directories retain
their own files. Preserve existing file permissions and the host's path and
symlink behavior. This boundary adds no locking, exclusive creation, replacement,
permission repair or concurrency guarantee.

Propagate a failed resource operation as the same thrown value and stop at that
operation. Preserve earlier completed effects. Do not retry, replace the error or
remove a successfully created file after a later read failure.

## Message authentication

Authenticate each supplied payload with keyed SHA-256 HMAC and return the
unpadded URL-safe Base64 digest. Use the caller's exact secret and payload on
each call, preserving empty strings, Unicode, embedded nulls and domain prefixes.
Secret selection, filesystem operations and entropy are separate from this
operation. Propagate cryptographic resource failures unchanged.

## Scope and acceptance

The captured original boundary contains only `serverSecret` and `hmac`. The
configured web facade, authentication's separate secret file, event and creation
prefixes, and other core behavior retain their existing owners. The core must
remain usable by the Node-only operator.

The source reference preserves 35 cases on macOS and Linux. Eight broken-source
controls are rejected, including discarded cryptographic entropy. These are
parity observations, without security or concurrency certification.

Before consumer transfer, require the independent target verifier, two clean
qualifications, separate admission, complete public type and actual consumer
compatibility, complete application and image acceptance, and a current receipt.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:168db031042feefbbbb2`
