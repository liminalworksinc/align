# Public interface: server-request-effects.create-v2

## ADDED Requirements

### Requirement: server-request-effects.create-v2

# Request helper effects

Capabilities `server-request-effects.create-legacy` and
`server-request-effects.create-v2` bind complete request-helper surfaces to
caller-owned configuration, errors, authentication, device lookup, readiness,
network-key and logging providers. These providers keep authority for their
own implementations. This transfer owns request orchestration, checks, input
reading and response construction. It changes no endpoint or security policy.

## Construction and public operations

Create either binding synchronously without invoking providers. Capture its
resource handles once. Operations work detached from their returned namespace.
Separate bindings share no private state. Requests, responses, principal values
and exact provider failures retain their target-defined identities.

The legacy binding provides response handling, browser JSON checks and bounded
JSON reading. The v2 binding provides its route wrapper, empty response,
browser refusal, device and web credentials, credential selection, recent
sign-in checks, same-site checks, credentialed writes, identifier validation,
bounded JSON reading, public origin and client key. The target defines concrete
names, types, error messages and host-runtime representation.

## Responses, readiness and failures

The legacy handler awaits its supplied callback. Return an existing response
unchanged, otherwise construct a JSON response from the result. A recognized
legacy error produces its declared status and message; include its code only
when effective. Other failures produce the generic legacy server response.

The v2 route wrapper first awaits the supplied connection provider. That step is
outside the response-mapping failure boundary: its failure escapes unchanged,
without readiness, parameter access, handler invocation or error logging.
After connection, await readiness, then parameters, then the handler with the
original request and resolved parameters. An existing response is returned
unchanged; other results become JSON responses. Readiness or parameter failures
prevent later stages and use normal route error mapping.

Map recognized v2 errors using their status, extra fields, code and message.
The canonical code and message override colliding extra fields. A rate-limit
error with a numeric wait value additionally carries the corresponding retry
header. Recognized legacy errors in v2 map to the v2 bad-request envelope while
preserving their declared status and message. Other failures use the generic v2
server envelope. The empty-response helper has no body and reports no content.

Response serialization failures also enter these mappings. Recognized errors
are not logged. For an unknown error, consult current configuration: hosted
logging includes only the fixed prefix and error name, with the target's fallback
for an absent name; local logging receives the exact original value. Preserve
failure while reading the name or invoking logging rather than adding a second
fallback boundary. No retry, timeout, request logging or authentication work is
added by the wrappers.

## Browser request checks

The legacy browser check requires JSON media type before consulting providers.
In local mode require a loopback host. An effective origin must parse and match
the supplied host. In hosted mode require an allowed host and an origin equal
to its secure origin. Preserve target normalization, case and port behavior.

The v2 same-site check has its own public contract. Hosted requests require an
origin, host, host approval and the matching secure origin. Local requests permit
an absent origin; a present origin must parse and match the host. A supplied
fetch-site value must be one of the target's accepted values. Do not add the
legacy loopback or JSON-media check to this v2 operation.

Refuse device requests with any origin header, including an empty value, before
checking any cookie header. Any cookie header is refused. These checks happen
before credential parsing or lookup. Error priority and distinct messages remain
observable.

## Credentials and recent sign-in

Device authentication first applies browser refusal. Parse one bearer token
using the target's exact syntax; consult device lookup only for a nonempty valid
token. A missing token or ineffective lookup result yields the same invalid-token
error. Return a successful principal by identity, without copying or wrapping it.

Web authentication first refuses any authorization header, including an empty
one. Obtain the authentication provider and request its session using the exact
request headers. A missing session user is unauthorized. Look up that user once;
a missing user is unauthorized. Return only the target's web-principal fields,
including its projected user and converted session creation time. Provider
failures escape unchanged; do not invent a session or attempt device fallback.

Either-credential authentication selects the device path by authorization-header
presence, otherwise the web path. A web write checks same-site status before
session access. An either-credential write checks same-site status only for the
web path, then uses the ordinary credential selection. Preserve refusal order.

The recent-sign-in export is the exact supplied provider. The sensitive-action
guard asks it about the principal's sign-in time. On refusal, use the supplied
action-message provider for an effective action name, otherwise the existing
default approval message. This helper owns no clock, freshness interval or
session implementation.

## Bounded JSON input

Both readers reject an excessive declared byte count before acquiring a reader.
Otherwise read chunks sequentially, count their bytes and stop at the first
chunk exceeding the cap. Await cancellation before reporting excess size; an
acquisition, read or cancellation failure retains its ordinary failure identity.
Do not read later chunks, add retries or silently replace cancellation failures.

Concatenate bytes, decode and trim according to the target. A missing or empty
body returns a new empty object. The legacy reader performs no media-type check.
The v2 reader checks the JSON media type only after reading a nonempty body,
before parsing. Preserve this ordering relative to size and stream failures.

Malformed JSON has its existing parse-error response. A parsed top-level value
must be a non-null object that is not an array. Recursively reject the three
reserved property names in objects and nested arrays. Preserve traversal order;
legacy failures include the containing object path, while v2 failures use their
existing shorter message. Return accepted parsed content without new defaults,
field filtering or input mutation. The target owns byte limits, decoding,
number coercion, reserved spellings and exact error representation.

## Identifiers, origins and client keys

Identifier validation returns a successful input unchanged. Missing or rejected
inputs are not found. Use the supplied pattern's ordinary test operation,
including its state changes; do not clone it or reset its state.

Use an effective configured public origin unchanged. Otherwise construct the
existing local origin from the host with its fallback. Local client keys use
the existing single local key without consulting network normalization. Hosted
keys normalize the supplied client-IP header, using its absent-header fallback,
and apply the existing prefix. Do not add proxy parsing or address validation.

## Acceptance and remaining authority

Forty-six source observation batches match on macOS and Linux. Twenty-four altered
source controls are rejected on both hosts. The observations cover every public
runtime export, effect ordering, both credential paths, exact provider failures,
response identity, origins, logging, reserved keys, streaming, cancellation,
default byte limits and decoding. Controlled providers are explicit owned test
resources. This is not authentication, database or endpoint qualification and
does not establish the public tester's security acceptance.

Independent clean generation, separate admission, actual consumer and public-type
parity, complete application/image workflows and a current parent receipt remain
required before authority transfer. All other accepted native boundaries and
live tester gates remain open.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:57fd617083ccf8ac2d34`, `evidence:88524b8fe312e1ac5af6`
