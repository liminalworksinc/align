# Public interface: storage-refresh-schema.extend-device-refresh-schema

## ADDED Requirements

### Requirement: storage-refresh-schema.extend-device-refresh-schema

# Device-refresh recovery schema extension

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

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:293b399e79971f9981ba`
