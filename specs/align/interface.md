---
name: Interface
summary: The screens people use in Align, what each role can see and do on them, and which endpoint each action calls.
kind: area
---

# Interface

Align's web interface is a single-page app that reads one filtered state document and polls it.
It serves two kinds of scenario through the same components:

- **Northstar**: the frozen demo company "Northstar Security", with fixed people (CEO / Leadership,
  Product Director, Alex / Security Lead), Sparta sandbox runs, an Alike brief and a live agent pane.
- **Custom**: a scenario that leadership set up at `/setup` (shown at `/`), or a separate workspace
  created at `/new` (shown at `/w/<id>`). Team and person names come from the setup. Custom
  scenarios have no generated options and no live agent. They have no sandbox unless runs exist, so
  every screen labels the plan "Not sandbox-tested".

Three roles sign in: `leadership` (owns the company goal), `product` (the asking team, which
proposes) and `security` (the owning team, which edits, approves or declines changes to its own
goal). Screens show only the controls the server accepts from the viewer's role in the proposal's
current state.

| Route | Screen | Who uses it | Purpose |
| --- | --- | --- | --- |
| `/` | Align app (sign-in, then the shell) | All three roles | The Northstar demo, or the scenario set up at `/setup` |
| `/w/<id>` | Workspace app (sign-in, then the shell) | All three roles of that workspace | A custom workspace created at `/new` |
| `/setup` | Set up your own conflict | Leadership of the demo store (local only) | Replace the demo store with a custom two-team scenario |
| `/new` | Create a workspace | Anyone (signup code if required) | Create a separate workspace and get its three passcodes |
| `/oauth/authorize` | Connect <app> to Align | A person connecting an AI app | Grant an AI app read-only access to one workspace as one role |
| (any) | Error page | Anyone | Plain error with Try again |

Views inside the shell (client state, no URL change):

| View | Nav label | Who | Purpose |
| --- | --- | --- | --- |
| Your turn | Your turn | All | Landing view: what waits on you, on others, and what changed |
| Company goal | Company goal | Leadership only | Approve and send the company goal (Northstar); decide the launch (custom) |
| Goals | Goals | All | Company goal, two team goals and the dependency between them |
| Scenario Studio | Scenario Studio | All (Northstar only in the nav) | Compare recorded baseline and candidate sandbox runs |
| Evidence | (via Scenario Studio, Inspector, plan test) | All (sandbox scenarios) | Decision chain, Sparta runs, audit log, timer |
| Decisions | Decisions | All | Open, accepted and declined proposals; opens the record |
| Decision / Next decision | (via Decisions, Goals, Your turn) | All | Next decision, or the decision record once agreed |
| Work | Work | All | Work still on the old plan, goal cascade, AI-session lanes (Northstar) |
| Proposals | (via Your turn, + New conflict, Goals) | All | Inbox, composer and review thread |
| Inspector | Right rail | All | Details of the selected goal, dependency, work item, run or proposal |
| Agent pane | Right rail on the Northstar decision view | All | Live status of Security's AI agent |
| Ways forward | Drawer (Northstar) | All | The brief: ranked options, disconfirmers, cited evidence |
| Which plan follows the new priority? | Drawer (Northstar) | All | Side-by-side plan test; attach results to a proposal |
| Agents on this plan / Connect an AI app | Sidebar card in `/w/<id>` | All | Connected AI apps and how to connect one |

Navigation: the left sidebar holds the Align mark, the **+ New conflict** control (custom only), the
main nav (Your turn, Company goal for leadership, Goals, Scenario Studio in Northstar only,
Decisions, Work), a Northstar **Connected** card (Sparta run count, Alike status), the
workspace's **Agents on this plan** card (`/w/<id>` only) and the signed-in person. The header shows
the company and timeframe, a status badge, reset controls, the person, **Switch team ▾** (custom) and
**Sign out**. A nav item stays highlighted for its sub-views (Your turn for Proposals, Goals for the
team view, Scenario Studio for Evidence, Decisions for the record). Opening any view closes an open
drawer. On a hosted server (`HOSTED=1`), `/` and `/setup` redirect to `/new`, and only `/new`,
`/w/<id>`, the OAuth pages and their APIs exist.

### Requirement: Northstar sign-in

The Align app at `/` SHALL show a sign-in form with three role cards and a passcode field when no
one is signed in, and SHALL sign in with `POST /api/session` carrying the chosen role and passcode.

#### Scenario: Sign in to the demo

- **WHEN** a signed-out person opens `/`, picks the "Alex / Security Lead" card under "I am", types a passcode and presses **Sign in**
- **THEN** the app posts `{role, passcode}` to `POST /api/session`, shows "Signing in…" while busy, and on success loads the shell on the Your turn view

