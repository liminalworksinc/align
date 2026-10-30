---
name: Interface
summary: The screens people use in Align, what each role can see and do on them, and which endpoint each action calls.
kind: area
---

# Interface

Align's web interface is the web app under `/app`, plus the OAuth consent page that connected AI apps send people
to. Everyone signs in as a person (Google, GitHub or an email one-time code); nothing is reached with a shared
passcode. `/` redirects to `/app`. Every path under `/app` is served in Mode L and when hosted.

Each page reads the `/api/v2` endpoints it needs when it loads and reloads them after each of its own actions; pages
do not poll. A page shows only the controls the server would accept from the signed-in person: their workspace role
(`owner`, `member` or `viewer`), their team role (`lead` or `member`), whether they own a goal or are in its approval
set, and the `can` flags the server returns on alignments and change requests. "Pod" is stored data only: every
screen says "team".

| Route | Screen | Who uses it | Purpose |
| --- | --- | --- | --- |
| `/` | (redirect) | Anyone | Redirects to `/app` |
| `/app/sign-in` | Sign in | A signed-out person | Sign in with Google, GitHub or an email code |
| `/app/request-access` | Request access | Anyone, signed in or not | Ask the operator for a creation code (hosted) |
| `/app` | Your workspaces | A signed-in person | List and create workspaces; first run offers the Northstar sample |
| `/app/account` | Your account | A signed-in person | See the account and link Google or GitHub |
| `/app/device` | Connect a device | A signed-in person (recent sign-in) | Approve the code that `align login` printed |
| `/app/devices` | Your devices | A signed-in person | List and revoke paired devices |
| `/app/invite/<token>` | Workspace invite | The invited person | Join a workspace (and team) from an invite link |
| `/app/w/<ws>` | Goals tab | Workspace members | Goals the person can read; create a goal |
| `/app/w/<ws>/goals/<goal>` | Goal page | Workspace members | One goal: versions, tree, new version, alignment request, change requests |
| `/app/w/<ws>/people` | People tab | Workspace members | Members, roles, invites, teams, leaving |
| `/app/w/<ws>/sessions` | Sessions tab | Workspace members | Shared sessions, stop and resume |
| `/app/w/<ws>/alignments` | Alignments tab | Workspace members | Alignment requests the person is part of |
| `/app/w/<ws>/requests` | Requests tab | Workspace members | Change requests: waiting on me, mine, others |
| `/app/w/<ws>/spend` | Spend tab | Workspace members | Usage and estimated cost by goal, team or session |
| `/app/w/<ws>/apps` | Apps tab | Workspace members | Connected AI apps and how to connect one |
| `/oauth/authorize` | Connect <app> to Align | A person connecting an AI app (recent sign-in) | Grant an AI app read-only access to one workspace as themselves |
| (any) | Error page | Anyone | Plain error with Try again |

Navigation: every `/app` page except sign-in has a top bar with the **Align** mark (a link to `/app`), a workspace
switcher (shown once the person has a workspace), **Devices**, **Account**, the person's name (email on hover) and
**Sign out**. Inside a workspace a second bar shows the workspace name, the person's role and the tabs Goals,
People, Sessions, Alignments, Requests, Spend and Apps, with the current tab highlighted.

### Requirement: Root path redirects to the web app

The server SHALL answer `/` with a redirect to `/app`, and SHALL serve no other page outside `/app` and
`/oauth/authorize`.

#### Scenario: Opening the root

- **WHEN** anyone opens `/` in Mode L or hosted
- **THEN** the response redirects to `/app`, which shows the person's workspaces or sends a signed-out visitor to sign-in

#### Scenario: Retired pages

- **WHEN** someone opens `/new`, `/setup` or `/w/<id>`
- **THEN** the server answers 404; no page offers passcodes, role cards or **Switch team**

### Requirement: Signed-out visitors are sent to sign-in

Every `/app` page other than `/app/sign-in` and `/app/request-access` SHALL send a signed-out visitor to
`/app/sign-in?next=<page>`, and
`/oauth/authorize`, once the request itself is valid, SHALL show a signed-out visitor a **Sign in** link to
`/app/sign-in?next=<this /oauth/authorize URL>` (as the `mcp` part specifies); sign-in SHALL return only to an `/app`
path or an `/oauth/authorize` URL, falling back to `/app` for anything else.

#### Scenario: Deep link while signed out

- **WHEN** a signed-out person opens `/app/w/<ws>/requests`
- **THEN** they land on `/app/sign-in?next=%2Fapp%2Fw%2F<ws>%2Frequests` and, after signing in, on the Requests tab

#### Scenario: Foreign next

- **WHEN** `next` is `https://evil.example/`, `//evil.example` or any path outside `/app` and `/oauth/authorize`
- **THEN** sign-in sends the person to `/app`

#### Scenario: Session ends while a page is open

- **WHEN** an API call from an open page returns 401
- **THEN** the page navigates to `/app/sign-in?next=<current path>`

