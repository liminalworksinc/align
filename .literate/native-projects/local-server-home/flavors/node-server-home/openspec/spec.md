# Node-Server-Home implementation Flavor

## ADDED Requirements

### Requirement: Node goal activity binding [authored:node-server-home-v3]

# Node workspace Home binding

## Package and capture

Export `create_home(resources)` from the dependency-free CommonJS package
`server_home`. The package contains exactly `create_home.js` and `package.json`,
with export map `{"./create_home":"./create_home.js"}`. Its only export is the
synchronous factory, named create_home, length 1, identical through CommonJS and
ESM import. Capture these 14 supplied resources once, in order:

`listGrants, config, listAlignments, listAsks, changeRequestGroups, all, goalRow,
visibleGoals, alignmentWaits, appEvidence, changeWaits, launchWaits, memberName,
readConsole`.

The returned object has exactly one enumerable own function `workspaceHome`,
synchronous, named workspaceHome and length 1. Retain HomeChange, HomeDeclined,
HomeAsk, HomeAlignment, HomeGoal, HomeApp and WorkspaceHome as caller-owned public
TypeScript types. Root build/test/package adapters stay outside the two-file
runtime package. No ambient application IO, Date, console, environment, fetch or
randomness is permitted. Read console only through the supplied live readConsole.

All supplied function calls are bare calls with original argument identity. The
pods.has method and supplied console.error retain their actual object receivers.
Never enumerate the resources. Preserve native JavaScript iterators, nullish and
truthy decisions, short-circuit order, repeated property observations, stable
sort order and original error identity. Do not cache fields, normalize arrays,
deduplicate whole domain groups or move an expression across a section boundary.
No permission or new read may be added to a supplied service's readership.

## Host toolchain and source dependencies

The selected JavaScript Flavor already owns the Node host toolchain, its
compatible version constraint and executable/version probe. Use that selected
toolchain for build, generated tests and runtime checks. The provided platform
requirement remains explicit; it is not a newly added source package.

This library introduces no additional third-party source dependency. Its runtime
package has only the named module and export-map manifest, and executable
adapters use the selected Node toolchain and built-in modules. Dependency
reporting must distinguish that already selected host toolchain from an added
library dependency. Do not introduce a separate unresolved Node.js source-package
range for the existing host toolchain. Report genuine additional source
dependencies if they ever exist, with the normal lock and evidence requirements.

Keep all normal source-dependency, host-toolchain and SBOM gates. Do not invent
an exact Node version or lock, alter a failed generated SBOM, discard a real
dependency, or treat passing behavioral checks as successful build acceptance.
The current build refusal must be resolved through normal authored intent,
generation and dependency/toolchain evidence.

## Sections and initial state

A section synchronously calls its callback inside try. If it throws, call config
and inspect hosted. When hosted, readConsole().error receives exactly the string
`Home section error:` and the thrown value's optional name, falling back to
`unknown` only when that name is nullish. When local, the error method receives
the original thrown value alone. Preserve receiver, arguments and lookup order.
After successful error logging, the section returns null. Config, hosted-field,
readConsole or error-method failures inside the catch are not caught again; they
propagate and prevent later work, as originally. Do not replace unknown with an
empty array, empty object, zero or a delivery claim.

workspaceHome first reads principal.userId into me. This occurs outside every
section. Read visibleGoals(principal) inside its own section. Outside that
section, build a Map from the returned goals or the nullish fallback empty array,
keyed by goal.id. Mapping or property errors in this setup propagate rather than
being converted to a failed Home section.

The local ownership helper takes a goal id, looks up a truthy id in this Map and
returns true only for an existing goal when any original short-circuit condition
holds: its owner_id is me, its truthy pod_id is in principal.pods, or principal is
a workspace owner and its level is company. Preserve repeated pod_id reads and
the pods.has receiver. Do not query another goal to decide ownership.

The team-name helper returns an empty string for a falsy pod id. Otherwise run
`SELECT name FROM v2_pods WHERE ws_id = ? AND id = ?` through all with
principal.wsId then the supplied pod id. Read the first row's optional name and
fall back to empty string only when nullish. Do not cache team-name reads across
goals or change workspace binding.

The person helper used for launchers makes a Map keyed by person.id, retaining
the final person for each repeated id, then sorts its values by native name
localeCompare and, on a name tie, id localeCompare. Keep the resulting stable
order. A later helper removes only people whose id is me when requested below.

## Changes

Read changeRequestGroups(principal) within one section. Iterate its
waiting_on_me, mine and others in that order using their sequential iterable
spreads. Preserve repeated or overlapping entries. Prepare arrays for onMe and
onOthers. For each view, the item constructor produces own fields in this order:
id, goal, state, requester, reason, next, waiting_on, updated_at. It reads view
fields only when constructing a selected item. Preserve argument evaluation
before those field reads.

First call launchWaits(view). If its result is truthy and the view's
dependency_loop is truthy, skip the view entirely. If launch is truthy otherwise:

- When launch.can_launch is truthy, append an item to onMe with next launch and
  one waiting person `{id: me, name: memberName(me)}`.
- Otherwise, append to onOthers only if the requester.id is me or the ownership
  helper accepts the view.goal.id. Use next launch and the deduplicated, sorted
  launcher list with me removed. Do not add approver-set involvement here.