#### Scenario: Wrong passcode

- **WHEN** the passcode is rejected
- **THEN** the form stays open and shows the server's error message in red; the **Sign in** button stays disabled while the passcode field is empty

### Requirement: Workspace sign-in

The workspace app at `/w/<id>` SHALL load the company and team names from
`GET /api/workspaces/<id>/login-info`, show one card per team under "Sign in as", and sign in with
`POST /api/session` carrying role, passcode and workspace.

#### Scenario: Returning tester

- **WHEN** a person who last signed in to this workspace as the security team in this browser opens `/w/<id>`
- **THEN** that team's card is preselected (remembered per workspace in local storage), the passcode field has **Show**/**Hide**, the submit button reads "Sign in as <team>", and the hint "Testing alone? Sign in as any team, then use Switch team." is shown

#### Scenario: Workspace gone or unreachable

- **WHEN** the login-info request returns 404, or fails in any other way
- **THEN** a 404 shows "This workspace no longer exists."; any other failure shows a "Couldn’t reach this workspace…" message (a test-server wording when hosted) with a **Try again** button that repeats the request

### Requirement: One session per browser

The app SHALL never render or write as a team or workspace other than the one the tab loaded with,
and SHALL say so when the browser's session changes underneath it.

#### Scenario: Signed in elsewhere

- **WHEN** the browser holds a session for another workspace (or for the demo, on a `/w/<id>` page) and the person opens a sign-in screen
- **THEN** the sign-in form shows "This browser is signed in to another workspace. Open that workspace. A browser holds one workspace session at a time." (or the demo wording) above the role cards

#### Scenario: Another tab switched team

- **WHEN** another tab signs the same browser in as a different team of the same workspace
- **THEN** this tab stops polling and shows "You signed in as <new> in another tab. This tab was <old>. Nothing was sent from this tab. A browser holds one session at a time." with a **Continue as <new>** button

#### Scenario: Session expired

- **WHEN** any request returns 401 with "Your session ended. Sign in again."
- **THEN** the view is cleared and the sign-in screen is shown; the workspace sign-in shows that sentence as its error

### Requirement: Loading and connection states

The app SHALL show plain loading and error states instead of an empty or stuck screen.

#### Scenario: Server unreachable before sign-in is known

- **WHEN** `GET /api/session` fails for a reason other than an ended session
- **THEN** the page shows "Couldn’t reach Align: <message>" with **Try again**; while it is pending the page shows "Loading Align…"

#### Scenario: Lost connection while signed in

- **WHEN** a later `GET /api/state` poll fails
- **THEN** an amber banner shows "▲ Lost connection to the server (<message>). Showing the last update; reconnecting automatically." above the last state, which stays on screen

#### Scenario: Action error

- **WHEN** a write returns an error
- **THEN** a red banner shows the server's message (custom scenarios replace a bare "HTTP <status>" with "Something went wrong. Please try again.") and it clears itself after 6 seconds

### Requirement: Live updates

The app SHALL keep every screen current by polling `GET /api/state` every 1.5 seconds and whenever
the tab becomes visible, and SHALL refresh state immediately after each successful write.

#### Scenario: The other owner acts

- **WHEN** Security approves a proposal in another browser
- **THEN** within one poll the Product window's Your turn, Goals, Decisions and Proposals views show the new state without a reload

#### Scenario: Guarded write

- **WHEN** a person presses any action button
- **THEN** the app first re-reads `GET /api/session`, sends the write only if the same team and workspace are still signed in, attaches the `x-align-workspace` header, and on a `workspace_mismatch` 409 stops showing the workspace and explains which one the browser is signed in to

### Requirement: Shell navigation and badges

The shell SHALL land each newly signed-in role on Your turn and SHALL show nav items and count
badges according to role and scenario.

#### Scenario: Leadership nav

- **WHEN** leadership signs in
- **THEN** the nav shows Your turn, Company goal, Goals, Scenario Studio (Northstar only; custom scenarios leave it out), Decisions and Work; other roles do not see Company goal

#### Scenario: Count badges

- **WHEN** items are waiting on the viewer or the dependency is unresolved
- **THEN** Your turn shows the number of waiting items (the same list the view renders) and Goals shows 1 while the dependency's status is `UNKNOWN`

### Requirement: Header status and company goal strip

The shell SHALL show, for product and security, a company goal strip with the company goal, the new
requirement and the viewer's own goal, and a header badge that states whether the two teams have
agreed.

#### Scenario: Northstar conflict open

