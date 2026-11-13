# Runtime-Settings-Node implementation Flavor

## ADDED Requirements

### Requirement: Node runtime settings binding [authored:runtime-settings-node-contract-v3]

# Node settings service binding

The proposed module `runtime_settings/create_settings` exports
`create_settings(context)`. It returns the complete settings service. One
application binding creates one instance and re-exports its methods and data
through the existing modules. The factory binds three supplied callbacks:

- `environment()` returns the current environment record.
- `cwd()` returns the current working directory.
- `followUpProblem(env)` implements the existing qualified public dependency.

Capture the three callback references at factory creation; later replacement of
context properties does not reconfigure an existing instance. Invoke captured
callbacks as bare functions. Do not call them during creation. Use them only when
the corresponding settings operation needs them, and propagate callback failures
without replacing the thrown value. Do not read ambient process settings or application files independently of
this context. The application binding supplies its actual process environment
and working directory. Tests supply isolated fixture values.

The returned service exposes these 22 functions with their existing names:

| Function | Inputs and result |
| --- | --- |
| `config` | No arguments; fresh `{hosted, dataDir, allowedHosts}` record |
| `hostName` | Host string or null; extracted lower-case hostname |
| `hostAllowed` | Host string or null; current allowlist decision |
| `hostedProblems` | Optional environment and working directory; ordered problem array |
| `startupProblems` | No arguments; instance-cached mutable problem array |
| `assertStartupConfig` | No arguments; undefined on success or an ordinary Error |
| `testIdpEnabled` | Optional environment; local test-provider switch |
| `validMaxDays` | String; whether it denotes an allowed session duration |
| `sessionMaxDays` | Optional environment; configured duration or default |
| `testOAuthUrl` | Optional environment; local test-provider origin or null |
| `googleConfigured` | Optional environment; both provider settings present |
| `githubConfigured` | Optional environment; both provider settings present |
| `emailApi` | Optional environment; fresh API settings record or null |
| `emailSignInEnabled` | Optional environment; local mode or configured API |
| `localOwnerEmail` | Optional environment; trimmed lower-case owner email |
| `localCodesPerHour` | Optional environment; send ceiling or default |
| `creationMode` | Optional environment; codes, open or closed |
| `caps` | Optional environment; fresh hosted cap record or null |
| `turnstile` | Optional environment; fresh bot-check record or null |
| `v2Warnings` | Optional environment; ordered warning array |
| `v2Problems` | Optional environment; ordered identity and admission problems |
| `publicOrigin` | Optional environment; hosted parsed origin or null |

The service also exposes `LOOPBACK` and `RECENT_SIGN_IN_MS`. Consumer bindings
retain the existing `Config`, `Caps` and `CreationMode` types. Re-exported core
settings functions and their v2 aliases refer to the same service functions.

The Node target mapping preserves these existing behaviors:

1. Hosted mode means exactly `HOSTED === "1"`. Unsupported public mode means
   exactly `ALIGN_PUBLIC === "1"`. Optional argument defaults apply to omitted
   or undefined values, using ordinary JavaScript default-parameter semantics.
2. Split `ALIGN_HOSTS` on commas, trim, lower-case and remove empty entries.
   Preserve first insertion order when constructing a Set. The initial loopback
   Set contains `localhost`, `127.0.0.1`, then `[::1]`.
3. Resolve `ALIGN_DATA_DIR`, or `data` beneath the current working directory,
   with Node path semantics. Relative resolutions use the bound working
   directory. Hosted validation requires a nonempty absolute data path outside
   the normalized application directory. Equal paths and descendants, including
   names beginning with two dots, fail. Parent and sibling paths remain valid.
   This rule does not inspect symlinks or perform filesystem operations.
4. Lower-case the whole Host input. A leading `[` ends the hostname at the first
   `]`; a missing closing bracket yields an empty hostname. Other inputs end at
   their first colon. Host admission requires a nonempty allowed hostname and a
   remaining suffix matching `^(?::\d{1,5})?$`. It does not trim input, reject
   a numeric port for exceeding 65,535, or normalize a trailing dot.
5. Test identity is enabled only for `ALIGN_TEST_IDP === "1"` in local mode.
   Its OAuth URL additionally needs a configured URL whose parsed hostname is
   `localhost`, `127.0.0.1` or `[::1]` and whose protocol is HTTP or HTTPS.
   Return its WHATWG URL origin, discarding path, query and fragment.
