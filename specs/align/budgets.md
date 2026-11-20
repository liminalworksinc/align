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

The terminal commands are `align budget [--team <name>] [--workspace <name|id>]` and
`align budget request --amount <USD> --reason <text> [--goal <ref>] [--team <name>] [--session <ref> ...]`.

## Wire representation

All team and request routes below are under `/api/v2/workspaces/{ws}`. This representation is part of the
observable contract; the implementation's `docs/v2/WIRE.md` mirrors it.

| Route | Read or write |
| --- | --- |
| `GET /teams/{team}/budget?month=YYYY-MM` | Budget and burn; current UTC month by default |
| `PUT /teams/{team}/budget?month=YYYY-MM` | Browser only; `{amount_usd, allowance_usd?, allowance_ceiling_usd?}` |
| `DELETE /teams/{team}/budget?month=YYYY-MM` | Browser only; remove the base budget |
| `POST /teams/{team}/budget-requests` | `{amount_usd, reason, goal_id?, session_keys?}`; 201 with the request |
| `GET /teams/{team}/budget-requests?month=YYYY-MM&limit=50&cursor=<id>` | Team request groups and continuation |
| `GET /budget-requests?month=YYYY-MM&limit=50&cursor=<id>` | Workspace request groups and continuation |
| `GET /budget-requests/{id}` | One request |
| `POST /budget-requests/{id}/{approve\|decline\|withdraw\|second-look}` | Browser only; `{revision}`; approval adds `{amount_usd, expires_at, note?}`, decline adds `{reason}` |
| `GET /spend/teams` | `{teams: [{id, name}]}` in name order, for readable budgets only |
| `GET /spend/home-team` | The caller's `{team, teams, can_choose}` |
| `PUT /spend/home-team` | Browser only; `{team_id}`; the caller's updated home-team choices |
| `GET /sessions/{key}/budget` | `{epoch_id}` plus budget fields, or null without an open readable shared spending period |
| `GET /sessions/{key}/budget?attribution=1` | Only `{epoch_id, team, month, budget_stamp}`, or null |

Budget responses have exactly `{team, team_member_count, month, from, to, as_of, note, budget,
effective_budget_usd_micros, estimated_spend_usd_micros, remaining_usd_micros, forecast_usd_micros,
runs_out_at, unpriced_requests, known_unpriced_requests, priced_spend_usd_micros, spend_bound,
remaining_bound, forecast_bound, pricing_note, budget_stamp, reached_thresholds, allowance_granted_usd_micros,
allowance_remaining_usd_micros, no_goal, history, can}`. `budget` is null or
`{amount_usd_micros, allowance_usd_micros, allowance_ceiling_usd_micros, updated_by, updated_at}`.
`history` entries have `{id, action, amount_usd_micros, allowance_usd_micros,
allowance_ceiling_usd_micros, actor, at}`. `can` is `{manage, request}`.
`no_goal` has `{priced_spend_usd_micros, estimated_spend_usd_micros, spend_bound,
unpriced_requests, known_unpriced_requests, share_percent, attribution_unknown, few_contributors}`.
A `team` is `{id, name}` and a person is `{id, name}`. Bounds are `exact`, `lower`, `upper`, `unknown`,
or null for absent amounts. Monetary fields use integer USD microdollars; instants use ISO UTC on the wire.

Request lists have exactly `{waiting_on_me, mine, others, next_cursor}`. Each request has exactly
`{id, team, month, revision, state, state_note, requester, filed_from, filing_note, amount_usd_micros,
reason, goal, goal_hidden, session_count, session_keys, approved_usd_micros, authority, authority_label,
expires_at, second_look, decisions, approvers, waiting_on_me, decision_unavailable_reason,
second_look_unavailable_reason, can, created_at, updated_at}`. `goal` is null or `{id, title}`.
A decision has `{round, decision, actor, amount_usd_micros, expires_at, note, at}`. Request actions are exactly
`{approve, decline, withdraw, second_look}`. `authority_label` is null, "This request was recorded under
the team's allowance." or "This request was granted by an approver.". The filing note is the plain source
sentence specified below; the stored device reference is not returned. Home has `budget_requests` as null
or `{waiting_on_me, mine, next_cursor}`.

| Refusal | Wire status and code |
| --- | --- |
| Unknown or unreadable workspace, team, request, goal or attached session | 404 `not_found` |
| Malformed month, amount, reason, session list, revision, expiry or page cursor | 400 `bad_request` |
| Viewer write | 403 `read_only` |
| Budget write by someone other than a lead or owner | 403 `not_team_lead` |
| Non-team requester, including an owner | 403 `not_in_team` |
| Self-decision or otherwise ineligible decider | 403 `not_an_approver` |
| Device attempting a browser-only write | 403 `bearer_not_allowed` |
| Past-month budget write | 409 `month_closed` |
| No current budget for request creation | 409 `budget_missing` |
| Five requests already waiting for that requester, team and month | 409 `too_many_waiting_requests` |
| Older revision | 409 `stale_revision` |
| Future revision | 400 `unknown_revision` |
| Action in an ineligible state | 409 `wrong_state` |
| Second look with no eligible different owner | 409 `no_eligible_approver` |
| Requester or workspace hourly creation limit | 429 `rate_limited` |