- **WHEN** the CEO's goal has been pushed and the dependency is `UNKNOWN`, and Product or Security is signed in
- **THEN** the header shows the amber button "▲ New company goal from the CEO · Product and Security haven’t agreed yet", which records `ceo_change_viewed` via `POST /api/timer`, selects the CEO goal and opens Goals

#### Scenario: Agreement reached

- **WHEN** the dependency is `ACCEPTED`
- **THEN** the header shows "Company goal <version> · Product and Security agreed" (Northstar) or "<asking> and <owning>: agreed, launch pending" / "agreed, launch approved" (custom), and the strip's status line reads the same

### Requirement: New conflict control

In custom scenarios the sidebar SHALL show **+ New conflict** with role-dependent behavior, and it
SHALL be hidden entirely in Northstar.

#### Scenario: Asking team with nothing open

- **WHEN** the product role presses **+ New conflict** and no proposal is open
- **THEN** the Proposals view opens with the composer

#### Scenario: Not allowed

- **WHEN** the owning team views the sidebar, or a proposal is already open
- **THEN** the button is disabled with "Only <asking team> proposes a change. You review it here when it arrives." or "A proposal is already open. Finish it first."; for leadership it is a link to `/new` (workspace) or `/setup` (scenario at `/`)

### Requirement: Switch team, sign out and reset

The header SHALL let a person sign out, let a solo tester switch team in custom scenarios without
bypassing passcodes, and let leadership restart a scenario after a confirming second click.

#### Scenario: Switch team

- **WHEN** a person in a custom scenario chooses another team from **Switch team ▾**
- **THEN** the app calls `DELETE /api/session` and opens the sign-in screen with that team preselected; its passcode is still required

#### Scenario: Restart

- **WHEN** workspace leadership presses **Restart this scenario** and then "Click again to restart this scenario" within 4 seconds
- **THEN** the app calls `POST /api/reset` with `{"confirm":"reset"}`, clears selection and attached test results and returns to Your turn; in Northstar the same control reads **Start the demo over** and appears only with `?ops` in the URL

### Requirement: Your turn view

The Your turn view SHALL list what waits on the signed-in role, each card quoting the exact measure
text and offering one action, using the same next-actor rules the server enforces.

#### Scenario: Owner has a proposal to review

- **WHEN** a proposal is `PENDING_SECURITY` and Security is signed in
- **THEN** "Waiting on you" shows "<proposer> asks to change your goal" with the proposed text and **Review the proposal**, which opens Proposals; `COUNTERED` shows **Review the changes** to Product and `ACKNOWLEDGED_BY_PRODUCT` shows **Review and approve** to Security

#### Scenario: Product can propose

- **WHEN** Product is signed in, the dependency is `UNKNOWN` and no proposal is open
- **THEN** a card "The new company requirement needs <owning team> to change its goal" offers **Propose a change**, which opens the composer; after a decline its subtitle says "<owner> declined your last proposal."

#### Scenario: Leadership items

- **WHEN** leadership is signed in
- **THEN** Northstar shows "The next company goal is ready. Approve it and send it to every team" with **Review and send** while a draft exists, and custom shows "<asking> and <owning> agreed. The launch decision is yours" with **Decide the launch** until the launch is approved; both open Company goal

### Requirement: Your turn context sections

The Your turn view SHALL also show what waits on others and what changed, and SHALL start the
time-to-agreement clock when it is shown while the company change is unresolved.

#### Scenario: Waiting on others

- **WHEN** an open proposal's next actor is someone else
- **THEN** a "Waiting on others" card such as "<person> reviews the proposal" with **Open** is shown; with nothing waiting on the viewer the view says "Nothing is waiting on you."

#### Scenario: Clock starts on landing

- **WHEN** the view renders while the company requirement exists, the dependency is `UNKNOWN` and the timer has not started
- **THEN** the app records `ceo_change_viewed` via `POST /api/timer`, and the "Changed today" (or "What changed") section shows the requirement with a status badge and **See goals**, plus a "See the decision" card once agreed

### Requirement: Goals view

The Goals view SHALL show the company goal node, both team goal nodes with their measures and top
work items, and the dependency node between them, with a lens and one next step for the selected
node.

#### Scenario: Unresolved dependency

- **WHEN** no proposal exists and the dependency is `UNKNOWN`
- **THEN** the dependency node is amber with "Unknown" and "select to see why", the owning team's conflicting measure carries "Clashes with the CEO's new requirement" (custom: "In conflict"), and the strip offers **See ways forward** (Northstar, opens the brief drawer) or **Open proposals** / **See proposals** (custom)

#### Scenario: Lens

- **WHEN** a person picks a team in the "Lens" control (Everything / <asking> / <owning>)
- **THEN** the other team's node and connector dim and that team's goal is selected in the Inspector

