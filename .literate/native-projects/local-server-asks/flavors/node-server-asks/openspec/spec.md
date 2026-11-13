# Node-Server-Asks implementation Flavor

## ADDED Requirements

### Requirement: Node team ask binding [authored:node-server-asks-v1]

# Team asks Node binding

Use Node24 or later on macOS and Linux. Export synchronous arity-one
create_asks(resources) at server_asks/create_asks in a dependency-free CommonJS
package server_asks. Its regular, non-symlink directory contains exactly two
regular, non-symlink files, create_asks.js and package.json. The manifest has name
server_asks, type commonjs and exactly {"./create_asks":"./create_asks.js"} as its
export map. No declarations, maps, tests or other files belong inside it. Root
build/test adapters may be outside. The caller retains AskState,AskAction,
AskPerson,AskView with their original structural public types.

Capture these23 resources once in order, without enumeration or service calls:
all,audit,get,run,tx,V2Error,badRequest,conflict,forbidden,notFound,event,newId,
nowIso,sha256hex,take,cleanProse,isBlankText,goalObj,goalRow,canReadGoal,memberName,
need,readDate. Supplied services use undefined receivers. V2Error is the exact
captured class, invoked with new. Preserve supplied thrown/rejected values.
Transactions belong to tx; supply synchronous callbacks. Only createAsk,
importAsks and actOnAsk are async functions. Construction calls no services.

The principal is the original flat PolicyPrincipal: pp.wsId is the workspace,
pp.userId is the person, pp.wsRole is the role and pp.pods is the original Map
from team ID to member/lead. Every role, owner, member or viewer test reads
pp.wsRole, never pp.role. Preserve repeated reads and left-to-right short circuits.
Stored fields use their original snake_case names. Do not replace the principal,
rows, resource objects or returned references with an alternate schema.

Return exactly these22 values in order: ASK_STATES,ASK_ACTIONS,ASK_TEXT_MAX,
ASK_FROM_MAX,ASK_TITLE_MAX,MENTION_TEXT_MAX,MENTIONS_MAX,IMPORT_MAX,OPEN_ASKS_MAX,
ASKS_PER_HOUR,ASK_ACTIONS_PER_MINUTE,canReadAsk,alignedTeams,getAsk,listAsks,
readableAsks,asksFeed,asksForBrief,createAsk,importAsks,actOnAsk,assertAskAction.
ASK_STATES and ASK_ACTIONS are ordinary live per-service arrays, respectively
open,accepted,done,declined,withdrawn and accept,decline,done,reopen,withdraw,mention.
The nine numeric constants in the listed order are400,80,120,300,10,60,500,60,30.
Do not freeze or clone the live arrays for validation. Functions keep their names
and lengths: canReadAsk2,alignedTeams2,getAsk2,listAsks1,readableAsks1,asksFeed2,
asksForBrief1,createAsk2,importAsks2,actOnAsk4,assertAskAction1. listAsks and
readableAsks have a fresh default options object. asksFeed's third argument defaults
to null. Preserve native JSON, Map, Set, regex, optional access, nullish behavior,
array-method protocols, object key/read order and failure positions.

## Refusal factories and native sorting

badRequest, conflict, forbidden and notFound return the error value. Every
refusal described here calls the named factory and throws its exact result.
Preserve a factory's own thrown value if it throws. V2Error is constructed with
throw new V2Error for the stated rate limits. Ignoring a factory result does not
refuse the operation.

Use the selected host runtime's ordinary native array sort with the exact
comparator and read expressions described below. Different V8 versions can invoke
the comparator in different orders while producing identical records. Preserve
the original source's getter and service trace on the same runtime. Do not add
a custom sorting algorithm, cache comparator decisions or precompute permission
results to force a cross-runtime callback sequence.

## Input and dates

Text validation receives value,field,max and optional=false. For undefined, null,
or optional and exact empty string, return null when optional, else
badRequest(`${field} is required`). A non-string throws
badRequest(`${field} must be a string`). Replace every control U+0000 through
U+001F and U+007F through U+009F with a space, then call cleanProse with that
string. Call isBlankText on its exact result. Blank text returns null only when
optional, otherwise the same required refusal. Next compare result.length>max,
refusing badRequest(`${field} is too long (max ${max} characters)`). Return the
exact cleaned value. Do not trim, clean, coerce or revalidate in a different order.

