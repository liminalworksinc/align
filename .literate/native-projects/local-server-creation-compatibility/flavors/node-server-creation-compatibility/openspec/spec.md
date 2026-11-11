# Node-Server-Creation-Compatibility implementation Flavor

## ADDED Requirements

### Requirement: Existing tester-code compatibility in v2 target binding [authored:node-server-creation-compatibility-v1]

# Node binding for current v2 creation-code compatibility

Use the selected Node 20 or later Standard lifecycle. Produce a CommonJS package
named `server_creation_compatibility` with exactly `package.json` and
`create_creation_compatibility.js`. Export only `./create_creation_compatibility`
with the named synchronous `create_creation_compatibility(resources)` factory.
All runtime logic belongs in that one file. Import and construction perform no
host I/O and require no runtime imports.

Capture `resources.core`, `resources.createHash` and `resources.readDate` in that
order, then the core's `CODE_RE`, `codeHash`, `rand32` and `recordEvent` members.
Call the captured helper functions and clock resolver as free functions with an
undefined receiver. Preserve receivers on the regular-expression `test`, hash
`update` and `digest`, database `run` and `get`, and supplied clock methods.
Replacing a member on the resources container later does not replace a captured
helper. Do not capture a Date constructor or clock value during construction.

Return exactly these keys in order: `V1_CODE_RE`, `isCreationCode`,
`importCreationCodes`, `redeemCreationCode`. The three functions have arities
1, 5 and 6. Keep their original synchronous execution and default parameters.
Do not add a transaction, retry, event, input coercion or exception wrapper.

## Format predicates

`V1_CODE_RE` is the shared RegExp `/^[0-9a-f]{20}$/`, without flags. Return that
same object that the combined predicate uses, so an existing object's test method
is read at each call. `isCreationCode(code)` evaluates `CODE_RE.test(code)` first
and short-circuits on success, otherwise evaluates `V1_CODE_RE.test(code)`.
Preserve ordinary RegExp input behavior. The current-format predicate is the
captured supplied object, rather than a separately reconstructed expression.

## Import

`importCreationCodes(db, secret, codes, spentOnV1, days, now = readDate().now())`
returns `{imported, present, used, spentOnV1}` with four numeric counters initially
zero and in that insertion order. The default clock lookup runs before body
validation. With explicit now, do not perform that default lookup.

Before dates, hashing or database work, require every row to pass
`V1_CODE_RE.test(c.code)` and either `c.email === null` or
`/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(c.email)`. Validate the raw email before
normalization. A failing batch throws `new Error("Invalid import row")` before
processing any of its rows. Preserve native failures from malformed inputs.

Resolve the supplied Date constructor separately for each construction. First
compute `at = new (readDate())(now).toISOString()`, then
`expires = new (readDate())(now + days * 86400000).toISOString()`. Even an empty
valid batch performs those constructions. No default clock is cached.

For each row in order, first call the captured `createHash("sha256")`, then its
`update(code)` and `digest("hex")`. If the supplied spent set contains that plain
digest, increment only the spentOnV1 counter and continue without keyed hashing,
random ID generation, database access or events.

For every other row, compute `hash = codeHash(secret, code)`. Call
`db.run` with exactly this SQL and positional arguments:

```sql
INSERT OR IGNORE INTO v2_creation_codes (id, code_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)
```

The arguments are `cc_` plus `rand32(15)`, hash,
`email?.trim().toLowerCase() ?? null`, at and expires, in that order. Generate
the random ID even for an existing row. Only the numeric result `=== 1` is a new
import. Increment imported, then call
`recordEvent(db, "code_created", {props:{source:"operator"}, at})`.

For any other run result, increment present and call `db.get` with exactly:

```sql
SELECT 1 AS x FROM v2_creation_codes WHERE code_hash = ? AND redeemed_at IS NOT NULL
```

Pass hash as its sole positional argument. Increment used when the result is
truthy. Return all four counters after the loop. Let database and event failures
propagate with their original identity; preserve earlier effects. The caller
owns BEGIN, COMMIT and ROLLBACK. Never issue them here.

## Redemption

`redeemCreationCode(db, secret, code, email, userId, wsId, now = readDate().now())`
first evaluates the default clock lookup when needed. Then call the internal
combined predicate and return false immediately for an invalid format, without
constructing a date or touching hashing or the database.

For a valid format, compute `at = new (readDate())(now).toISOString()`. Then call
`db.run` with exactly this SQL, preserving its newline and seven leading spaces
on the second line:

```sql
UPDATE v2_creation_codes SET redeemed_at = ?, redeemed_by = ?, ws_id = ?
       WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ? AND (email IS NULL OR email = ?)
```

Its positional arguments are at, userId, wsId, `codeHash(secret, code)`, at,
`email.toLowerCase()`, in that order. Return whether the run result is strictly
the number 1. Do not trim the redemption email. Do not query a row first or emit
an event. Preserve default evaluation and thrown error identity.


#### Scenario: Preserve current v2 creation-code compatibility

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve current-v2 code formats, whole-batch validation, spent-code exclusion, strict import counters, parameterized redemption guards, helper effects, clock lookups and error propagation through the supplied host resources.