#### Scenario: Agreement reached

- **WHEN** an acceptance exists
- **THEN** the dependency shows the agreed status, the strip offers **Open record** (Northstar), the summary ProofStrip appears below, and the app records `saw_accepted_version` once via `POST /api/timer`

### Requirement: Ways forward drawer

The Ways forward drawer (Northstar brief, opened from Goals, the Inspector or the decision view)
SHALL present ranked options as suggestions and let only Product propose.

#### Scenario: Product proposes P0

- **WHEN** Product opens the drawer, keeps P0 selected and presses "Propose P0 to Alex / Security Lead"
- **THEN** the drawer closes and Proposals opens; the propose button is disabled for P1 and P2, and other roles see a disabled "Only Product can propose"

#### Scenario: Brief content

- **WHEN** the drawer opens
- **THEN** it records `brief_reviewed` once, shows "Work completed ≠ Goal achieved", the ranked options with owner and "time available" chips, collapsible "What could prove this wrong" and "Cited evidence" (with the Alike decision, or "Pending"/"Not available"), a **Test in Scenario Studio** button, and closes on Escape or **Close** (**← Goals** when opened from Goals)

### Requirement: Scenario Studio

Scenario Studio SHALL compare only sandbox runs already recorded in state (latest baseline of the
current plan against the latest normal or outage-test run of the new plan) and never start a run.

#### Scenario: Comparable runs exist

- **WHEN** the view opens with recorded baseline and candidate runs
- **THEN** it records `scenario_reviewed`, loads run details from `GET /api/evidence/<id>`, shows one result card per run with verdict, checks passed and which tickets changed, and warns "These runs didn't use the same tickets and checks, so they can't be compared" if mission, seed or checks differ

#### Scenario: Attach to proposal

- **WHEN** Product presses **Attach to proposal** while no proposal is open
- **THEN** the new plan and the baseline, candidate and outage-test run ids are attached and Proposals opens; the button is absent for other roles or while a proposal is open, and **Run details** opens Evidence on the chosen run

#### Scenario: No sandbox

- **WHEN** a custom scenario without sandbox runs is open
- **THEN** Scenario Studio is not in the nav (custom scenarios never list it), and if shown it states "No sandbox in this scenario" and "Not sandbox-tested"

### Requirement: Plan test drawer

The "Which plan follows the new priority?" drawer SHALL show the current and new plan side by side
with their checks, the protected ticket and the agent's steps, and let only Product add the results
to a proposal.

#### Scenario: Product adds passing results

- **WHEN** Product presses **Add test results to the proposal** after the new plan passed
- **THEN** the plan and the attached run ids are kept (surviving a reload in session storage), the drawer closes and the Proposals composer opens

#### Scenario: Results not ready

- **WHEN** a run is missing or the runs used different tickets or checks
- **THEN** the drawer shows "Can't compare yet" or "Not a fair comparison"; a missing run's column shows "Not run yet"; a failing candidate's button reads "Add anyway (not tested: the new plan didn't pass)"; non-Product roles see the button disabled with "Only the Product Director can add test results to a proposal."

### Requirement: Evidence view

The Evidence view SHALL show the authority strip, the decision chain, every Sparta run, the audit
log and the timer, keeping backend ids and commands inside closed "For engineers" sections.

#### Scenario: Open a run

- **WHEN** a person opens Evidence from **See full results in Evidence**, **Run details** or the Inspector's **Open Evidence**
- **THEN** the app records `evidence_opened`, expands and scrolls to the selected run, and loads its checks, changed and off-limits tickets and step-by-step agent trace from `GET /api/evidence/<id>`

#### Scenario: No runs

- **WHEN** no runs have been ingested
- **THEN** the runs section shows "No test runs yet." with an explanation and the run commands under "For engineers"

### Requirement: Proposal composer

The Proposals view SHALL let only Product compose a proposal, only while no proposal is open, and
send it with `POST /api/proposals`.

#### Scenario: Send a tested proposal

- **WHEN** Product fills "New target for <owning team>" (up to 300 characters), "Why" and "What <asking team> will do in return" and presses "Send proposal to <owner>"
- **THEN** the app posts the measure text, rationale, reciprocal commitment, plan id, plan version and attached run ids to `POST /api/proposals`, clears the attachment and selects the new proposal

#### Scenario: Missing fields or tests

- **WHEN** the new target or the commitment is empty, or (Northstar) no test results are attached
- **THEN** the send button is disabled with "▲ Write the new target" / "▲ Say what <team> will do in return"; without attachments an amber "No test results added" card warns the proposal will show as not tested and offers **Test which plan follows the new priority**

#### Scenario: Defaults