### Requirement: Sign-in screen

The `/app/sign-in` page SHALL offer **Continue with Google** and **Continue with GitHub** only when that provider's
client id and secret are configured, and SHALL offer the email-code form whenever email sign-in is available (always
in Mode L; when hosted, whenever the email settings are set, as the `workspaces` part specifies); a person who is
already signed in SHALL be sent straight to `next`, unless the URL carries `reauth=1`, which shows the form anyway.
When hosted with `ALIGN_CREATION=codes` it SHALL link to `/app/request-access`, and when the bot check is on it SHALL
render one Turnstile widget for the email-code form, sending its token with each send and sign-in and asking for a new
one after each try.

#### Scenario: Social sign-in

- **WHEN** a person presses **Continue with Google**
- **THEN** the page posts `{provider:"google", callbackURL:<next>, errorCallbackURL:"/app/sign-in"}` to `POST /api/v2/auth/sign-in/social` and follows the returned URL; an error is shown in red at the bottom of the sign-in card

#### Scenario: Neither provider configured

- **WHEN** neither Google nor GitHub is configured (in Mode L, or hosted with the email settings set)
- **THEN** the page shows only the email-code form; it never says that no sign-in method is configured

#### Scenario: Request access link and bot check

- **WHEN** a hosted server with `ALIGN_CREATION=codes` and both Turnstile keys serves `/app/sign-in`
- **THEN** the card ends with "New to Align? Creating a workspace here needs a creation code. **Request access**" (a link to `/app/request-access`), and the email-code form shows the Turnstile widget; **Send code** and **Sign in** stay disabled until it gives a token, and a refused check shows "Complete the check that you are a person, then try again." or "The check that you are a person didn't pass. Try it again."; Mode L shows neither

#### Scenario: Test identity provider

- **WHEN** the server runs with `ALIGN_TEST_IDP=1` (never when hosted)
- **THEN** the page also shows "Test sign-in (this machine only)" with **Sign in** and **Create a test account** (name, email, password of at least 8 characters), posting to `POST /api/v2/auth/sign-in/email` or `POST /api/v2/auth/sign-up/email`; without the flag that section is absent

### Requirement: Email code sign-in form

The sign-in page SHALL sign a person in with a 6-digit email code in two steps, **Send code** and **Sign in**, and
SHALL sign in only on a POST that the person submits; opening a sign-in link SHALL only fill the form.

#### Scenario: Send a code

- **WHEN** a person types their email and presses **Send code**
- **THEN** the page posts `{email, type:"sign-in"}` to `POST /api/v2/auth/email-otp/send-verification-otp`, then shows "If this email can sign in to Align, a 6-digit code is on its way. It works for 5 minutes." (the same text whether or not an account exists), a 6-digit "Code" field, **Sign in**, **Send a new code** and **Use another email**

#### Scenario: Enter the code

- **WHEN** the person types the 6 digits and presses **Sign in**
- **THEN** the page posts `{email, otp}` to `POST /api/v2/auth/sign-in/email-otp` and on success navigates to `next`; **Sign in** is disabled until the field holds exactly 6 digits

#### Scenario: Code refused

- **WHEN** the code is wrong, expired, or has used up its 3 attempts
- **THEN** the page shows "That code didn't work. Check it and try again.", "That code has expired. Send a new one." or "Too many wrong tries. Send a new code." respectively, and stays on the code step

#### Scenario: Email that cannot sign in

- **WHEN** the server is hosted, the code's email has no account, no invite for it is pending, and it is not the
  `ALIGN_FIRST_OWNER_EMAIL` address while the server has no account yet
- **THEN** sign-in fails and the page shows "This email can't sign in here yet. Ask a workspace owner to invite you."

#### Scenario: Too many codes

- **WHEN** sending is refused with 429 (more than 3 sends for that email in 10 minutes, or more than 10 from this client in an hour)
- **THEN** the page shows "Too many codes were sent. Wait a few minutes, then try again." and sends nothing

#### Scenario: Link from the email

- **WHEN** a person opens `/app/sign-in?email=<email>&code=<code>` (with or without `next`)
- **THEN** the page shows the code step with both fields filled and does not sign in until the person presses **Sign in**; `email` alone fills only the email field

#### Scenario: Mode L hint

- **WHEN** the page is served in Mode L
- **THEN** the code step adds "On this machine the code is not emailed: it is printed in the terminal running Align and saved in `<data>/v2/sign-in.txt`. Run `npm run sign-in-link` to get a new one." Being on loopback never signs the person in

### Requirement: Account screen and provider linking

The `/app/account` page SHALL show the signed-in person's name and email and the sign-in methods linked to the
account, and SHALL let the person link Google or GitHub explicitly; accounts are never linked implicitly.

#### Scenario: Link GitHub

- **WHEN** GitHub is configured, not yet linked, and the person presses **Link GitHub**
- **THEN** the page posts `{provider:"github", callbackURL:"/app/account", errorCallbackURL:"/app/account"}` to `POST /api/v2/auth/link-social`, follows the returned URL, and on return lists GitHub with a green "linked" pill under "Ways you can sign in"