## Requirements

### Requirement: One monthly budget per team

A team SHALL have at most one budget for each UTC calendar month. Browser and granted-device reads SHALL default to the current month. Only team members, including viewers, and workspace owners may read a budget; other people or a team outside the workspace receive not found. Invalid months SHALL be refused. Team leads and workspace owners, excluding viewers, SHALL set, change or remove a budget only through a browser sign-in. Past-month writes SHALL be refused without changing history.

Amounts SHALL be finite whole-cent US dollar amounts from zero to 1,000,000. An omitted or empty allowance means none. A monthly allowance ceiling defaults to the per-request allowance when omitted, requires an allowance, and accepts the same amount range. Zero grants no positive request. Every set, change and removal SHALL atomically preserve immutable history and an audit entry naming the amount, allowance, ceiling, person and time. Removing an absent budget SHALL change nothing. A team without a budget SHALL leave work unchanged.

The budget including grants SHALL be the base plus grants currently in force, or absent without a base. For a closed month it SHALL include every granted request in force at some time during that month, including grants that have since expired. Remaining and reached thresholds SHALL use that historical amount. Allowance used SHALL include all grants recorded under the allowance that month, including expired ones; allowance left SHALL be the nonnegative ceiling less those grants. Changing, removing or restoring the budget SHALL never reset that total.

#### Scenario: Setting, changing and removing

- **WHEN** a team lead sets 100 US dollars with a 5 dollar allowance, an owner changes it to 120 without an allowance, and the lead removes it
- **THEN** one current budget is replaced twice, three history rows and audit rows name who and when, and the next read has no current budget

#### Scenario: Unauthorized or cross-workspace change

- **WHEN** a member, a viewer stored as a lead, a lead of another team, or a person outside the workspace writes a budget
- **THEN** the first three get 403 (a read-only refusal for the viewer, a team-lead refusal otherwise), the last gets 404, and nothing is written; a device token cannot change a budget

#### Scenario: Read grants in a closed month

- **WHEN** a grant was in force during a past month and the month is read after the grant expires
- **THEN** that month's budget including grants, remaining amount and reached thresholds still include the grant

#### Scenario: A closed month

- **WHEN** a lead tries to change or remove a budget for a past UTC month
- **THEN** the server returns 409 a closed-month refusal and preserves its amounts, history and audit

### Requirement: Estimated team burn and privacy

Budget reads SHALL report the team, member count, month and window, read time, estimate disclaimer, base and effective budget, spend, remaining, forecast, projected crossing, pricing bounds, known priced subtotal, unpriced counts, allowance used and left, no-goal subtotal and share, history, and the actions the reader may take. History SHALL list changes oldest first with their actor and time. Team and person references SHALL include a name and a stable reference. Reads SHALL create no decisions or audit entries.

Usage SHALL count toward the goal's team, including private goals without naming them, or toward the home team captured when a spending period in no goal opened. A person SHALL have at most one home team in each workspace: their sole team, otherwise the earliest joined current team with a consistent tie choice, or none with no membership. Only the person SHALL read their preference and choices, through a browser or granted device. Only a browser sign-in SHALL change that preference, including for viewers. Membership SHALL be checked again in the transaction. A team the person does not belong to SHALL be refused as not found. Leaving a chosen team SHALL clear the preference for future spending periods. Later membership or preference changes SHALL never move earlier usage.

Spending periods opened before home-team attribution SHALL retain no home team. Their no-goal usage SHALL remain unallocated and SHALL never be assigned retrospectively. Team totals plus unallocated usage SHALL be additive. Retention SHALL preserve no-goal totals by team, UTC day and billing basis, including every token and request count and the priced subtotal, without person or session references. Only usage with a recorded home team SHALL count as attributed in retained totals.

When the window contains earlier no-goal usage without a home team from someone now in the team, the known positive priced total SHALL be a lower bound and the panel SHALL say some earlier usage could not be attributed. With no known priced amount the complete total SHALL be unknown, never zero. Older aggregate totals with missing attribution SHALL be treated the same way: a known positive priced total is a lower bound, and with none the complete total is unknown. Unknown attribution SHALL be flagged for the window without exposing workspace-wide unattributed counts. Complete unpriced counts SHALL be absent when unknown, with known counts retained separately.

With unpriced work and complete attribution, spend and forecast SHALL be lower bounds labelled "at least" and remaining SHALL be an upper bound labelled "at most". The same bounds SHALL apply to a positive known subtotal with incomplete live attribution. Fully priced and attributed amounts SHALL be exact. Absent amounts SHALL have no bound; unknown SHALL never read as zero. The no-goal subtotal SHALL follow the same rules. The no-goal share SHALL be its percentage of team spend, absent with no spend or incomplete data. Projected crossings SHALL be absent with incomplete data. The pricing explanation SHALL give the applicable bounds without repeating the displayed unpriced count. All monetary figures and forecasts SHALL be labelled estimates at list price.

Forecast SHALL be priced spend divided by elapsed time since month start, multiplied by the month's duration. Past months SHALL use the whole month, future months no elapsed time, and no elapsed time SHALL give no forecast. Remaining SHALL be effective budget less spend, including negative amounts. A projected crossing SHALL lie in that month and account for future grant expiries, or be absent without a budget, positive spend rate or projected crossing. A past projected date SHALL remain labelled a projection.

