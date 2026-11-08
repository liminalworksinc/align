# Public interface: server-client-keys.create-client-keys

## ADDED Requirements

### Requirement: server-client-keys.create-client-keys

# Client keys

Capability `server-client-keys.create-client-keys` binds caller-owned configuration to the
complete client-key surface: address normalization and request-key selection.
Rate-limit state, thresholds, proxy trust and authentication keep their existing
owners. This Component owns how supplied address text becomes a client key.

## Binding and operations

Binding is synchronous. Capture the configuration handle once, without invoking
it. Return separate operation namespaces for separate bindings. Operations work
when detached from their namespace and share no hidden mutable state.

Normalization is synchronous and uses only its supplied input. Repeated calls do
not query configuration, read requests or depend on time, entropy or external
state. The target specifies text cleanup and exact host-runtime behavior.

## Address grouping

Preserve individual IPv4 clients, including equivalent IPv4-mapped IPv6 forms.
For the existing IPv6 path, return the normalized first four groups and the
existing network suffix. Preserve cleanup of whitespace, case, brackets and zones,
embedded dotted tails, group expansion and their observable ordering.

The current module is a key normalizer. Existing loose forms retain their current
results and ordinary failures. Apply the target's exact operations without adding
strict address validation, alternate parsing, range corrections or new defaults.

## Request keys and effects

Consult current configuration once for every request-key operation. In local
mode, return the existing local key without reading the request's headers. In
hosted mode, read the existing client-IP header, use the existing fallback only
for an absent value, normalize it and add the existing hosted prefix. An empty
header remains distinct from an absent header. Preserve the header method's
receiver and the original order of configuration, mode and header access.

Configuration, mode access and request/header failures propagate unchanged by
identity. Add no retries, fallback error mapping, request mutation, logging or
background work. Changes in the configuration provider between calls take effect
on the next call. The target defines concrete names, values and language rules.

## Acceptance and remaining authority

Preserved source has eleven matching observation batches on macOS and Linux,
including 1,995 normalization inputs per host, actual Requests, provider ordering,
exact failure identity and configuration changes. All sixteen altered source
controls are rejected on both hosts. These observations establish this bounded
module's current behavior; they do not qualify rate-limit storage, authentication
or the public tester's security.

Independent private acceptance, two clean generations, separate admission, actual
consumer and type parity, six unchanged callers, production assembly, complete
application/image workflows and a current parent receipt remain required before
authority transfer. The accepted 31-boundary program and live tester gates stay open.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:d12c7eebec1452a08416`
