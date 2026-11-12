# Node-Storage-Refresh-Schema implementation Flavor

## ADDED Requirements

### Requirement: Device refresh schema extension target binding [authored:node-storage-refresh-schema-v1]

# Device-refresh schema extension for Node and SQLite

JavaScript module `storage_refresh_schema/extend_device_refresh_schema` exports
synchronous ordinary function `extend_device_refresh_schema(programs:string[]):string[]`.
Its name is `extend_device_refresh_schema` and its arity is one. Node 20 or later
is sufficient for this pure function. It imports no modules, reads no ambient
state and has no hidden mutable state or external effect.

Place the implementation in
`source/storage_refresh_schema/extend_device_refresh_schema.js`. It is the sole
CommonJS named export. The only other package member is package.json, declaring
name storage_refresh_schema, type commonjs and exports exactly
`{"./extend_device_refresh_schema":"./extend_device_refresh_schema.js"}`.
Framework build and test adapters remain outside the package.

Input is an ordinary dense Array of opaque strings, including an empty or frozen
array. Return a fresh ordinary mutable Array whose prefix contains exactly those
strings, in the same order, followed by one nonempty string. Do not alter, freeze,
reorder, remove, combine, trim, execute or validate the prefix. A result never
aliases the input or another result. Mutating a result cannot affect the input,
another result, or a later call. The appended string is equal across calls and
across all prefixes. No length restriction is imposed by this function. The
application supplies its pinned 22-program predecessor, producing 23 programs.

## SQLite target mapping

The appended string is one SQLite program that adds these columns to the existing
v2_device_tokens table, in exactly this order:

```json
[
  {"name":"rotated_ts","declared_type":"TEXT","nullable":true,"default":{"absent":true}},
  {"name":"used_at","declared_type":"TEXT","nullable":true,"default":{"absent":true}}
]
```

Both columns are absent in the predecessor. Append them without rebuilding or
replacing the table. Existing rows receive NULL in both fields. Preserve every
existing row and old field value, column order, reference, index, constraint and
allocation state. Do not infer dates, rewrite token values, change expiry, add a
trigger or touch another table. Text values later stored in the fields are
opaque. Equivalent SQL whitespace and identifier quoting are allowed; runtime
program text remains stable across invocations.

The program contains only the two necessary column additions. It owns no
transaction or stored-version update and emits no BEGIN, COMMIT, ROLLBACK,
PRAGMA, ATTACH, DETACH, VACUUM, extension loading or filesystem function. The
injected application coordinator applies it as migration 23 in its usual locked
transaction, checks references and records the stored version. Return the program
text without opening SQLite or executing any prefix or appended program.

## Independent composition checks

The private acceptance worker supplies the existing independently qualified
22-program provider and compares the composed history with exact current-main
observations. Preserve all 53 schema batches containing 214 observations:
collection freshness, historical shapes from 0 through 23, populated upgrades
from every previous version, physical and constraint behavior, and failure
recovery. Six separate binding controls cover opaque, empty and frozen prefixes,
input preservation, independent mutable results and a prefix-independent
extension. Those controls add no product file or test fixture dependency.


#### Scenario: Extend the admitted predecessor without changing it

- **WHEN** the Node and SQLite target is selected
- **THEN** # Device-refresh recovery schema extension

Capability `storage-refresh-schema.extend-device-refresh-schema` extends an
ordered program collection with the one device-refresh recovery transition.
Return a fresh ordinary mutable collection containing all supplied program
strings in their existing order, followed by one stable program. Preserve the
argument and every existing string exactly. Do not mutate, freeze, execute,
inspect or normalize the supplied programs. The same extension program is used
for every input collection and every invocation.

The new transition adds two optional text facts to each device token: the signed
timestamp of the request that rotated it, followed by the time its access token
was first used. Existing tokens receive neither fact. Keep every prior field,
row, reference, index and constraint unchanged. Add no backfill, default,
validation, lifetime change or additional record family.

The application composes the already-qualified history through version 22 with
this extension as version 23. The migration coordinator owns execution,
transactions, foreign-key checks and the stored version. Producing an extended
collection has no store, filesystem, environment, subprocess, clock, randomness
or network effect. The host facade supplies the predecessor collection from its
separately pinned native provider. This component neither reimplements that
history nor reads another provider's private files at runtime.

