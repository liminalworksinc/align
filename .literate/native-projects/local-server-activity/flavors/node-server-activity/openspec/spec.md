# Node-Server-Activity implementation Flavor

## ADDED Requirements

### Requirement: Node goal activity binding [authored:node-server-activity-v3]

# Node activity binding

## Import and resource boundary

Export `create_activity(resources)`.

Publish a dependency-free CommonJS package `server_activity` with exactly
`create_activity.js` and `package.json`. Its export map is
`{"./create_activity":"./create_activity.js"}` and its only exported symbol is
`create_activity`. CommonJS and ESM imports must expose the same factory. The
factory is synchronous, has name `create_activity` and length 1, and captures
these 16 supplied resources once, in this order:

`all, run, tx, badRequest, nowIso, goalObj, goalRow, canReadGoal, openEpoch,
sessionRow, need, cleanProse, isBlankText, personName, SESSION_KEY_RE, readDate`.

Do not enumerate the resource object, defer capture, substitute resources or add
ambient application effects. The result has exactly two own enumerable members,
in order: async `ingestActivity` with length 3 and sync `activityFor` with length 2.
Preserve these function names and asynchronous kinds. Existing caller-owned types
remain at the caller, with no new public type or executable adapter in this package.
Root build/test/package adapters are outside the two-file runtime package.

Invoke supplied functions as bare calls, preserving their argument objects and
refusal identity. Invoke `SESSION_KEY_RE.test` as a method of that supplied regex
object, preserving its receiver and original repeated reads of the item key.
`readDate()` returns the live Date constructor. Call it at every original Date
lookup, preserving constructor, static parse and now behavior, lookup order and
errors. Do not capture Date once at factory creation or add another clock read.
There are five static Date sites in ingestion. The feed uses supplied `nowIso`.

Preserve JavaScript truthiness, short-circuit evaluation, nullish behavior,
property access count and order, array iterators, native Date parsing and UTF16
string slicing. Do not pre-read properties, normalize inputs in advance, copy the
input array, reorder resource calls or replace callback transaction ownership.
Preserve a thrown supplied value unchanged. No repair of accepted invalid input,
additional permission or stricter validation is authorized by this preservation
contract. Ordinary private effect/property failures must retain the same partial
trace and durable transaction result as the original.

## Ingestion

For `(principal, device, body)`, first call `need(principal, "session.share")`.
Read `body.items`; require an array, otherwise throw the result of
`badRequest("items must be a list")`. Read its length and refuse values above 200
with `badRequest("items: at most 200")`. Exactly 200 is allowed. Sample
`readDate().now()` once after these checks, initialize accepted and refused, then
await the supplied `tx` with one synchronous callback. Use the live
`items.entries()` iterator. Preserve the original processing order of each item:

1. Require a truthy object that is not an array. Refuse with `each item must be an object`.
2. Obtain the session key by checking its string type, invoking the supplied regex
   method and reading the original key again. A false result is `session_key is invalid`.
3. Read kind. Accept exactly edit, commit, task and claim. Otherwise refuse with
   `kind must be edit, commit, task or claim`.
4. If at is a string, parse it with the live Date constructor's static parse;
   otherwise use NaN. Require a finite result, with `at must be an ISO time` on
   refusal. Keep native Date.parse acceptance of parseable non-ISO strings.
5. Require a string repo_id matching lowercase hexadecimal length 16 through 64,
   with `repo_id must be a hex hash` on refusal. Preserve both original reads.
6. Evaluate path_hash with the original repeated undefined, null, string and hex
   checks. Missing or null yields null. A supplied value that fails the lowercase
   16-through-64 rule refuses with `path_hash must be a hex hash`.
7. Read path and validate it. Missing or null yields null. A supplied value must
   be a nonempty string, at most 300 UTF16 code units, without a leading forward
   slash, a complete forward-slash-separated `..` component or an ASCII control
   from zero through 31. Refuse with `path must be a repo-relative path`. Retain
   original acceptance of backslashes, drive-shaped strings, DEL and other path
   spellings that do not meet one of those refusal tests.
8. Read text. Missing or null yields null. A supplied non-string refuses with
   `text must be a string`. Replace ASCII zero through 31 and 127 with spaces,
   then call supplied `cleanProse` once. Test the returned string with supplied
   `isBlankText`. A blank result is null; otherwise use its first 120 UTF16 code
   units, preserving a possible sliced surrogate and the supplied cleaner's result.
9. After all field checks, individually refuse a timestamp more than five minutes
   ahead of the held clock as clock_skew or more than 24 hours behind as too_old.
   Equality at each boundary is allowed. Append `{index, reason}` and continue.
10. Call `sessionRow(principal.wsId, key)`. A missing row, a device_id different
    from device.deviceId or a state different from shared individually refuses
    as not_shared and continues. Preserve short-circuit property and call order.
11. Use one hour for claim and 24 hours for the other accepted kinds. Insert using
    the exact query below and binds, in order: principal.wsId, held key,
    session.user_id, `openEpoch(principal.wsId, key)?.goal_id ?? null`, the live
    item.repo_id read, held kind, path hash, path, text, an ISO string from a new
    live Date at the held parsed timestamp, and an ISO string from a new live
    Date at that timestamp plus the lifetime. Increment accepted after the write.

