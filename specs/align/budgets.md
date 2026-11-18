---
name: Team budgets and requests for more
summary: Monthly budgets in estimated list-price US dollars, team burn, recorded decisions and information for running sessions.
kind: area
---

# Team budgets and requests for more

A budget is a planning amount in estimated list-price US dollars for one team and one calendar month in UTC.
It is never a bill or a payment limit. Each month has its own budget; nothing carries into another month.
This version deliberately has no hard stop: reaching a budget never blocks work, holds a goal, stops a session,
or grants permission to spend. Threshold notes are information and confer no authority.
The existing spend, goal visibility, authentication, audit and former-member rules in `workspaces` apply.

## Requirements

### Requirement: One monthly budget per team

The server SHALL expose `GET /api/v2/workspaces/{ws}/teams/{team}/budget?month=YYYY-MM` to browser sessions and
granted device tokens, defaulting to the current UTC month. Only members of that team, including viewers, and workspace owners may read it. Everyone else gets 404.
A workspace or team outside that workspace is 404. A malformed month is 400. Team leads and workspace owners,
except viewers, SHALL set or change the budget with browser-only `PUT` on the same path
`{amount_usd, allowance_usd?, allowance_ceiling_usd?}` and remove it with `DELETE`. Writes to past months are 409 `month_closed`.
Amounts SHALL be finite JSON numbers in whole cents, from 0 to 1,000,000 US dollars; an omitted or null allowance
means no allowance. `allowance_ceiling_usd` is the monthly maximum total granted under the allowance for this team,
with the same amount validation. With an allowance and an omitted or null ceiling it defaults to that allowance.
Without an allowance a non-null ceiling is 400. An allowance or ceiling of zero grants no positive request. Every set, change and removal SHALL preserve
an immutable history row with the amounts, actor and time and audit `team_budget.set`, `.changed` or `.removed`
in the same transaction. Removing an absent budget changes nothing. A team without a budget behaves as before.

#### Scenario: Setting, changing and removing

- **WHEN** a team lead sets 100 US dollars with a 5 dollar allowance, an owner changes it to 120 without an allowance, and the lead removes it
- **THEN** one current budget is replaced twice, three history rows and audit rows name who and when, and the next read has `budget: null`

#### Scenario: Unauthorized or cross-workspace change

- **WHEN** a member, a viewer stored as a lead, a lead of another team, or a person outside the workspace writes a budget
- **THEN** the first three get 403 (`read_only` for the viewer, `not_team_lead` otherwise), the last gets 404, and nothing is written; a device token cannot change a budget

#### Scenario: A closed month

- **WHEN** a lead tries to change or remove a budget for a past UTC month
- **THEN** the server returns 409 `month_closed` and preserves its amounts, history and audit

### Requirement: Estimated team burn and privacy

A budget read SHALL return `{team, month, from, to, as_of, note, budget, effective_budget_usd_micros,
estimated_spend_usd_micros, remaining_usd_micros, forecast_usd_micros, runs_out_at, unpriced_requests, known_unpriced_requests,
priced_spend_usd_micros, spend_bound, remaining_bound, forecast_bound, pricing_note, budget_stamp, reached_thresholds,
allowance_granted_usd_micros, allowance_remaining_usd_micros, no_goal, history, can}`. `budget` is null or
`{amount_usd_micros, allowance_usd_micros, allowance_ceiling_usd_micros, updated_by, updated_at}`. The effective amount is the base plus
unexpired granted requests for that month, or null without a base budget. Remaining is effective minus estimated
spend, including a negative result. History lists each recorded budget change, oldest first, as `{id, action, amount_usd_micros, allowance_usd_micros, allowance_ceiling_usd_micros, actor, at}`. `team` is `{id, name}` and each person (`actor`, `requester`, `updated_by` and approver) is `{id, name}`.
`allowance_granted_usd_micros` SHALL be the total granted under the allowance in the month, including expired grants;
`allowance_remaining_usd_micros` SHALL be the nonnegative ceiling minus that total, or null without an allowance.
Changing or removing and restoring a budget SHALL NOT reset the monthly granted total. History SHALL retain
the ceiling with each set or change. `can` has `manage` and `request` flags that match server authorization.

