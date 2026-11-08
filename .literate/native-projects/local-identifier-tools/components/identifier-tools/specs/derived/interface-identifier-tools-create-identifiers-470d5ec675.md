# Public interface: identifier-tools.create-identifiers

## ADDED Requirements

### Requirement: identifier-tools.create-identifiers

# Bound identifier helpers

Capability `identifier-tools.create-identifiers` supplies a synchronous service
bound to real entropy, hashing and current-date resources. The selected target
defines its concrete representations and existing public names.

Binding captures the supplied resource references without invoking them. Changing
the binding record later does not reconfigure an existing service. Distinct
bindings retain their own resources. Every returned operation works as a bare
function and preserves its original function name and required argument count.
No operation reads an ambient clock, entropy source, hash provider, environment,
filesystem, network or application state.

## Random identifiers

The base32 operation requests the specified number of random bytes once. An
omitted or undefined byte count uses fifteen. Consume each byte in order, most
significant bits first, using the lowercase RFC 4648 alphabet
`abcdefghijklmnopqrstuvwxyz234567`. Emit each complete five-bit group. If bits
remain, append one alphabet character with the remaining bits in its high
positions and zero low bits. Do not append padding. Preserve zero-byte requests.
Do not normalize, truncate, cache or replace supplied entropy.

The prefixed operation returns the supplied prefix, one underscore and the
base32 encoding of fifteen freshly requested bytes. Preserve the prefix text.
The secret-token operation requests the specified number of random bytes once
and returns their unpadded URL-safe base64 encoding. An omitted or undefined
byte count uses thirty-two. Every call obtains its own entropy sample.

The entropy resource owns byte-count validation. Forward its argument and
propagate the same thrown value. Do not substitute a validator, coercion, empty
result, fallback entropy, retry or different error.

## Hashing and time

Hash the exact supplied string or binary buffer using SHA-256. Create the bound
hash resource with algorithm `sha256`, pass the original input to `update`, then
request `digest` with encoding `hex`. Preserve resource method receivers, call
order, lowercase hexadecimal output and every resource failure's identity.
Do not normalize strings or reinterpret binary bytes as text.

The time operation calls the current-date resource once, then calls the returned
date object's `toISOString` method with its original receiver. Preserve its UTC
ISO text, including milliseconds. Each operation obtains a new current date.
Propagate construction and formatting failures as the same thrown value. Do not
sample an extra clock, cache an instant or retry either operation.

## Caller contract

The application retains its public prefix type and all five existing helpers.
Its ID module and shared core continue to export the same base32 function.
That cross-module identity requires actual consumer acceptance. A factory-only
qualification does not prove it. The shared core retains its separately owned
creation-code, purge, signing, file, event, database and email behavior until
their own boundaries independently qualify.

Preserve the independently frozen source observations and resource traces.
Private fixture selectors belong to the verifier, outside the public API and
generation inputs. Introduce no artificial public arguments for test diversity.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:663741c02929338a5573`, `evidence:d9cf4635aa16bb6821bf`