Align SHALL offer no per-person spend view. Team totals can reveal one person's spend when the team has fewer than three members. Teams of one or two SHALL still be able to have a budget. The team budget panel SHALL show that risk in one plain sentence when the team has fewer than three members. Budget reads SHALL expose no session list or unreadable goal reference or name. History may name who changed a budget, never their spend. Only team members and workspace owners SHALL read home-team spend in no goal through budget reads. Hidden goals SHALL stay unnamed.

Budget reads SHALL return only a yes or no saying whether the no-goal figure may come from fewer than three people: yes when one or two distinct people have recorded no-goal usage attributed to the team's captured home team in the month's read window, and yes when fewer than three are known and retained usage, which keeps no identities, is part of the figure. No count or name SHALL be returned. When it is yes, the panel SHALL show beside the no-goal figure: "Spend in no goal may come from fewer than three people this month, so it can reveal one person's spend." The CSV SHALL carry neither. This sentence SHALL apply regardless of team size, without withholding figures or imposing a minimum size.

#### Scenario: No-goal contributors in a larger team

- **WHEN** the port-free test `scripts/test-budgets.mjs`, "no-goal spend from fewer than three people is flagged without a count", reads a team of at least three members with no-goal usage from zero, one, two and three people, and again after that usage is retained
- **THEN** the read returns only a yes or no: yes for one or two distinct people with attributed usage in the month's read window, yes when fewer than three are known and retained usage is part of the figure, no otherwise; the panel's disclosure follows it regardless of team size, and no count or name appears in the read or the CSV

#### Scenario: Earlier no-goal usage before and after retention

- **WHEN** a current team member has usage from a spending period opened without a home team before this feature
- **THEN** the team total is a lower bound when a priced amount is known and unknown otherwise, the panel explains the missing attribution, and retaining the session does not turn that usage into attributed or exact team spend

#### Scenario: A team with one or two members

- **WHEN** a team with one member sets a budget and later adds a second member
- **THEN** its budget remains available and the panel warns that team totals can reveal one person's spend, while no per-person spend view is offered

#### Scenario: Home team and history

- **WHEN** a person joins Build before Support, opens a spending period in no goal, chooses Support, then opens another
- **THEN** the first period counts only under Build, the second only under Support, leaving either team moves neither, and no usage counts twice

#### Scenario: Private goals and work with no goal

- **WHEN** a team has 20 dollars on readable goals, 10 on a private goal and 10 on spending periods in no goal
- **THEN** its burn is 40 estimated dollars and the no-goal share is 25 percent for a team member or workspace owner, the private goal is never named or identified, and no person's spend is exposed

#### Scenario: Unpriced work

- **WHEN** one team request is unpriced and its priced requests total 40 dollars
- **THEN** the known priced subtotal is 40 dollars and there is one unpriced request, spend says at least 40 estimated dollars, remaining says at most its priced remainder, forecast is labelled at least its priced projection, and the count of one unpriced request is shown; no-goal share and crossing date are absent

#### Scenario: A person chooses a home team

- **WHEN** a person reads their home-team preference and uses the browser to choose one of their teams with one of their teams
- **THEN** both return the chosen team, eligible teams and whether a choice is available, only their own preference changes, and a team they do not belong to is 404

#### Scenario: A session budget read

- **WHEN** a session's owner or sharing device reads its current budget, with and without attribution-only selection
- **THEN** the response is the spending period, team and month for attribution alone or the spending period plus the budget details otherwise, null for no open shared period, no readable team or an unreadable goal, and a different person's read is 404

#### Scenario: Only team members and owners read a team budget and burn

- **WHEN** an ordinary member of another team reads this team's budget, even with a readable goal in this team
- **THEN** the read is 404 and returns no team burn, no-goal subtotal or budget history

### Requirement: Monthly CSV and spend table visibility parity

For the same reader and UTC month, the monthly team CSV SHALL contain exactly the on-screen team spend report's data rows, named teams and numeric amounts, including request, token and unpriced counts. This SHALL apply to workspace owners, team leads, team members, members of other teams, members of no team and viewers. A readable goal SHALL contribute only to its team's named row, or `Goals without a team` if it has no team. All unreadable goals, including private goals and other teams' restricted goals, SHALL contribute to one unnamed `Private goals` row without team, goal, session or person references. All spend in no goal SHALL remain together in `Not bound to a goal`, without home-team subtotals even for owners or team members. `Total` SHALL equal the other data rows for every numeric column. Empty goal categories SHALL create no row. Retention SHALL preserve this parity. The separate team budget, burn, history and home-team no-goal reads SHALL remain restricted to that team's members and workspace owners; other readers SHALL receive 404.

#### Scenario: CSV matches the table for every reader role

- **WHEN** the port-free test `scripts/test-budgets.mjs`, "monthly CSV matches every table row for each reader role before and after retention", reads a month containing workspace-visible, team-restricted, private, teamless and no-goal usage, including unpriced requests
- **THEN** each reader receives exactly the table's named teams and amounts, all hidden goal rows fold into its one unnamed row, all no-goal usage stays unallocated, and neither empty months nor retention add disclosures

