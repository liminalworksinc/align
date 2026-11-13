# Node-Server-Readiness implementation Flavor

## ADDED Requirements

### Requirement: Node shared readiness resource binding [authored:node-server-readiness-contract-v1]

# Node readiness binding

The target is a JavaScript library for Node 24 or later on macOS and Linux.
Expose capability `server-readiness.create-ready` from
`server_readiness/create_ready` as a synchronous named function `create_ready`
with arity one. Accept one resource container with `state`, `openDb`,
`migrateAuth` and `migrate`. Capture all four property values once at construction.
Return an object whose sole enumerable own key is `ready`; its value is a named,
ordinary synchronous function `ready` with arity zero. It works detached from
the object. Construction runs no providers and does not inspect the cache.

Use the supplied state object's property `__alignV2Ready` as the only cache.
Only `null` and `undefined` count as absent. Any other existing value, including
false, zero, empty text, an arbitrary object or any promise, is returned exactly
without assimilation, validation or provider calls. Preserve the existing
non-async TypeScript interface `ready(): Promise<void>` at its actual consumer;
the observed out-of-type preseed behavior remains part of JavaScript compatibility.

Call captured provider functions without a receiver or arguments. Opening runs
before authentication invocation, both within the first readiness call's
synchronous work. Await authentication using ordinary JavaScript await semantics,
including thenable assimilation and a yield for scalar or already-settled values.
Invoke application migration after that await. Opening and migration return
values are ignored entirely, including a throwing `then` getter.

The stored and returned attempt is one exact promise whose fulfilled result is
undefined. Preserve ordinary JavaScript nullish-assignment evaluation: a cache
read precedes attempt construction; initial provider effects occur before cache
assignment; a getter failure is synchronous with no providers; a setter failure
is synchronous after the initial provider effects and does not cancel the
already-started work. No early placeholder, promise wrapper or bound method
receiver may change those observations.

On rejection, assign undefined to the same state's exact cache property, then
reject with the same thrown value, including null, undefined, a symbol or an
object. Do not require an Error instance. Preserve any exception from that cache
clear as the attempt's replacement rejection. Do not protect clearing with an
attempt-identity comparison: the original clears external replacement state and
newer cached attempts after an older failure. Successful attempts never rewrite
the cache on completion.

Shared state is supplied by the actual application's existing global object,
which retains the `__alignV2Ready` name across module instances and hot reload.
The generated implementation must use the supplied state reference and cannot
read or mutate the ambient global's cache. Do not import filesystem, database,
authentication, network, clock, entropy or process APIs; all required effects
come from the captured resources. No timers, queueMicrotask scheduling, console
output or hidden background work are required.

Private conformance tests may use a VM to observe forbidden ambient accesses.
That VM is a functional test guard and is not a security sandbox. The normal
generated package owns its build and self-test entry points; the private
acceptance observations remain separate and absent from generation inputs.


#### Scenario: Concurrent readiness and retry

- **WHEN** the Node readiness target is selected
- **THEN** Preserve the detached ready API, exact shared promise identity, migration order, JavaScript nullish cache, rejection identity, retry and externally changed state behavior through captured caller-owned resources.