#### Scenario: Linked methods

- **WHEN** the page loads
- **THEN** it reads `GET /api/v2/auth/list-accounts` and lists "Email code" (whenever email sign-in is available), each linked provider and, for a test account, "Test password (this machine only)"; a provider that is not configured on this server, or is already linked, has no **Link** button

#### Scenario: Provider account already in use

- **WHEN** linking fails because that Google or GitHub account belongs to another Align account
- **THEN** the provider sends the person back to `/app/account?error=<code>` and the page shows "That account is already linked to another Align account, so nothing was linked." (other link failures show "Linking didn't work (<code>). Nothing was linked."); nothing is linked

### Requirement: Workspace list and first-run sample

The `/app` page SHALL list the person's workspaces from `GET /api/v2/workspaces` with their role and teams, let them
create a workspace (with a "Creation code" field and a **Request access** link when the hosted creation gate needs a
code from them, the Turnstile widget when the bot check is on, and only a note when creation is closed), and offer
**Create the Northstar sample** only when they have no workspaces and need no code.

#### Scenario: Workspaces listed

- **WHEN** a person with workspaces opens `/app`
- **THEN** each workspace is a link to `/app/w/<ws>` with a role pill and one pill per team (" (lead)" for a team they lead), followed by a "Create a workspace" card (Name, up to 100 characters, **Create**, posting `{name}` to `POST /api/v2/workspaces` and then opening the new workspace) and a "Connect a device" card pointing to `align login` and `/app/device`

#### Scenario: First run

- **WHEN** a person in no workspace opens `/app`
- **THEN** the page shows "You are not in a workspace yet. Create one, open an invite link someone sent you, or start from a sample." and a "Try Align with a sample" card with **Create the Northstar sample**, which posts to `POST /api/v2/workspaces/sample` and opens the new "Northstar (sample)" workspace; the button is not shown once the person has any workspace

#### Scenario: Create refused

- **WHEN** creating a workspace or the sample returns an error (for example 429 `rate_limited`, 403 `creation_code_invalid` or 403 `owned_workspace_cap`)
- **THEN** the card shows the server's message in red and stays on `/app`

#### Scenario: Creation code

- **WHEN** a hosted person who needs a code opens `/app`
- **THEN** "Create a workspace" has Name, "Creation code" (hint: each code creates one workspace and came in the email that answered the access request), "No code yet? **Request access**", the widget when the bot check is on, and **Create**, disabled until the name, the code and the check are filled, posting `{name, creation_code}`; the sample card is not shown

#### Scenario: Creation closed

- **WHEN** a hosted server runs with `ALIGN_CREATION=closed`
- **THEN** "Create a workspace" shows only "New workspaces can't be created on this server right now. Contact its operator."

### Requirement: Request access page

The `/app/request-access` page SHALL, without sign-in, collect email, name, company (optional), team size (optional),
what the person wants to use Align for, and one interest, **Try Align** or **Evaluate Align on a real workflow** (a
follow-up about an evaluation and, if it fits, a non-binding letter of intent), post them to
`POST /api/v2/access-requests` with the Turnstile token when the bot check is on, and say plainly that the form is not
an agreement, commits neither the person nor their employer, and asks nobody to sign for their organization.

#### Scenario: Send a request

- **WHEN** someone fills the form and presses **Send request**
- **THEN** the page posts the fields and shows "Thanks. We got your request and will answer it by email at <email>, usually within a day." with a link back to sign-in; an error is shown in red under the form

#### Scenario: No agreement implied

- **WHEN** the page is read
- **THEN** it says "Sending this form only asks for access. It is not an agreement, and asking for a follow-up or a letter of intent doesn't commit you or your employer to anything. Nothing here asks you to sign for your organization."; in Mode L it also notes that anyone signed in on this machine can create a workspace without a code

### Requirement: Device approval screen

The `/app/device` page SHALL let a person with a recent sign-in look up the code that `align login` printed, choose
which of their workspaces the device may use, and approve or deny it.

#### Scenario: Approve a device

- **WHEN** a person enters the code, presses **Look up**, ticks at least one workspace and presses **Approve**
- **THEN** the page calls `GET /api/v2/device/requests/<code>` (showing the device name and "Asked <n> seconds/minutes ago") and then `POST /api/v2/device/approve` with `{user_code, workspace_ids}`, and says "<device> is connected. You can close this page."; **Approve** stays disabled until a workspace is ticked

#### Scenario: Unknown code or deny

- **WHEN** the code is unknown or expired, or the person presses **Deny**
- **THEN** the page shows "No device is waiting for that code. Check it, or run align login again.", or calls `POST /api/v2/device/deny {user_code}` and says "Denied. That device was not connected."

#### Scenario: Nothing to grant

- **WHEN** the person is in no workspace
- **THEN** the looked-up device shows "You are not in any workspace yet, so there is nothing to grant." and **Approve** stays disabled