Team usage SHALL include usage whose spending period goal belongs to that team, including private goals without naming them,
and usage in spending periods in no goal attributed to that team. Each person SHALL have at most one home team per workspace.
With exactly one team it is that team; with several it defaults to the team joined first (join order, with a consistent choice when join times match), and the person may choose any of their current teams. With no teams it is null and their
no-goal spend stays unallocated. Browser and granted device GET `.../spend/home-team` SHALL return
`{team, teams, can_choose}` for the caller only; browser PUT `{team_id}` SHALL change only the caller's choice,
including for viewers. A team the caller does not belong to is 404. The write rechecks membership transactionally.
Removal from a chosen team clears that preference; the next spending period uses the earliest remaining membership.

A spending period in no goal SHALL capture that single home team in its team attribution when it opens. Later choice and membership
changes SHALL NOT move that usage. Periods bound to a goal use the goal's team. Periods opened before this feature SHALL have no home team; their no-goal spend SHALL remain unallocated. No historical usage SHALL be assigned to a team. Team totals plus unallocated usage SHALL be additive. Retention SHALL preserve no-goal totals by team, UTC day and billing basis with no person or session, including every token and request count and the priced subtotal. Periods with no home team stay in the unallocated total. Pre-feature totals lacking attribution SHALL remain unallocated. If any such or pre-feature older aggregate totals occur in the window, `no_goal.attribution_unknown` SHALL be true, and complete team totals SHALL remain unknown rather than invented.

`no_goal` SHALL be `{priced_spend_usd_micros, estimated_spend_usd_micros, spend_bound, unpriced_requests, share_percent,
known_unpriced_requests, attribution_unknown}`. When older aggregate totals lack attribution, complete `unpriced_requests` counts SHALL be null, with `known_unpriced_requests` retaining the
attributed count. The response SHALL report only whether attribution is incomplete for the window, never workspace-wide unattributed counts. The share is no-goal spend divided by team spend, in percent,
or null with no spend or incomplete pricing or attribution. `priced_spend_usd_micros` is always the known priced
subtotal, labelled as such. With unpriced requests and complete attribution, `estimated_spend_usd_micros` SHALL return the priced subtotal,
`spend_bound` SHALL be `lower`, and the amount SHALL be labelled "at least" with `unpriced_requests` giving the count.
Remaining SHALL be effective minus priced spend, with `remaining_bound: "upper"` and the label "at most".
Forecast SHALL use the priced rate with `forecast_bound: "lower"` and "at least". Exact priced totals use
`spend_bound`, `remaining_bound` and `forecast_bound` of `exact` when the respective amount exists; absent amounts
have a null bound. With unknown attribution, complete amounts stay null and `spend_bound` is `unknown`.
`no_goal.spend_bound` follows the same lower, exact or unknown rule for that subtotal. `pricing_note` SHALL explain
the applicable bounds and unpriced count. A projected crossing date and no-goal share SHALL be absent with
incomplete data because neither has a reliable bound. Unknown never reads as zero. All monetary figures and forecasts
SHALL be labelled estimates at list price. No per-person spend view, session list, or unreadable goal id or name
SHALL be returned. Budget history may identify who changed the budget, never their spend.

The linear forecast SHALL use priced spend divided by elapsed milliseconds from month start through
`as_of`, multiplied by the month's duration. Past months use the whole month, future months have no elapsed time,
and no elapsed time yields a null forecast. `runs_out_at` is the projected crossing date within that month, or null
when there is no budget, no positive spend rate, incomplete data or no projected crossing. Future expiries SHALL
reduce the effective budget at their recorded instant when finding the crossing. A past crossing estimate may
precede `as_of`; it is not a measured crossing. Reads SHALL not create decisions or audit entries. Budget reads SHALL report an opaque `budget_stamp` (null without budget history) and `reached_thresholds`, the subset of 80 and 100 reached by a known priced estimate against a positive effective budget. Unknown totals and absent budgets SHALL report no threshold. Lower bounds may cross.

