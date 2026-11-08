# Node-Server-Secrets implementation Flavor

## ADDED Requirements

### Requirement: Node server secret resource binding [authored:node-server-secrets-contract-v1]

# Node server secret resource binding

The JavaScript module `server_secrets/create_tools` exports
`create_tools(context)` with one required parameter. It returns an ordinary
service object with the two public operations below. Target Node 24 or newer on
macOS and Linux, with no runtime package dependency.

| Operation | Required arity | Result |
| --- | --- | --- |
| `serverSecret(dataDir, env?)` | 1 | Configured or persisted secret string |
| `hmac(secret, payload)` | 2 | HMAC-SHA256 digest string |

Preserve the function names `serverSecret` and `hmac`. Both work as detached
functions. Public environment values and HMAC inputs retain the existing typed
string interfaces.

## Supplied resources

| Context member | Host resource |
| --- | --- |
| `environment()` | The caller's current process environment |
| `join(...parts)` | Node path joining |
| `dirname(file)` | Node parent-path resolution |
| `existsSync(file)` | Node filesystem existence check |
| `mkdirSync(directory, options)` | Node recursive directory creation |
| `writeFileSync(file, value, options)` | Node file writing |
| `readFileSync(file, encoding)` | Node file reading |
| `randomBytes(size)` | Node cryptographic entropy returning an actual Buffer |
| `createHmac(algorithm, secret)` | Node's actual HMAC resource |

Capture these references at binding, without calling them. Read the current
environment through the captured reader on each call that omits `env` or passes
explicit `undefined`. Explicit environments bypass that reader.

The library obtains effects exclusively from these supplied resources. It does
not import host builtins or consult ambient process state, filesystem,
cryptography, randomness, time, timers or network resources. Ordinary JavaScript
language primitives and methods of returned resource objects remain available.

## Secret operation

Preserve JavaScript's existing configured-value check: consult `env.ALIGN_SECRET`
and return that property unchanged when truthy. An ordinary getter is therefore
read twice on the successful configured path and once on the fallback path.
Whitespace and the string `0` are configured values; an empty string falls back
to the file. Do not trim a configured value or validate unrelated settings.

The fallback file is `join(dataDir, '.secret')`. First consult `existsSync` for
that path. If absent, call `mkdirSync(dirname(file), {recursive: true})`, then
request `randomBytes(32)`. Encode the exact returned bytes with lowercase hex
and call `writeFileSync(file, encoded, {mode: 0o600})`. Preserve this operation
order and options. The original has no exclusive-create flag, explicit write
encoding or extra permission call.

After either branch of the existence check, call `readFileSync(file, 'utf8')`
and return the result's normal JavaScript `trim()`. Keep empty-file behavior,
Unicode whitespace and internal newlines. Existing content and permissions stay
unchanged. Follow ordinary Node path and symlink behavior; a directory at the
secret-file path produces the actual read error.

All failures propagate unchanged, including existence, directory creation,
entropy, writing and reading. A failed write has already attempted directory
creation; a failed final read may leave the newly written file. Add no retry or
cleanup policy.

## HMAC operation

Use `createHmac('sha256', secret)` with the exact caller key, invoke the returned
resource's `update(payload)` with the original payload, then its
`digest('base64url')`. Invoke `digest` on the exact value returned by `update`.
Keep native receivers and returned errors intact. The
result is the existing 43-character unpadded URL-safe digest for the supported
string inputs. Add no prefix, normalization, encoding step or truncation.

This operation does not read the environment or filesystem and does not request
entropy. Current event, token, refresh and creation callers own their domain
prefixes.

## Integration boundary

The production host binding supplies real Node resources. The core and its
operator consumers must remain independent of the application's configuration
module. The existing configured web facade still reads configuration per call,
and lexical core callers use the same HMAC provider through their original
public helper names. Keep authentication's `.auth-secret` implementation outside
this boundary.

Independent resource controls check conformance. They are not a security sandbox.
These requirements preserve observed source behavior and do not claim a new
atomic-creation or security-hardening policy.


#### Scenario: Existing server and operator helper calls

- **WHEN** the Node server-secret target is selected
- **THEN** Preserve both helper APIs, current environment selection, exact persisted entropy, file behavior, cryptographic digests and original failures through real caller-owned resources.
