# Node-Workspace-Admission implementation Flavor

## ADDED Requirements

### Requirement: Node workspace admission binding [authored:node-workspace-admission-v3]

# Node workspace-admission binding

Provide one dependency-free CommonJS package named `server_workspace_admission`.
Expose three named factory modules: `create_creation`, `create_access` and
`create_disposable`. Each factory takes exactly one resource object, captures
its declared properties once in the order below, and returns a stable namespace.
Construction invokes no supplied service, enumerates no resource properties and
uses no later replacement of the resource-object properties. Exported operations
work when detached from the namespace.

Creation preserves needsCode(email), precheckCreation(request, creator, code),
admitCreation(creator, code, workspaceId), checkRestoreCaps(userId),
checkMemberCap(workspaceId, countInvites) and sessionCapError(max), with argument
counts 1, 3, 3, 1, 2 and 1. Access preserves createAccessRequest(request, client,
body), argument count 3, plus TEAM_SIZES, INTERESTS and VIAS. Disposable preserves
isDisposable(email) and refuseDisposable(email), argument count 1 each. Only
precheckCreation and createAccessRequest are async. Preserve their Promise
completion and exact supplied rejections. All remaining operations are sync.

Creation captures config, secret, requireCaptcha, caps, creationMode, CODE_RE,
redeemCreationCode, get, sql, refuseDisposable, V2Error, conflict, forbidden,
count, readFirstOwnerEmail and memberCheckNow, in that order. Access captures
config, requireCaptcha, get, run, tx, refuseDisposable, event, V2Error,
badRequest, newId, nowIso, accessEmailKey, durableCount, durableRoom, oneOf,
optOneOf, optStr and str, in that order. Disposable captures forbidden only.
Call supplied functions as bare calls unless their declared contract requires
a method receiver or constructor. Keep CODE_RE.test's object receiver and
operation-time method lookup. Omitted optional arguments remain omitted.

The raw live first-owner reader returns the current environment property.
memberCheckNow returns the current native Date ISO value at the member-cap
lookup point. Node owns string, regex, Set, object, async and exception behavior.
Do not normalize malformed provider values or replace supplied error objects.
Access owns three mutable, stable array objects, passed directly to validators.

The ordinary immutable asset overlay supplies
`source/server_workspace_admission/disposable-domains.json`. Its SHA-256 is
`1b36130a488aae7a4fefc689f9c9b936dc679a7537edda2c3e1003e53814f894`,
its size is 217324 bytes and its media type is application/json. The JSON root
is an object with `domains`, an array of 10083 strings, and string metadata
fields _commit, _license, _note and _source. Read the existing domains array to
construct the private membership Set. Use metadata in the generation context;
never recreate, shorten, normalize, rewrite or generate the data file.

Normal source promotion owns the reviewed selector and Component-relative
asset custody. Generation owns only JavaScript text. The same overlaid exact
JSON must survive package, cache and runtime assembly beside the advertised
modules. A generated output cannot replace an authored asset or introduce an
undeclared runtime dependency. Domain labels that resemble platform names are
data values, and impose no target requirement. The selected Node target supplies
platform and toolchain authority.

## Complete imported port signatures

These are read-only TypeScript public signatures from the exact preserved three
modules. Aliases name the caller-owned types; these declarations contain no function
implementation or credential values. The factory captures each listed resource
once and keeps its exact value. Invoke services as bare calls unless the contract
explicitly requires an object method or constructor. Keep omitted optional
arguments omitted. Do not pass a generated clock to a service that originally
used its own default.

### Creation

| Resource | Supplied type |
| --- | --- |
| `config` | `() => Config` |
| `secret` | `() => string` |
| `requireCaptcha` | `(req: Request) => Promise<void>` |
| `caps` | `(env?: NodeJS.ProcessEnv) => Caps \| null` |
| `creationMode` | `(env?: NodeJS.ProcessEnv) => CreationMode` |
| `CODE_RE` | `RegExp` |
| `redeemCreationCode` | `(db: Sql, secret: string, code: string, email: string, userId: string, wsId: string, now?: number) => boolean` |
| `get` | `<T = Row>(sql: string, ...params: SQLInputValue[]) => T \| undefined` |
| `sql` | `Sql` |
| `refuseDisposable` | `(email: string) => void` |
| `V2Error` | `typeof V2ErrorShape; new (status: number, code: string, message?: string, extra?: Record<string, unknown>): V2ErrorShape` |
| `conflict` | `(code: string, message: string) => V2Error` |
| `forbidden` | `(code: string, message: string) => V2Error` |
| `count` | `(n: number, one: string, many?: string, fmt?: (n: number) => string) => string` |
| `readFirstOwnerEmail` | `() => string \| undefined`, raw live environment property |
| `memberCheckNow` | `() => string`, live native Date ISO value |

### Access

| Resource | Supplied type |
| --- | --- |
| `config` | `() => Config` |
| `requireCaptcha` | `(req: Request) => Promise<void>` |
| `get` | `<T = Row>(sql: string, ...params: SQLInputValue[]) => T \| undefined` |
| `run` | `(sql: string, ...params: SQLInputValue[]) => number` |
| `tx` | `<T>(fn: () => T) => Promise<T>` |
| `refuseDisposable` | `(email: string) => void` |
| `event` | `(name: EventName, o?: { ws?: string \| null; user?: string \| null; props?: EventProps; at?: string; }) => boolean` |
| `V2Error` | `typeof V2ErrorShape; new (status: number, code: string, message?: string, extra?: Record<string, unknown>): V2ErrorShape` |
| `badRequest` | `(message: string, code?: string) => V2Error` |
| `newId` | `(prefix: IdPrefix) => string` |
| `nowIso` | `() => string` |
| `accessEmailKey` | `(email: string) => string` |
| `durableCount` | `(limits: Limit[], now?: number) => void` |
| `durableRoom` | `(limits: Limit[], now?: number) => boolean` |
| `oneOf` | `<T extends string>(b: Body, k: string, allowed: readonly T[]) => T` |
| `optOneOf` | `<T extends string>(b: Body, k: string, allowed: readonly T[]) => T \| null` |
| `optStr` | `(b: Body, k: string, max?: number) => string \| null` |
| `str` | `(b: Body, k: string, max?: number, options3?: { min?: number; }) => string` |