#### Scenario: Home team and history

- **WHEN** a person joins Build before Support, opens a spending period in no goal, chooses Support, then opens another
- **THEN** the first period counts only under Build, the second only under Support, leaving either team moves neither, and no usage counts twice

#### Scenario: Private goals and work with no goal

- **WHEN** a team has 20 dollars on readable goals, 10 on a private goal and 10 on spending periods in no goal
- **THEN** its burn is 40 estimated dollars and the no-goal share is 25 percent for a team member or workspace owner, the private goal is never named or identified, and no person's spend is exposed

#### Scenario: Unpriced work

- **WHEN** one team request is unpriced and its priced requests total 40 dollars
- **THEN** `priced_spend_usd_micros` is 40000000, `unpriced_requests` is 1, spend says at least 40 estimated dollars, remaining says at most its priced remainder, forecast is labelled at least its priced projection, and the count of one unpriced request is shown; no-goal share and crossing date are absent

#### Scenario: A person chooses a home team

- **WHEN** a person reads `GET .../spend/home-team` and uses browser `PUT {team_id}` with one of their teams
- **THEN** both return exactly `{team, teams, can_choose}`, only their own preference changes, and a team they do not belong to is 404

#### Scenario: A session budget read

- **WHEN** a session's owner or sharing device reads its current budget, with and without `attribution=1`
- **THEN** the response is `{epoch_id, team, month}` for attribution alone or `{epoch_id}` plus the budget-read fields otherwise, null for no open shared period, no readable team or an unreadable goal, and a different person's read is 404

#### Scenario: Only team members and owners read a team budget and burn

- **WHEN** an ordinary member of another team reads this team's budget, even with a readable goal in this team
- **THEN** the read is 404 and returns no team burn, no-goal subtotal or budget history

Goal-bound team spend in the monthly CSV SHALL have exactly the same named team rows and amounts as the on-screen team report for that reader. The member-or-owner restriction above applies to budgets, burn, forecasts, history and home-team spend in no goal. Other teams' home-team amounts SHALL remain unallocated. Hidden goals SHALL remain unnamed.

### Requirement: Asking for more

Any non-viewer member of the team SHALL create a request for the current UTC month with browser or device
`POST /api/v2/workspaces/{ws}/teams/{team}/budget-requests {amount_usd, reason, goal_id?, session_keys?}`.
An amount SHALL be positive, at most 1,000,000 dollars, in whole cents; reason is required, at most 1000 characters.
The optional goal SHALL be readable by the requester (404 otherwise). It may be outside the team; requesting
does not change that goal. At most 50 distinct session keys may be attached, each an existing shared session owned
by the requester in this workspace (404 otherwise). Malformed input is 400. A non-team workspace member gets 403
`not_in_team`, even an owner; a viewer gets 403 `read_only`. With no current budget, creation is 409
`budget_missing`. The workspace creation limit in `workspaces` SHALL count every budget request, including withdrawn requests and allowance grants. All writes use bodies of at most 16 KB and the existing same-site protections for cookies.

Every request SHALL record `filed_from` as `browser` for cookie authentication or `terminal` for device authentication; input SHALL NOT override it. A device request SHALL always wait for a person, even under the allowance.
At most five waiting requests per person, team and current UTC month SHALL exist. Creating a sixth waiting request or referring a declined request when five already wait SHALL return 409 `too_many_waiting_requests` with a plain explanation, in the same transaction.