Within the same transaction callback, after all entries, always run workspace
expiry cleanup with principal.wsId and `nowIso()`, even for an empty or fully
refused batch. The comparison is strictly less than. A malformed later item,
property error or supplied failure must roll back earlier writes through the
supplied transaction. Do not swallow it or move cleanup outside the callback.

After awaiting the transaction, return own properties in order accepted, refused,
server_time. The last timestamp uses a new live Date constructed from the held
initial clock value, without resampling now. Preserve Promise behavior even for
permission or input refusals before the first await.

## Visible feed

For `(principal, after)`, first call `need(principal, "workspace.read")`. Query
with principal.wsId, after and `nowIso()` using the exact program below. Join
sessions within the same workspace, left join users, require seq strictly above
after and expiry strictly after the live timestamp, order by seq and limit to
500 raw rows. No refill or post-filter replacement page is permitted.

Use a fresh per-call Map to memoize readability by goal id. For a falsy goal id,
only the row's own user may see it. For a truthy uncached id, call goalRow with
principal.wsId and the id. Cache false for a missing goal; otherwise cache the
result of `canReadGoal(principal, goalObj(goal))`. Preserve the truthiness and
short-circuit result, including caching hidden and missing goals. Supplied policy
owns visibility. Do not replace it with owner-only logic or repeated queries.

Filter all rows first, reading each goal_id then user_id for visibility. Map the
visible rows afterward, producing these own members in order: seq, session_key,
harness, user `{id: row.user_id, name: personName(row.user_id, row.name)}`, mine
from row.user_id strictly equal to principal.userId, goal_id, repo_id, kind,
path_hash, path, text, at, expires_at. Preserve repeated field reads and supplied
retention-name handling of a deleted person.

Return `{cursor, items}` in that order. When raw rows exist, cursor is the seq of
the final raw row, even if every row is hidden; otherwise retain the supplied
after value. Do not derive the cursor from visible items, reapply current session
sharing state during feed reads, add content reads or change the raw SQL joins.

## Required property observation order

The optional path hash retains a separate final property read after deciding its
bound value. Read path_hash to test undefined. Only if that test is false, read
it again to test null. When both tests are false, read it for the string-type
test; only for a string read it again for the hex regex; only on a match read
it again to bind the value, otherwise bind null. After that entire decision,
independently read item.path_hash for the non-null test, and refuse if that test
is true and the bound value is falsy. Do not combine that last read with the
initial checks. A stable valid hash causes six reads, stable null three and
stable undefined two. Changes or failures on any read remain observable.

In feed filtering, evaluate both row.goal_id and row.user_id for every raw row,
in that order, before checking whether the held goal id is falsy or consulting
the readability cache. Even a bound-goal row must read user_id before any
principal, goalRow, goalObj or canReadGoal access. Conditionalizing that read on
an unbound row changes the original property and failure order. Keep the held
user id for the unbound ownership comparison.

## Exact SQL programs

Q01, supplied `run`, 11 ordered binds:

```sql
INSERT INTO v2_activity (ws_id, session_key, user_id, goal_id, repo_id, kind, path_hash, path, text, at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Binds: `pp.wsId`, `key`, `s.user_id`, `openEpoch(pp.wsId, key)?.goal_id ?? null`, `it.repo_id`, `kind`, `pathHash`, `path`, `text`, `new Date(at).toISOString()`, `new Date(at + life).toISOString()`.

Q02, supplied `run`, 2 ordered binds:

```sql
DELETE FROM v2_activity WHERE ws_id = ? AND expires_at < ?
```

Binds: `pp.wsId`, `nowIso()`.

Q03, supplied `all`, 3 ordered binds:

```sql
SELECT a.seq, a.session_key, a.user_id, a.goal_id, a.repo_id, a.kind, a.path_hash, a.path, a.text, a.at, a.expires_at, s.harness, u.name
     FROM v2_activity a JOIN v2_sessions s ON s.ws_id = a.ws_id AND s.session_key = a.session_key LEFT JOIN ba_user u ON u.id = a.user_id
     WHERE a.ws_id = ? AND a.seq > ? AND a.expires_at > ? ORDER BY a.seq LIMIT 500
```

Binds: `pp.wsId`, `after`, `nowIso()`.


#### Scenario: Preserve atomic activity ingestion and visible raw-page feed

- **WHEN** the Node activity target is selected
- **THEN** Capture16 ordered resources once. Preserve2 runtime methods, async ingestion with3 arguments and sync feed with2. Preserve five live Date sites, exact SQL/binds and the supplied regex receiver. Validate fields before clock refusals; retain200-item cap, five-minute future and24-hour past equality boundaries, per-item refusal indices, shared-device ownership, epoch and session-user association, one-hour claim lifetime, supplied text cleaning and UTF16 truncation, strict cleanup within the same atomic transaction, and whole-batch rollback. Preserve workspace joins,500 raw-row page limit, per-call goal readability cache including missing and hidden goals, own unbound rows, retention names and the cursor of the final raw row after filtering. Preserve all property, effect and refusal identities and order. No ambient IO, new content read, permission or delivery assertion.
