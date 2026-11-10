# Node-Server-Sessions implementation Flavor

## ADDED Requirements

### Requirement: Node shared-session binding [authored:node-server-sessions-v2]

# Node shared-session binding

## Package and resources

Export synchronous `create_sessions(resources)`, name create_sessions and length
1, from dependency-free CommonJS package `server_sessions`. Its directory has
exactly `create_sessions.js` and `package.json`, with export map
`{"./create_sessions":"./create_sessions.js"}` and type commonjs. The sole
module export is create_sessions. CommonJS and ESM expose that same factory.
Root build/test/package adapters remain separate from this runtime package.

Capture the following 37 resources exactly once and in this order:

`caps, sessionCapError, all, audit, get, run, tx, takeDurable, V2Error, badRequest, conflict, notFound, event, nowIso, sha256hex, goalObj, goalRow, transferFor, authorize, canReadGoal, stopStatus, writeDirective, need, expireStoppedSessionTargets, holdNewlyBound, personName, shareAgainText, shareAgainWords, sharingStoppedText, b64url, iso, nonNegInt, oneOf, optInt, optStr, str, readDate`.

Never enumerate or defer resource capture. Call supplied functions bare and
preserve argument identities and read order. V2Error is a supplied constructor,
used with new. readDate() returns the current Date constructor at each original
lookup, including all fifteen Date parse/now sites. Preserve lookup order and
native return/error behavior. No ambient Date, Buffer, process, crypto, fs,
network, environment, timer or randomness belongs in the runtime module.

The selected JavaScript Flavor owns the host toolchain, its compatible range
and executable/version probe. Reuse that selected host. Add no duplicate Node
source dependency or invented SBOM version. Keep normal dependency, source,
provenance, build, package and host gates. Do not edit generated evidence.

Preserve native truthiness, nullish choice, optional access, comparison, repeated
property reads, Array iteration, Map lookup, Set membership receivers, regex and
JSON semantics. Do not cache row fields or pre-read inputs. Preserve every
supplied transaction callback result and its sync kind. Await each original tx
where specified; ingestUsage returns its tx result through its async function.
All original thrown values, including undefined and null from supplied ports,
retain identity. Add no catch outside the original usage-row conversion catch.

Return the twelve own enumerable values in the metadata order below. Eleven
are functions and USAGE_FIELDS is the same exported mutable array used by the
implementation. Preserve names, lengths, async kinds, values and public shape.
SessionRow and EndedReason remain caller-owned public TypeScript types with their
original structural and union identities. Do not introduce a runtime type export.

## Ending, finding and owning sessions

endSessions(live,reason,at) is synchronous, length 3, and runs inside a caller-owned
transaction when the caller supplies one. For each original row in order: Q01
closes open epochs, Q02 stops the session, preserves an existing stopped_at,
records the reason and clears governing ids, then Q03 expires only sent/received
request targets with that same reason. Read ws_id and session_key again at each
original bind. Add no transaction or audit here. Return the original live.length
after iteration, including repeated or missing keys.

sessionRow(ws,key) runs Q04 and returns its supplied get result unchanged.
openEpoch(ws,key) runs Q05 and returns its get result unchanged. Each has length 2.

ownSession(pp,p,key), length 3, calls sessionRow(pp.wsId,key). If absent throw
notFound(). Otherwise need(pp,"session.manage",{kind:"session",ownerId:s.user_id}).
Only then, when p.kind is device and s.device_id !== p.deviceId, throw notFound().
A web principal has no device restriction. Return the exact row object.

The private epoch output maps epoch_id, goal_id, goal_version_at_start, starts_at
and ends_at in that order. Share output first reads openEpoch(s.ws_id,
s.session_key), then maps session_key, state and current_epoch, using null when
there is no open epoch.

Clock-skew refusal computes Math.round((live Date.parse(sent) - live Date.now()) /
60000), then constructs V2Error(400,"clock_skew", `${field} is ${minutes} minutes
ahead of the server's clock; this device's clock is off`, {server_time:nowIso()}).
Keep this second clock sampling and exact message; do not reuse an earlier value.

## Sharing and re-sharing