Only for a request made with a web sign-in, as opposed to a device token, if the amount is within the per-request allowance set at creation and adding it to the month's total allowance grants
would not exceed the monthly ceiling, the request SHALL be `granted` immediately with authority
`allowance`, no approver, the exact label "This request was recorded under the team's allowance.", and expiry at next month's start.
Otherwise it SHALL be `waiting`, with the usual decision path. The allowance and ceiling SHALL be checked in the
same transaction as creation, so concurrent requests cannot exceed the ceiling. A later allowance change SHALL not alter an existing grant. Creation SHALL return 201 and audit
`budget_request.requested` and, for an allowance grant, `budget_request.allowance_granted`.

#### Scenario: Allowance or waiting

- **WHEN** a person using a web sign-in asks for 5 dollars under a 5 dollar allowance with no ceiling given and then asks for 1
- **THEN** the ceiling defaults to 5, the first is granted under the team's allowance without an approver, the remaining allowance is zero, and the second waits for a decision; the grant raises the effective budget by 5 until expiry

#### Scenario: Terminal requests wait for a person

- **WHEN** a device files a request that fits the allowance
- **THEN** the request waits for a person and records terminal as its filing source

#### Scenario: Five requests already wait

- **WHEN** a person has five waiting requests for one team this month and files another above the allowance
- **THEN** the sixth request is refused with `too_many_waiting_requests` and no new record or audit entry

### Requirement: Decisions, withdrawal and expiry

Browser-only `POST /api/v2/workspaces/{ws}/budget-requests/{id}/{approve|decline|withdraw|second-look}` SHALL return
the updated request. Every action SHALL carry `{revision}` for the version read. Missing or invalid revision is
400, a future revision is 400 `unknown_revision`, an older one is 409 `stale_revision`, checked before decision
fields. Every successful action increments the revision, so a stale first decision cannot decide a second look.
Team leads and workspace owners, except viewers and always excluding the requester, SHALL decide a waiting
request. Approve requires `{amount_usd, expires_at, note?}`: a positive amount no greater than asked, an ISO instant
after now and at or before next UTC month's start, and an optional note of at most 1000 characters. Decline requires
`{reason}` with 1 to 1000 characters. Approval SHALL record authority `approver`, approver, approved amount, expiry,
note and time. Decline SHALL record decider, reason and time. Only the requester may withdraw a waiting request, including a requester whose workspace role later became viewer.
No acknowledgement is an approval. Every decision SHALL be an immutable row in `decisions`; both rounds survive.

Each decision, withdrawal and second look SHALL be transactional and audit `budget_request.approved`, `.declined`,
`.withdrawn` or `.second_look`. At month end a waiting request becomes effectively `expired`; a granted request
becomes effectively `expired` at its expiry. Expired grants add nothing. Declined and withdrawn records keep those
states. Derived expiry requires no background write or audit. Any action in an ineligible state is 409 `wrong_state`.
Its message SHALL say what happened, name the actor when one exists ("you" to that actor), and use the app's
words, including "declined". It SHALL NOT interpolate a stored state into "This request is ...".
Removing a budget preserves grants and history but leaves no effective budget until one is set for that month.

#### Scenario: Partial approval and no self-approval

- **WHEN** a lead requests 20 dollars and tries to approve it, then another lead grants 12 until a date this month
- **THEN** self-approval is 403 `not_an_approver`, the other decision is granted with authority `approver`, and the effective budget grows by 12 until that instant; an approval after month end or above 20 dollars is 400

#### Scenario: Racing decisions and withdrawal

- **WHEN** two people decide the same revision, or the requester withdraws before a decision arrives
- **THEN** exactly one transition succeeds, the other is refused without another decision or grant, and the audit agrees with the surviving record

### Requirement: One second look by a different owner

Only a declined request's requester, while the month is still current, SHALL send it once for a second look.
It becomes `waiting` with `second_look: true`. Only a current workspace owner who is neither the requester nor the
first decider may decide it. No second referral is permitted, including after a second decline. Both decisions
SHALL remain visible. A first decider who becomes an owner still cannot make the second decision. When no eligible
owner exists, `can.second_look` SHALL be false and `second_look_unavailable_reason` SHALL say that no other owner
can decide it, excluding the requester and first decider. Attempting referral then SHALL be 409
`no_eligible_approver` without a revision change, audit or referral. Eligibility SHALL be rechecked transactionally.
A second look already waiting when its last eligible owner leaves SHALL remain waiting and say nobody is eligible.