### Requirement: Recent sign-in prompt

The device approval page and the OAuth consent page SHALL ask a person whose sign-in is older than 15 minutes to
sign in again before they can approve, and SHALL show the same prompt when the server refuses an approval with 403
`reauth_required`.

#### Scenario: Stale sign-in on the device page

- **WHEN** a person who signed in 40 minutes ago opens `/app/device`
- **THEN** instead of the code form the page shows "Sign in again to approve a device. Approving needs a sign-in from the last 15 minutes." with **Sign in again**; the consent page shows "Sign in again to connect an app. Connecting needs a sign-in from the last 15 minutes." with **Sign in again** and **Cancel**

#### Scenario: Signing in again

- **WHEN** the person presses **Sign in again**
- **THEN** the app posts to `POST /api/v2/auth/sign-out` and opens `/app/sign-in?next=<this page, with its query>&email=<their email>`, so after a fresh sign-in they return to the same device code or consent request

#### Scenario: Sign-in ages while the page is open

- **WHEN** the page was opened with a recent sign-in, but **Approve** or **Allow read-only access** gets 403 `reauth_required`
- **THEN** the page replaces the form with the sign-in-again prompt and nothing is approved

### Requirement: Devices screen

The `/app/devices` page SHALL list the person's paired devices from `GET /api/v2/devices` and let them revoke an
active one.

#### Scenario: Revoke a device

- **WHEN** a person presses **Revoke** on an active device
- **THEN** the page calls `DELETE /api/v2/devices/<id>` and the device shows a red "revoked" pill instead of the green "active" one; each row shows when it was connected, when it was last seen and its workspaces

#### Scenario: No devices

- **WHEN** the person has no paired device
- **THEN** the page shows "No devices yet. Run align login on your machine to connect one."

### Requirement: Invite acceptance page

The `/app/invite/<token>` page SHALL preview an invite with `GET /api/v2/invites/<token>` and let only the invited
email join with **Join workspace**.

#### Scenario: Accept an invite

- **WHEN** the signed-in person's email matches the invite and they press **Join workspace**
- **THEN** the page shows "You are invited to <workspace> as <role>." (adding "and to the team <team> as <team role>." when the invite names a team), posts to `POST /api/v2/invites/<token>/accept` and opens `/app/w/<ws>`

#### Scenario: Wrong account or unusable link

- **WHEN** the signed-in email differs from the invited one, or the token is unknown, accepted, withdrawn or expired
- **THEN** the page says "This invite is for <invited email>. You are signed in as <email>. Sign in with the invited address to join." with no button, or "This invite link is not valid. It may have been used, withdrawn or expired."

#### Scenario: Invitee without an account

- **WHEN** a signed-out invitee opens the invite link
- **THEN** sign-in opens with `next` set to the invite page; the email code for the invited address creates their account, because an invite for it is pending

### Requirement: Workspace Goals tab

The Goals tab at `/app/w/<ws>` SHALL list the goals the person can read from `GET /api/v2/workspaces/<ws>/goals`,
and SHALL give everyone but viewers a "New goal" form that posts to `POST /api/v2/workspaces/<ws>/goals`.

#### Scenario: Goal list