Day validation requires a string matching exactly /^\d{4}-\d{2}-\d{2}$/.
Next obtain readDate(), call its parse with that constructor as receiver and
`${value}T00:00:00Z`, and require a result that is not Number.isNaN. Only then
obtain a second constructor via readDate(), construct it with new and that same
date-time string, call its toISOString with the created object as receiver,
slice(0,10), and require strict equality with the original value. Refuse any
validation condition through badRequest(`${field} must be a date like 2026-10-26`).
Do not catch supplied/native failures or accept a normalized invalid calendar
date. The two constructor lookups remain live and in this order.

An object input must be truthy, typeof object and not an array, else
badRequest(`${field} must be an object`). Preserve its exact reference.

Team selection from b,prefix: when b.team_id is undefined or a fresh b.team_id
read is null, and typeof b.team is string, validate a fresh b.team read as
`${prefix}team` with maximum200, then Q01(pp.wsId,name). Exactly one returned ID
is required, otherwise badRequest(`${prefix}team: ${ids.length ? 'more than one
team' : 'no team'} here is called "${name}"`). Return ids[0].id. Otherwise test
b.team_id independently for undefined, null or empty string, refusing
badRequest(`${prefix}team_id (or ${prefix}team, a team's name) is required`).
Validate a fresh b.team_id as `${prefix}team_id`, maximum64. Require truthy
Q02(pp.wsId,teamId), else notFound(). Return teamId. Do not case-normalize an ID.

An ask input validates team first, then b.goal_id as optional `${prefix}goal_id`,
maximum64. For a truthy goal ID obtain goalRow(pp.wsId,id), require existence and
canReadGoal(pp,goalObj(g)), else notFound(). Require g.pod_id===teamId, else
badRequest(`${prefix}goal_id must be a goal of the team asked`). Next object-check
b.source as `${prefix}source`. Determine kind by s.kind strictly meeting OR a
fresh s.kind read strictly manual, then read s.kind again when accepted; otherwise
null and badRequest(`${prefix}source.kind must be meeting or manual`). Validate
s.title as `${prefix}source.title`, maximum120, optional only for manual.
Return fresh fields in order teamId,goalId,text from b.text with maximum400,
fromLabel from b.from_label optional maximum80,source:{kind,title,
date:day(s.date,`${prefix}source.date`)}. Preserve this validation and field order.

Mention input from b,prefix returns fresh fields in order date from day(b.date,
`${prefix}date`), text from text(b.text,`${prefix}text`,300), source_title from
text(b.source_title,`${prefix}source_title`,120). Preserve required-field behavior.

## Policy and waiting

is-owner means pp.wsRole strictly owner. in-team means pp.pods.has(a.team_id).
leads means pp.pods.get(a.team_id) strictly lead. writer means role strictly owner
OR a fresh role read strictly member. canReadAsk(pp,a) returns !!pp.wsRole AND
(a.created_by===pp.userId OR pp.pods.has(a.team_id) OR a fresh pp.wsRole==='owner').
Keep that order; it performs no workspace need check of its own.

Action flags for a non-writer are a fresh object of six false values in action
order accept,decline,done,reopen,withdraw,mention. Otherwise first compute decide
as leads(pp,a) OR is-owner(pp). Return a fresh record in that order:
accept and decline each read state open AND decide; done reads state accepted AND
(in-team OR is-owner); reopen reads state done OR a fresh state declined, then
AND decide; withdraw reads state open OR a fresh state accepted, then AND
a.created_by===pp.userId; mention reads state open OR a fresh state accepted.
Do not reuse a state read across fields or call permission resources eagerly.

Waiting takes the already computed flags. If can.accept, return leads(pp,a) OR
falsy Q03(a.ws_id,a.team_id), stopping before Q03 for an actual lead. Otherwise
if can.done, return in-team(pp,a) OR falsy Q04(a.ws_id,a.team_id). Otherwise false.
Thus an owner outside the team waits only when the team has no relevant person.

Visible ask: need(pp,'workspace.read'), then Q05(pp.wsId,id). Missing row or
canReadAsk false throws notFound(). Return the exact row.

## Projection and listing cache

Create a new viewer function for each getAsk or listing. It owns three fresh
Maps, people,teams,goals, reused only across projections made by that viewer.
person(id): when not cached, store fresh {id,name:memberName(id)}; return the
exact cached object. team(id): when not cached, store fresh {id,
name:Q06(pp.wsId,id)?.name ?? ''}; return the exact cached object. goal(id): falsy
ID returns null immediately. Otherwise, when not cached, obtain
goalRow(pp.wsId,id), and cache a fresh {id:g.id,title:g.title} only when existing
and canReadGoal(pp,goalObj(g)), otherwise cache null. Return that cached value.
Preserve Map.has before creation and Map.get after it. Do not intern across
viewer instances, copy cached records or repeat person/team/goal services.