#### Scenario: Different owner and preserved first decision

- **WHEN** a lead declines, the requester asks for a second look, that lead tries again as an owner, and another owner grants less than asked
- **THEN** the lead's action is 403 `not_an_approver`, the other owner can grant, the first decline and second grant both remain, and another second look is 409 `wrong_state`

#### Scenario: Nobody can decide

- **WHEN** the only workspace owner is also the only team lead and files a request above the allowance
- **THEN** creation succeeds and the record and lists say nobody is eligible to decide; the requester cannot decide it

#### Scenario: A second look has nobody eligible

- **WHEN** a declined request has no eligible different owner
- **THEN** no second-look action is offered, its unavailability is explained, and attempting it records nothing

### Requirement: Reading requests and what needs you

Browser and granted device reads SHALL list `GET .../teams/{team}/budget-requests?month=YYYY-MM` and workspace
`GET .../budget-requests?month=YYYY-MM&limit=50&cursor=<id>` as `{waiting_on_me, mine, others, next_cursor}` (newest first by creation time, with a stable tie order). Both lists SHALL default to the current UTC month, accept limit 1 to 100 (default 50), and use the last id as an opaque cursor within the selected month, returning 400 for an invalid cursor. Changes to request state or decisions between pages SHALL neither skip unread rows nor repeat previously returned rows. Readers SHALL read one at
`GET .../budget-requests/{id}`. A request is readable by its requester, current team members and workspace owners;
others get 404. Each request SHALL return exactly `{id, team, month, revision, state, state_note, requester, filed_from, amount_usd_micros, reason, goal, goal_hidden, session_count, session_keys, approved_usd_micros, authority, authority_label, expires_at, second_look, decisions, approvers, waiting_on_me, decision_unavailable_reason, second_look_unavailable_reason, can, created_at, updated_at}`. `goal` is null or `{id, title}`. Each decision is `{round, decision, actor, amount_usd_micros, expires_at, note, at}`. `can` contains exactly `{approve, decline, withdraw, second_look}`. `authority_label` is null, "This request was recorded under the team's allowance." or "This request was granted by an approver.". A waiting request with nobody eligible SHALL carry
`decision_unavailable_reason` explaining who is needed and that the requester cannot decide it. Creation SHALL
still succeed with 201 and the same warning in the record and lists; no automatic grant is inferred. A linked unreadable goal SHALL be null, with `goal_hidden: true`,
including in Home. Attached sessions SHALL be identified only to their owner; others see a count.
Home SHALL return `budget_requests` as null or `{waiting_on_me, mine, next_cursor}`. The Home SHALL put requests waiting on the reader and the reader's own current and previous UTC month requests in the existing single Needs list and its filters; the heading count SHALL count those same rows. A failed source is unknown. Home SHALL return only these relevant records, at most 100, with `next_cursor` when more exist. Unrelated history SHALL NOT crowd out relevant requests. The Requests tab SHALL have a clearly labelled Budget requests section, a month filter defaulting to the current UTC month and paginated reads. Lists and Home SHALL remain bounded as request history or workspace membership grows. A requester SHALL see every state, including declined, withdrawn and expired.

#### Scenario: An owner deciding for a private goal

- **WHEN** a member attaches their private goal and own session, and an owner reads the request or Home
- **THEN** the owner may decide it but sees no private goal name or id and no session key, while the requester can read their own references; another team's ordinary member gets 404

#### Scenario: Lists stay within the selected month and page

- **WHEN** a person lists requests without a month and follows the returned cursor with limit 50
- **THEN** both pages contain only this month's readable records, each has at most 50 records, no record repeats, and `next_cursor` is null on the final page

