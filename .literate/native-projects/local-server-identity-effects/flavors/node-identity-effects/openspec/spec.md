# Node-Identity-Effects implementation Flavor

## ADDED Requirements

### Requirement: Node sign-in delivery and verification binding [authored:node-identity-effects-contract-v1]

# Node sign-in effects binding

Target Node 24 or later on macOS and Linux. Export one synchronous named factory
with arity one:

| Capability | Module | Factory |
| --- | --- | --- |
| `server-identity-effects.create-effects` | `server_identity_effects/create_effects` | `create_effects` |

Use the framework's dependency-free JavaScript library layout. The generated
artifact has `source/server_identity_effects/package.json`, named exactly
`server_identity_effects`, with `type: commonjs` and exactly this exports map:

```json
{"./create_effects":"./create_effects.js"}
```

The CommonJS module lives beside that manifest and exports the named factory
through module.exports. Its locked import path is
`server_identity_effects/create_effects`. Add no compatibility/default factory or
alternate public export. Do not declare nonempty dependencies, devDependencies,
optionalDependencies or peerDependencies. Static relative internal modules are
permitted; public implementation modules import no builtins or external packages.
Keep `source/main.js` as the normal non-product `--litai-test` smoke adapter.
Other private verifier formats do not change this production layout.

## Resource ownership

Read exactly these 15 container properties once each, without enumerating the
container or reading unrelated keys: `config`, `emailApi`, `turnstile`,
`postEmail`, `dbDir`, `path`, `mkdirSync`, `writeFileSync`, `chmodSync`, `captcha`,
`V2Error`, `readURLSearchParams`, `readConsole`, `readFetch`, `readAbortSignal`.
Capture their values. Do not invoke or validate handles or read nested provider
properties during construction. A capture failure escapes unchanged. Later
container mutations do not replace captured values.

Imported callable handles and resolver functions are called without an artificial
receiver. `path` is the supplied object; read its `join` and `dirname` properties
when needed and use that same object as receiver. Host resolvers return the current
URL-search-parameters constructor, console object, fetch function and abort-signal
object. Resolve them when the operation needs that host value, without caching
results. Console log/error methods use their returned
console object as receiver; timeout uses its returned abort-signal object.
Fetch and the fetch resolver are called without receivers. Preserve resolution
before argument evaluation, including fetch lookup before timeout construction.

The namespace has exactly these own public fields. Functions keep their public
names, arities, synchronous/asynchronous kind and detached-call behavior:

| Field | Arity | Kind |
| --- | ---: | --- |
| `SIGN_IN_SUBJECT` | | string constant |
| `CAPTCHA_HEADER` | | string constant |
| `signInLink` | 3 | synchronous function |
| `signInFile` | 0 | synchronous function |
| `sendSignInCode` | 3 | async function |
| `captchaPlugin` | 0 | synchronous function |
| `requireCaptcha` | 1 | async function |

The exact callable signatures are `signInLink(origin, email, code) -> string`,
`signInFile() -> string`, `sendSignInCode(email, code, origin) -> Promise<void>`,
`captchaPlugin() -> opaque provider result | null` and
`requireCaptcha(req) -> Promise<void>`. Email, code and origin are strings; req is
the host's Request-compatible value. Keep parameter order and public void results.

`config()` supplies hosted and allowedHosts, where allowedHosts is an iterable of
host-name strings. `turnstile()` supplies null or an object with secretKey and
verifyUrl strings. `emailApi()` supplies null or an opaque settings object;
postEmail receives that exact object. The postEmail result may be synchronous or
awaitable and is always discarded after waiting. `dbDir()` supplies a string.
The path and filesystem ports use the host signatures described below.
`V2Error` is a caller-supplied constructable error type taking status, code and
message. Global readers take no arguments and supply the current corresponding
constructor, object or function. Do not impose extra validation on these handles.

The two string values and all public messages/text are the Component's exact
values. Use ordinary JavaScript property/getter, nullish, truthiness, coercion,
template-literal, method and exception behavior at the defined positions. Add no
eager normalization, validation or failure wrapping. Do not depend on ambient
network, filesystem, console, environment, clock, randomness or dynamic imports.

## Delivery mechanisms

