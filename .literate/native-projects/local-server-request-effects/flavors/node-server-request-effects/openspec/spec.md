# Node-Server-Request-Effects implementation Flavor

## ADDED Requirements

### Requirement: Node legacy and v2 request resource bindings [authored:node-server-request-effects-contract-v1]

# Node request helper bindings

Target Node 24 or later on macOS and Linux. Expose synchronous named factories
`create_legacy` and `create_v2`, each with arity one, from modules
`server_request_effects/create_legacy` and `server_request_effects/create_v2`.
They provide `server-request-effects.create-legacy` and
`server-request-effects.create-v2`, respectively. No construction-time provider
invocation, input validation, logging or asynchronous work is required.

`create_legacy` captures `config`, `hostAllowed`, `HttpError` and `console` from
its resource container once. Its enumerable own keys are exactly `handle`,
`requireJson`, `cappedJson`. Each value has that function name and arity one.
`handle` and `cappedJson` are asynchronous; `requireJson` is synchronous.

`create_v2` captures `connection`, `config`, `hostAllowed`, `HttpError`,
`clientNet`, `getAuth`, `isRecentSignIn`, `reauthMessage`, `publicOrigin`,
`deviceFromAccessToken`, `userById`, `V2Error`, `badRequest`, `ready` and `console`
once. Its enumerable own keys are exactly `route`, `noContent`, `rejectBrowser`,
`deviceAuth`, `webAuth`, `isRecentSignIn`, `requireRecentSignIn`, `eitherAuth`,
`requireSameSite`, `webWrite`, `eitherWrite`, `idParam`, `readJson`, `originOf`,
`clientKey`. Functions retain these names. `noContent` has arity zero;
`requireRecentSignIn` and `idParam` have arity two; the other declared operations
have arity one. `isRecentSignIn` is the exact supplied function, without a wrapper.
`webAuth`, `eitherAuth`, `webWrite`, `eitherWrite` and `readJson` are asynchronous.
`route` synchronously returns an asynchronous `(req, ctx)` handler. The remaining
operations are synchronous.

Call captured function providers without an artificial receiver. Session access
retains `getAuth().api.getSession({headers: req.headers})` method semantics.
Logging calls the captured console object's current `error` method with its
console receiver. Observe fresh `config().hosted` results at each original
decision; do not cache a hosted-mode result across calls or reorder its checks.

## Exact legacy browser-check read order

For each `requireJson(req)` call, read and normalize content-type first. A
media-type refusal invokes no provider. Otherwise call captured `config()` once
for the host-check decision. If that result is hosted, read the original host
header and call `hostAllowed` with it; refuse an ineffective result immediately.
If that first result is local, read and validate the loopback host and refuse an
invalid result immediately.

Only after the host check succeeds, read the origin header into a local value.
Then call captured `config()` again for the origin-check decision. This second
call is required even when the first result was local and the origin is absent.
Do not reuse the first result, combine the two branches into a single mode test,
or prefetch host or origin before their specified checks.

If the second result is hosted, read the origin header again, lower-case it,
then read and lower-case the host header and enforce the existing exact secure
origin rule. If the second result is local and the saved origin is truthy, parse
it and compare its nonempty URL host with a fresh original host-header read.
A failed parse or empty parsed host refuses before that final host-header read.
The second result is independent of the first: a changing provider may select
one mode for the host check and another for the origin check. A stable valid
local call therefore invokes config twice; a stable valid hosted call invokes
config, hostAllowed, then config, in that order. All other public operations
retain their separately specified configuration-read behavior.

Use actual platform Request, Response, Headers, readable-body and byte behavior.
The returned response identity test is `instanceof Response`. JSON construction
uses ordinary `Response.json` serialization. Legacy errors are recognized by the
supplied `HttpError`; v2 errors by the supplied `V2Error`, checked first in v2.
No structural status-based error recognition is added.

The legacy handler maps an `HttpError` to its status and `{error: message}`,
adding `code` only when truthy. Unknown legacy errors produce status 500 and
`{error: "Server error"}`. V2 errors produce their status and
`{...extra, error: code, message}`. Add `retry-after: String(extra.retry_after)`
only when status is 429 and that field has JavaScript type `number`. V2 mapping
of `HttpError` uses `{error: "bad_request", message}` and the original status.
Unknown v2 errors produce status 500 and
`{error: "server_error", message: "Server error"}`. `noContent()` returns
`new Response(null, {status: 204})` with no content-type header.

For unknown errors in hosted mode log `"Server error:"` and
`error?.name ?? "unknown"`; in local mode log the original error value alone.
Do not read or log its message, body, URL, request or stack in hosted mode.
Preserve exceptions during configuration, name access or logging. Await
`connection()` outside the v2 mapping try/catch, then await `ready()`,
`ctx.params` and `fn(req, params)` inside it.

For media type use `(content-type || "").split(";")[0].trim().toLowerCase()`
and accept exactly `application/json`. Legacy `requireJson` rejects other types
with `HttpError(415, "Send this as application/json")`. Its local host parser
uses the bracketed prefix through the first `]` for an opening `[`, otherwise
the text before the first `:`; lower-case that name and accept only `localhost`,
`127.0.0.1`, `[::1]`. Reject other local hosts with
`HttpError(403, "This request must come from this machine")`.