- **WHEN** the composer opens in Northstar
- **THEN** the target, why and return fields are pre-filled with the demo text; in custom scenarios they start empty and "The plan" section shows the setup's plan with "Not sandbox-tested"

### Requirement: Proposal inbox and review thread

The Proposals view SHALL list every proposal newest first with state and test badges, and show the
selected proposal as a conversation: the proposal, each counter, Product's acknowledgment, and the
approval or decline.

#### Scenario: Reading a counter

- **WHEN** Security asked for changes that only appended text to the target
- **THEN** the counter bubble shows only the added words highlighted; a counter that changes the plan carries "Changes how the agent works: needs a new test" (Northstar), and custom conditions show with "Not confirmed yet"

#### Scenario: Empty inbox

- **WHEN** no proposals exist and the viewer is not Product
- **THEN** the view shows "No proposals to your goal yet." with an explanation of where proposals appear

### Requirement: Owner decision on a proposal

The review SHALL give only the owning team, and only in `PENDING_SECURITY` or
`ACKNOWLEDGED_BY_PRODUCT`, a "Your decision" section with Accept, Accept if… (custom only), Counter
and Decline.

#### Scenario: Approve

- **WHEN** Security picks **Accept**, fills "Why you're approving" and presses **Approve the change to my goal**
- **THEN** the app calls `POST /api/proposals/<id>/accept` with the rationale; the thread then shows the approval with the new goal version and the old version "kept as superseded"

#### Scenario: Approve untested or stale

- **WHEN** the proposal is `STALE`, or a custom proposal is not `TESTED`
- **THEN** the approve button stays disabled until the person ticks the acknowledgement ("…I'm approving it without a passing test" / "I'm approving this plan without a sandbox test"), and the request carries `accept_untested: true`

#### Scenario: Counter, accept if, decline

- **WHEN** Security sends **Ask for changes**, **Send my conditions to <asking team>** or **Decline this proposal**
- **THEN** the app calls `POST /api/proposals/<id>/counter` (with revised text, why, and either `changes_plan` in Northstar or optional `conditions` in custom, up to 1000 characters) or `POST /api/proposals/<id>/reject`

### Requirement: Asking team's actions on a proposal

The review SHALL let Product accept the owner's changes while `COUNTERED`, and otherwise show Product
that it is waiting, with a harmless way to show that only the owner can approve.

#### Scenario: Accept the changes

- **WHEN** Product presses "Accept Security's changes and confirm what Product will do" (custom: "Accept <owning>’s changes and confirm what <asking> will do")
- **THEN** the app calls `POST /api/proposals/<id>/acknowledge` and the proposal moves to waiting for the owner's final approval

#### Scenario: Try to approve as non-owner

- **WHEN** Product presses "Try to approve (only <owning team> can)" while waiting
- **THEN** the app re-checks `GET /api/session`, calls `POST /api/proposals/<id>/accept` directly without refreshing state, and on 403 shows "Handed back: only <owning team> can approve this"; a stale tab shows "This tab is out of date…" and sends nothing

### Requirement: Next-step guidance

In custom scenarios the app SHALL show where a proposal stands and, after a hand-off, who acts next,
with a one-click switch for a solo tester; Northstar shows neither.

#### Scenario: Progress strip

- **WHEN** a custom proposal is open in the review
- **THEN** a strip shows Proposed, Reviews (or Asked for changes), Accepts the changes (only after a counter), Approves and Decides the launch, each marked done, NOW / YOU, NOW, NEXT or stopped (Declined)

#### Scenario: Hand-off line

- **WHEN** Product has sent a proposal (`PENDING_SECURITY`), Security has countered (`COUNTERED`) or Product has acknowledged (`ACKNOWLEDGED_BY_PRODUCT`)
- **THEN** the actor who just handed off sees "Next: <person> reviews this" / "reviews your changes" / "gives the final approval" with an **Act as <team> →** button that runs Switch team; the actor who acts next sees no such line

### Requirement: Decisions list

The Decisions view SHALL list open proposals, acceptances and declined proposals newest first, with
All / Open / Accepted / Declined filters.

#### Scenario: Open a decision

- **WHEN** a person presses an accepted row ("<owning>’s goal <version>", "Agreement reached" in Northstar or the agreement status in custom)
- **THEN** the decision record opens; an open or declined row opens that proposal in Proposals, and an empty list shows "Nothing here yet."

### Requirement: Next decision view

Before agreement, the decision view SHALL state the conflict and who owns it, and offer the asking
team the step to propose.

#### Scenario: Northstar open decision