6. Google and GitHub readiness require truthy ID and secret values. Email API
   readiness requires truthy `ALIGN_EMAIL_API_URL`, `ALIGN_EMAIL_API_KEY` and
   `ALIGN_EMAIL_FROM`, with a parseable HTTPS URL. Return the original strings
   as `url`, `key` and `from`. Local email sign-in is always enabled.
7. The local owner email defaults to `owner@align.localhost` when its setting
   is falsy, then trims and lower-cases. Recent sign-in means 900,000 ms.
   The local send ceiling defaults to 60. A configured positive integer must
   match `^\s*[1-9]\d{0,8}\s*$`; leading zeroes are invalid for this ceiling
   and for hosted caps.
8. Session days default to 30. Trim `ALIGN_SESSION_MAX_DAYS`; a valid value
   matches `^\d{1,3}$` and numerically lies from 1 through 365. Leading zeroes
   are valid. The public `validMaxDays` method itself does not trim its argument.
9. Local creation is always open. Hosted `ALIGN_CREATION` defaults to codes
   when falsy, then trims and lower-cases. Unknown values resolve to closed.
10. Hosted caps are `workspaces` from `ALIGN_MAX_WORKSPACES`, default 100;
    `owned` from `ALIGN_MAX_OWNED_WORKSPACES`, default 2; `members` from
    `ALIGN_MAX_MEMBERS`, default 25; and `sessionsPerDeviceDay` from
    `ALIGN_MAX_SESSIONS_PER_DEVICE_DAY`, default 500. Use the positive-integer
    rule above. Local mode returns null.
11. Bot-check configuration requires hosted mode and both truthy Turnstile
    keys. Return their original strings and the configured verification URL,
    or `https://challenges.cloudflare.com/turnstile/v0/siteverify` when falsy.
    Readiness itself does not validate that URL; startup validation does.
12. Use WHATWG URL parsing for identity, email, bot-check and origin settings.
    Public-origin validation requires HTTPS, pathname `/`, no search, hash,
    username or password, and a parsed hostname in the configured host list.
    Its read accessor returns null outside hosted mode, for a falsy setting or
    on parse failure; otherwise it returns the parsed origin without repeating
    startup validation.
13. `v2Problems` validates whenever called, including with a local environment.
    Its caller decides when those problems prevent startup. Empty optional
    settings retain their existing truthiness and nullish distinctions.

## Relative application-directory binding

The optional application-directory argument of hostedProblems belongs to the
same runtime context as its default. Resolve a relative explicit application
directory against the current value returned by the bound cwd callback, then
compare the absolute data directory with that normalized application directory.
An absolute explicit application directory keeps its absolute meaning. The
omitted or undefined argument uses the bound cwd callback as before. Every
implicit working-directory dependency of path normalization uses that bound
runtime context.

On a POSIX Node target, when the bound runtime directory is /sandbox and the
explicit application directory is service, /sandbox/service/state is inside and
must receive the outside-directory diagnostic. /sandbox/other-state is outside
and does not receive that diagnostic. Directory existence is irrelevant because
these checks perform lexical normalization only.

## Public record and diagnostic representations

Every present settings record is a fresh ordinary JavaScript object with
Object.prototype as its prototype and these own enumerable data properties in
this exact insertion order. The properties are writable and configurable.
Do not add other own enumerable fields or substitute a class instance.

| Method | Ordered properties |
| --- | --- |
| config | hosted: boolean; dataDir: string; allowedHosts: a fresh native Set of strings |
| emailApi | url: string; key: string; from: string |
| caps | workspaces: number; owned: number; members: number; sessionsPerDeviceDay: number |
| turnstile | siteKey: string; secretKey: string; verifyUrl: string |

The presence and null rules remain those specified for each method. In particular,
turnstile uses the original site and secret strings as siteKey and secretKey,
and its configured or default endpoint as verifyUrl. Changing a returned record
or Set does not change later calls or previous independent records.

hostedProblems, v2Problems and v2Warnings each return a fresh mutable native Array
on every call, including empty results. startupProblems alone retains its one
mutable cached Array. Validation throws an ordinary Error with Error.prototype
when startup must be refused; dependency and runtime callbacks preserve their
original thrown values instead.

Do not mutate an input environment or its property descriptors, extensibility,
prototype, hidden properties, symbols or nested references. Reading settings
must leave the caller's input object usable as before.

## Ordered Node diagnostic catalog

Append each applicable problem in the order below. Conditions do not short
circuit later checks except for the alternatives explicitly grouped in one row.
Do not trim secrets or provider values before testing their truthiness or length.