### Requirement: Asking for more

Any non-viewer team member SHALL file a budget request for the current UTC month from a browser or granted device. A positive whole-cent amount up to 1,000,000 US dollars and a reason of 1 to 1000 characters SHALL be required. A linked goal SHALL be readable and may belong to another team without changing it. At most 50 distinct sessions SHALL be attached, each shared in this workspace and owned by the requester. Unreadable references SHALL receive not found. Invalid input, non-team requesters including owners, viewers, and requests without a current budget SHALL be refused. Write bodies SHALL be bounded at 16 KB and cookie writes SHALL use the existing same-site protections.

Authentication SHALL determine the filing source; input SHALL never override it. Device requests SHALL record the authenticated device and its name at filing, and SHALL always wait for a person. Records, lists and Home rows SHALL say "Filed from a terminal on the device <device name>. Align cannot tell whether <person> or an agent on that device ran the command." Browser requests SHALL say "Filed in the browser by <person>." Older terminal records without a recorded name SHALL say so.

Only browser requests within both the per-request allowance and remaining monthly ceiling SHALL be granted under the allowance. The record SHALL say "This request was recorded under the team's allowance.", have no approver or decision row, expire at next month's start and raise the effective budget until expiry. All other requests SHALL wait for a person. Allowance checks, request creation, attached sessions and audit entries SHALL be atomic. Creation and allowance grants SHALL each have their audit entry.

At most five requests per person, team and month SHALL wait at once. Creating a sixth or referring a declined request when five already wait SHALL be refused transactionally with a plain explanation. Creation SHALL be limited to 60 requests per requester per workspace in a rolling hour, plus a workspace ceiling of 600. Browser and device requests by the same requester, withdrawals and allowance grants SHALL count toward both limits across restarts. Refusals SHALL record no request or audit entry.

#### Scenario: Allowance or waiting

- **WHEN** a person using a web sign-in asks for 5 dollars under a 5 dollar allowance with no ceiling given and then asks for 1
- **THEN** the ceiling defaults to 5, the first is granted under the team's allowance without an approver, the remaining allowance is zero, and the second waits for a decision; the grant raises the effective budget by 5 until expiry

#### Scenario: Honest terminal and browser sources

- **WHEN** a request is filed with a device token and another is filed with a web sign-in
- **THEN** the terminal record preserves its device name and uncertainty about who ran the command, the browser record names the signed-in person, and records, lists and Home show the same source

#### Scenario: Terminal requests wait for a person

- **WHEN** a device files a request that fits the allowance
- **THEN** the request waits for a person and records terminal as its filing source

#### Scenario: One requester exhausts their hourly allowance

- **WHEN** a requester records 60 requests in an hour and another member files a request while the workspace is below its ceiling
- **THEN** the first requester is refused and the other member can still file, with allowance grants counted in both limits

#### Scenario: Five requests already wait

- **WHEN** a person has five waiting requests for one team this month and files another above the allowance
- **THEN** the sixth request is refused with a too-many-waiting-requests explanation and no new record or audit entry

### Requirement: Decisions, withdrawal and expiry

Only browser sign-ins SHALL approve, decline, withdraw or refer a request. Every action SHALL carry the revision the person read. Missing, invalid or future revisions SHALL be refused as bad input; an older revision SHALL be refused as stale before decision fields are checked. Every successful transition SHALL increment the revision. A stale first decision SHALL never decide a second look.

Team leads and workspace owners, excluding viewers and the requester, SHALL decide waiting requests. Approval SHALL name the approver, amount no greater than requested, expiry after now and no later than next UTC month's start, and an optional note of at most 1000 characters. Decline SHALL require a reason of 1 to 1000 characters. Only the requester SHALL withdraw a waiting request, including after becoming a viewer. Every decision SHALL be an immutable record preserving both rounds. Every transition SHALL be transactional and audited with the acting person. No acknowledgement SHALL imply approval.

Waiting requests SHALL expire at month end and granted requests at grant expiry, without background writes or audit entries. Expired grants SHALL add nothing to the current effective budget. Declined and withdrawn records SHALL retain those states. Ineligible actions SHALL be refused with a plain sentence saying what happened, naming the actor when known and using "you" for that actor. Refusals SHALL never interpolate a stored state. Removing a budget SHALL preserve grants and history but leave no effective budget until one is set again.

#### Scenario: Partial approval and no self-approval

- **WHEN** a lead requests 20 dollars and tries to approve it, then another lead grants 12 until a date this month
- **THEN** self-approval is 403 an approver refusal, the other decision is granted with authority `approver`, and the effective budget grows by 12 until that instant; an approval after month end or above 20 dollars is 400

#### Scenario: Racing decisions and withdrawal

- **WHEN** two people decide the same revision, or the requester withdraws before a decision arrives
- **THEN** exactly one transition succeeds, the other is refused without another decision or grant, and the audit agrees with the surviving record

### Requirement: One second look by a different owner

Only the requester of a declined request SHALL send it once for a second look during its current month. It SHALL return to waiting, keeping the first decision. Only a current workspace owner who is neither the requester nor first decider SHALL decide it. A first decider promoted to owner SHALL remain ineligible. A second referral SHALL be refused, including after a second decline.

