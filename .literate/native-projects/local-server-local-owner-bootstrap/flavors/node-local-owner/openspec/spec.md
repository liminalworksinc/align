# Node-Local-Owner implementation Flavor

## ADDED Requirements

### Requirement: Node local owner startup binding [authored:node-local-owner-v1]

# Node local owner startup binding

Preserve the exported asynchronous `ensureLocalOwner(): Promise<void>` with
arity zero. The native package exposes one factory that receives seven
explicit resources and returns this operation:

- `config`
- `get`
- `localOwnerEmail`
- `getAuth`
- `getHeadersConstructor`
- `readPort`
- `getConsole`

Capture each resource once when constructing the factory. Construction
makes no service calls. Calls use the captured function aliases with a bare
receiver. The factory receives no private world, database handle or source module.
The factory and types are defined below.

## Native host mechanics

The account-presence read calls the existing `get` exactly once with
`SELECT 1 AS x FROM ba_user LIMIT 1`, without additional arguments. It uses the
existing database service. The query's Node/SQLite mechanism belongs in the
target requirements; its observed account-presence decision belongs in the
portable Component.

`getAuth()` returns the current opaque service. Read and await its `$context`.
Call `ctx.internalAdapter.createUser` on the actual adapter receiver with exactly
`{ email, name: "Local owner", emailVerified: true }` and `{ method: "admin" }`.
Await the result, then read `auth.api` outside the send-failure handler.

Inside that handler, look up `api.sendVerificationOTP` before preparing its
argument. Preserve the actual API receiver and pass one argument with
`body: { email, type: "sign-in" }` and a native `Headers` instance.

Resolve the current header constructor through `getHeadersConstructor()` before
reading the port, then construct the header from
`{ host: "127.0.0.1:" + (readPort() || "3100") }`. Preserve constructor behavior,
native normalization and failures. Do not cache the constructor across calls or
replace it with an ordinary object. The application binding reads the existing
global constructor and `process.env.PORT` at the original points.

On a caught send/preparation failure, obtain the current console through
`getConsole()`, look up its `error` method and call it on that same console
receiver with exactly one message:

```text
Align could not print a sign-in code for EMAIL. Run npm run sign-in-link to get one.
```

Substitute the same configured address for `EMAIL`. Do not wrap reporting errors
or log successful initialization. Header construction, environment and console
access remain explicit caller-owned mechanisms.

## Package and public surface

Emit a dependency-free CommonJS package named `server_local_owner_bootstrap`
under source/server_local_owner_bootstrap. Its package.json has type commonjs
and exactly one exports mapping:
`./create_local_owner_bootstrap` to `./create_local_owner_bootstrap.js`.
The module has a named synchronous factory `create_local_owner_bootstrap` with
arity one. The returned stable namespace has exactly one own public value,
`ensureLocalOwner`. This is a named asynchronous function with arity zero and
return type Promise<void>, and it works detached from its namespace.

Capture resource properties once in the listed order. If a property lookup
throws, preserve the exact failure and stop before reading subsequent resources.
Do not enumerate the resource object, read unrelated properties, invoke any
service while constructing the factory, or read its properties again later.

## Supplied provider types

| Resource | Structural public type |
| --- | --- |
| config | () => { hosted: boolean } |
| get | (query: string) => unknown |
| localOwnerEmail | () => string |
| getAuth | () => LocalOwnerAuth |
| getHeadersConstructor | () => typeof Headers |
| readPort | () => string or undefined |
| getConsole | () => Pick<Console, "error"> |

LocalOwnerAuth has an awaitable `$context` and an opaque `api` property.
Awaiting `$context` yields an object with internalAdapter.createUser. That method
accepts the exact user payload and `{method:"admin"}` control already specified,
and may return an opaque awaitable value which the operation awaits and discards.
Keep the actual adapter receiver and operation-time property lookups. This
structural port compiles against the configured provider's generic createUser
signature without a provider implementation or credentials in generated input.

The API remains opaque until the same explicit endpoint narrowing used by the
application. Read auth.api outside the send-failure handler. Inside the handler,
read sendVerificationOTP on that API before evaluating its argument. It receives
one object with exactly body and headers. Body has exactly email and type, with
type sign-in. The current header constructor is resolved before the current port
reader is invoked. Construct it with exactly one own input key, host. Port uses
the existing falsy default, not numeric parsing or a different normalization.

Configuration accesses its hosted property after config() returns. The account
read uses normal truthiness and the exact single SQL argument above. Malformed
provider objects retain native lookup and call failures at the original catch
boundary. Keep asynchronous waits and exact supplied rejection identities.
Header construction uses the supplied constructor; never reach for ambient
Headers, process, console or a new authentication provider inside the package.

The existing instrumentation startup caller and configured authentication/store
composition remain application-owned. This helper changes no provider settings,
secrets, sign-in permission, startup ordering or delivery transport. Require
actual typed consumer and configured-provider acceptance after separate
qualification and admission, followed by complete application, image and current
receipt gates before source authority transfer.


#### Scenario: Complete local owner startup operation

- **WHEN** the Node target is selected
- **THEN** Expose the named seven-resource factory, preserve zero-argument async startup, exact live reads and method receivers, provider payloads, waiting and catch boundaries, and leave configured provider and host mechanism ownership with the caller.
