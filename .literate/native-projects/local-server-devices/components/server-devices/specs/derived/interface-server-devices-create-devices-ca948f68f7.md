# Public interface: server-devices.create-devices

## ADDED Requirements

### Requirement: server-devices.create-devices

# Device pairing and credentials

Provide `server-devices.create-devices`, the existing device and browser halves
of key-bound pairing, access and rotating refresh credentials, revocation, device
names and workspace grants. Preserve all thirty runtime values and the two
caller-owned types UserRef and DevicePrincipal. This is a library with supplied
resources. Routes, user authentication, principal construction and account policy
remain with the application.

The application supplies persistence, transactions, cryptographic primitives,
limits, identifiers, clocks, configuration, audit/events and session termination.
Keep its exact decisions, argument identities, refusal identities and observation
order. Pairing and credential writes retain their original transaction ownership.
Polling bookkeeping and refresh-reuse revocation commit before the later refusal.
Access checks retain live membership and workspace filtering. A correctly signed
revoked device may learn its revocation reason; an invalid signature may not.

Preserve original name reservations and same-machine replacement rules, browser
input wording, workspace caps, ownership and privacy-equivalent refusals, listing
order, token lifetimes and native parsing behavior. Store hashes where the original
stores hashes; return the original structured results. Add no authentication,
validation, permission, ambient IO, content read or delivery assertion. The Node
target fixes the import surface, thirty-value metadata, supplied resource boundary,
live Date/Buffer use and fifty exact SQL call sites.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:5d43e033d75e9ff47adc`