### Requirement: Screens fit the existing app

The existing Spend tab SHALL offer a team and UTC month picker, budget and burn, a form for authorized budget
changes, an honest "No team budget for this month" state, and a request form for team members. The form SHALL
encourage a readable goal and allow choosing the requester's own shared sessions. Request cards SHALL show waiting,
granted with authority, declined, withdrawn and expired distinctly, both decisions, and only actions the server
allows. An approval form SHALL collect amount and expiry, a decline a required reason. Second look and withdrawal
SHALL carry the displayed revision. Home and Requests SHALL link to the same record on Spend using `?team=<id>&month=<YYYY-MM>&request=<id>`.
The request record SHALL name the team whose budget is requested. Its status SHALL be a plain sentence for each state: waiting for a decision, granted by the named approver until the recorded expiry, recorded under the team's allowance until expiry, declined by the named decider, withdrawn, or expired. Status text SHALL NOT reuse refusal sentences or say "so nothing changes" above an available second look.
The attribution rule SHALL appear once on the Spend tab, with no shared workspace footer: goal-bound spend counts toward the goal team's budget, and spend in no goal counts toward the home team's budget recorded when the spending period opened. The team picker SHALL list only teams whose budget the reader may read. Browser and granted device `GET .../spend/teams` SHALL return `{teams: [{id, name}]}` for exactly those teams, ordered by name, so the terminal can offer the same choices without exposing budgets.
The Sessions screen SHALL show a budget attribution label only for the reader's own sessions whose team has a budget this month. Other people's sessions SHALL have no label, including when read by a workspace owner. A month without a team budget SHALL have no label. A hidden goal SHALL stay unnamed. Forms SHALL have
named labels, direct English, visible errors, no emoji or internal field names in copy, and fit 390 CSS pixels
without page overflow. Incomplete totals and forecasts SHALL label bounds or say unknown, and count unpriced requests. Nothing is
populated with mock, seed or demo data.

The budget amount SHALL be required and validated before sending. A blank amount SHALL never become zero; zero is allowed only when typed explicitly. Field errors SHALL be plain sentences beside the relevant fields, with no raw server messages or field names. A successful request SHALL clear its form, and every write form SHALL prevent duplicate submissions while a write is outstanding. Saving a home team or removing a budget SHALL show a specific confirmation that survives the follow-up read and page reload while that saved choice or removal remains current. Saving a budget SHALL show a confirmation that survives the follow-up read and page reload for the same saved budget. With no budget, the amount and remaining display SHALL say there is no budget. Required fields SHALL be marked through their labels and control semantics.

#### Scenario: A phone and an empty team

- **WHEN** a reader opens the team's Spend view at 390 pixels with no budget, usage or requests
- **THEN** the page fits, says those records are absent, shows no invented spend, and exposes only authorized forms

#### Scenario: Required amount, successful request and confirmation

- **WHEN** a person submits a blank budget amount, saves an explicit zero, then files a valid request twice before its first response
- **THEN** the blank amount is refused beside its field without a request, zero can be saved explicitly with a confirmation retained on reload, and only one request is filed with its form cleared on success

The CSV month control and the budget month control SHALL be independent. Changing either SHALL preserve the other's selected month.

### Requirement: Terminal commands and threshold notes

`align budget [--team <name>]` SHALL report the current folder goal's team (or the explicit team, or the folder's
only team when unambiguous), this UTC month's budget and burn with estimate labels and unknown counts.
`align budget request --amount <USD> --reason <text> [--goal <ref>] [--team <name>] [--session <ref> ...]`
SHALL file a request with the same server rules, defaulting the goal from the folder. An optional `--workspace` SHALL follow the existing workspace resolver. Folder rules SHALL supply the default
workspace and goal; without a team on that goal, only a sole current team may be selected implicitly. Ambiguous team selection
SHALL list eligible teams by name and ask the person to pass `--team <name>` rather than guessing. Successful reads SHALL also list eligible teams by name and leave the local team figure and matching current session snapshot current under the same attribution and figure validity rules as sync. Messages SHALL use plain sentences without raw identifiers or stored state values. Terminal commands SHALL never decide a request.