With no eligible different owner, the second-look action SHALL be unavailable with an explanation, and an attempted referral SHALL record no revision, audit or referral. Eligibility SHALL be rechecked transactionally. A second look already waiting when its last eligible owner leaves SHALL remain waiting and explain that nobody is eligible. A request with nobody eligible to decide SHALL still be created and SHALL never be granted automatically.

#### Scenario: Different owner and preserved first decision

- **WHEN** a lead declines, the requester asks for a second look, that lead tries again as an owner, and another owner grants less than asked
- **THEN** the lead's action is 403 an approver refusal, the other owner can grant, the first decline and second grant both remain, and another second look is 409 an ineligible-state refusal

#### Scenario: Nobody can decide

- **WHEN** the only workspace owner is also the only team lead and files a request above the allowance
- **THEN** creation succeeds and the record and lists say nobody is eligible to decide; the requester cannot decide it

#### Scenario: A second look has nobody eligible

- **WHEN** a declined request has no eligible different owner
- **THEN** no second-look action is offered, its unavailability is explained, and attempting it records nothing

### Requirement: Reading requests and what needs you

Browser and granted-device reads SHALL list team or workspace requests, defaulting to the current UTC month, with newest creation first and a stable tie order. Page size SHALL be 1 to 100, default 50. An opaque continuation reference SHALL apply only within the selected month; an invalid one SHALL be refused. Changes in decisions or states between pages SHALL neither skip unread rows nor repeat rows. Lists SHALL group requests waiting on the reader, their own requests and others, and indicate when another page exists.

A request SHALL be readable by its requester, current team members and workspace owners; others SHALL receive not found. Each record SHALL include its team, month, revision, state and plain status, requester, filing source, requested amount and reason, readable goal or hidden-goal flag, original attached-session count, approved amount, authority and expiry, second-look state, immutable decisions, eligible approvers, available actions, unavailable-action explanations and creation and update times. Attached sessions SHALL be identified only to their owner; others SHALL see a count. An unreadable linked goal SHALL remain unnamed and unidentified, including in Home. Allowance and approver authority SHALL have distinct full sentences. Decisions SHALL retain their round, actor, decision, amount, expiry, note and time.

Home SHALL put requests waiting on the reader and their own current and previous UTC month requests in its existing single Needs list and filters. The heading SHALL count the same rows. Home SHALL return only relevant records, at most 100 with continuation when needed; unrelated history SHALL not crowd them out. Failed reads SHALL be unknown. Requesters SHALL see every state. The Requests tab SHALL have a clearly labelled Budget requests section, a current-month default filter and pagination. Lists and Home SHALL remain bounded as history and membership grow.

#### Scenario: An owner deciding for a private goal

- **WHEN** a member attaches their private goal and own session, and an owner reads the request or Home
- **THEN** the owner may decide it but sees no private goal name or id and no session key, while the requester can read their own references; another team's ordinary member gets 404

#### Scenario: Lists stay within the selected month and page

- **WHEN** a person lists requests without a month and follows the returned cursor with limit 50
- **THEN** both pages contain only this month's readable records, each has at most 50 records, no record repeats, and the next-page reference is null on the final page

### Requirement: Screens fit the existing app

Spend SHALL offer team and UTC month controls, budget and burn, authorized budget changes, an honest "No team budget for this month" state and a request form for team members. The team choices SHALL list only readable budgets, ordered by name, matching terminal choices. The form SHALL encourage a readable goal and offer the requester's own shared sessions. Request cards SHALL distinguish waiting, granted with authority, declined, withdrawn and expired; show both decisions; and offer only authorized actions. Approval SHALL collect amount and expiry, decline a required reason. Withdrawal and second look SHALL carry the displayed revision. Home and Requests SHALL link to the same record on Spend with its team and month selected.

The record SHALL name the requested team and state plainly who granted or declined, whether a grant used the allowance, its expiry, or that the request waits, was withdrawn or expired. Status text SHALL not reuse refusal sentences or say "so nothing changes" above an available second look. The filing source SHALL appear in records, lists and Home rows.

The attribution rule SHALL appear once on Spend with no shared workspace footer: goal-bound spend follows the goal's team and spend in no goal follows the home team captured when its spending period opened. Only the reader's own sessions SHALL have budget labels, only when the team has a budget this month. Other people's sessions, including those read by owners, SHALL have no label. Hidden goals SHALL stay unnamed.

Forms SHALL have named labels, required-field semantics, direct English, visible errors, no emoji, internal field names or raw server messages, and fit 390 CSS pixels without overflow. Incomplete amounts SHALL show bounds or unknown and the known unpriced count. No mock, seed or demo data SHALL populate this feature. Blank budget amounts SHALL be refused before sending and never become zero; zero SHALL be accepted only when explicitly typed. Successful requests SHALL clear their form. Every write form SHALL prevent duplicate submissions while pending. Saving a budget or home team or removing a budget SHALL show a specific confirmation surviving reads and reloads while the saved state remains current. Without a budget both amount and remaining SHALL say so. CSV and budget month controls SHALL be independent and preserve each other's selection.

#### Scenario: A phone and an empty team