- Continue after either launch branch; do not call changeWaits for this view.

For a non-launch view, call changeWaits. Skip a falsy result. Determine whether
it is mine to act on by reading view.waiting_on_me, then only if false comparing
waiting.next to rebase and only for that next value reading view.can.rebase.
A true result appends item(waiting.next, waiting.waiting_on) to onMe.

Otherwise, eligibility for onOthers short-circuits in this order: requester.id
is me, ownership helper accepts view.goal.id, or view.approvers.some finds my id.
For an eligible view, pass waiting.next as the item's first argument. For its
second argument, look up waiting.next again to compare decide, and if needed
look it up again to compare resolve_loop. For those two values remove me from
waiting.waiting_on; otherwise use the supplied waiting.waiting_on unchanged.
Preserve all these repeated next reads, short-circuits and constructor reads.

After processing transitions, independently select declined requests from the
same complete views. Consider only the reader's own requester.id. Keep the
newest view per view.goal.id: a later created_at wins, and for equal created_at
a lexicographically larger id wins. Preserve the original repeated created_at,
goal.id and id comparisons and reads. A later non-rejected request hides an older
rejected request for that goal; someone else's request does not replace mine.

Keep only a selected view with state rejected and
`goalRow(principal.wsId, view.goal.id)?.status` equal to active. Map it to own
fields in order id, goal, reason, rejected_by, rejection_reason, decided_at.
Sort by decided_at descending with nullish values treated as an empty string,
then id ascending. Use native localeCompare. Return this section's object in
order waiting_on_me, waiting_on_others, declined.

## Asks

Inside its own section, call listAsks(principal, {states: [open, accepted]}).
The exact state strings are `open` and `accepted`, in that order. Filter all
returned asks by their waiting_on_me value, then map them to own fields id,
state, team, goal, text, from_label, requester, next. Next is accept only when
the held ask's state is exactly open, otherwise done. Preserve the repeated state
reads and do not independently reinterpret the supplied reader's states or
readership. Return `{waiting_on_me}`. Keep empty successful results distinct
from a failed null section.

## Alignments

Inside its own section, call listAlignments(principal), then iterate
waiting_on_me, mine and others through sequential iterable spreads. Call
alignmentWaits for every visited alignment; skip a falsy wait result before
reading the projected fields. For a retained item, construct own fields in order
id, state, requester, target_goal, choice, source_goal, sessions, next, waiting_on,
updated_at. Project every session to label, started_at, key_end in that order,
preserving null values and actual timestamps. Null or invalid session entries
retain their original failure inside this section. Keep the supplied choice and
source goal rather than reconstructing either.

Only after constructing the item, inspect the alignment's waiting_on_me and
append to the corresponding array. Do not add an ownership filter to the supplied
list. Return `{waiting_on_me: onMe, waiting_on_others: onOthers}` in that order.

## Active goals

Use the original truthy goals guard followed by its own section. If the earlier
goals section returned null, this value stays null and no active-goal section
runs. Filter all supplied goals for status exactly active before mapping them.
Project each to fields id, title, version, level, team, owner, mine in that order.
Level is company only when exactly company, otherwise team. Team is null for a
falsy pod_id; otherwise read pod_id for its id and again for the team-name call.
Owner reads owner_id for its id and again for memberName. Mine invokes the local
ownership helper with another goal.id read. Preserve these observations and the
exact supplied values. Sort by Number(mine) descending only; tied items retain
their original order. Do not introduce title sorting or additional goal queries.

## Connected applications and return

Inside its own section, first set everyone from principal.wsRole exactly equal
to owner. Call listGrants(principal), preserving its own readership. Project the
returned grants to fields id, name, connected_by from grant.user, approved_at,
last_used_at, last_read_at, evidence_class in that order. The final field calls
appEvidence with another read of grant.last_read_at, even after the earlier
last_read_at field read. Last use is not substituted for an observed read.
Do not infer content reading from connection, approval or token use.

The connected-app section returns exactly `{everyone, items}`, with those own
keys in that order. `items` is the projected list of grants. Do not call that
inner list `apps`; apps is the containing field of the whole Home result.

Finally return own fields in order me, change_requests, asks, alignments, goals,
apps. Each successful or failed section retains its independent result. Do not
write state, add timestamps, combine failure handling across sections, silently
continue after a logging failure or replace supplied domain helpers with local
approval, launch, evidence or visibility policy.


#### Scenario: Preserve independent Home sections and waiting-state metadata

- **WHEN** the Node Home target is selected
- **THEN** Capture 14 ordered resources once and expose one synchronous workspaceHome method with one argument. Keep seven public caller types, the exact team-name SQL and two live console sites. Preserve independent null sections and local versus hosted error logging; configuration and logger failures still propagate. Preserve supplied readership and transition helpers, owner/team/company classification, ordered group iterators, launch-before-change handling, approval-only involvement where originally allowed, repeated next-field reads, latest own rejected request per active goal, ask actions, alignment source/choice/session metadata, stable mine-first active goals and connected-app observed-read metadata. Preserve property, call, refusal and native error ordering. Add no writes, permission logic, content reads, ambient IO or delivery claim.