At a shared session's next turn after its team's priced known spend reaches 80 and then 100 percent of the effective
budget, it SHALL receive one short informational note per threshold per UTC month per session. Dedupe SHALL survive
hooks, sync and restarts; a leap past both thresholds may deliver both at the same turn. A changed budget SHALL
not reset dedupe, even when the session changes teams. An unknown total, no budget, private sessions, and teams the person cannot read SHALL produce no
threshold claim. A priced lower bound crossing a threshold SHALL cause a note even when some requests are unpriced; an unpriced request alone SHALL NOT. A crossing observed by a sync pass SHALL remain due at the session's next turn however long the pause, while it is the same UTC month and the session still counts toward the same team. A later budget amount change or temporary read failure SHALL NOT erase an observed crossing. Removing the budget SHALL clear due notes from the next successful sync pass. A new spending period confirmed to count toward the same team SHALL retain that due note; an unconfirmed period mismatch SHALL NOT deliver it. Each note SHALL state when the estimate was read, in plain words, because the budget may have changed. Future-dated, previous-month or mismatched observations SHALL NOT cause a note. A sync pass SHALL accept a new crossing only from a figure read within the last five minutes. The one-pass sync SHALL refresh session attribution and its budget through
`GET .../sessions/{key}/budget`, readable only by the person who owns that session (and its sharing device for
device reads). With `attribution=1` the read SHALL return only `{epoch_id, team, month, budget_stamp}` for the sync pass; the normal read SHALL return `{epoch_id}` plus the budget-read fields. It SHALL return null when there is no open shared spending period, no team, or an unreadable goal. The hook SHALL read only its local snapshot and dedupe files, without a network read, sync wait or lock wait, within the existing p95 latency budget. Spending snapshots SHALL live outside the goal-feed directory. Hooks SHALL
match the cached workspace, session key and spending period before delivering information through their existing context path.
The sync pass SHALL refresh at most 100 shared sessions per pass, with rotation. Positive and nothing-to-report answers for matching session attribution SHALL be reused for at most five minutes. Team budget answers, including absent or unreadable budgets, SHALL be reused for the same five-minute window across passes only while their change stamp is unchanged. A set, change, removal, grant or grant expiry SHALL invalidate reuse at the next sync through the existing directive response. An unchanged cached pass SHALL make zero budget requests. Missing stamp support, unknown additive fields and absent budget routes SHALL leave the pass working without a budget error. One pass SHALL make at most 120 budget-related reads and spend at most two seconds waiting for them. It SHALL stop when either bound is reached, without waiting for sign-in refresh or another lock, and continue with later sessions on the next pass. Cache files for sessions no longer shared SHALL be removed on stop-sharing, removal or sign-out. Markers from earlier UTC months SHALL be pruned. With no shares, no cursor file SHALL be written. Each note SHALL use the `[Align] ...` form, name the team and threshold, label list-price estimates, state that work continues and that the note grants no authority, and say the person can ask for more in Align. It SHALL contain no runnable command or instruction. These reads and notes SHALL add no daemon, decision, hold or stop. No acknowledgement or automatic approval SHALL be inferred from a note.

#### Scenario: Repeated turns and a new month

- **WHEN** a shared session crosses 80 percent, runs more turns, crosses 100, restarts, and runs in the next month
- **THEN** it receives each previous-month threshold only once and may receive each threshold once again against a new month's budget, without any work blocked

#### Scenario: A long pause after a crossing

- **WHEN** a sync pass observes 80 percent and the person next prompts two days later in the same UTC month with the session still counting toward that team
- **THEN** that turn receives the note once, stating when the estimate was read, even if a later budget read falls below 80 percent
- **AND** a different month or changed session attribution receives no note from that observation

#### Scenario: Read a budget from the terminal