- **WHEN** a reader opens the team's Spend view at 390 pixels with no budget, usage or requests
- **THEN** the page fits, says those records are absent, shows no invented spend, and exposes only authorized forms

#### Scenario: Required amount, successful request and confirmation

- **WHEN** a person submits a blank budget amount, saves an explicit zero, then files a valid request twice before its first response
- **THEN** the blank amount is refused beside its field without a request, zero can be saved explicitly with a confirmation retained on reload, and only one request is filed with its form cleared on success

### Requirement: Terminal commands and threshold notes

The budget command SHALL report this UTC month's team budget and burn, with estimate bounds and unknown counts, for the folder goal's team, an explicit team, or the sole current team. Folder rules SHALL supply workspace and goal defaults; normal workspace selection SHALL still apply. An ambiguous team SHALL never be guessed: eligible teams SHALL be listed by name and the person asked to choose. Successful reads SHALL list those choices and refresh this device's cached figure for that team and its matching snapshots. The request command SHALL file under the same rules, defaulting to the folder goal and accepting optional goal, team and own-session references. Terminal commands SHALL never decide requests. Errors SHALL be mapped to plain sentences, never printed from server messages verbatim. No raw identifier, stored state, raw timestamp or bare numeric month SHALL appear in these messages. Dates SHALL use a readable month and UTC read time. The word "read" SHALL describe the time a figure was computed throughout the feature.

A shared session SHALL receive one informational note at each of 80 and 100 percent of its effective team budget per UTC month. A leap past both SHALL permit both at once. Delivery markers SHALL survive hooks, sync and restarts and SHALL not reset on budget or team changes. A priced known lower bound SHALL cross a threshold; an unpriced request alone, unknown amount, absent budget, private session or unreadable team SHALL not. A crossing observed while fresh SHALL remain due however long the pause within that month and team. A confirmed new spending period in the same team SHALL retain it; an unconfirmed mismatch SHALL not deliver it. Temporary failures and rejected figures SHALL preserve observations and pending crossings. Once a newer accepted read shows a removed budget or changed effective amount, no note SHALL come from a figure read before that change.

Each model-context line SHALL start with the Align marker, name the team and threshold, label list-price estimates, state when the figure was read, say work continues, grant no authority and say the person can ask for more in Align. It SHALL contain no command or instruction. The separate person-only message SHALL address the person directly and may name Spend and the terminal request command. A claimed person-only message SHALL be returned even without other context or notices. No note SHALL repeat an unpriced count or imply acknowledgement, approval, a hold or a stop.

The session budget read SHALL answer only the person who owns the session and its sharing device; any other reader SHALL get 404. Hooks SHALL answer only from local snapshots and delivery files, with no network, credential read, network-client import, directory scan, sync wait or lock wait. Snapshots SHALL live outside goal feeds and match the workspace, session and spending period. The existing 150 millisecond p95 whole-hook latency limit SHALL apply both after delivery and with a set budget below 80 percent, when every turn reads its snapshot. Both cases SHALL use the same busy-machine allowance as the existing limit: the limit grows by the factor a bare Node start slowed by against 60 milliseconds at p95, a run with a bare start over 160 milliseconds is skipped and never passed, and nothing else changes the limit. Server text in any hook note SHALL have control and invisible Unicode characters removed, including tags, zero-width and bidirectional characters, and Align markers neutralized.

Budget work SHALL run last in each sync pass, after directives, stops, holds, usage, activity and steering. It SHALL refresh at most 100 shared sessions with rotation, reuse positive and empty attribution and team-budget reads for at most five minutes while the team change stamp is unchanged, and start at most 120 reads within a two-second time cap. It SHALL stop at either cap without sign-in refresh or another lock wait, save completed work and its position and continue unfinished work next pass. A running session SHALL be described as able to act on a figure up to five minutes old. A new crossing SHALL require a figure read within five minutes. Server-computed times SHALL use the offset in non-secret local files and the shared one-minute tolerance; device-written times SHALL retain strict device-clock checks. Far-future, mismatched or previous-month observations SHALL be rejected. Brief server/device month disagreement SHALL preserve pending notes and allow the server month's delivery.

Responses other than success or not found SHALL preserve snapshots and pending crossings and be remembered for thirty seconds. Cleanup SHALL guard each marker directory separately, including unreadable directories and concurrent file creation. Local budget files SHALL store only fields used by hooks and commands. Stop-sharing and removal SHALL delete session caches but retain delivery markers; sharing again in the same month SHALL not repeat a note. Sign-out and uninstall SHALL remove budget caches and delivery markers. Old-month markers SHALL be pruned with boundary tolerance. With no shares no cursor SHALL be written. No daemon SHALL be added.

Successful terminal reads SHALL print figures before a best-effort update of the selected team's local cache and
matching confirmed snapshots. Local failures SHALL leave the read successful. The update SHALL skip a held sync
lock and make at most one attribution read for the current folder's most recently active shared session. It SHALL
use the same clock validation, field allowlist and current spending-period checks as sync.

#### Scenario: Cleanup and temporary refusal preserve progress

- **WHEN** one marker directory cannot be cleaned and a budget route temporarily refuses a read
- **THEN** other directories and sessions are still processed, previous snapshots and pending crossings remain, and the refused route is not retried during the next thirty seconds

