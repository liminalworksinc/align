# Sqlite-Rate-Limits implementation Flavor

## ADDED Requirements

### Requirement: Node and SQLite rate limiter binding [authored:sqlite-rate-limits-contract-v2]

# Node and SQLite limiter binding

The module `rate_limits/create_limiter` exports synchronous
`create_limiter(context)`. The returned service supplies these callable methods:
`take`, `takeAll`, `retryAfterMs`, `otpEmailKey`, `accessEmailKey`, `durableRoom`,
`durableCount`, `durableRetryAfterMs` and `takeDurable`.

The application preserves the original nine exports, argument order, optional
time parameters, return types and `Limit` type. `Limit` has `key: string`,
`max: number` and `windowMs: number`. `take` accepts those three values separately.
The batch and durable operations accept arrays of `Limit`. The two key helpers
accept an email string. Time is measured in milliseconds. The constructor has
one required parameter. Preserve each existing method's function name and required
arity: three for `take`, one for each other exported function. Optional time
parameters retain their ordinary default-parameter behavior.

## Supplied dependencies

- `hits` is the exact shared `Map<string, number[]>` for the original process
  memory scope. Keep that object by reference, including changes its owner makes.
  The owner may preload or leave more than 10,000 valid keys. Both `take` and
  every successful key update in `takeAll` remove the key's earlier entry and
  remove as many oldest remaining entries as needed before recording the new
  hit. A single eviction is insufficient when the supplied Map starts further
  above capacity. Empty batches and refusals retain their existing no-effect
  behavior.
- `now()` returns the current time. Capture its reference and call it as a bare
  function only when an operation's time is omitted or undefined.
- `signPayload(payload)` supplies the existing signing implementation. Preserve
  its reference, exact string argument, returned value and thrown value.
- `get(statement, ...parameters)`, `all(statement, ...parameters)` and
  `run(statement, ...parameters)` are the existing synchronous database helpers.
  Capture them once and invoke them as bare functions.
- `V2Error` is the existing qualified constructor. Capture its reference and use
  it for single-key memory refusal, preserving constructor identity.

Capture dependency references without invoking them during construction. Use
lexical dependencies between returned operations so replacing a returned method
does not replace the internal operation used by another method. Every method
supports the original bare-function calling convention.

The application binding retains the original `globalThis.__alignV2Limits` slot
and supplies its Map, a callback to the actual clock, signing, database helpers
and qualified error constructor. The native library uses its supplied resources;
it does not access ambient process state, files, network, secrets or clock.

## Exact SQLite mapping

The caller initializes `v2_rate_hits` with its existing non-null text `key` and
non-null integer `at` columns and existing indexes. Preserve these parameterized
statements and their argument order:

| Operation | Statement | Parameters |
|---|---|---|
| Count live hits | `SELECT COUNT(*) AS n FROM v2_rate_hits WHERE key = ? AND at > ?` | key, time minus window |
| Read newest hits | `SELECT at FROM v2_rate_hits WHERE key = ? AND at > ? ORDER BY at DESC LIMIT ?` | key, time minus window, maximum |
| Prune | `DELETE FROM v2_rate_hits WHERE at <= ?` | time minus 86,400,000 |
| Append | `INSERT INTO v2_rate_hits (key, at) VALUES (?, ?)` | key, time |

A missing count row or nullish `n` uses zero, as in the retained helper.
Room/retry queries do not prune. Counting preserves duplicate rows and prunes
before appends, including for an empty batch. Durable admission performs all
required prechecks before any counting.

The library issues no transaction commands. The existing caller's acquired
transaction and synchronous callback requirement continue to own durable atomicity.
Failures retain the same thrown value, earlier effects and read/write order.

Use ordinary JavaScript optional-parameter semantics and numerical arithmetic.
Do not normalize keys or email text, change duplicate handling, add runtime input
validation, silently swallow failures or add stronger cross-store rollback.

Generated implementation tests retain the normal diversity requirement. Public
constructor and method arguments describe real dependencies and operations; no
artificial parameters are introduced to satisfy a test-count rule.


#### Scenario: Existing application operations

- **WHEN** the Node and SQLite target binding is selected
- **THEN** Preserve the nine existing function signatures, explicit resources and complete frozen observations.