- **WHEN** a person runs `align budget` in a folder with a goal team
- **THEN** it displays this month's team budget and list-price spend estimates, bounds and unpriced counts, or says there is no budget, and makes no decision

#### Scenario: File a budget request from the terminal

- **WHEN** a person runs `align budget request --amount 5 --reason "Finish work"` in that folder under an allowance of 5 dollars
- **THEN** the record says it was filed from the terminal, waits for a person, and the terminal says that waiting for a person grants no authority

#### Scenario: A priced lower bound crosses a threshold

- **WHEN** priced spend reaches 80 percent while another request is unpriced
- **THEN** the next turn receives an informational 80 percent note, with no command, decision or authority

### Requirement: Record retention

Budgets, their history, budget requests and both decision rounds SHALL be kept for the workspace's lifetime,
as decision records. Each actor SHALL follow the existing former-member replacement schedule. Attached session keys
SHALL disappear when their session is deleted or retained as aggregate totals, with the original attached-session count retained on
the request. No-goal team older aggregate totals SHALL retain only team, UTC day and aggregate request and estimate counts.
Retaining older session totals SHALL count each request once under its UTC day, model and billing basis; retaining a session SHALL leave other days, models and bases unchanged. Purging a workspace SHALL remove all these records. Product events SHALL remain content-free; this feature adds
no product-event names or properties.

#### Scenario: A session is retained as aggregate totals and a member leaves

- **WHEN** a request's attached session is retained as aggregate totals after 13 months and its requester becomes a former member
- **THEN** the request keeps its reason, original session count and decisions, its session key is gone, and its actor reads as "Former member #n"

### Requirement: Crossing information during a turn and in the browser

A supported harness SHALL show a short person-visible warning at the next main-session tool call after sync observes
an undelivered crossing. It SHALL use a verified user-visible field that does not enter model context. Claude Code
synchronous PreToolUse supports systemMessage. Codex tool-call user-only messages are not verified and SHALL retain
next-prompt delivery only. Subagent calls SHALL receive no budget message. The next prompt SHALL still receive the
existing context line. Each threshold SHALL have at most one person-visible message and one context line per session
and UTC month across delivery points and restarts. A prompt delivering context before a tool warning SHALL consume
that threshold's message opportunity too. No budget information SHALL enter model context during a turn. Hooks
SHALL never wait for a lock.

Spend SHALL state each currently reached threshold with the figure's computation time for authorized budget readers. A selected past month SHALL be named rather than called this month.
Home SHALL show the team's first observed crossing of each threshold this UTC month to current team leads and
workspace owners under Since you last looked's baseline, first-visit, reload, ordering and bounded display rules.
The record SHALL retain its first observation and computation times across later budget changes, removal and repeated
reads, but Home SHALL show no crossing row while the budget is absent, with no goal, person or session references. Crossings SHALL NOT enter Needs or change its count. An absent
budget SHALL cause no new observation, message, row or burn computation. Existing refreshes SHALL suffice without
new polling.

#### Scenario: Changed budget in a cached pass

- **WHEN** a budget is set, changed, removed, raised by a grant or reduced by a grant expiring during the reuse window
- **THEN** the next sync invalidates the old figure within existing read and time caps, and removal leaves no due note

#### Scenario: A long turn reaches a threshold

- **WHEN** sync observes 80 percent during a Claude Code turn and main-session tool calls precede the next prompt
- **THEN** one tool call shows a user-only warning and the next prompt delivers context once, with neither repeating after restart

#### Scenario: No budget and mixed release versions

- **WHEN** a session's team has no budget or either release predates budget support
- **THEN** ordinary work and sync continue without new budget notes or rows, and an unchanged cached pass makes zero budget requests

#### Scenario: A lead returns after a crossing

- **WHEN** a lead or workspace owner returns to Home after the team's first observed crossing this month
- **THEN** Since you last looked shows it under existing visit rules and Spend states current crossings with computation time, without changing Needs or exposing it to other teams
