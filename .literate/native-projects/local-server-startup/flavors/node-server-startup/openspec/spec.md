# Node-Server-Startup implementation Flavor

## ADDED Requirements

### Requirement: Node server startup resource binding [authored:node-server-startup-contract-v1]

# Node server startup binding

The JavaScript module `server_startup/create_startup` exports
`create_startup(context)` with one required parameter. It synchronously returns
an object whose only public member is `startup`, a zero-argument function named
`startup`. That function works detached and synchronously returns `undefined`.
Target Node 24 or newer on macOS and Linux with no runtime package dependency.

## Resource context

Capture these 19 supplied function references at construction without invoking
them. Resource values are read when the operation calls the captured function.

| Member | Host meaning |
| --- | --- |
| `assertStartupConfig()` | Existing startup configuration validation |
| `environment()` | Current process environment |
| `dataDir()` | Current configured data-directory string |
| `dcrDir()` | Existing OAuth client-directory provider |
| `warnings()` | Current ordered warning array |
| `chmodSync(file, mode)` | Node permission change |
| `existsSync(file)` | Node existence check |
| `mkdirSync(directory, options)` | Node directory creation |
| `readFileSync(file, encoding)` | Node text reading |
| `rmSync(file, options)` | Node removal |
| `unlinkSync(file)` | Node unlinking |
| `writeFileSync(file, value, options)` | Node file writing |
| `readdirSync(directory)` | Node filename enumeration |
| `join(...parts)` | Node path joining |
| `dirname(file)` | Node parent-path resolution |
| `pid()` | Current process identifier |
| `kill(pid, signal)` | Node process probe |
| `once(event, callback)` | Process exit-listener registration |
| `warn(value)` | Warning delivery |

Obtain effects exclusively through these resources. Import no host builtins and
consult no ambient process, console, storage, randomness, clock, timer or network
resources. Ordinary JavaScript primitives and methods of returned values remain
available. Functional VM controls do not provide a security sandbox.

## Startup sequence

1. Invoke `assertStartupConfig()` and ignore its normal return value. If it
   throws, propagate the same value before calling `environment()`.
2. Read `environment().NEXT_PHASE` and return `undefined` only when it is exactly
   `phase-production-build`. Other values, including different case and trailing
   whitespace, proceed. Validation still occurs for the build phase.
3. Resolve `join(dataDir(), '.pid')`. This resolved file is the path retained for
   this call and its exit callback.
4. Consult `existsSync(file)`. If present, use `Number(readFileSync(file, 'utf8').trim())`
   as the recorded owner; if absent, use zero. Preserve ordinary JavaScript
   coercion, including whitespace, leading zeros, plus signs, decimal, exponent,
   hexadecimal, nonnumeric and nonfinite forms.
5. For a truthy recorded owner, read `pid()` for the strict identity comparison.
   Probe only a different owner by calling `kill(owner, 0)`. Every normal return,
   including a falsy one, counts as alive. When the probe throws, inspect its
   `code` property: exactly `EPERM` counts as alive and other property values
   count as dead. Preserve ordinary property-access failure for thrown null or
   undefined; do not replace it with optional-property handling.
6. When that different owner is alive, throw an error with the exact message
   `Another Align server (pid <owner>) is using <directory>. Stop it first.`
   Use normal JavaScript number-to-string interpolation and `dirname(file)` for
   the directory. This branch performs no file write, permission repair,
   warning or listener registration.
7. Otherwise call `mkdirSync(dirname(file), {recursive: true, mode: 0o700})`,
   then `writeFileSync(file, String(pid()), {mode: 0o600})`, then
   `chmodSync(file, 0o600)`. Preserve argument order and options. The final
   permission call repairs an existing file's mode; directory creation does not
   repair an existing directory's permissions. Add no write encoding,
   exclusive-create flag, extra permission operation or retry.
8. Perform the client-file sweep below, then obtain `warnings()` once and call
   `warn(value)` for every supplied element in order, without trimming,
   combining, sorting or otherwise changing it.
9. Call `once('exit', callback)` after all warnings complete. Return
   `undefined`, regardless of the registration resource's return value.

Do not move current-value reads into construction. A second startup invocation
revalidates, rewrites and repairs its owner record, sweeps, warns and registers
another exit callback. Reading an existing self-owned PID skips the liveness
probe. Preserve original resource-call order, including reads before failures.

## Client-file sweep

Obtain the directory from `dcrDir()` after owner-record permission repair. This
provider remains independent of the earlier data-directory result. Consult
`existsSync(directory)` and stop the sweep if false. Otherwise call
`readdirSync(directory)` without extra options and inspect entries in the exact
returned sequence.

Select only names matched by the JavaScript expression
`/^_oauth_clients\.json\.[0-9a-f]{8,}\.tmp$/` without flags. It requires the exact
prefix, at least eight lowercase hexadecimal characters and the exact suffix.
Uppercase hexadecimal, seven digits, other prefixes, extra suffixes and terminal
line separators are not selected.

For each selected entry call `rmSync(join(directory, name), {force: true})`.
Supply no recursive option and add no file-type test. Preserve Node behavior:
an owned matching symlink is unlinked while its target remains; a matching
directory causes the actual nonrecursive-removal error. Earlier removals and
the new PID file remain if a later entry fails. Warnings and exit registration
occur only after the entire sweep completes.

## Exit callback

The callback closes over this call's resolved PID file. On invocation, first
call `readFileSync(file, 'utf8')` and trim its returned string. Then compare it
strictly with `String(pid())`. Unlink with `unlinkSync(file)` only if they are
equal. Whitespace around the current PID is accepted; a leading-zero numeric
equivalent or a replacement is not.

Catch every thrown value from this cleanup, including read, PID access,
comparison and unlink failures. Return `undefined` without logging. A missing
file is therefore silent. Each registered callback retains its own original
path even after configuration changes. Repeated callbacks tolerate a file
already removed by an earlier one. Add no directory sweep or configuration read
during exit.

Outside probe classification and this callback, preserve thrown resource values
unchanged. For example, warning delivery or listener registration can fail after
the owner file has already been written. Those failures leave completed effects
in place and install no successful listener for that invocation.

## Host integration

The existing public `lib/startup.ts` interface remains `startup(): void`. Bind
real Node resources and existing configuration, client-directory and warning
providers. Preserve the instrumentation caller's direct detached call, its
configuration refusal handling and its later database/owner/retention sequence.
Those callers and providers keep their existing authority. This target does not
introduce an atomic process-claim guarantee or change startup recovery policy.


#### Scenario: Existing startup call and exit cleanup

- **WHEN** the Node startup target is selected
- **THEN** Preserve the sole public startup API, validation and phase ordering, PID ownership checks, exact filesystem effects, warning delivery, listener sequencing, exit cleanup and original failures through caller-owned resources.