- **WHEN** Product opens the decision view with the dependency unresolved and no proposal
- **THEN** it shows "Your company's priorities changed. Your agent's plan didn't.", the "Current plan · running now" and "Tested alternative" cards with checks passed and the critical ticket outcome, **Review the conflict with Security**, and "Propose the tested change →" (attaches the runs and opens Proposals) or "Propose the change (not tested yet) →"; Security sees "Product hasn't proposed it yet. When they do, you decide here."

#### Scenario: Proposal in progress

- **WHEN** a proposal is open
- **THEN** the view shows a role-specific title, both sides' text, the latest changes from the owner, and **Review and decide →** when it is the viewer's turn or "Nothing for you to do until <team> responds." otherwise

### Requirement: Decision record

Once the dependency is accepted, the decision view SHALL show the decision record with Summary,
Activity and How to read this tabs.

#### Scenario: Summary tab

- **WHEN** a person opens the record
- **THEN** it shows one status pill ("Agreement reached" in Northstar; "Agreed, launch pending" or "Agreed, launch approved" in custom, amber while conditions exist), the columns Approved / Only proposed / Never tested, who decided, the measured time, **Copy text**, **← Decisions** and "See work still on the old plan (<n>)"

#### Scenario: Activity tab

- **WHEN** a person picks **Activity**
- **THEN** the record shows the audit log ("Names come from who was signed in, never from the request"), the sandbox runs (or "No sandbox runs in this scenario") and the coordination timer with its touchpoints

### Requirement: Company goal screen

The Company goal screen SHALL show the current company goal with new and changed measures marked, and
in Northstar SHALL let only leadership approve and send a drafted next version.

#### Scenario: Approve and send

- **WHEN** leadership edits the draft's goal text and presses **Approve and send to teams**
- **THEN** the app calls `POST /api/org/push` with the objective, measures and success criteria, and the screen then shows "Last sent to teams" with **See where AI agent work is going** and **See how the goals connect**

#### Scenario: Nothing to approve

- **WHEN** no draft exists and a goal was already pushed
- **THEN** the screen says "Nothing to approve: company goal <version> was already sent…" and points to `?ops` / **Start the demo over**

### Requirement: Launch decision

In custom scenarios the Company goal screen SHALL show leadership the teams' decision record and let
leadership approve the launch or say not yet; before agreement it SHALL say there is nothing to do.

#### Scenario: Approve the launch

- **WHEN** leadership adds an optional note (up to 500 characters) and presses **Approve launch**
- **THEN** the app calls `POST /api/proposals/<id>/launch` with `decision: "approved"`; if the plan is not tested the button stays disabled until "I'm launching a plan that was not sandbox-tested" is ticked and the request carries `accept_untested`

#### Scenario: Change the decision

- **WHEN** a launch decision already exists
- **THEN** only the other choice is offered (**Change to not yet** or **Approve launch**) under "Change the launch decision", and every agreement status in the app follows the result

### Requirement: Work screen

The Work screen SHALL show work still on the old plan, the goal cascade and, in Northstar only, the
AI coding sessions grouped by the goal each one seems to serve.

#### Scenario: Old-plan nudge

- **WHEN** an approval exists and some linked work items were not re-planned
- **THEN** each is marked "still on the old measure", "Keep, re-scope or stop, per item" is labelled as coming next, and **Copy a nudge for the owner** copies a summary (with a selectable fallback if copying is blocked); before any approval it says "No approved decision yet, so nothing to move."

#### Scenario: Confirm a session link

- **WHEN** a session's suggested link points at the signed-in role's own goal and the person presses **Confirm link** or **Not this goal**
- **THEN** the app calls `POST /api/mappings/<session_id>/confirm` or `/reject`; the lanes poll `GET /api/mappings` every 3 seconds and show "Goals changed — re-checking which goal each session serves…" while re-matching

### Requirement: Inspector

The right-rail Inspector SHALL show details of the current selection (goal, dependency, work item,
run or proposal), defaulting to the dependency, with role-aware wording and actions.

#### Scenario: Peer goal selected

- **WHEN** Product selects Security's goal
- **THEN** the Inspector shows owner, version (earlier version "kept for the record"), "Who can edit" as "Security's goal · view only", the measures, unknowns Product cannot see, "Busy isn't the same as on-goal" and **Propose a change to Security's goal**

#### Scenario: Missing selection

- **WHEN** the selected item no longer exists or is filtered from the viewer
- **THEN** the Inspector shows "Unknown" and "<This item> wasn't found, or you can't see it."

### Requirement: Live agent pane

In Northstar the right rail of the decision view SHALL show "Live · Security's AI agent", subscribed
to `GET /api/directives/stream?session=*` over server-sent events.

#### Scenario: Agent woken by approval