Legacy hosted host approval passes the original host-header value, including
null, to `hostAllowed`. Its hosted origin and host values are lower-cased and
must be nonempty, with origin exactly `https://${host}`. Local legacy origin is
checked only when truthy. A parsed `new URL(origin).host` must equal the original
host header. Legacy cross-site failures use
`HttpError(403, "This request came from another site")`.

V2 hosted same-site checks lower-case host and origin, require both, approve the
lower-case host and require that same exact secure origin. In local mode check
origin whenever its header is not null, including an empty string. Require its
parsed URL host to equal the original host header. Then permit a fetch-site
header only when absent, empty, `same-origin` or `none`. Refuse otherwise with
`V2Error(403, "cross_site", "This request came from another site")`. Do not
normalize away explicit ports or change the observed local case comparison.

Device browser refusals are, in order,
`V2Error(403, "browser_not_allowed", "Device routes do not accept browser requests")`
for any origin header, then
`V2Error(403, "cookies_not_allowed", "Device routes do not accept cookies")`
for any cookie header. Parse bearer text by trimming it and applying
`/^Bearer\s+(\S+)$/i`. Missing or ineffective tokens do not call lookup.
An ineffective principal yields
`V2Error(401, "invalid_token", "Sign in again with align login")`.

Web authentication refuses any authorization header with
`V2Error(403, "bearer_not_allowed", "Web routes do not accept device tokens")`.
Missing session user or user lookup yields
`V2Error(401, "unauthorized", "Sign in first")`. The successful principal is
`{kind: "web", user: {id, name, email}, emailVerified, signedInAt}` using fields
from the looked-up user and `new Date(session.session.createdAt)`. Do not add
date-validity or account-field checks. Both either-credential selectors choose
the device path when authorization is not null, including an empty value.

`requireRecentSignIn` passes `p.signedInAt` to the captured provider. If refused,
throw `V2Error(403, "reauth_required", message)`. A truthy `what` supplies
`reauthMessage(what)`; otherwise the message is exactly
`Sign in again to approve. Approving needs a sign-in from the last 15 minutes.`
The provided freshness implementation retains its own clock and policy.

Both readers default to `64 * 1024` bytes. Compare
`Number(content-length || 0) > max` before acquiring a reader; retain ordinary
JavaScript coercion, including NaN comparisons. Read with
`req.body.getReader()` when a body exists. Accumulate `value.byteLength`, reject
only when accumulated size is strictly greater than max, and await cancellation
before throwing. Do not release a reader lock or consume later chunks after
that failure. Concatenate byte chunks with Buffer semantics, decode as UTF-8
with replacement, and trim the text. Empty text returns `{}` even when the
media type is missing or wrong. The v2 reader checks nonempty media type before
attempting JSON parse; the legacy reader has no such check.

Excess size uses `HttpError(413, tooLarge)` for legacy, where `tooLarge` defaults
to `This request is too large`, and
`V2Error(413, "too_large", "This request is too large")` for v2. V2 unsupported
media uses `V2Error(415, "unsupported_media_type", "Send this as application/json")`.
Legacy parse/shape failures use `HttpError(400, message)`; v2 uses the supplied
`badRequest(message)`. Parse failure says `Send valid JSON`; a null, primitive
or array top level says `Send a JSON object`.

Visit arrays by ordinary `forEach` and object keys by `Object.keys` order,
checking each key before visiting its value. Reserved names are exactly
`__proto__`, `constructor`, `prototype`. Legacy starts the containing path at
`body`, adds `.key` and `[index]`, and says
`“${key}” is not allowed as a field name (at ${path})`. V2 says
`"${key}" is not allowed as a field name`. Preserve curly legacy quotation
marks and straight v2 quotation marks. Return the parsed object unchanged.

`idParam(v, re)` returns v when truthy and `re.test(v)` succeeds; otherwise
throw `V2Error(404, "not_found", "Not found")`. Preserve regex lastIndex.
`originOf` returns a truthy `publicOrigin()` value unchanged, else
`http://${host || "127.0.0.1"}` using the original host value. `clientKey` returns
`local` when not hosted; otherwise return `ip:${clientNet(header ?? "unknown")}`
from the `fly-client-ip` header. An empty header is preserved for normalization.

Generated code may use platform Response, Buffer, URL and Date for these named
operations. It must not call the clock, timers, entropy, filesystem, environment,
network, process, console or dynamic-code APIs through ambient access. Date
construction from the supplied session timestamp is permitted. Required effects
come through the explicit captured providers. Relative package modules are
permitted; no external runtime dependency or hidden background work is needed.
Private VM checks are functional guards, not a security sandbox. Normal package
build and self-tests remain separate from private source and acceptance fixtures.


#### Scenario: Request effects and credential paths

- **WHEN** the Node request target is selected
- **THEN** Preserve both whole helper namespaces, exact provider receivers, credential and origin refusals, bounded streaming and cancellation, response/error mapping and effect order through captured caller-owned resources.
