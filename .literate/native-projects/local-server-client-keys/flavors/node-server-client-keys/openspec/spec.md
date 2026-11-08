# Node-Server-Client-Keys implementation Flavor

## ADDED Requirements

### Requirement: Node client-key resource binding [authored:node-server-client-keys-contract-v2]

# Node client-key binding

Target Node 24 or later on macOS and Linux. Export synchronous named factory
`create_client_keys`, with arity one, from module
`server_client_keys/create_client_keys`. It provides `server-client-keys.create-client-keys`.

The package export map must contain exactly the keys and targets of the locked
library import surface. For this capability the public module and factory are
`server_client_keys/create_client_keys` and `create_client_keys`. Keep internal
helpers and self-test entrypoints unexported; add no root or compatibility alias
to the package export map.

Read the supplied resource container's `config` property exactly once during
construction. Capture that handle without invoking or validating it. The returned
object's enumerable own keys, in order, are exactly `clientNet`, `clientOf`.
Both values are synchronous functions with their respective names and arity one.
Separate factories return distinct objects and retain their own captured handle.
Both operations work detached from the object. Do not wrap a configuration call
in an artificial receiver or read the container again after construction.

## `clientNet(ip: string): string`

Use the input's ordinary `trim()` operation, then `toLowerCase()`. Remove one
opening bracket at the beginning and one closing bracket at the end using the
global regular expression `/^\[|\]$/g`. Then split on `%` and keep the first part.
Perform those operations in that order. Let this cleaned text be `v`.

If `v` contains no colon, return it unchanged. This includes ordinary dotted IPv4
text and non-address text. Do not convert dotted-only octets, strip their leading
zeroes, validate their ranges or substitute a fallback.

Otherwise, recognize a dotted tail with
`/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/`. Convert the four captured
decimal strings with `Number`. If any exceeds 255, immediately return the cleaned
`v` unchanged. Otherwise replace the dotted tail with two lowercase hexadecimal
groups: pack the first two and last two octets using ordinary JavaScript left
shift and bitwise OR, then convert each packed value with `toString(16)`.

Split the resulting text on `::`, using only its first two pieces as `head` and
`tail`; default a missing tail to the empty string. Split a truthy head on `:`.
Split the tail only when the text contains `::` and the tail is truthy. Between
those arrays insert `Math.max(0, 8 - headGroupCount - tailGroupCount)` strings
equal to `"0"`. This padding also applies to short colon forms without `::`.
Convert each resulting group with `parseInt(group || "0", 16)`; call the resulting
numeric array `groups`.

Recognize an IPv4-mapped result only when there are exactly eight groups, the
first five are strictly zero and the sixth is strictly `0xffff`. Return the last
two groups as four decimal parts using, in order, `groups[6] >> 8`,
`groups[6] & 0xff`, `groups[7] >> 8`, `groups[7] & 0xff`, joined by dots.
Preserve JavaScript signed bitwise
semantics. Add no group-range validation or masking beyond those operations.

For other colon forms, use the first four converted groups. Replace a `NaN`
group with `"0"`; otherwise call its `toString(16)`. Join with colons and append
`::/64`. Preserve partial parsing, overlong or negative groups, extra groups and
multiple compression separators according to these exact operations. Do not
replace this behavior with a strict IP parser or a canonical-address library.

Use ordinary input methods without eager string coercion or type validation.
Preserve ordinary method results and failures for runtime inputs as supplied.
Normalization never invokes configuration or any ambient effect provider.

## `clientOf(req: Request): string`

Call the captured `config` function without a receiver and read the returned
value's `hosted` property. Use ordinary JavaScript truthiness. Do this once per
operation, preserving provider and property failures by identity. Do not cache
the returned configuration or its mode between calls.

When mode is falsy, return exactly `"local"` without accessing `req.headers`.
Otherwise obtain `req.headers` once and call its `get` method with that headers
object as receiver and exactly `"fly-client-ip"` as its argument. Apply the nullish
fallback `"unknown"` to that result. An empty string retains its empty value.
Pass the result through the ordinary `clientNet` behavior and return its result
prefixed by `"ip:"`. Do not split proxy lists, consult another header, add address
validation or otherwise reinterpret the caller's trust decision.

Preserve synchronous return and failure behavior. Configuration, `hosted`, header
property and header method failures escape unchanged; add no catch or retry.
Mutating the original resource container after construction must not replace the
captured configuration handle. Calls on distinct factories remain independent
except for state deliberately supplied through their explicit providers.

Generated code may use ordinary language intrinsics for these operations and
relative package modules. It requires no external runtime dependency. It must
not access ambient process/environment, filesystem, network, console, clock,
timers, entropy, dynamic code or hidden background effects. The private VM checks
are functional guards, not a security sandbox. Normal package build and generated
self-tests remain separate from the original source and private acceptance inputs.


#### Scenario: Client normalization and current-mode key selection

- **WHEN** the Node client-key target is selected
- **THEN** Preserve the whole clientNet/clientOf namespace, exact normalization and loose forms, one captured config handle, fresh provider reads, header receiver and absence semantics, detached calls and exact failure identity.