| Order | Condition | Exact diagnostic |
| --- | --- | --- |
| Outer 1 | Parsed host list is empty | `ALIGN_HOSTS must list the public hostname(s)` |
| Outer 2 | A listed host is in the current LOOPBACK Set or equals `::1` | `ALIGN_HOSTS must not include loopback names` |
| Outer 3 | Server secret is falsy or shorter than 32 characters | `ALIGN_SECRET must be set (32+ characters)` |
| Outer 4a | Data directory is falsy or not absolute | `ALIGN_DATA_DIR must be an absolute path on the persistent volume` |
| Outer 4b | Otherwise, data directory is equal to or inside the application directory | `ALIGN_DATA_DIR must be outside the app directory` |
| Outer 5 | Unsupported public mode is on | `Public mode is not supported in this build` |
| V2 1 | Identity secret is falsy or shorter than 32 characters | `BETTER_AUTH_SECRET must be set (32+ characters)` |
| V2 2a | Public origin fails the URL restrictions above | `ALIGN_PUBLIC_ORIGIN must be an https origin (https://host)` |
| V2 2b | Otherwise, its hostname is absent from the parsed host list | `ALIGN_PUBLIC_ORIGIN's host must be listed in ALIGN_HOSTS` |
| V2 3 | Some, but not all, email API values are truthy | `Set all of ALIGN_EMAIL_API_URL, ALIGN_EMAIL_API_KEY, ALIGN_EMAIL_FROM or none (missing <keys>)` |
| V2 4 | A truthy email API URL cannot parse as HTTPS | `ALIGN_EMAIL_API_URL must be an https URL` |
| V2 5 | Exactly one Google provider value is truthy | `GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together` |
| V2 6 | Exactly one GitHub provider value is truthy | `GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together` |
| V2 7 | No email API value is truthy and neither provider is ready | `Sign-in needs the email settings (ALIGN_EMAIL_API_URL, ALIGN_EMAIL_API_KEY, ALIGN_EMAIL_FROM) or a Google or GitHub client (id and secret)` |
| V2 8 | Trimmed session-days setting is nonempty and invalid | `ALIGN_SESSION_MAX_DAYS must be a whole number of days from 1 to 365` |
| V2 9 | Test identity setting is truthy | `ALIGN_TEST_IDP is not allowed when hosted` |
| V2 10 | Test clock setting is truthy | `ALIGN_TEST_NOW is not allowed when hosted (tests only)` |
| V2 11 | Test OAuth URL setting is truthy | `ALIGN_TEST_OAUTH_URL is not allowed when hosted (tests only)` |
| V2 12 | Local owner setting is truthy | `ALIGN_LOCAL_OWNER_EMAIL is not allowed when hosted (Mode L only)` |
| Gate 1 | A truthy creation setting normalizes to an unknown mode | `ALIGN_CREATION must be codes, open or closed` |
| Gate 2 | A cap setting is neither undefined nor empty and fails the positive-integer rule | `<key> must be a positive whole number` |
| Gate 3 | Exactly one bot-check key is truthy | `ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY must be set together` |
| Gate 4 | A truthy bot-check verification URL cannot parse as HTTPS | `ALIGN_TURNSTILE_VERIFY_URL must be an https URL` |

For V2 3, list only missing email keys, joined by comma and space, in this order:
URL, API key, from. Any truthy partial email configuration suppresses V2 7 while
still producing V2 3. Gate 2 may append four messages, using cap keys in the
workspaces, owned workspaces, members, sessions-per-device order above.
`hostedProblems` appends all V2 and gate messages after the outer messages.

The first warning, when hosted and bot-check configuration is absent, is exactly:

```text
Warning: ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY are not set, so sign-in, access requests and workspace creation have no bot check.
```

Append a truthy result of `followUpProblem(env)` after that warning, in either
operating mode. Preserve its exact returned text. Startup assertion first throws
an Error with the outer unsupported-public-mode message when that switch is on.
Otherwise, in hosted mode only, obtain a fresh `hostedProblems` array. If it is
nonempty, throw an Error whose message is `HOSTED=1 refused to start:\n- `
followed by the problems joined with `\n- `. Return undefined in every other
case. This assertion neither reads nor initializes the startup-problem cache.



#### Scenario: Preserve every settings observation

- **WHEN** the Node settings target is selected
- **THEN** The complete service and all original observations retain their reviewed behavior.

#### Scenario: Bind explicit relative directories to the runtime

- **WHEN** a caller supplies a relative application directory
- **THEN** Normalize it against the bound current-directory callback before checking the absolute data directory.