The viewer takes a,mentions,optional via. First compute can as via truthy ? the
single service-local NO_ACTIONS object : flags(pp,a). NO_ACTIONS has the same
six false keys in action order and is shared by every via projection from this
service, including separate listings. It is not copied, frozen or globally shared
between separately constructed services. Return a fresh view in key/read order:
id:a.id,state:a.state,team:team(a.team_id),goal:goal(a.goal_id),text:a.text,
from_label:a.from_label,requester:person(a.created_by),
source:{kind:a.source_kind,title:a.source_title,date:a.source_date},
mentions:mentions.map(m=>({n:m.n,date:m.date,text:m.text,source_title:m.source_title,
added_by:person(m.added_by)})),
decided_by:a.decided_by ? person(a fresh a.decided_by read) : null,
decided_at:a.decided_at,created_at:a.created_at,updated_at:a.updated_at,
waiting_on_me:via ? false : waiting(pp,a,can),can,
and only for truthy via a final via_alignment:{goal_id:via}. Keep the optional
field absent otherwise. Do not add an untrusted-text transformation to reading.

alignedTeams(pp,deviceId) calls Q07(pp.wsId,pp.userId,deviceId). It returns a new
Map from team ID to the first goal ID per team in the returned order. For each row
test out.has(r.team_id), and only when absent out.set(a fresh r.team_id read,
r.goal_id). Keep the SQL's DISTINCT, exact joins, live shared session state,
approved alignment, matching governing goal, non-null goal team and ORDER BY
goal ID. Do not choose the last goal for a team or widen browser reads here.

getAsk(pp,id) first obtains visible ask a, then creates viewer(pp), then
Q08(a.id), and invokes that viewer with a and the exact mentions array. Keep
viewer creation before the mention query. It uses no followed-team permission.

listAsks(pp,o={}) first need(pp,'workspace.read'). Start where with 'ws_id = ?'
and params with pp.wsId. If o.states?.length is truthy, append
`state IN (${o.states.map(()=>'?').join(', ')})`, then push ...a fresh o.states
read into params. If o.teamId truthy, append 'team_id = ?', then push a fresh
o.teamId read. Join where with exact ' AND ', prefix 'SELECT * FROM v2_asks WHERE ',
and call Q09's dynamic all with spread params. Do not add state validation here.

For each returned a, mine(a) reads pp.pods.has(a.team_id) OR
a.created_by===pp.userId, yielding0 when true and1 otherwise. via(a) is
(!canReadAsk(pp,a) AND a.state==='accepted') ? o.followed?.get(a.team_id) : undefined.
Filter by canReadAsk(pp,a) OR !!via(a), retaining the second canReadAsk inside via
on the denied path. Sort by mine(a)-mine(b), then state rank open0,accepted1,
done/declined/withdrawn2, then descending source_date.localeCompare, descending
created_at.localeCompare, ascending id.localeCompare. Keep comparator invocation
and getter order. Slice(0,o.limit ?? Infinity) with native slice semantics.

Create fresh byAsk Map. Only if selected rows.length truthy, Q10(pp.wsId), then
for every mention row create an empty array for its ask_id if absent, get that
array again using a fresh ask_id read, and push the exact mention row. Query all
workspace mentions, including those outside selected asks. Create viewer(pp)
once, then return rows.map(a=>view(a,byAsk.get(a.id) ?? fresh [],via(a))). Evaluate
via again here, without caching a prior permission result. Cached projection
objects remain shared within this listing. Followed-team entries grant only
accepted asks and always use NO_ACTIONS and waiting false.

readableAsks(pp,o={}) delegates to listAsks(pp,{states:o.state ? [a fresh o.state
read] : undefined,teamId:o.teamId,limit:o.limit}), preserving key/read order.

asksFeed(pp,q,deviceId=null): states is q.state truthy ? a fresh q.state read
split(',').map(trim) : fresh []. A state not included in the exact live ASK_STATES
throws badRequest(`state must be one or more of ${ASK_STATES.join(', ')}`). Next
truthy q.teamId must match /^pod_[A-Za-z0-9_-]{8,64}$/ on a fresh q.teamId read,
else badRequest('team_id must be a team id'). Limit is q.limit truthy ?
Number(a fresh q.limit read) :500. It must be safe integer1 through500 inclusive,
else badRequest('limit must be 1 to 500'). Only truthy deviceId invokes
alignedTeams(pp,deviceId). Then listAsks(pp,{states,teamId:q.teamId ?? undefined,
limit,followed}). Return fresh {version:sha256hex(JSON.stringify(asks)).slice(0,16),
asks} in that order. No digest or result cache. Native stringify failures stay.