putSession(pp,dev,key,b) is async, length 4. First need(pp,"session.share"), then
oneOf(b,"harness",["claude-code","codex"]), b64url(b,"repo_key",43,43),
optStr(b,"repo_alias",100), iso(b,"started_at"). If live parse(startedAt) > live
now()+5*60*1000, throw the clock-skew refusal for started_at. Equality is allowed.
Then optStr(b,"title",200), nowIso() as at, and await tx with a synchronous
callback. Do not derive started_at from the existing row or the receipt clock.

Inside tx obtain sessionRow(pp.wsId,key). The ended predicate is exactly stopped
and, for device_signed_out, a different device id, otherwise member_removed.
Preserve short-circuit reads: state, ended_reason, the reason-dependent device id,
and, only when s and ended, s.user_id then dev.user.id.

For this same person's ended session, require existing harness and repo_key to
match the validated values, reading harness before repo_key and short-circuiting
OR. Otherwise throw conflict("session_conflict","This session key was shared
with a different harness or repo"). Q06 reopens it on dev.deviceId, clears the
ending fields, updates alias/title/time. Then audit(pp.wsId,dev.user.id,
"session.shared_again",null,at).

For any other existing row: first a different user is notFound; next stopped
state is conflict("sharing_stopped","Sharing was stopped for this session");
next a different device is notFound; next mismatched harness/repo is the same
session_conflict. This order makes a permanently stopped key refuse as stopped
before a different same-person device is considered. Q07 updates alias/title/time.

For a new row, call caps(). Only if truthy call takeDurable with a newly allocated
one-element array holding a descriptor. The single argument is [descriptor],
never the descriptor object itself. The descriptor is {key:`sessions-device:${dev.deviceId}`,max:c.sessionsPerDeviceDay,
windowMs:24*3600*1000}. A false take throws sessionCapError(c.sessionsPerDeviceDay).
Keep both separate max-property reads. Q08 inserts shared state with the exact
actor, device, metadata and time binds. Then event("first_session_captured",
{ws:pp.wsId,user:dev.user.id,props:{harness},at}), followed by the same shape for
"member_first_session_captured". These effects stay within tx.

Every successful callback returns shareOut(sessionRow(pp.wsId,key)). After tx
resolves, inspect its actual returned out.state. If stopped, throw the same
sharing_stopped conflict after commit; otherwise return out unchanged.

## Binding epochs

openBindingEpoch(pp,dev,key,b) is async, length 4. ownSession first; stopped state
throws new V2Error(409,"sharing_stopped","Sharing was stopped for this session",
{ended_reason:s.ended_reason ?? null}).

str(b,"epoch_id",70) must match /^ep_[A-Za-z0-9_-]{22,64}$/ or badRequest with
"epoch_id must be ep_ followed by 22+ url-safe characters". Read b.goal_id for
null, then undefined using the original OR short circuit. Otherwise obtain it
with str(b,"goal_id",64). Next iso(b,"starts_at"), optStr(b,"root_turn",200),
str(b,"cause",80). Cause must be manual or /^directive:dir_[a-z2-7]{24}$/;
otherwise badRequest('cause must be "manual" or "directive:<dir_id>"'). Nonmanual
cause must pass Q09 using cause.slice(10); absence is badRequest("cause names a
directive that was not sent to this session").

A startsAt more than five minutes ahead gets the clock-skew refusal for starts_at.
Then futureStart is live parse(s.started_at) > live now(). A startsAt earlier than
s.started_at is badRequest("starts_at is before the session started") only if
!futureStart. This permits a corrected clock to move a future session start back.
Evaluate live parse(startsAt) < live parse(s.started_at) first, then only on a
true comparison evaluate !futureStart. Keep that exact left-to-right conjunction.
Moving !futureStart first incorrectly skips observable Date and row reads for a
future-start session. Preserve repeated Date and row reads. Q10 checks idempotency
before goal policy.
An existing id with same.goal_id === goalId AND same.starts_at === startsAt returns
its epoch output immediately; any difference is conflict("epoch_conflict",
"This epoch id was already used with different values").

Start authority none, alignmentId null, version null. For truthy goalId, goalRow
must exist and canReadGoal(pp,goalObj(g)) must pass, otherwise notFound. Next
transferFor(pp.wsId,key,goalId), then authorize(pp,"goal.bind",
{kind:"bind",goal:goalObj(g),hasTransfer:!!transfer}). If !d.ok throw new
V2Error(d.status,d.code,d.message). Only then require g.status active, or
conflict("goal_not_active","That goal is no longer active"). Authority is own
when g.owner_id === pp.userId, else pod when g.pod_id is truthy and
pp.pods.has(g.pod_id), else alignment. Keep that receiver and repeat pod_id read.
alignmentId is the transfer result itself only for alignment, otherwise null.
No extra resource-result validation or normalization is added. version is g.version.

Obtain nowIso and await tx with a synchronous callback. Read openEpoch first,
then Q11's optional m with nullish fallback. If open and startsAt < open.starts_at,
conflict("epoch_overlap","starts_at is before the current epoch started"). If
lastEnd and startsAt < lastEnd, conflict("epoch_overlap","starts_at is before
the last epoch ended"). Equality is allowed. Q12 closes an open epoch. Q13 moves
the stored session start back only when startsAt < s.started_at. Q14 inserts the
new epoch and exact authority/transfer/version/root-turn/cause fields.

Read the current session again. keepGoverning is cur.governing_goal_id !== null
AND cur.governing_goal_id === goalId. Q15 always restores shared state and keeps
both governing fields only when that predicate passes, otherwise clears both.
For truthy goalId call holdNewlyBound(pp.wsId,goalId,key). For truthy goalId and
authority !== none, event("first_session_bound",{ws:pp.wsId,user:pp.userId,
props:{harness:cur.harness,authority},at}). Return epoch output from Q16 as the
callback result, then return the awaited tx result unchanged.

## Usage ingestion and accounting

USAGE_FIELDS is exactly the array in the metadata section. QUERY_SOURCES is
main/subagent/auxiliary/unknown; BASES is api_usd/subscription_included/
workspace_credits/estimated_list_usd/unknown; SOURCES is otel/transcript/rollout.
Create one array for each enum at factory initialization. Every usage row passes
the same QUERY_SOURCES, BASES and SOURCES objects to the corresponding oneOf
port. These supplied argument identities are observable across rows. Never inline
a fresh array literal in the row converter or clone an enum for each call.

Each usage row must be a truthy non-array object, otherwise badRequest with
`rows[${i}] must be an object`. In a try block build fields in order:
b64url(request_key,16,128), str(epoch_id,70), iso(ts), str(model,100),
oneOf(query_source,QUERY_SOURCES), nonNegInt input/output/cache_read/
cache_write_5m/cache_write_1h/cache_write_unsplit, oneOf(basis,BASES),
optInt(est_list_usd_micros), optStr(price_table_version,64), oneOf(source,SOURCES).
Every call uses the same row object. Catch only this conversion: an instanceof
supplied V2Error becomes badRequest(`rows[${i}]: ${e.message}`); any other thrown
value is rethrown unchanged, including null and undefined.

ingestUsage(pp,dev,key,b) is async, length 4. ownSession and stopped-sharing refusal
precede body validation. b.rows must be an Array or badRequest("rows must be a
list"). More than 500 rows throws V2Error(413,"too_many_rows","At most 500 rows
per batch"); exactly 500 is allowed. Convert with native b.rows.map(usageRowIn)
before nowIso and tx. A later malformed row prevents every write in this batch.

Return tx with a synchronous callback. Q17 lists all epochs of this session and
constructs a Map by epoch_id. For each converted row in order, an unknown epoch
increments conflicts, appends its request_key to refused and continues. Parse ts
using live Date. A time before its own epoch starts has the same refusal. If its
own epoch has ended, time >= that end is refused only when no epoch for this
session covers time with starts_at <= time AND (ends_at null OR time < ends_at).
Thus an old turn's usage tail may count under its original epoch when another
epoch is currently open; a gap is never stored. Preserve the list.some iteration,
repeated Date lookups and endpoint inequalities.

Q18 uses the live exported USAGE_FIELDS.join(", ") and map-to-placeholder list,
then spreads field values in that exact order. Its truthy run result increments
accepted and continues. Otherwise Q19 reads the same field list and exact key.
Only prev truthy AND USAGE_FIELDS.every(f => prev[f] === r[f]) is a duplicate.
Any other stored-key mismatch increments conflicts, without appending that key to
refused. Conflicts are distinct from refused never-stored records. When conflicts
is truthy, Q20 adds them to the session's existing conflict total. Callback returns
{accepted,duplicates,conflicts,refused} in order. Preserve original arrays and
native strict comparisons; no upsert overwrites existing usage.

## Stop sharing and history deletion

stopSharing(pp,p,key) is async, length 3. ownSession, then nowIso. Await tx with a
synchronous callback: Q21 closes open epochs, Q22 stops sharing with the original
COALESCE timestamp, clears ended_reason even after an involuntary ending and
clears governing ids. expireStoppedSessionTargets(pp.wsId,key,at) follows, then
audit(pp.wsId,pp.userId,"session.sharing_stopped",null,at). Callback result is
undefined. After tx return {session_key:key,state:"stopped"}. The agent latch is
not lifted by stopping sharing or deleting history.

A deleted key is sha256hex(`deleted-session\0${userId}\0${key}`) with actual NUL
separators, never the two printed characters backslash and zero.

deleteSession(pp,p,key) is async, length 3. Read sessionRow directly, without
ownSession's device restriction. When absent, Q23 with pp.userId's deleted hash
returns V2Error(410,"history_deleted","This session's shared history was already
deleted; nothing is left to delete") only for this account's marker. Otherwise
notFound. When present, need(pp,"session.manage",{kind:"session",ownerId:s.user_id}).
Any currently paired device of that person may delete the history.

Await tx with a synchronous callback: Q24 deletes the session, letting existing
cascade behavior remove its retained dependent rows. Q25 stores the tombstone
for the actual s.user_id and key with a fresh nowIso; Q26 removes only this
workspace's directives with no remaining target. Audit(pp.wsId,pp.userId,
"session.history_deleted",p.kind === "device" ? p.deviceId : null,nowIso()) uses
another fresh nowIso. Callback and public result are undefined. Preserve exact
workspace scope, hash inputs and actor audit privacy.

## Agent stop/resume and recovery text

setAgentStop(pp,key,stop) is async, length 3. Read sessionRow, notFound if missing,
then need(pp,"session.stop",{kind:"session",ownerId:s.user_id}). Refuse these
states in order, before time or write: device_signed_out, then member_removed,
then stopped sharing. The first is conflict("device_signed_out", the exact
message in the message section). Member removal uses the recovery text below
with conflict("member_removed",text). Stopped state uses
conflict("sharing_stopped",sharingStoppedRefusal(pp,s)).

On a live reachable session obtain nowIso and await tx: Q27 writes stop ?1:0;
audit uses stop ?"session.agent_stopped":"session.agent_resumed", null and at;
return writeDirective(pp.wsId,stop ?"stop":"resume",[key],null,null) from the
synchronous callback. After tx return {directive_id:id,agent_stopped:stop} using
the actual supplied transaction result, without boolean-coercing the public stop.

For memberRemovedRefusal, compute you as s.user_id === pp.userId; Q28 reads the
user, then personName(s.user_id,user?.name). Lead text is
`This session's sharing ended when ${you ? "you" : name} left this workspace, so a stop or resume can't reach it.`
If no user, append ` Their account was deleted, so nothing can share it again.`
Otherwise Q29 determines current membership. If absent append
` Once ${you ? "you are" : `${name} is`} back in the workspace and the machine that shared it has the workspace again, ::align share in that session shares it again, and then Stop and Resume here reach it.`
If present, append a space, then shareAgainText(shareAgainWords(sharedFrom(pp.wsId,
s.device_id),you ? null : name)), then
` Then Stop and Resume here reach it.` Preserve all service/field read order.

For sharingStoppedRefusal, the caller's own row returns sharingStoppedText(null)
without a user lookup. Otherwise Q30, then sharingStoppedText(personName(s.user_id,
user?.name),{deleted:!user}).

sharedFrom(wsId,deviceId) calls Q31 only for truthy deviceId. Missing device is
null. Otherwise has_workspace is !d.revoked_at AND !!Q32(d.id,wsId), preserving
the revoked-device short circuit. Return id,name,signed_out:!!d.revoked_at,
has_workspace, with original repeated row reads.

## Listing and privacy

listSessions(pp) is synchronous, length 1. goalLabel returns null immediately for
a falsy id. Otherwise goalRow(pp.wsId,id), then canReadGoal(pp,goalObj(g)) when g
exists. A readable goal maps id,title,version; any absent/unreadable goal maps
{id:null,title:null,private:true}. Do not expose private titles or versions.

Q33 lists the caller's own sessions by descending start. For each row, first
openEpoch(pp.wsId,s.session_key), then Q34 for usage counts/totals, then construct
in order: session_key,harness,repo_alias,title,started_at,state,stopped_at,
ended_reason,device via sharedFrom,current_epoch (epoch fields plus goalLabel)
or null,governing_goal via goalLabel,agent_stopped boolean,stop_status via
stopStatus(pp.wsId,s.session_key),conflicts,usage as the exact Q34 row. Preserve
stopped own rows and all original row-read/call ordering.

Only when pp.wsRole === owner, Q35 lists every nonstopped workspace session in
descending start order. Map only session_key,owner:{id:s.user_id,
name:personName(s.user_id,s.owner_name)},repo_alias,harness,started_at,state,
agent_stopped boolean,stop_status from its exact service call. Never include
title or usage in that list. For other roles everyone is null, not an empty
array or the caller's private list. Return {mine,all:everyone}.

## Exact messages

Device signed out:
`The machine that shared this session signed out of Align, so its sharing ended and a stop or resume can't reach it. Once that machine is signed in again (align login), ::align share in the session shares it again, and then Stop and Resume here reach it; until then, a stopped session stays stopped.`

Preserve all exact error strings, codes, statuses and details specified above.
Do not replace recovery wording, contraction, punctuation or null details.

## Public runtime metadata

```json
{
  "endSessions": {
    "kind": "Function",
    "length": 3,
    "name": "endSessions"
  },
  "sessionRow": {
    "kind": "Function",
    "length": 2,
    "name": "sessionRow"
  },
  "openEpoch": {
    "kind": "Function",
    "length": 2,
    "name": "openEpoch"
  },
  "ownSession": {
    "kind": "Function",
    "length": 3,
    "name": "ownSession"
  },
  "putSession": {
    "kind": "AsyncFunction",
    "length": 4,
    "name": "putSession"
  },
  "openBindingEpoch": {
    "kind": "AsyncFunction",
    "length": 4,
    "name": "openBindingEpoch"
  },
  "USAGE_FIELDS": {
    "kind": "value",
    "value": [
      "epoch_id",
      "ts",
      "model",
      "query_source",
      "input",
      "output",
      "cache_read",
      "cache_write_5m",
      "cache_write_1h",
      "cache_write_unsplit",
      "basis",
      "est_list_usd_micros",
      "price_table_version",
      "source"
    ]
  },
  "ingestUsage": {
    "kind": "AsyncFunction",
    "length": 4,
    "name": "ingestUsage"
  },
  "stopSharing": {
    "kind": "AsyncFunction",
    "length": 3,
    "name": "stopSharing"
  },
  "deleteSession": {
    "kind": "AsyncFunction",
    "length": 3,
    "name": "deleteSession"
  },
  "setAgentStop": {
    "kind": "AsyncFunction",
    "length": 3,
    "name": "setAgentStop"
  },
  "listSessions": {
    "kind": "Function",
    "length": 1,
    "name": "listSessions"
  }
}
```

USAGE_FIELDS value:
`epoch_id, ts, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, basis, est_list_usd_micros, price_table_version, source`.

## Exact SQL programs and ordered binds

Use the exact SQL bytes below, including multiline whitespace. These programs
are supplied-service observations. Do not substitute equivalent SQL, reorder
binds or widen workspace/device/person scope. Q18/Q19 derive field names and
placeholders from the same live exported USAGE_FIELDS array at each original
lookup, rather than a separately held copy.

### Q01: run

```sql
UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL
```

Binds in order: `at`, `s.ws_id`, `s.session_key`.

### Q02: run

```sql
UPDATE v2_sessions SET state = 'stopped', stopped_at = COALESCE(stopped_at, ?), ended_reason = ?, governing_goal_id = NULL,
         governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `at`, `reason`, `at`, `s.ws_id`, `s.session_key`.

### Q03: run

```sql
UPDATE v2_request_targets SET state = 'expired', ended_reason = ?, updated_at = ? WHERE ws_id = ? AND session_key = ? AND state IN ('sent','received')
```

Binds in order: `reason`, `at`, `s.ws_id`, `s.session_key`.

### Q04: get

```sql
SELECT * FROM v2_sessions WHERE ws_id = ? AND session_key = ?
```

Binds in order: `ws`, `key`.

### Q05: get

```sql
SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL
```

Binds in order: `ws`, `key`.

### Q06: run

```sql
UPDATE v2_sessions SET device_id = ?, state = 'shared', stopped_at = NULL, ended_reason = NULL, repo_alias = ?, title = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `dev.deviceId`, `alias`, `title`, `at`, `pp.wsId`, `key`.

### Q07: run

```sql
UPDATE v2_sessions SET repo_alias = ?, title = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `alias`, `title`, `at`, `pp.wsId`, `key`.

### Q08: run

```sql
INSERT INTO v2_sessions (ws_id, session_key, user_id, device_id, harness, repo_key, repo_alias, title, started_at, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'shared', ?, ?)
```

Binds in order: `pp.wsId`, `key`, `dev.user.id`, `dev.deviceId`, `harness`, `repoKey`, `alias`, `title`, `startedAt`, `at`, `at`.

### Q09: get

```sql
SELECT 1 AS x FROM v2_directive_targets WHERE ws_id = ? AND directive_id = ? AND session_key = ?
```

Binds in order: `pp.wsId`, `cause.slice(10)`, `key`.

### Q10: get

```sql
SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?
```

Binds in order: `pp.wsId`, `key`, `epochId`.

### Q11: get

```sql
SELECT MAX(ends_at) AS m FROM v2_epochs WHERE ws_id = ? AND session_key = ?
```

Binds in order: `pp.wsId`, `key`.

### Q12: run

```sql
UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND epoch_id = ?
```

Binds in order: `startsAt`, `pp.wsId`, `key`, `open.epoch_id`.

### Q13: run

```sql
UPDATE v2_sessions SET started_at = ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `startsAt`, `pp.wsId`, `key`.

### Q14: run

```sql
INSERT INTO v2_epochs (ws_id, session_key, epoch_id, goal_id, goal_version_at_start, starts_at, root_turn, cause, authority, alignment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Binds in order: `pp.wsId`, `key`, `epochId`, `goalId`, `version`, `startsAt`, `rootTurn`, `cause`, `authority`, `alignmentId`, `at`.

### Q15: run

```sql
UPDATE v2_sessions SET state = 'shared', governing_goal_id = ?, governing_alignment_id = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `keepGoverning ? cur.governing_goal_id : null`, `keepGoverning ? cur.governing_alignment_id : null`, `at`, `pp.wsId`, `key`.

### Q16: get

```sql
SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?
```

Binds in order: `pp.wsId`, `key`, `epochId`.

### Q17: all

```sql
SELECT epoch_id, starts_at, ends_at FROM v2_epochs WHERE ws_id = ? AND session_key = ?
```

Binds in order: `pp.wsId`, `key`.

### Q18: run

```sql
INSERT OR IGNORE INTO v2_usage (ws_id, session_key, request_key, epoch_id, ts, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, basis, est_list_usd_micros, price_table_version, source, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Binds in order: `pp.wsId`, `key`, `r.request_key`, `...USAGE_FIELDS.map((f) => r[f])`, `at`.

### Q19: get

```sql
SELECT epoch_id, ts, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, basis, est_list_usd_micros, price_table_version, source FROM v2_usage WHERE ws_id = ? AND session_key = ? AND request_key = ?
```

Binds in order: `pp.wsId`, `key`, `r.request_key`.

### Q20: run

```sql
UPDATE v2_sessions SET conflicts = conflicts + ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `conflicts`, `pp.wsId`, `key`.

### Q21: run

```sql
UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL
```

Binds in order: `at`, `pp.wsId`, `key`.

### Q22: run

```sql
UPDATE v2_sessions SET state = 'stopped', stopped_at = COALESCE(stopped_at, ?), ended_reason = NULL, governing_goal_id = NULL, governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `at`, `at`, `pp.wsId`, `key`.

### Q23: get

```sql
SELECT 1 AS x FROM v2_deleted_sessions WHERE ws_id = ? AND key_hash = ?
```

Binds in order: `pp.wsId`, `deletedKeyHash(pp.userId, key)`.

### Q24: run

```sql
DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?
```

Binds in order: `pp.wsId`, `key`.

### Q25: run

```sql
INSERT OR REPLACE INTO v2_deleted_sessions (ws_id, key_hash, deleted_at) VALUES (?, ?, ?)
```

Binds in order: `pp.wsId`, `deletedKeyHash(s.user_id, key)`, `nowIso()`.

### Q26: run

```sql
DELETE FROM v2_directives WHERE ws_id = ? AND NOT EXISTS (SELECT 1 FROM v2_directive_targets t WHERE t.directive_id = v2_directives.id)
```

Binds in order: `pp.wsId`.

### Q27: run

```sql
UPDATE v2_sessions SET agent_stopped = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?
```

Binds in order: `stop ? 1 : 0`, `at`, `pp.wsId`, `key`.

### Q28: get

```sql
SELECT name FROM ba_user WHERE id = ?
```

Binds in order: `s.user_id`.

### Q29: get

```sql
SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?
```

Binds in order: `pp.wsId`, `s.user_id`.

### Q30: get

```sql
SELECT name FROM ba_user WHERE id = ?
```

Binds in order: `s.user_id`.

### Q31: get

```sql
SELECT id, name, revoked_at FROM v2_devices WHERE id = ?
```

Binds in order: `deviceId`.

### Q32: get

```sql
SELECT 1 AS x FROM v2_device_grants WHERE device_id = ? AND ws_id = ?
```

Binds in order: `d.id`, `wsId`.

### Q33: all

```sql
SELECT * FROM v2_sessions WHERE ws_id = ? AND user_id = ? ORDER BY started_at DESC
```

Binds in order: `pp.wsId`, `pp.userId`.

### Q34: get

```sql
SELECT COUNT(*) AS requests, COALESCE(SUM(input), 0) AS input, COALESCE(SUM(output), 0) AS output FROM v2_usage WHERE ws_id = ? AND session_key = ?
```

Binds in order: `pp.wsId`, `s.session_key`.

### Q35: all

```sql
SELECT s.*, u.name AS owner_name FROM v2_sessions s LEFT JOIN ba_user u ON u.id = s.user_id WHERE s.ws_id = ? AND s.state <> 'stopped' ORDER BY s.started_at DESC
```

Binds in order: `pp.wsId`.



#### Scenario: Preserve shared-session lifecycle, epochs, usage and privacy

- **WHEN** the Node shared-session target is selected
- **THEN** Capture37 explicit resources once in order. Pass takeDurable a one-element descriptor array. Evaluate the original binding parse comparison before !futureStart. Reuse one per-factory array for each usage validation enum and preserve its identity across rows. Preserve12 public runtime values and2 caller types,35 SQL programs and ordered binds,15 live Date sites,ownership and device privacy,voluntary/involuntary endings and re-sharing,creation caps inside transaction,epoch idempotency and directive cause scope,clock boundaries and correction,goal visibility/policy/authority,governing-goal clearing,holds/events,all14 usage fields and native row conversion,500-row bound,epoch gaps/tails,duplicate/conflict/refused distinctions,stop and deletion cascade/tombstone/audit privacy,agent delivery refusals/recovery text,exact directive callback results,private versus owner session lists,all property/effect/error and transaction observations. Add no ambient IO,validation,policy or completion claim.