Construct the supplied current URLSearchParams with an object containing email
then code, and preserve ordinary template conversion of that result. The link
prefix is `${origin}/app/sign-in?`. The local file is the result of
`path.join(dbDir(), "sign-in.txt")`. Do not normalize the origin separately.

For local delivery, call the current console object's log with the exact local
line. Resolve the file, call mkdirSync on its current dirname with
`{recursive:true,mode:0o700}`, call writeFileSync with exact line plus LF and
`{mode:0o600}`, then call chmodSync with 0o600. Preserve an existing directory's
permissions and enforce 0600 on an existing regular file. Keep real filesystem
error codes and partial effect order. Do not create directories for the location
operation alone.

For hosted delivery, read emailApi after the current configuration selects hosted
mode. Missing settings throw an ordinary Error with the Component's exact
message. Otherwise await postEmail with the settings object unchanged, then an
object containing `to`, `subject`, `text`, then label `Sign-in email`. Discard any
successful result. Preserve exact synchronous or asynchronous refusal objects.
The library owns no hosted mail implementation or credentials.

## Captcha mechanisms

Call turnstile at each public captcha operation. For falsy settings, the plugin
operation returns null and direct verification returns undefined without other
effects. Do not add a separate config().hosted branch.

For configured middleware, call the supplied captcha function with own fields in
this order: provider `cloudflare-turnstile`, secretKey from settings,
siteVerifyURLOverride from settings.verifyUrl, endpoints
`["/email-otp/send-verification-otp","/sign-in/email-otp"]`, then allowedHostnames
as the current iteration of config().allowedHosts. Return the exact provider
result. The consuming application's actual provider is currently Better Auth
1.7.10. Its import/dependency custody belongs to the host, not this generated
dependency-free package. Actual configured middleware acceptance remains an
additional mandatory admitted-package gate.

Direct verification reads req.headers.get(CAPTCHA_HEADER), applies ordinary
string length and refuses missing/empty values or length greater than 4096.
The supplied V2Error constructor produces 400/captcha_required with the
Component's required message. Construct public errors with this supplied class;
preserve its prototype and metadata.

Inside the transport catch, call the current supplied fetch with settings.verifyUrl
and options: method POST, headers `{"content-type":"application/json"}`, body
JSON.stringify of secret, response and remoteip in that order, signal from the
current AbortSignal.timeout(10000), and redirect `error`. The remoteip expression
is req.headers.get("fly-client-ip") with a nullish undefined fallback. An empty
header survives; an absent one is omitted by JSON.stringify.

For a truthy res.ok, await res.json with its response object as receiver;
otherwise use null. Caught failures call the current console.error with
`Captcha check failed:` then the failure's optional name, falling back to
`unknown` only for null/undefined. Never log the failure object, message, token,
secret or address. A throwing name getter or logger escapes unchanged.

Falsy parsed data throws supplied V2Error(503, "captcha_unavailable", unavailable
message). Otherwise test data.success strictly true, then truthy data.hostname,
short-circuiting in that order. Only after both pass, resolve the current host
array, its includes method and data.hostname.toLowerCase(), in that order.
Do not lower or trim the configured list. A truthy hostname without a callable
toLowerCase retains TypeError with message
`data.hostname.toLowerCase is not a function`. Preserve ordinary method receiver
and getter behavior. Refusal throws supplied V2Error(403, "captcha_failed", failed message).
The configured host read is outside the transport catch. Keep public-constructor
and outside-catch provider failures unchanged.

## Verification and authority

Four private qualification batches cover all 50 controlled mail/captcha records,
six actual local filesystem records and 66 interface checks. The profile requires
two clean generations, build/test/parity and the exact locked import surface.
No private original algorithm or verifier command belongs in model inputs.

After separate admission, all 17 actual configured middleware observations must
also pass through that admitted package with the host's exact provider. Full
consumer and immutable-image acceptance remain required before retiring the two
retained source files. This does not qualify the separate authentication module,
complete the whole identity boundary or satisfy public-tester/security/live gates.


#### Scenario: Complete sign-in effects namespace

- **WHEN** the Node target is selected
- **THEN** Capture15declared resources once without effects, preserve five operation names/signatures and two constants, detached calls, exact current public content, failure/prototype identity, live resolver and receiver behavior, protected local-file effect order and actual configured provider delegation.