### Disposable

| Resource | Supplied type |
| --- | --- |
| `forbidden` | `(code: string, message: string) => V2Error` |

Config has hosted:boolean, dataDir:string and allowedHosts:Set<string>. Caps
has workspaces, owned, members and sessionsPerDeviceDay:number. CreationMode is
codes, open or closed. Keep Sql as the caller's opaque handle and pass it only
to redeemCreationCode. Public V2Error instances come from the supplied
constructor. A new error with matching fields cannot replace that identity.

Get returns an optional row. Count projections used by these operations default
a missing/null count through the original behavior. SQL input types and provider
failures retain the caller's declared binding semantics. Do not normalize
provider values, field nullability or the results of supplied parsers.

The access limit descriptors carry key, max and windowMs; access has exactly the
two descriptors and order declared by the Component. Its event call is
access_requested with an options object containing props:{interest,via}. The
newId argument is ar. Parsers receive the actual supplied body, original field
names, maxima and the exported array objects. Neither array copies nor
pre-validation can replace those calls.

## Literal body and query projection contracts

Access parsers receive these exact body keys in order: email, name, company,
team_size, use_case, interest, via. Keep the underscore wire keys; public
TypeScript argument variable names do not rename body properties.

Workspace ownership is the v2_members relationship: user_id identifies the
person, role is owner, and ws_id joins v2_workspaces.id. A workspace's created_by
field records its creator and does not substitute for membership ownership.
Count projections expose `n`; missing or null `n` defaults to zero. Preserve
ordinary native property behavior for other malformed provider values.

Hosted creation reads required caps directly even if the provider returned
null; restore/member checks have their own explicitly absent-cap early return.
Use strict null comparison for the precheck code-pattern skip. Count calls use
workspace, member and new session as the respective singular unit strings, with
only two arguments. Owned cap messages use the actual owned count rather than
the configured cap.

## Physical store metadata

Use the following row-free SQLite table metadata. Column types, nullability,
primary-key order and foreign-key relationships are input contracts. They contain
no original query program or account rows. Bind caller values as SQL parameters.
The supplied redemption service owns creation-code storage through the exact
opaque Sql handle. Preserve its public call instead of recreating that service.

```json
{
  "v2_access_requests": {
    "columns": [
      {
        "name": "id",
        "type": "TEXT",
        "notnull": 0,
        "pk": 1
      },
      {
        "name": "email",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "name",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "company",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      },
      {
        "name": "team_size",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      },
      {
        "name": "use_case",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "interest",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "status",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "created_at",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "decided_at",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      },
      {
        "name": "code_id",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      }
    ],
    "foreign_keys": []
  },
  "v2_invites": {
    "columns": [
      {
        "name": "id",
        "type": "TEXT",
        "notnull": 0,
        "pk": 1
      },
      {
        "name": "ws_id",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "token_hash",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "email",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "role",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "created_by",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "created_at",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "expires_at",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "accepted_at",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      },
      {
        "name": "accepted_by",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      },
      {
        "name": "team_id",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      },
      {
        "name": "team_role",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      }
    ],
    "foreign_keys": [
      {
        "id": 0,
        "seq": 0,
        "table": "v2_workspaces",
        "from": "ws_id",
        "to": "id",
        "on_update": "NO ACTION",
        "on_delete": "CASCADE",
        "match": "NONE"
      }
    ]
  },
  "v2_members": {
    "columns": [
      {
        "name": "ws_id",
        "type": "TEXT",
        "notnull": 1,
        "pk": 1
      },
      {
        "name": "user_id",
        "type": "TEXT",
        "notnull": 1,
        "pk": 2
      },
      {
        "name": "role",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "created_at",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      }
    ],
    "foreign_keys": [
      {
        "id": 0,
        "seq": 0,
        "table": "ba_user",
        "from": "user_id",
        "to": "id",
        "on_update": "NO ACTION",
        "on_delete": "CASCADE",
        "match": "NONE"
      },
      {
        "id": 1,
        "seq": 0,
        "table": "v2_workspaces",
        "from": "ws_id",
        "to": "id",
        "on_update": "NO ACTION",
        "on_delete": "CASCADE",
        "match": "NONE"
      }
    ]
  },
  "v2_workspaces": {
    "columns": [
      {
        "name": "id",
        "type": "TEXT",
        "notnull": 0,
        "pk": 1
      },
      {
        "name": "name",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "created_by",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "created_at",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      },
      {
        "name": "deleted_at",
        "type": "TEXT",
        "notnull": 0,
        "pk": 0
      },
      {
        "name": "steering",
        "type": "TEXT",
        "notnull": 1,
        "pk": 0
      }
    ],
    "foreign_keys": []
  }
}
```


#### Scenario: Complete workspace admission namespace

- **WHEN** the Node target is selected
- **THEN** Capture the declared resources once, preserve all nine operations and three stable mutable arrays, exact signatures and failures, native host behavior and the existing immutable data through the ordinary overlay and packaged library boundary.