#### Scenario: Share again or sign out

- **WHEN** a session stops sharing and is shared again that month, then the device signs out
- **THEN** its delivered thresholds do not repeat on sharing again and sign-out removes its delivery markers

#### Scenario: A budget pass reaches its time cap

- **WHEN** budget reads consume the pass's two-second allowance before all selected sessions have been refreshed
- **THEN** the pass saves completed observations and its position, starts no further read, and continues unfinished work on the next pass

#### Scenario: Server clock ahead or behind

- **WHEN** the server is seconds or minutes ahead of the device, or the device is ahead with a known offset
- **THEN** a current figure can produce a note using the saved offset, while a figure beyond the tolerance is rejected without erasing a pending crossing

#### Scenario: Different clocks at the month boundary

- **WHEN** the server has entered a new UTC month while the device is briefly still in the previous month
- **THEN** the server month's observed crossing remains pending and can be delivered with local read times checked on the device clock

#### Scenario: Repeated turns and a new month

- **WHEN** a shared session crosses 80 percent, runs more turns, crosses 100, restarts, and runs in the next month
- **THEN** it receives each previous-month threshold only once and may receive each threshold once again against a new month's budget, without any work blocked

#### Scenario: A long pause after a crossing

- **WHEN** a sync pass observes 80 percent and the person next prompts two days later in the same UTC month with the session still counting toward that team
- **THEN** that turn receives the note once, stating when the estimate was read, even if a later spend read falls below 80 percent while the effective budget stays the same; a different month or changed session attribution receives no note from that observation

#### Scenario: A changed amount reaches beyond the rotating batch

- **WHEN** an accepted read changes the effective amount while some snapshots are outside the current batch or have stale attribution (`test/budgets.test.ts`, "an accepted effective amount invalidates older snapshots outside the rotating batch and stale terminal attribution")
- **THEN** older snapshots cannot deliver their pending crossings and new notes wait for confirmed attribution under the current amount

#### Scenario: A terminal read refreshes a changed budget

- **WHEN** the budget is removed or its effective amount changes and the terminal reads the newer figure before the cache expires
- **THEN** the device uses the newer figure and no subsequent note comes from a figure read before that change

#### Scenario: Read a budget from the terminal

- **WHEN** a person runs `align budget` in a folder with a goal team
- **THEN** it displays this month's team budget and list-price spend estimates, bounds and unpriced counts, or says there is no budget, and makes no decision

#### Scenario: File a budget request from the terminal

- **WHEN** a person runs `align budget request --amount 5 --reason "Finish work"` in that folder under an allowance of 5 dollars
- **THEN** the record says it was filed from the terminal, waits for a person, and the terminal says that waiting for a person grants no authority

#### Scenario: Model context and the person's message differ

- **WHEN** a budget threshold is delivered at the next turn
- **THEN** the model receives an informational line without a command and the person receives a separate message saying their work continues and where they can ask for more

#### Scenario: A budget message is the only claimed output

- **WHEN** a hook claims a budget message while there is no other context or notice
- **THEN** its response includes the person-only message and a subsequent hook does not claim it again

#### Scenario: A priced lower bound crosses a threshold

- **WHEN** priced spend reaches 80 percent while another request is unpriced
- **THEN** the next turn receives an informational 80 percent note, with no command, decision or authority


#### Scenario: Local update unavailable after a terminal read

- **WHEN** a terminal budget read succeeds with an unwritable cache or a held sync lock (`test/budget-timing.test.ts`, "the real budget command prints figures and succeeds with locked local caching" and "the real budget command prints figures and succeeds with unwritable local caching")
- **THEN** figures are printed successfully before any local refresh, and a held lock causes no local write or attribution read

### Requirement: Record retention

Budgets, history, requests and both decision rounds SHALL remain for the workspace lifetime. Actors SHALL follow former-member replacement; a terminal request's identifying device reference and name SHALL be removed with its requester identity. Attached session references SHALL disappear on deletion or retention as aggregate totals, with the original attachment count retained. No-goal team aggregates SHALL contain only team, UTC day, billing basis, request and token counts and estimates. Retention SHALL count each request once under its day, model and basis and leave other groups unchanged. Purging a workspace SHALL remove all budget records. Product events SHALL remain content-free with no new event names or properties.

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
SHALL never wait for a lock. A locally opened spending period SHALL receive no mid-turn budget message until its current epoch matches the snapshot.

Spend SHALL state each currently reached threshold with the figure's computation time for authorized budget readers. A selected past month SHALL be named rather than called this month.
Home SHALL show the team's first observed crossing of each threshold this UTC month to current team leads and
workspace owners under Since you last looked's baseline, first-visit, reload, ordering and bounded display rules.
Budget burn SHALL be computed read-only without a write transaction. Only a reached current-month threshold with no
crossing row SHALL open a domain write transaction. Inside it, reads SHALL recheck authorization on a live principal
and recompute budget, grants and spend from current data before recording with a unique workspace, team, month and
threshold key and insert-or-ignore. Returned figures and change stamps SHALL reflect that recomputation and recording.
An absent or zero budget or unknown spend SHALL create no crossing; past months SHALL create none. If the write
transaction cannot start before the existing busy retry bound, the read SHALL still return its computed figures
without recording, allowing a later read to record the crossing. The record SHALL retain its first observation and computation times across later budget changes, removal and repeated
reads, but Home SHALL show no crossing row while the budget is absent, with no goal, person or session references. Crossings SHALL NOT enter Needs or change its count. An absent
budget SHALL cause no new observation, message, row or burn computation. Existing refreshes SHALL suffice without
new polling.