- **WHEN** a member opens the tab
- **THEN** each goal links to its goal page and shows its status pill, a "company" pill for a company goal, its visibility ("Only me", "My team", "Everyone in the workspace"), its team, "you can bind sessions" (green) or "needs alignment to bind" (amber), its owner ("Yours" for the person's own) and version, and its measures; with none, "No goals you can see yet."

#### Scenario: Create a team goal

- **WHEN** a member fills Goal (up to 300 characters), measures (up to 10, each with an optional target), "Who can see it", Team ("No team" or one of the person's teams; hint "Members of the team can bind their sessions to it") and the optional anchors, and presses **Create goal**
- **THEN** the page posts `{title, level:"team", visibility, team_id, measures, anchors}` and lists the new goal; "My team" is disabled for a person in no team, and **Create goal** stays disabled for "My team" without a team

#### Scenario: Create a company goal

- **WHEN** a workspace owner chooses Level "Company goal"
- **THEN** the Team field is hidden, visibility is fixed to "Everyone in the workspace", and the page posts `{level:"company", visibility:"workspace", …}` with no `team_id`; members and viewers are not offered the Level choice

### Requirement: Goal page details and new version

The goal page at `/app/w/<ws>/goals/<goal>` SHALL show the goal from `GET /api/v2/workspaces/<ws>/goals/<goal>`, its
tree and every version, and SHALL give a person the server lets edit it (`can_edit`) a "New version" form.

#### Scenario: Reading a goal

- **WHEN** a member opens a goal
- **THEN** the page shows its title, status, level, visibility, team, version, owner ("you" for the person's own), measures with targets, anchors, contributing goals and every version (title, status, time and the first 12 characters of its content hash); a goal the server does not return shows "This goal does not exist or you can't see it."

#### Scenario: Save a new version

- **WHEN** the owner edits Goal, measures, Status (Active, Achieved, Dropped), anchors and "Depends on" (other active goals) and presses **Save version <n+1>**
- **THEN** the page posts them with `version` to `POST .../goals/<goal>/versions`; a 409 `cycle` shows "That would make these goals depend on each other in a loop." and other errors show the server's message

#### Scenario: Goal tree

- **WHEN** the goal contributes to goals or depends on goals
- **THEN** a "Goal tree" card links each parent with its version, a green "reviewed" or an amber "reviewed against version <n>" / "not reviewed yet" pill, and for an editor, on a parent not reviewed against
  its current version, **Still fits version <n>**, which posts `{parent_id}` to `POST .../goals/<goal>/review`; dependencies are listed as links with their versions

### Requirement: Ask to align from the goal page

The goal page SHALL offer an "Align with this goal" card on an active goal owned by someone else to every member who
is not a viewer, and SHALL send the request with `POST /api/v2/workspaces/<ws>/alignments`.

#### Scenario: Send an alignment request

- **WHEN** a member picks **Recognize contribution only** (optionally naming one of their own bindable goals) or **Work toward this goal and count future usage here**, ticks shared sessions (at least one for work toward), writes an optional note "never sent to agents" (up to 1000 characters) and presses **Send request**
- **THEN** the page posts `{target_goal_id, source_goal_id, choice, session_keys, note}` and says "Sent. Follow it on Alignments." with a link to the Alignments tab; **Send request** stays disabled until at least one session is ticked (for work toward) or a session or contributing goal is chosen (for contribution only)

#### Scenario: Refused request

- **WHEN** the server answers 409 `cycle`, `already_governed`, `sharing_stopped` or `goal_not_active`
- **THEN** the card shows the server's message and nothing is sent again automatically

### Requirement: Propose a change from the goal page

The goal page SHALL offer **Propose a change** on an `active` goal to every member who can read the goal, is not a
viewer and does not own it, and SHALL send the proposal with
`POST /api/v2/workspaces/<ws>/goals/<goal>/change-requests`.

#### Scenario: Propose a change

- **WHEN** a member presses **Propose a change**, edits the pre-filled Goal, measures, Status and "Depends on", writes "Why this change" (required, 1 to 2000 characters) and presses **Send for approval**
- **THEN** the page posts `{base_version:<current version>, changes:<only the fields that differ>, reason}` and the new request appears in the goal's "Change requests" list as "waiting for approval"; **Send for approval** stays disabled while nothing differs or the reason is empty

#### Scenario: Stale or duplicate proposal

- **WHEN** the server answers 409 `stale_version` or 409 `already_open`
- **THEN** the form shows "This goal changed while you were editing. Reload to start from version <n>." or "You already have an open change request on this goal. See it below." with a link to the goal's "Change requests" list

#### Scenario: Who does not see it

- **WHEN** the goal's owner or a viewer opens the goal page, or anyone opens an achieved or dropped goal
- **THEN** there is no **Propose a change**; the owner uses the "New version" form instead

### Requirement: Change request controls on the goal page

The goal page SHALL list the goal's change requests from `GET .../goals/<goal>/change-requests` to everyone who can
read the goal, and SHALL show on each request only the actions its `can` flags allow, posting them to
`POST .../goals/<goal>/change-requests/<id>/<action>`.

#### Scenario: Reading a request

- **WHEN** a member opens a request in "Change requests"
- **THEN** the card, built from the list response, shows the requester, a state pill ("waiting for approval", "approver suggested a change", "approved", "rejected", "withdrawn" or "superseded"), the base version, the revision, the reason, a before and after view of each changed field, who can approve it while it is open, every revision with its author and note (under "Revisions" once there is more than one), and once decided who approved or rejected it, their note or reason and the resulting version; a superseded request says "Closed because the goal was marked achieved or dropped."

#### Scenario: Approver acts

- **WHEN** a member of the goal's approval set (other than the requester, unless they own the goal) acts on a pending request
- **THEN** **Approve** opens an optional note and **Approve as version <n+1>**, which posts `{revision, note}` to `approve`; **Reject** requires "Why you're rejecting" and posts `{reason}` to `reject`; and **Suggest a change** opens the pre-filled fields with a required note and **Send suggestion**, which posts `{revision, changes, note}` to `counter`

#### Scenario: Approval blocked by a newer version

- **WHEN** **Approve** gets 409 `stale_version`
- **THEN** the request shows "The goal changed after this request was made. <requester> needs to update it before it can be approved." and stays pending; this also happens to other open requests on a goal after one of them is approved

#### Scenario: Requester acts

- **WHEN** the requester views their own request
- **THEN** a countered request offers **Accept the change** (`accept_counter`, back to pending); a pending or countered one offers **Withdraw** (`withdraw`), both posting `{revision}`; and one whose base version is behind the goal and whose `can.rebase` flag is set shows "Made against version <b>. The goal is now at version <n>." with **Update to version <n>**, which posts `{revision, base_version:<n>}` to `rebase`

#### Scenario: Viewer

- **WHEN** a viewer opens the goal page
- **THEN** the change requests are listed with no action buttons

### Requirement: Workspace Requests tab

The Requests tab at `/app/w/<ws>/requests` SHALL show the change requests the person can see, from
`GET /api/v2/workspaces/<ws>/change-requests`, in three sections: "Waiting on you", "Your requests" and "Others".

#### Scenario: Sections

- **WHEN** a member opens the tab
- **THEN** "Waiting on you" holds the requests whose `approve` or `accept_counter` flag is true for the person (pending requests they may approve, and their own countered requests waiting for them to accept), "Your requests" holds the person's other requests, and "Others" holds every other request they can see; each card names the goal (a link to its goal page), the requester, the state pill, the reason and the changed fields, with the same actions as on the goal page

#### Scenario: Empty sections

- **WHEN** a section has nothing
- **THEN** it shows "Nothing is waiting on you.", "You have not proposed a change. Open someone else's goal to propose one." or "None." respectively

### Requirement: Workspace People tab members

The People tab SHALL list the workspace's members from `GET /api/v2/workspaces/<ws>`, let a workspace owner change a
member's role or remove a member, and let any member leave.

#### Scenario: Change a role

- **WHEN** an owner picks Owner, Member or Viewer next to a member
- **THEN** the page posts `{role}` to `POST /api/v2/workspaces/<ws>/members/<user>` and the list shows the new role; members and viewers see roles as pills only

#### Scenario: Remove a member

- **WHEN** an owner presses **Remove** next to another member and confirms "Remove <name> from <workspace>? Their team places, device access and connected apps for this workspace end. Their goals, sessions and history stay."
- **THEN** the page calls `DELETE /api/v2/workspaces/<ws>/members/<user>` and the member disappears from the list

#### Scenario: Leave

- **WHEN** a member presses **Leave workspace** and confirms "Leave <workspace>? You lose access to it. Your goals, sessions and history stay."
- **THEN** the page calls `DELETE /api/v2/workspaces/<ws>/members/<own id>` and opens `/app`

#### Scenario: Last owner

- **WHEN** a role change, removal or leave gets 409 `last_owner`
- **THEN** the page shows "A workspace needs at least one owner. Make someone else an owner first." and nothing changes

### Requirement: Workspace People tab invites

The People tab SHALL give workspace owners an "Invite someone" card that creates an email-bound invite link,
optionally naming a team, and lists and withdraws open invites.

#### Scenario: Create an invite

- **WHEN** an owner enters an email, picks a Role (Member, "Viewer (read only)", Owner), optionally a Team and a team role (Member by default, or Lead), and presses **Create invite link**
- **THEN** the page posts `{email, role, team_id, team_role}` to `POST /api/v2/workspaces/<ws>/invites` and shows "Send this link to them yourself. It works once, for that email address, for 7 days: <link>"

#### Scenario: Open invites

- **WHEN** invites exist
- **THEN** each shows its email, role, team, and "joined <time>" or "expires <time>"; an unaccepted one has **Withdraw**, which calls `DELETE .../invites/<id>`; members and viewers see no invite card

### Requirement: Workspace People tab teams

The People tab SHALL show a "Teams" card listing every team with its members and roles, let workspace owners create
teams, and let owners and team leads manage team members, with lead changes reserved to workspace owners.

#### Scenario: Create a team

- **WHEN** an owner enters a name (up to 100 characters) under "New team" and presses **Create team**
- **THEN** the page posts `{name}` to `POST /api/v2/workspaces/<ws>/teams` and lists the team; with no teams the card says "No teams yet." (owners also see "Teams group people; members can bind their sessions to the team's goals.")

#### Scenario: Add a team member

- **WHEN** an owner or the team's lead picks a workspace member under "Add someone", a role and presses **Add**
- **THEN** the page posts `{user_id, role}` to `POST .../teams/<team>/members`; a person can be in several teams, so "Add someone" lists every member not already in this team

#### Scenario: Leads are owner-only

- **WHEN** a team lead who is not a workspace owner manages the team
- **THEN** the role choice offers only Member, and other leads have no **Remove** or role control; a workspace owner can make anyone a lead, change a lead's role (posting the new role to `.../teams/<team>/members`) and remove anyone with **Remove** (`DELETE .../teams/<team>/members/<user>`)

### Requirement: Workspace Sessions tab

The Sessions tab SHALL list the person's own shared sessions with their usage and controls, and for workspace owners
everyone's shared sessions with stop and resume, from `GET /api/v2/workspaces/<ws>/sessions`.

#### Scenario: Own sessions

- **WHEN** a member opens the tab
- **THEN** each of their sessions shows its title (or repo alias or "<harness> session"), harness, state ("shared", "suspended", "not shared"), its stop or resume progress ("Stop sent, not yet received", "Stop received by the machine", "Local stop active", "Resume sent, not yet received", "Resumed"), the goal it counts under and follows, and its requests and tokens, with **Stop agent** or **Resume agent**, **Stop sharing** and **Delete shared history**

#### Scenario: Confirmed actions

- **WHEN** the person presses **Stop sharing** or **Delete shared history**
- **THEN** the page asks "Stop sharing this session? Nothing more will be uploaded. What was already shared stays until you delete it." or "Delete this session's shared history? Its usage is removed from every total, so goal and team totals will change. This can't be undone." and on confirm posts to `.../sessions/<key>/stop-sharing` or calls `DELETE .../sessions/<key>`

#### Scenario: Owners see everyone's sessions

- **WHEN** a workspace owner opens the tab
- **THEN** an "Everyone's shared sessions (workspace owners)" card lists each session's owner, repo alias and harness with **Stop agent** or **Resume agent** (`POST .../sessions/<key>/stop` or `/resume`), never titles or usage; a suspended own session shows "The alignment this session counted under was revoked. Pick a goal for it on your machine to resume uploads."

### Requirement: Workspace Alignments tab

The Alignments tab SHALL show the alignment requests the person is part of, from
`GET /api/v2/workspaces/<ws>/alignments`, under "Waiting on you", "Your requests" and "Others you are part of", with
only the actions the server allows.

#### Scenario: Alignment card

- **WHEN** a member opens the tab
- **THEN** each card shows "<requester> asks to align with <goal>" (goals the person can't read show as "a goal you can't see"), the state, the choice, the revision, its effects, its sessions, each approval requirement with the people who can satisfy it and whether it is satisfied, the note and the history, and the buttons its `can` flags allow: **Approve**, **Suggest a change**, **Accept the change**, **Decline**, **Withdraw**, **Revoke**

#### Scenario: Counter and revoke

- **WHEN** an approver presses **Suggest a change**, or someone involved presses **Revoke**
- **THEN** a counter form (choice, sessions to keep, note) posts `{revision, choice, keep, note}` to `.../alignments/<id>/counter`, and revoking first confirms "Revoke this alignment? From now on it has no effect. Sessions that counted under the goal only because of it stop uploading until their owner picks a goal. Past usage does not move."

#### Scenario: Approval would make a loop

- **WHEN** **Approve** gets 409 `cycle`
- **THEN** the card shows "Approving this would make these goals contribute to each other in a loop." and the request stays pending

### Requirement: Workspace Spend tab

The Spend tab SHALL show token usage and estimated list cost from
`GET /api/v2/workspaces/<ws>/spend?by=goal|team|session` with a "Group by" choice of By goal, By team and By my
sessions.

#### Scenario: Usage table

- **WHEN** a member (viewers included) opens the tab
- **THEN** a table shows, per row, requests, input, output, cache read, cache write and estimated list cost, with the billing basis per row, then "Not bound to a goal" and "Total", the server's note, "Goals you can't see are grouped without names. There is no per-person view.", and a count of unpriced requests when there are any

### Requirement: Workspace Apps tab

The Apps tab at `/app/w/<ws>/apps` SHALL list the AI apps connected to the workspace from
`GET /api/v2/workspaces/<ws>/apps` and explain how to connect one; a person sees their own connections, and a
workspace owner sees everyone's.

#### Scenario: Connected apps

- **WHEN** a member opens the tab
- **THEN** each connection shows the app's name, its redirect host, the person who connected it, when it was approved and when it last read the workspace, with **Disconnect** on the person's own connections (an owner sees **Disconnect** on every connection), which calls `DELETE /api/v2/workspaces/<ws>/apps/<id>`; with none, "No AI apps are connected to this workspace."

#### Scenario: How to connect

- **WHEN** a member who is not a viewer opens the tab
- **THEN** a "Connect an AI app" card shows the MCP URL `<origin>/api/mcp` with **Copy** and says the app will send them to Align to sign in and choose this workspace; a viewer sees "Viewers can't connect apps to this workspace." instead

### Requirement: OAuth consent screen

The `/oauth/authorize` page SHALL, in the same look as the web app, let a signed-in person with a recent sign-in grant
an AI app read-only access to one workspace in which they are an owner or member, acting as themselves, and SHALL
refuse requests it cannot trust without redirecting.

#### Scenario: What the page shows

- **WHEN** a signed-in person with a recent sign-in arrives with a valid request
- **THEN** the page shows "Connect <app> to Align", "This app named itself." unless it is a known AI provider's client document, "After you allow it, Align sends you back to <redirect host>.", "Signed in as <name> (<email>).", and "What it can do": it reads goals, change requests, decision records and directives in the workspace they choose, as them and with their role; it can’t propose, approve or change anything; it never sees captured prompts; what it reads is sent to <provider>; they or a workspace owner can disconnect it on the workspace’s Apps tab, and it is disconnected if they leave the workspace

#### Scenario: Choose a workspace and allow

- **WHEN** the person picks one workspace under "Which workspace" and presses **Allow read-only access**
- **THEN** the page posts `{params, decision:"approve", workspace_id}` to `POST /api/oauth/approve` and follows the returned redirect; **Cancel** posts `decision:"deny"`; **Allow read-only access** stays disabled until a workspace is picked (a person with exactly one such workspace has it picked already)

#### Scenario: Viewer workspaces

- **WHEN** the person is a viewer in some workspaces
- **THEN** those workspaces are not offered; with no workspace they own or are a member of, the page shows "You have no workspace where you can connect an app. Viewers can't connect apps." and no **Allow** button

#### Scenario: Loopback redirect

- **WHEN** the redirect URI is on `localhost`, `127.0.0.1` or `[::1]`
- **THEN** the page shows an amber warning "This app sends you back to a program on this computer (<host>). Allow it only if you started it yourself just now."

#### Scenario: Untrusted or rate-limited request

- **WHEN** the app or redirect fails the server check, or this network made too many requests
- **THEN** the page shows "Can’t connect this app" with the reason, or with "Too many requests from this network. Wait a minute, then reload this page.", or for a redirectable error with "The app sent a request Align can’t accept. Go back to the app and try again." and a **Return to the app** link; it offers no **Allow** button

#### Scenario: Server stops answering

- **WHEN** the approve request gets no answer within 20 seconds
- **THEN** the page shows "Align didn’t answer. Reload this page and choose Allow again." and re-enables the buttons

### Requirement: Render error page

The app SHALL show a plain error page for any render error, without the error message or stack.

#### Scenario: Render error

- **WHEN** a page under the root layout throws while rendering
- **THEN** the page shows "Something went wrong on this page." with **Try again** and, for a server error, "Reference: <digest>"; with JavaScript off the page shows "Align needs JavaScript. Turn it on and reload this page."

#### Scenario: Loading

- **WHEN** an `/app` page or the consent page is waiting for the server
- **THEN** it shows "Loading Align…" (whole page) or "Loading…" (one card) instead of an empty screen, and an API error shows the server's message in red

### Requirement: Web app status pills

Pages under `/app` SHALL mark states with plain-word pills whose colors follow one rule: green for a settled good
state, amber for something waiting or needing attention, red for revoked or stopped, violet for names and labels that
are not states (a team, a "company" goal, an active goal's status), neutral otherwise.

#### Scenario: Pill colors

- **WHEN** a page shows a state
- **THEN** an approved alignment, alignment requirement or change request, an active device, a linked sign-in method, a shared session, an achieved goal, a goal "you can bind sessions" to and a reviewed parent goal are green; a pending or countered alignment or change request, a requirement still waiting, a suspended session, "needs alignment to bind" and a parent not reviewed against its current version are amber; a revoked device and a stopped agent are red

## Open questions

- Should a person be able to propose reopening an achieved or dropped goal? The server refuses change requests on
  such goals (409 `goal_not_active`), so this spec offers **Propose a change** only on active goals.
- Should the account page also let a person unlink a provider? The owner's decision names only linking, so this
  spec offers no unlink.

## Sources

- `proxy.ts`
- `app/page.tsx`
- `app/layout.tsx`
- `app/error.tsx`
- `app/global-error.tsx`
- `app/app/_ui/server.ts`
- `app/app/_ui/kit.tsx`
- `app/app/_ui/types.ts`
- `app/app/_ui/goalform.tsx`
- `app/app/_ui/changes.tsx`
- `app/app/_ui/words.ts`
- `app/app/_ui/error-notice.tsx`
- `app/app/page.tsx`
- `app/app/view.tsx`
- `app/app/sign-in/page.tsx`
- `app/app/sign-in/view.tsx`
- `app/app/request-access/page.tsx`
- `app/app/request-access/view.tsx`
- `app/app/_ui/turnstile.tsx`
- `app/app/account/page.tsx`
- `app/app/device/page.tsx`
- `app/app/account/view.tsx`
- `app/app/device/view.tsx`
- `app/app/devices/view.tsx`
- `app/app/invite/[token]/view.tsx`
- `app/app/w/[ws]/view.tsx`
- `app/app/w/[ws]/goals/[goal]/view.tsx`
- `app/app/w/[ws]/people/view.tsx`
- `app/app/w/[ws]/sessions/view.tsx`
- `app/app/w/[ws]/alignments/view.tsx`
- `app/app/w/[ws]/requests/view.tsx`
- `app/app/w/[ws]/spend/view.tsx`
- `app/app/w/[ws]/apps/view.tsx`
- `app/oauth/authorize/page.tsx`
- `app/oauth/authorize/AuthorizeForm.tsx`
- `app/api/oauth/approve/route.ts`
- `lib/oauth/clients.ts`
- `lib/oauth/limits.ts`
- `lib/oauth/server.ts`
- `lib/v2/auth.ts`
- `lib/v2/config.ts`
- `lib/v2/changes.ts`
- `lib/v2/mail.ts`