- **WHEN** an authority event is pushed and the captured agent session receives and acts on it
- **THEN** the pane shows "Connected to Align's live feed", a timeline entry "Woken by: Security approved its goal <version>" with received and acted times, the following run's checks and critical-ticket status, and live feed lines such as "Align → … · pushed to 1 running agent"

#### Scenario: No agent

- **WHEN** no matching Claude Code session was captured
- **THEN** the pane shows "No agent connected" and "Start the agent to see it here"

### Requirement: Connect AI apps

In a workspace (`/w/<id>`) the sidebar SHALL show "Agents on this plan" and a **Connect an AI app**
dialog backed by `GET /api/workspaces/connections`.

#### Scenario: Connect and see the app

- **WHEN** a person opens the dialog, picks a tab (Claude Code, Codex, Claude app, ChatGPT) and follows its steps
- **THEN** the dialog shows the MCP URL or command with **Copy**, polls every 3 seconds while open (15 seconds while closed), and once the app has read the workspace lists it as "<app> is connected as <team>" with a suggested first question

#### Scenario: Disconnect

- **WHEN** a person presses **Disconnect** on an app connected as their own team, or leadership presses **Disconnect all**
- **THEN** the app calls `DELETE /api/workspaces/connections` (with the app id, or none for all); apps that have not read since the plan changed show "▲ Hasn’t read the plan since it changed…"

### Requirement: Setup page

The `/setup` page SHALL let only the demo store's leadership replace that store with a custom
scenario, after an explicit confirmation, via `POST /api/scenario`.

#### Scenario: Save a scenario

- **WHEN** leadership fills the six steps (Company, The priority that changed, Who’s changing the priority, Whose plan has to change, Work already running on the old plan, The proposed plan) and presses **Save this scenario** then **Yes, replace and save**
- **THEN** the app posts the form with `confirm: "replace"` to `POST /api/scenario` and shows "Scenario ready: <company>" with **Open the scenario**; a 400 marks fields and shows "Some fields need fixing. They are marked below."

#### Scenario: Wrong session

- **WHEN** the visitor is not leadership, or is signed in to a custom workspace
- **THEN** the page shows "Only leadership can set up a new scenario…" or "This page sets up the demo workspace, and this browser is signed in to another workspace." with an **Open that workspace** link, and no form

### Requirement: New workspace page

The `/new` page SHALL create a separate workspace with `POST /api/workspaces` without signing anyone
in, and show its link and three passcodes exactly once.

#### Scenario: Create a workspace

- **WHEN** a person fills the form (and a signup code when `GET /api/workspaces/config` requires one) and presses **Create the workspace**
- **THEN** on 201 the page shows "Workspace ready: <name>", the workspace link with **Copy link**, one passcode per team with **Copy**, the warning "Save these passcodes now. They won’t be shown again.", and enables **Open the workspace in a new tab** only after "I’ve saved all three passcodes somewhere I can find them." is ticked

#### Scenario: Refusals

- **WHEN** the server is at its workspace limit, or creation fails
- **THEN** the page shows "This server already has as many workspaces as it allows…", or field marks (400), "Check the signup code." (403), a too-long message (413), or "Open this page on the machine running Align…" (421)

#### Scenario: Test server notice

- **WHEN** the server runs hosted
- **THEN** every form state shows the notice "Liminal Align is an early-testing product running on a test server." with the deletion date

### Requirement: Intake interview

When the server enables it, the `/new` page SHALL offer an AI interview that fills the form through
`POST /api/workspaces/interview` and never overwrites a person's own edits.

#### Scenario: Talk it through

- **WHEN** a person presses **Start the interview** and sends an answer (typed, or by **Talk** where speech recognition exists)
- **THEN** the app posts the conversation to `POST /api/workspaces/interview`, shows the reply, fills only empty fields or fields it filled itself, updates "Draft so far (<n> of 9)" and the one-sentence read-back, and folds the form into "Review & edit the form", which opens when the interview says it is done

#### Scenario: Interviewer fails

- **WHEN** the request fails
- **THEN** the message is returned to the input and the panel shows "The interviewer didn't answer. Try again, or fill in the form below." (or "Enter your signup code above first, then try again." on 403)

### Requirement: OAuth consent page

The `/oauth/authorize` page SHALL let a person grant an AI app read-only access to one workspace as
one role, and SHALL refuse requests it cannot trust without redirecting.

#### Scenario: Allow with the browser's session

- **WHEN** the browser is signed in to a workspace and the person keeps "<company>, as <team>. You’re signed in to it in this browser." and presses **Allow read-only access**
- **THEN** the page posts `{params, decision: "approve", use_session: true}` to `POST /api/oauth/approve` and follows the returned redirect to the app