#### Scenario: Concurrent reads record one crossing

- **WHEN** two budget reads observe the same new threshold concurrently (`scripts/test-budgets.mjs`, "concurrent budget reads record one crossing inside a retried transaction")
- **THEN** current authorization, budget, grants and spend are rechecked inside the write transaction, one first
  observation is stored with no decision or audit row, and both reads return figures consistent with the recording

#### Scenario: A budget read contends with another writer

- **WHEN** another connection holds the database write lock (`scripts/test-budgets.mjs`, "reads without a new current-month crossing never begin a write transaction under contention" and "a busy crossing write returns figures and a later read records it")
- **THEN** a read with no new crossing issues no BEGIN IMMEDIATE and succeeds; a read needing a crossing still
  returns figures if the existing busy retry bound is exhausted, leaves the crossing and change stamp untouched,
  and a later read records the crossing once the lock is released

#### Scenario: A locally opened period waits for confirmation

- **WHEN** a tool call sees a pending local epoch and a budget snapshot from the prior epoch (`test/budgets.test.ts`, "mid-turn budget messages wait for the locally opened epoch to be confirmed")
- **THEN** no budget message is delivered or marker consumed until the server snapshot and current local epoch match

#### Scenario: Changed budget in a cached pass

- **WHEN** a budget is set, changed, removed, raised by a grant or reduced by a grant expiring during the reuse window (`test/budgets.test.ts`, "directive stamps invalidate only changed team reads, including removal, without extra attribution or unchanged-pass reads")
- **THEN** the next sync invalidates the old figure within existing read and time caps, and removal leaves no due note

#### Scenario: A long turn reaches a threshold

- **WHEN** sync observes 80 percent during a supported turn and main-session tool calls precede the next prompt (`test/budgets.test.ts`, "tool warnings stay user-only, skip subagents and a busy lock, and share durable delivery limits with prompts")
- **THEN** one tool call shows a user-only warning and the next prompt delivers context once, with neither repeating after restart

#### Scenario: No budget and mixed release versions

- **WHEN** a session's team has no budget or either release predates budget support (`test/budgets.test.ts`, "404 budget routes and unknown additive stamp fields never stop a pass or create a note")
- **THEN** ordinary work and sync continue without new budget notes or rows, and an unchanged cached pass makes zero budget requests

#### Scenario: A lead returns after a crossing

- **WHEN** a lead or workspace owner returns to Home after the team's first observed crossing this month (`scripts/test-v2.mjs`, "budget screens: Since shows crossings and Needs contains no crossing row")
- **THEN** Since you last looked shows it under existing visit rules and Spend states current crossings with computation time, without changing Needs or exposing it to other teams

## Open questions

- Budget exposure through read-only MCP remains outside this feature.

## Sources

- `lib/v2/budgets.ts`
- `lib/v2/spend.ts`
- `lib/v2/spend-home.ts`
- `lib/v2/spend-month.ts`
- `lib/v2/spend-export.ts`
- `lib/v2/sessions.ts`
- `lib/v2/db.ts`
- `lib/v2/core.mts`
- `lib/v2/retention-core.mts`
- `lib/v2/policy.ts`
- `lib/v2/home.ts`
- `app/app/w/[ws]/spend/budgets.tsx`
- `app/app/w/[ws]/spend/view.tsx`
- `app/app/_ui/home/needs.ts`
- `app/app/_ui/home/since.tsx`
- `packages/align-agent/src/budgets.ts`
- `packages/align-agent/src/shared/budget-notes.ts`
- `packages/align-agent/src/shared/clock.ts`
- `packages/align-agent/src/shared/envelope.ts`
- `packages/align-agent/src/hooks/handlers.ts`
- `packages/align-agent/src/api.ts`
- `packages/align-agent/src/sync.ts`
- `scripts/test-budgets.mjs`
- `scripts/test-v2.mjs`
- `scripts/test-agent-live.mjs`
- `packages/align-agent/test/budgets.test.ts`
- `packages/align-agent/test/budget-timing.test.ts`
- `packages/align-agent/test/serial/latency.test.ts`
- `app/api/v2/workspaces/[ws]/sessions/[key]/budget/route.ts`
- `app/api/v2/workspaces/[ws]/budget-requests/route.ts`
- `app/api/v2/workspaces/[ws]/budget-requests/[id]/route.ts`
- `app/api/v2/workspaces/[ws]/budget-requests/[id]/[action]/route.ts`
- `app/api/v2/workspaces/[ws]/teams/[team]/budget-requests/route.ts`
- `app/api/v2/workspaces/[ws]/teams/[team]/budget/route.ts`
- `app/api/v2/workspaces/[ws]/spend/teams/route.ts`
- `app/api/v2/workspaces/[ws]/spend/home-team/route.ts`