asksForBrief(pp): listAsks(pp,{states:['open','accepted']}), filter by
pp.pods.has(a.team.id), sort by state rank, descending mentions.length, descending
source.date.localeCompare, then descending created_at.localeCompare. Return fresh
{asks:list.slice(0,5),more:Math.max(0,list.length-5)}. Keep projected object references.

## Capacity, insertion and mention writes

require-writer(pp) calls need(pp,'workspace.read'), then, if not writer(pp),
forbidden('read_only','Viewers can look but not change anything.'). Do not dedupe
this need call with a preceding visible-ask need or a later getAsk need.

Open count is Q11(ws)?.n ??0, counting only open and accepted asks. Created in the
last hour is Q12(ws,cutoff)?.n ??0, counting every state. For cutoff evaluate one
readDate() constructor first, obtain a second through readDate(), call its now
with that second constructor as receiver, subtract3600000, construct the first
with new, then call toISOString on that date object. Keep both live reads and
native failures. The exact SQL comparison is strictly greater than cutoff.

check-caps(ws,adding), inside the caller's tx: if open-count+adding>500,
conflict('too_many_asks','A workspace can have at most 500 open or accepted asks;
close some first.'). Only after it passes, if fresh created-last-hour+adding>60,
new V2Error(429,'rate_limited','Too many asks were recorded in the last hour; try
again later.'). The exact bounds500 and60 are allowed. No cached count or clock.

Insert ask(pp,f,state,at): newId('ask') as id, decided is state==='open' ? null :
pp.userId. Q13(id,pp.wsId,f.teamId,f.goalId,f.text,f.fromLabel,pp.userId,
f.source.kind,a fresh f.source read then title,a fresh f.source read then date,
state,decided,decided?at:null,at,at). Return id. Preserve fresh source reads and
record author; do not derive state from a requester policy here.

Add mention(pp,a,m,at): n is (Q14(a.id)?.n ??0)+1, based on MAX(n), not count.
When n>10 conflict('too_many_mentions',"An ask keeps at most 10 mentions, so this
one isn't recorded."). Otherwise Q15(a.ws_id,a.id,n,m.date,m.text,m.source_title,
pp.userId,at), then Q16(at,a fresh a.id read), returning undefined. A failed
second write remains subject to the caller's transaction.

createAsk(pp,b): require-writer, validate the complete ask input, nowIso() as at.
Await tx of a synchronous callback: check-caps(pp.wsId,1), insert ask state open,
audit(pp.wsId,pp.userId,'ask.created',id,at),
event('first_ask',{ws:pp.wsId,user:pp.userId,at}), return id. After tx return
getAsk(pp,id), retaining its fresh permission and projection effects.

## Import append and merge

importAsks(pp,b): need(pp,'workspace.manage'), then
take(`ask-import:${pp.wsId}`,10,60000), before validating the body. b.asks must
be an array, else badRequest('Send {asks: [...]}'). A fresh b.asks.length>60
throws badRequest('asks: at most 60 per import'). Empty imports are valid.

Validate all items in b.asks.map before obtaining the clock or opening tx. For
item i let prefix be `asks[${i}].`, object-check raw as `asks[${i}]`. State is
it.state undefined OR a fresh it.state read null ? open : a fresh it.state read.
It must be in the private fixed array open,accepted,done,declined; public
ASK_STATES mutations do not change this list. Otherwise
badRequest(`${prefix}state must be open, accepted, done or declined`).
ms is it.mentions ?? fresh []; require array, else
badRequest(`${prefix}mentions must be a list`), then length<=10, else
badRequest(`${prefix}mentions: at most 10`). Return a fresh validated item in
order ask:ask-input(pp,it,prefix),state,mentions:ms.map((m,j)=>mention-input(
object-check(m,`${prefix}mentions[${j}]`),`${prefix}mentions[${j}].`)).
Do not skip validation for an item that would later match an existing ask.

After every item validates, nowIso() as at. Return tx of a synchronous callback
directly from the async function. Initialize created,merged,unchanged to0. For
each validated item in order, Q17(pp.wsId,it.ask.teamId), then filter to identical
normalized text. Normalization is toLowerCase(), replace /\s+/g with one space,
then trim, for each compared stored and imported text in that order. Do not
normalize or overwrite stored text, source, goal, recorder, from-label or state.

If any same-text row has source_date===it.ask.source.date, increment unchanged
and continue, ignoring its supplied mentions for persistence. Otherwise choose
the first same-text row whose state is open OR accepted, with fresh state reads.
For such a live row, title is it.ask.source.title ?? 'Recorded by hand'; obtain
Q08(live.id). When its length>=10 OR some mention has date strictly equal to
it.ask.source.date AND source_title strictly equal to title, increment unchanged.
Otherwise add one mention to live with fresh
{date:it.ask.source.date,text:it.ask.text,source_title:title},at and increment
merged. Continue in either case. The item's imported history is not appended
on a merge. Do not revive a closed ask or replace a matching record.

When no live match exists, insert ask with the imported state, then
Q05(pp.wsId,id). For every validated imported mention add it to that exact row
in order, then increment created. Subsequent import items see these writes and
may match/merge with them. All are in the same transaction.

After processing all items, check-caps(pp.wsId,0). Then independently call
created-last-hour(pp.wsId) again; >60 throws the same supplied V2Error429 and
words. This second query and its two fresh Date lookups are intentional. Do not
reuse the previous count or omit this call because check-caps just ran. Next
audit(pp.wsId,pp.userId,'ask.imported',String(created+merged),at). Only for truthy
created, event('first_ask',{ws:pp.wsId,user:pp.userId,at}). Return fresh
{created,merged,unchanged}. Any validation/capacity/mention/service failure in tx
leaves all its writes subject to rollback; no partial import, retry or recovery.

## Actions and state refusal words

Allowed source states by action are accept:[open],decline:[open],done:[accepted],
reopen:[done,declined],withdraw:[open,accepted],mention:[open,accepted]. Next
states are accepted,declined,done,open,withdrawn for the first five. Audit names
are ask.accepted,ask.declined,ask.done,ask.reopened,ask.withdrawn,ask.mentioned.
These private tables are independent of public array mutations.

State refusal(a,reader) first reads a.decided_by as who, compares with reader as
self, and eagerly computes by as truthy who ? ' by '+memberName(who) : ''. Keep
this person lookup even on branches that will not use by. Then switch a.state:

- open: truthy who ? `${self ? 'You' : memberName(who)} reopened this ask, so it waits for the team asked to accept it again.` : 'This ask waits for the team asked to accept it.'. A non-self person lookup here is additional to the earlier by lookup.
- accepted: self ? 'You already accepted this ask.' : `This ask was already accepted${by}.`.
- done: self ? 'You marked this ask done.' : `This ask was marked done${by}.`.
- declined: self ? 'You declined this ask, so nothing changes.' : `This ask was declined${by}, so nothing changes.`.
- withdrawn: a.created_by===reader ? 'You withdrew this ask, so nothing changes.' : `This ask was withdrawn by ${memberName(a.created_by)}, so nothing changes.`. Keep that fresh creator read.

No default state fallback is added; unknown stored states retain the native
undefined result. Exact punctuation and person naming remain as above.

actOnAsk(pp,id,action,b): first visible ask, then require-writer (including its
second workspace.read need), then take(`ask-action:${pp.userId}`,30,60000).
Validate a mention input only for action strictly mention, before state/role
checks or clock; otherwise mention is null. Then nowIso() as at. Await tx callback.
Inside it reread Q05(pp.wsId,id) as a. Apply guards in order:

1. accept/decline/reopen and not leads(pp,a) and not is-owner(pp): forbidden('not_team_lead','Only a lead of the team asked, or a workspace owner, can do this.').
2. done and not in-team(pp,a) and not is-owner(pp): forbidden('not_in_team','Only the team asked, or a workspace owner, can mark it done.').
3. withdraw and a.created_by!==pp.userId: forbidden('not_requester','Only the person who recorded this ask can withdraw it.').
4. The exact private FROM[action].includes(a.state) must hold, else conflict('wrong_state',state-refusal(a,pp.userId)). Preserve an unrecognized action's native failed includes access; its route uses assertAskAction separately.

For a truthy validated mention, add it using the current row and at. Otherwise
Q18(NEXT[action],pp.userId,at,at,a.id). Then
audit(pp.wsId,pp.userId,AUDIT[action],a fresh a.id read,at). Do not update decision
fields during a mention. After tx return getAsk(pp,id), with its own fresh need,
row, membership and viewer. No state check is moved ahead of a role guard.

assertAskAction(a) checks the exact live ASK_ACTIONS.includes(a), else throws
notFound(). Included values return the exact a, without coercion or a copied list.

All external effects pass through the declared resources. No source import,
ambient Date, configuration, environment, filesystem, network, randomness,
permission substitute, result cache or recovery is allowed. The stated local
projection caches and shared NO_ACTIONS record are part of the original service,
not a permission cache. Preserve exact SQL, bindings, resources, references,
repeated property reads, thrown/rejected identity and post-transaction failures.

## Exact SQL interfaces

### Q01 all with 2 bindings

```sql
SELECT id FROM v2_pods WHERE ws_id = ? AND lower(name) = lower(?)
```

### Q02 get with 2 bindings

```sql
SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?
```

### Q03 get with 2 bindings

```sql
SELECT 1 AS x FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND role = 'lead'
```

### Q04 get with 2 bindings

```sql
SELECT 1 AS x FROM v2_pod_members WHERE ws_id = ? AND pod_id = ?
```

### Q05 get with 2 bindings

```sql
SELECT * FROM v2_asks WHERE ws_id = ? AND id = ?
```

### Q06 get with 2 bindings

```sql
SELECT name FROM v2_pods WHERE ws_id = ? AND id = ?
```

### Q07 all with 3 bindings

```sql
SELECT DISTINCT g.pod_id AS team_id, g.id AS goal_id FROM v2_sessions s
       JOIN v2_alignments al ON al.ws_id = s.ws_id AND al.id = s.governing_alignment_id
       JOIN v2_goals g ON g.ws_id = s.ws_id AND g.id = s.governing_goal_id
     WHERE s.ws_id = ? AND s.user_id = ? AND s.device_id = ? AND s.state = 'shared'
       AND al.state = 'approved' AND al.target_goal_id = s.governing_goal_id AND g.pod_id IS NOT NULL
     ORDER BY g.id
```

### Q08 all with 1 bindings

```sql
SELECT * FROM v2_ask_mentions WHERE ask_id = ? ORDER BY n
```

### Q09 all dynamic interface

SELECT * FROM v2_asks WHERE ws_id = ? with optional AND state IN (?, ...) using comma-space separators and optional AND team_id = ?, in that order. States appear only for a truthy states.length, team only for truthy teamId. Parameters follow the same order.

Binding order: one workspace, then each selected state, then optional team.

### Q10 all with 1 bindings

```sql
SELECT * FROM v2_ask_mentions WHERE ws_id = ? ORDER BY ask_id, n
```

### Q11 get with 1 bindings

```sql
SELECT COUNT(*) AS n FROM v2_asks WHERE ws_id = ? AND state IN ('open','accepted')
```

### Q12 get with 2 bindings

```sql
SELECT COUNT(*) AS n FROM v2_asks WHERE ws_id = ? AND created_at > ?
```

### Q13 run with 15 bindings

```sql
INSERT INTO v2_asks (id, ws_id, team_id, goal_id, text, from_label, created_by, source_kind, source_title, source_date, state, decided_by, decided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

### Q14 get with 1 bindings

```sql
SELECT MAX(n) AS n FROM v2_ask_mentions WHERE ask_id = ?
```

### Q15 run with 8 bindings

```sql
INSERT INTO v2_ask_mentions (ws_id, ask_id, n, date, text, source_title, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

### Q16 run with 2 bindings

```sql
UPDATE v2_asks SET updated_at = ? WHERE id = ?
```

### Q17 all with 2 bindings

```sql
SELECT * FROM v2_asks WHERE ws_id = ? AND team_id = ?
```

### Q18 run with 5 bindings

```sql
UPDATE v2_asks SET state = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?
```



#### Scenario: Record team asks, preserve their history and expose only the original readable views

- **WHEN** the Node team ask target is selected
- **THEN** Capture twenty-three resources once and preserve twenty-two runtime values, four caller types, seventeen literal SQL interfaces and the exact dynamic listing SQL protocol. Retain text and real calendar-date validation, team and goal visibility, principal wsRole and pods Map policy, local projection reference caches and shared read-only action record, exact native sorting and same-runtime effect order, device alignment access to accepted asks only, list/brief/feed rules and hashes, workspace capacity and hourly counts, import append/merge semantics, mentions, action role-before-state refusals, direct V2Error class and exact returned-error throwing, transactions and audit/event positions. Preserve all four live Date lookup sites. Route-level request and authentication concerns remain consuming-service responsibilities.