#### Scenario: Allow with a passcode

- **WHEN** the person chooses "Another workspace or team", pastes a workspace link, picks a team under "Connect as" and enters "That team’s passcode"
- **THEN** the page looks the workspace up with `GET /api/workspaces/<id>/login-info` and on Allow posts workspace, role and passcode; an unknown link shows "No workspace has that link…" and **Cancel** posts `decision: "deny"`

#### Scenario: Untrusted request

- **WHEN** the app or redirect fails the server check, or the network is rate limited
- **THEN** the page shows "Can’t connect this app" with the reason, or "Return to the app" for a redirectable error, and offers no Allow button

### Requirement: Error pages

The app SHALL show a plain error page for any render error, without the error message or stack.

#### Scenario: Render error

- **WHEN** a page under the root layout throws while rendering
- **THEN** the page shows "Something went wrong on this page." with **Try again** and, for a server error, "Reference: <digest>"; with JavaScript off the page shows "Align needs JavaScript. Turn it on and reload this page."

### Requirement: Honest status wording

Every screen SHALL use the plain status labels and never present agreement or a sandbox pass as
proof of success.

#### Scenario: Status labels

- **WHEN** a code such as `PENDING_SECURITY`, `COUNTERED`, `RATIFIED`, `STALE` or `UNKNOWN` is shown
- **THEN** it reads "Waiting for Security", "Security asked for changes", "Approved" (custom: "Agreed, launch pending"), "Needs retest", "Unknown"; green is used only for passing sandbox results, and records state "Whether the beta launch succeeds isn't known yet" or "Agreement between two teams is not approval to launch."

## Open questions

- `TodayView` ("Good to see you", "What needs you", "Time to agreement") is implemented but no view renders it: the `today` view id renders the decision view. Is it dead code or meant to return?
- The team view (`TeamLens`, "Team view") is routed under the Goals nav item, but no control in the current code navigates to it. Is it reachable?
- The Inspector and team view label the viewer's own goal "Your goal · you can edit", but no screen offers a way to edit one's own goal directly. Is that wording intended?
- `docs/DEMO_SCRIPT.md` names labels the current code does not show, such as a "How the goals connect" screen heading (the view is titled "Goals"), a "Waiting for your decision" badge (present only in the unrendered `TodayView`), and "Test which plan follows the new priority" inside the brief, which now reads **Test in Scenario Studio**. Which labels should the spec treat as authoritative?
- The goal-sessions web app under `/app` (enabled by `ALIGN_GOAL_SESSIONS=1`: sign-in, devices, invites, alignments, people, sessions, spend) is outside this part's file list and is not specified here. Which part should cover it?
- The `/w/<id>` slug is called "a convenience, not access control". Should the interface spec say anything about what an unauthenticated visitor to `/w/<id>` can see beyond the login-info names?

## Sources

- `README.md`
- `docs/DEMO_SCRIPT.md`
- `proxy.ts`
- `lib/labels.ts`
- `app/page.tsx`
- `app/layout.tsx`
- `app/error.tsx`
- `app/global-error.tsx`
- `app/setup/page.tsx`
- `app/new/page.tsx`
- `app/new/NewWorkspace.tsx`
- `app/w/[slug]/page.tsx`
- `app/oauth/authorize/page.tsx`
- `app/oauth/authorize/AuthorizeForm.tsx`
- `components/Home.tsx`
- `components/useAlign.ts`
- `components/props.ts`
- `components/select.ts`
- `components/nextStep.ts`
- `components/launch.ts`
- `components/ui.tsx`
- `components/ErrorNotice.tsx`
- `components/YourTurnView.tsx`
- `components/TodayView.tsx`
- `components/GoalsView.tsx`
- `components/TeamLens.tsx`
- `components/DecisionsView.tsx`
- `components/DecisionView.tsx`
- `components/ProposalsView.tsx`
- `components/Handoff.tsx`
- `components/OrgView.tsx`
- `components/WorkMap.tsx`
- `components/Inspector.tsx`
- `components/AgentPane.tsx`
- `components/AuthorityStrip.tsx`
- `components/ProofStrip.tsx`
- `components/SpartaProof.tsx`
- `components/BriefDrawer.tsx`
- `components/ScenarioDrawer.tsx`
- `components/EvidenceView.tsx`
- `components/ConnectAI.tsx`
- `components/ScenarioForm.tsx`
- `components/InterviewPanel.tsx`
- `components/v6/ScenarioStudio.tsx`
- `components/v6/OldPlanWork.tsx`
- `components/v6/ConflictSentence.tsx`
- `components/v6/record.tsx`
- `components/v6/kit.tsx`
- `components/v6/thread.tsx`
