---
name: Interface
summary: The screens people use in Align, what each role can see and do on them, and which endpoint each action calls.
kind: area
---

# Interface

Align's web interface is the web app under `/app`, plus the OAuth consent page that connected AI apps send people
to. Everyone signs in as a person (Google, GitHub, an email one-time code or a passkey); nothing is reached with a
shared passcode. `/` redirects to `/app`. Every path under `/app` is served in Mode L and when hosted.

Each page reads the `/api/v2` endpoints it needs when it loads and reloads them after each of its own actions; pages
do not poll, except the Home: its first-run card checks the Apps endpoint while it is shown, and while the Home stays
open it reads again at most once a minute (see "Workspace Home"). A page shows only the controls the server would accept from the signed-in person: their workspace role
(`owner`, `member` or `viewer`), their team role (`lead` or `member`), whether they own a goal or are in its approval
set, and the `can` flags the server returns on alignments and change requests. "Pod" is stored data only: every
screen says "team".

| Route | Screen | Who uses it | Purpose |
| --- | --- | --- | --- |
| `/` | (redirect) | Anyone | Redirects to `/app` |
| `/app/sign-in` | Sign in | A signed-out person | Sign in with Google, GitHub, an email code or a passkey |
| `/app/request-access` | Request access | Anyone, signed in or not | Ask the operator for a creation code (hosted) |
| `/app` | Your workspaces | A signed-in person | List and create workspaces, restore a deleted one; first run offers the Northstar sample |
| `/app/account` | Your account | A signed-in person | See the account, link Google or GitHub, manage passkeys, sign out everywhere, delete the account |
| `/app/device` | Connect a device | A signed-in person (recent sign-in) | Approve the code that `align login` printed |
| `/app/devices` | Your devices | A signed-in person | List and revoke paired devices, and give one a workspace |
| `/app/invite/<token>` | Workspace invite | The invited person | Join a workspace (and team) from an invite link |
| `/app/w/<ws>` | Home | Workspace members | What needs the person, what waits on others and what is done; what changed since they last looked; the active goals |
| `/app/w/<ws>/goals` | Goals tab | Workspace members | Goals the person can read; create a goal |
| `/app/w/<ws>/goals/<goal>` | Goal page | Workspace members | One goal: versions, tree, new version, alignment request, change requests |
| `/app/w/<ws>/people` | People tab | Workspace members | Members, roles, invites, teams, leaving, deleting the workspace |
| `/app/w/<ws>/sessions` | Sessions tab | Workspace members | Shared sessions, stop and resume |
| `/app/w/<ws>/alignments` | Alignments tab | Workspace members | Alignment requests the person is part of |
| `/app/w/<ws>/requests` | Requests tab | Workspace members | Change requests: waiting on me, waiting on others, decided, all |
| `/app/w/<ws>/asks` | Asks tab | Workspace members | What teams were asked to do: waiting on me, my teams', mine, others; record and import asks |
| `/app/w/<ws>/spend` | Spend tab | Workspace members | Usage and estimated cost by goal, team or session |
| `/app/w/<ws>/apps` | Apps tab | Workspace members | Connected AI apps and how to connect one |
| `/app/w/<ws>/work` | Work | Workspace members | What Align knows about the work behind a decision: its evidence, what Align sent, the sessions on the goal and connected apps' goal reads (`?goal=<goal>&cr=<id>` leads with that decision, `?goal=<goal>` with the goal's open or latest one; bare, an index of goals) |
| `/app/w/<ws>/record` | Decision record | Workspace members | The decision record as a timeline of what Align recorded; with `?cr=<id>` it is titled "Review" and the review leads, its record follows (`?goal=<goal>` narrows it) |
| `/app/w/<ws>/decisions/<goal>/<id>` | Decision | Workspace members | One change request as a decision: where it is and who decides, its actions, the request, its change and evidence, and links to its record, its work and the goal dependencies |
| `/app/w/<ws>/dependencies` | Goal dependencies | Workspace members | Each goal under the goal it contributes to, with what it depends on; choose one for its details and to compare its versions |
| `/privacy` | Privacy policy | Anyone, signed in or not | Align's privacy policy (public, also when hosted) |
| `/trust` | Trust | Anyone, signed in or not | Security overview, subprocessors, retention, DPA, questionnaire answers and contact |
| `/oauth/authorize` | Connect <app> to Align | A person connecting an AI app (recent sign-in) | Grant an AI app read-only access to one workspace as themselves (or, when the app asks, read access plus agent-reported evidence links) |
| (any) | Error page | Anyone | Plain error with Try again |

Navigation: every `/app` page except sign-in and the decision page (which has its own frame, below) has, at 1024 px and
wider, a left rail with the **Align** mark (a link to `/app`) and, at narrower widths, a top bar with the mark, the
workspace's name and a **Menu** button that opens the same navigation as a sheet (focus moves into it, Escape closes it
and returns focus to **Menu**). The navigation holds, in order: **Propose a change** inside a workspace for anyone who
is not a viewer (see "Propose a change from the goal page"); the workspace switcher and "You are an owner", "You are a
member" or "You are a viewer", once the person has a workspace; inside a workspace, **Home**, then "Plan" (**Goals**,
**Alignments**, **Requests**, **Asks**), "Agents" (**Sessions**, **Apps**, **Spend**) and "Team" (**People**, and
**Record** for a workspace owner), the current page marked; and at its foot **Devices**, **Account**, **Sign out**,
the person's name (email on hover) and the appearance setting. The Work, Dependencies and decision pages are opened
from a goal or a decision, not from this navigation. Above the page, a person with no passkey who has not dismissed the
offer sees the add-a-passkey prompt. The decision page (`/app/w/<ws>/decisions/<goal>/<id>`) has a narrow rail (the
**A** mark for all workspaces, "Decision desk" (the Home), "Goals", "Work" (the Sessions tab), "Alignments", "Asks", "Apps", "People", "Spend" and the
person's initials for **Account**), a breadcrumb with the workspace switcher, and on a phone a **Menu** that adds
**Account**, **All workspaces** and **Sign out**. Opening a workspace (from the list, the switcher, a new workspace, the
sample or an invite) lands on its Home.

### Requirement: Root path redirects to the web app

The server SHALL answer `/` with a redirect to `/app`, and, when hosted, `/new` too, so a v1 invite link leads to sign-in
and the creation-code field. It SHALL serve no other page outside `/app`, `/oauth/authorize` and the public trust pages
`/privacy` and `/trust`.

#### Scenario: Opening the root

- **WHEN** anyone opens `/` in Mode L or hosted
- **THEN** the response redirects to `/app`, which shows the person's workspaces or sends a signed-out visitor to sign-in

#### Scenario: Retired pages

- **WHEN** someone opens `/setup` or `/w/<id>`, or `/new` in Mode L
- **THEN** the server answers 404; no page offers passcodes, role cards or **Switch team**

#### Scenario: A v1 invite link

- **WHEN** anyone opens exactly `/new` on a hosted server, with or without a query
- **THEN** the response redirects to `/app` with no query; `/new/x` and `/newx` stay 404

#### Scenario: Sign-in names the invite code

- **WHEN** anyone opens the sign-in page
- **THEN** it says "Have an invite code? Sign in first, then enter it."

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

### Requirement: Passkey sign-in

The sign-in page SHALL offer **Sign in with a passkey** and passkey suggestions in the email field (WebAuthn
conditional mediation, `autocomplete="email webauthn"`) whenever the page is served from the passkey relying party's
host, and on any other host SHALL say where passkeys work instead.

#### Scenario: Button

- **WHEN** a person presses **Sign in with a passkey** and picks a registered passkey
- **THEN** the page gets `/api/v2/auth/passkey/generate-authenticate-options`, asks the browser for the passkey, posts the answer to `/api/v2/auth/passkey/verify-authentication` and on success navigates to `next`; a cancelled request shows "Passkey sign-in was cancelled.", a passkey Align doesn't know shows "That passkey isn't registered with Align. Sign in another way, then add it from your account page."

#### Scenario: Autofill

- **WHEN** the email step is shown in a browser that supports conditional mediation and the person picks a passkey from the email field's suggestions
- **THEN** the page signs them in the same way and navigates to `next`; nothing happens until they pick one

#### Scenario: Mode L at 127.0.0.1

- **WHEN** the sign-in page is opened at `http://127.0.0.1:<port>` in Mode L
- **THEN** it has no passkey button and says "Passkeys work only at http://localhost:<port> (a passkey needs a domain name, and this address is a number)."

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

- **WHEN** sending is refused with 429 (more than 3 sends for that email in 10 minutes, or, hosted, more than 10 from this client in an hour; see "Email code send limits")
- **THEN** the page shows the server's message, which says how long to wait ("Too many codes were sent. Try again in <n> minutes."), and sends nothing; for Better Auth's own per-minute limit it says the same from its retry header

#### Scenario: Link from the email

- **WHEN** a person opens `/app/sign-in?email=<email>&code=<code>` (with or without `next`)
- **THEN** the page shows the code step with both fields filled and does not sign in until the person presses **Sign in**; `email` alone fills only the email field

#### Scenario: Mode L hint

- **WHEN** the page is served in Mode L
- **THEN** the code step adds "On this machine the code is not emailed: it is printed in the terminal running Align and saved in `<data>/v2/sign-in.txt`. Run `npm run sign-in-link` to get a new one (with `PORT=<port>` in front when Align runs on a port other than 3100)." Being on loopback never signs the person in

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

### Requirement: Account passkeys

The `/app/account` page SHALL list the person's passkeys under "Passkeys" with each one's name ("Unnamed passkey"
when it has none), when it was added and when it was last used ("not used yet" before its first sign-in), and SHALL
let the person add, rename and delete passkeys.

#### Scenario: Add a passkey

- **WHEN** the person, on the relying party's host, optionally types a name and presses **Add a passkey**
- **THEN** the page runs Better Auth's passkey registration (`/api/v2/auth/passkey/generate-register-options`, the browser's passkey dialog, `/verify-registration`), then names the new passkey with `PATCH /api/v2/account/passkeys/<id>` if a name was given (a name of only spaces or invisible characters is none), and lists it; a cancelled dialog shows "Adding a passkey was cancelled. Nothing was added."

#### Scenario: Naming a new passkey fails

- **WHEN** the person adds a passkey with a name of only invisible characters (U+200B U+2060), and, another time, adds one whose naming request fails (`scripts/test-v2.mjs` "c14 C14-2 and C14-3 (ui, E2E-WEB cycle 14): ...")
- **THEN** the first is added unnamed with no naming request and no error; for the second the card says "The passkey was added, but naming it didn't work. Rename it below." and the list is reloaded whatever the naming did, so it shows the new passkey ("Unnamed passkey") to rename, never "No passkeys yet." (E2E-WEB cycle 14 C14-3)

#### Scenario: Rename and delete

- **WHEN** the person presses **Rename**, edits the name and presses **Save**, or presses **Delete** and confirms "Delete the passkey "<name>"? It will no longer sign you in to Align."
- **THEN** the page calls `PATCH /api/v2/account/passkeys/<id> {name}` or `DELETE /api/v2/account/passkeys/<id>` and reloads the list

#### Scenario: Another host

- **WHEN** the page is opened at `http://127.0.0.1:<port>` in Mode L, or in a browser without WebAuthn
- **THEN** instead of the add form it says "Passkeys work only at http://localhost:<port>, because a passkey needs a domain name and this address is a number. Open Align there and sign in to add or use one." or "This browser can't use passkeys."

### Requirement: Add-a-passkey prompt

Every `/app` page with the top bar, except `/app/account`, SHALL show under it, to a person the server reports as due
for the prompt and only on the passkey host (Mode L: `localhost`, never `127.0.0.1`, where a passkey can't work), "Add a passkey to sign in with your fingerprint, face or device PIN instead of an email code. A passkey
can't be phished." with an **Add a passkey** link to `/app/account#passkeys` and **Not now**.

#### Scenario: No prompt where passkeys can't work

- **WHEN** a person due for the prompt opens `/app` at `http://127.0.0.1:<port>` in Mode L
- **THEN** no prompt is shown; at `http://localhost:<port>` it is

#### Scenario: Not now

- **WHEN** the person presses **Not now**
- **THEN** the prompt disappears and the page calls `DELETE /api/v2/account/passkey-prompt`, so no page shows it to them again

### Requirement: Sign out everywhere button

The `/app/account` page SHALL offer **Sign out everywhere** with two unticked options, "Also unpair all my devices"
and "Also disconnect all my AI apps, in every workspace".

#### Scenario: Sign out everywhere

- **WHEN** the person ticks any options, presses **Sign out everywhere** and confirms "Sign out of Align on every browser, this one included[, and unpair all your devices][ and disconnect all your AI apps]?"
- **THEN** the page posts `{devices, apps}` to `POST /api/v2/account/sign-out-everywhere` and opens `/app/sign-in`

### Requirement: Account deletion screen

The `/app/account` page SHALL offer a "Delete your account" card that says what deletion does and keeps, enables
**Delete my account** only once the person has typed their email, and asks for a fresh sign-in first when their
sign-in is older than 15 minutes.

#### Scenario: Delete the account

- **WHEN** a person with a recent sign-in types their email into "Type <email> to confirm" and presses **Delete my account**
- **THEN** the page calls `DELETE /api/v2/me` with `{email}` and, on 204, opens `/app/sign-in`; until the typed text equals their email (in any case) the button stays disabled

#### Scenario: Old sign-in or refusal

- **WHEN** the person's sign-in is older than 15 minutes, or the server answers 403 `reauth_required`
- **THEN** the card is replaced by "Sign in again to delete your account. This needs a sign-in from the last 15 minutes." with **Sign in again** (coming back to `/app/account`); any other refusal, such as 409 `last_owner`, shows the server's message in red

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

#### Scenario: Deleted workspaces

- **WHEN** the person owns workspaces deleted in the last 30 days
- **THEN** a "Deleted workspaces" card lists each with "Deleted <time>. You can restore it until <time>; then it is erased. Restoring brings back its members and history, but not its connected AI apps: each one has to connect again." and **Restore**, which posts to `POST /api/v2/workspaces/<ws>/restore` and reloads the list, where the workspace is back among the links; 403 `reauth_required` shows the server's "Sign in again to restore a workspace. This needs a sign-in from the last 15 minutes." with **Sign in again** (coming back to `/app`); a hosted restore that would pass a workspace cap (409 `workspace_cap` or `owned_workspace_cap`) shows the server's message in red; the card is absent when there is nothing to restore

#### Scenario: Create refused

- **WHEN** creating a workspace or the sample returns an error (for example 429 `rate_limited`, 403 `creation_code_invalid` or 403 `owned_workspace_cap`)
- **THEN** the card shows the server's message in red and stays on `/app`

#### Scenario: Creation code

- **WHEN** a hosted person who needs a code opens `/app`
- **THEN** "Create a workspace" has Name, "Creation code" (hint: each code creates one workspace and came in the email that answered the access request), "No code yet? **Request access**", the widget when the bot check is on, and **Create**, disabled until the name, the code and the check are filled, posting `{name, creation_code}`; the sample card is not shown, and a person in no workspace reads "You are not in a workspace yet. Create one with a creation code, or open an invite link someone sent you." (no sample is mentioned)

#### Scenario: Creation closed

- **WHEN** a hosted server runs with `ALIGN_CREATION=closed`
- **THEN** "Create a workspace" shows only "New workspaces can't be created on this server right now. Contact its operator.", and a person in no workspace reads "You are not in a workspace yet. Open an invite link someone sent you."

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

#### Scenario: Opened from the value card

- **WHEN** the page is opened as `/app/request-access?interest=evaluate&via=value_card` (the decision value card's default follow-up link)
- **THEN** **Evaluate Align on a real workflow** is preselected and the request is posted with `via: "value_card"`, which the server keeps only on the `access_requested` product event (`metrics`); without those parameters, or with any other value, **Try Align** is preselected and `via` is `form`

### Requirement: Public trust pages

The server SHALL serve `/privacy` (the privacy policy, `docs/trust/privacy-policy.md`) and `/trust` (the security
overview, the subprocessor list, the retention schedule `docs/RETENTION.md`, the DPA cover note, the questionnaire
answers and a contact section, each from its file in `docs/trust`, with a link to `/privacy`) to anyone, signed in or
not, in Mode L and hosted; it SHALL build both pages from that Markdown when the app is built, show no HTML and no
comment from the documents, keep a link's target only when it is https, http, mailto, an anchor or another trust
document, and fill the placeholders `[LEGAL ENTITY]`, `[ADDRESS]`, `[PRIVACY CONTACT EMAIL]` and
`[SECURITY CONTACT EMAIL]` from `lib/trust/entity.ts`; the sign-in and request-access cards SHALL end with links to
both pages, and the request-access form SHALL link to `/privacy`.

#### Scenario: Reading the trust page

- **WHEN** anyone opens `/trust`
- **THEN** the page lists its sections (Security overview, Subprocessors, Retention, Data processing agreement, Questionnaire answers, Privacy policy, Contact) and shows each document below, its title one heading level down, with every link between documents pointing at `/trust#<section>` or `/privacy`

#### Scenario: Source notes stay out

- **WHEN** a trust document carries an HTML comment (a source note or a `PRESEED-…` marker) or raw HTML
- **THEN** the comment does not appear in the page, and the raw HTML is shown as text

#### Scenario: Links from sign-in

- **WHEN** someone opens `/app/sign-in` or `/app/request-access`
- **THEN** the card ends with **Privacy** (`/privacy`) and **Trust and security** (`/trust`)

### Requirement: Device approval screen

The `/app/device` page SHALL let a person with a recent sign-in look up the code that `align login` printed, choose
which of their workspaces the device may use, and approve or deny it. **Approve** and **Deny** SHALL act on the device
whose panel is shown, by the code it was looked up by, never on what the code field holds now: editing the field to
another code SHALL close that panel and clear its ticks, as a new **Look up** does, so no device is approved or denied
that the person did not look up (E2E-WEB cycle 10 C10-1). A **Look up** still on its way when the field changes SHALL
be dropped when it answers unless the field still holds the code it looked up (case, spaces and dashes aside), and so
SHALL any but the latest **Look up**, so the panel never opens for a device whose code the field no longer shows
(E2E-WEB cycle 11 C11-1). An approval or denial with no code, or with a `user_code` that is not text (`null`, a number),
SHALL be 400 `Enter the code shown by align login.`, and one longer than 20 characters 400 `That code is too long. Enter
the code shown by align login.`, never a field name (E2E-WEB cycle 10 W4, cycle 11 W1). A device name, on this page (its
panel and the note after **Approve**) as on the Devices page, the invite page ("Your paired devices") and the Sessions
page (the line naming a session's machine), SHALL wrap anywhere and clip what can't wrap inside its own box, and every box
that holds one SHALL be able to shrink below the name's width (a `fieldset` included, whose default minimum is its
widest content), so no name scrolls the page sideways at any width from 320 to 1280 px (E2E-WEB cycle 10 C10-3, cycle
11 C11-2). This rendering, not the device-name limits, is what keeps a name inside the page: the limits accept names
that draw one wide character, such as `ก` with 15 × `ำ`, 15 Malayalam dot rephs before `ക` or 16 Hangul initial jamo,
since none of their parts is a grapheme extender and the 16-part cap bounds them (`workspaces` "Device pairing flow";
E2E-WEB cycle 11 W4).

#### Scenario: A code edited after Look up

- **WHEN** a person looks up device C's code and ticks a workspace, then types device D's code into the field without pressing **Look up**; then looks D up and presses **Deny** (`scripts/test-v2.mjs` "C10-1 (ui, E2E-WEB cycle 10): ...")
- **THEN** C's panel (its name, the workspace boxes, **Approve** and **Deny**) closes as the code changes, D looked up is denied, and C stays pending

#### Scenario: A code edited while Look up is on its way

- **WHEN** a person presses **Look up** for device E's code and, before the answer arrives, types device F's code into the field; and, another time, types F's code and then E's again (lowercase, without the dash) before it arrives (`scripts/test-v2.mjs` "C11-1 (ui, E2E-WEB cycle 11): ...")
- **THEN** the first answer is dropped: no panel opens (no name, no workspace boxes, no **Approve** or **Deny**), the field keeps F's code and both devices stay pending; the second answer opens E's panel

#### Scenario: An empty code

- **WHEN** an approval or denial is posted with an empty or blank `user_code` (`scripts/test-v2.mjs` "W4 (E2E-WEB cycle 10): ..."), or with `null`, a number or a list (`scripts/test-v2.mjs` "c11 W1 (E2E-WEB cycle 11): ...")
- **THEN** it is 400 `Enter the code shown by align login.`, and a code of more than 20 characters is 400 `That code is too long. Enter the code shown by align login.`

#### Scenario: A device name too wide for the page

- **WHEN** the Devices page lists a device stored as `ｶ` with 150 half-width voiced sound marks (stored before the limit that now refuses it) and one named with a 100-letter word, at 320 and at 1280 px (`scripts/test-v2.mjs` "C10-3 (ui, E2E-WEB cycle 10): ...")
- **THEN** the page never scrolls sideways

#### Scenario: Every page that shows a device name

- **WHEN** a person's device names include `ｶ` with 150 × U+FF9E (stored before the limit), `ก` with 15 × `ำ`, 15 Malayalam dot rephs before `ക`, 16 Hangul initial jamo, a 100-letter word, 30 × `﷽` and twelve eight-woman families, and they open the approval page for each (its panel, and the "connected as “<name> (2)”" note), the Devices page, an invite to them and the Sessions page naming the machine of a session that ended when they left, at 320, 390, 768 and 1280 px (`scripts/test-v2.mjs` "C11-2 and W4 (ui, E2E-WEB cycle 11): ...")
- **THEN** no page scrolls sideways

#### Scenario: Approve a device

- **WHEN** a person enters the code, presses **Look up**, ticks at least one workspace and presses **Approve**
- **THEN** the page calls `GET /api/v2/device/requests/<code>` (showing the device name and "Asked <n> seconds ago" or "Asked <n> minutes ago", with the count-and-noun helper `lib/v2/plural.mts`, so "Asked 1 minute ago" for a code 60 to 89 seconds old: `scripts/test-v2.mjs` "C6-4 (ui): ...") and then `POST /api/v2/device/approve` with `{user_code, workspace_ids}`, and says "<device> is connected. You can close this page." with the name the approval answers (`device_name`, decided at approval: `workspaces` "Device pairing flow"); when that is not the name the device asked for, because one of the person's devices already has it, it says why, naming the person's live devices of that name (the approval's `same_name`) as the machines a new align login on one of them keeps the name of: with one, "<asked> is connected as “<asked> (2)”: you already have a device named “<asked>”. If this is a new align login on that same machine, it keeps that device's name instead. You can close this page." (`scripts/test-v2.mjs` "W4 (ui): ..."); with several, "<asked> is connected as “<asked> (3)”: you already have devices named “<asked>” and “<asked> (2)”. If this is a new align login on one of those machines, it keeps that machine's name instead. You can close this page." (`scripts/test-v2.mjs` "C8-3 (ui, E2E-AGENT cycle 8): ...", where the re-login of `<asked> (2)` keeps `<asked> (2)`); and with none (another pairing approved a moment ago holds the name) "<asked> is connected as “<asked> (2)”: another device you approved a moment ago has the name “<asked>”. You can close this page."; never a name the device is not stored under, nor a name a re-login does not keep (a re-login on any machine it names keeps that machine's name, also when a lower number is free: `workspaces` "Device pairing flow"); **Approve** stays disabled until a workspace is ticked, and the workspaces of each device looked up start unticked: a new **Look up** clears the ticks made for the device looked up before, so a workspace ticked for one device is never approved for another (`scripts/test-v2.mjs` "C9-2 (ui, E2E-WEB cycle 9): ..."). A ticked workspace that is no longer the person's (deleted or left in another tab) is refused with "A workspace you ticked is not one of yours any more (it was deleted, or you left it or were removed from it), so nothing was approved. Tick your workspaces again.", and the page reads the workspace list again

#### Scenario: Unknown code or deny

- **WHEN** the code is unknown or expired, or the person presses **Deny**; in another case the code shown was approved (or denied) in another tab and the person presses **Approve** or **Deny** (`scripts/test-v2.mjs` "W1 (ui, E2E-WEB cycle 8): ...")
- **THEN** the page shows "No device is waiting for that code. Check it, or run align login again.", or calls `POST /api/v2/device/deny {user_code}` and says "Denied. That device was not connected."; in the other case it shows that refusal and the device's panel (its name, "Asked ...", the workspaces, **Approve** and **Deny**) closes, as after an approval, so nothing offers to decide a code nobody is waiting on; a new **Look up** also closes the panel of a device looked up before, whatever it finds, and editing the field to another code clears a refusal shown for the code before, so "No device is waiting for that code." never stays under a code it is not about (the same code written another way, in another letter case, with a space or without the hyphen, keeps it: `scripts/test-v2.mjs` "c12 W1 (ui, E2E-WEB cycle 12): ...")

#### Scenario: Nothing to grant

- **WHEN** the person is in no workspace
- **THEN** the looked-up device shows "You are not in any workspace yet, so there is nothing to grant." and **Approve** stays disabled

### Requirement: Recent sign-in prompt

The device approval page and the OAuth consent page SHALL ask a person whose sign-in is older than 15 minutes to
sign in again before they can approve, and SHALL show the same prompt when the server refuses an approval with 403
`reauth_required`; the account page, the workspace list and the People tab SHALL show it, with the server's message,
when an action there is refused with 403 `reauth_required`.

#### Scenario: Stale sign-in on the device page

- **WHEN** a person who signed in 40 minutes ago opens `/app/device`
- **THEN** instead of the code form the page shows "Sign in again to approve a device. Approving needs a sign-in from the last 15 minutes." with **Sign in again**; the consent page shows "Sign in again to connect an app. Connecting needs a sign-in from the last 15 minutes." with **Sign in again** and **Cancel**

#### Scenario: Signing in again

- **WHEN** the person presses **Sign in again**
- **THEN** the app posts to `POST /api/v2/auth/sign-out` and opens `/app/sign-in?next=<this page, with its query>&email=<their email>`, so after a fresh sign-in they return to the same device code or consent request

#### Scenario: Sign-in ages while the page is open

- **WHEN** the page was opened with a recent sign-in, but **Approve**, **Allow read-only access** or **Allow access** gets 403 `reauth_required`
- **THEN** the page replaces the form with the sign-in-again prompt and nothing is approved

#### Scenario: Account page, workspace list and People tab

- **WHEN** adding or deleting a passkey, linking a provider, signing out everywhere or deleting the account on `/app/account`, restoring a deleted workspace on `/app`, or changing a role, removing a member, inviting an owner or deleting the workspace on the People tab, gets 403 `reauth_required`
- **THEN** the page shows the server's message (for example "Sign in again to invite an owner. This needs a sign-in from the last 15 minutes.") with **Sign in again**, which signs out and opens `/app/sign-in?next=<that page>&email=<their email>`; nothing changed; on the People tab the remove panel stays open as it was, and the prompt for deleting the workspace shows just above the "Delete this workspace" card

### Requirement: Devices screen

The `/app/devices` page SHALL list the person's paired devices from `GET /api/v2/devices` and let them revoke an
active one. Each row SHALL name the device with the end of its id (`dv_…` and its last 6 characters, as `align login`
names devices), so two devices of one name are told apart. An active device that does not reach every workspace the
person is a member of SHALL offer those workspaces in a list with **Give this device the workspace**, which calls
`POST /api/v2/devices/<id>/workspaces` (`workspaces` "Giving a device a workspace later", an extension of owner decision
2026-11-01 in `docs/decisions/0003-owner-decisions-v2.md` section 6); a 403 `reauth_required` shows the server's message
with **Sign in again** (back to `/app/devices`), and a note says the device picks the workspace up at its next sync.
The devices SHALL be listed as the invite page lists them, by name (case-insensitive), the live ones first and then the
revoked ones. The button SHALL give the workspace the list shows: once one is given it leaves the list, and the next
press gives the one shown then. A refusal because the device is no longer the person's (revoked in another tab, say),
the workspace no longer theirs (deleted, left or removed from in another tab: 404, "This workspace is not one of yours
any more (it was deleted, or you left it or were removed from it), so the device was given nothing."), or the device
given that workspace meanwhile (409 `already_granted`, "This device already has this workspace") SHALL show the server's
message and read both lists again after any 404 or 409, so the row shows what is true now.

#### Scenario: Give a device a workspace

- **WHEN** a person with a recent sign-in opens the page with a device that lacks one of their workspaces and presses **Give this device the workspace** (`scripts/test-v2.mjs` "ui (Chrome, E2E-AGENT cycle 5): the Devices page names each device ...")
- **THEN** the row showed the device's `dv_…` tag, now lists the workspace and offers it no more, the device has the grant on the server, and a device that has every workspace of theirs is offered none

#### Scenario: Two workspaces given one after the other

- **WHEN** a device lacks two of the person's workspaces, they choose the second in the list and press **Give this device the workspace**, then press it again without choosing (`scripts/test-v2.mjs` "C6-3 (ui): ...")
- **THEN** the first press gives the chosen workspace, the list then shows only the other, and the second press gives that one (never the one just given, which the server would refuse 409 `already_granted`)

#### Scenario: Order, and a device revoked in another tab

- **WHEN** the person opens the page, then a device is revoked in another tab and they press **Give this device the workspace** on its row (`scripts/test-v2.mjs` "Z1, Z2 (ui): ...")
- **THEN** the live devices were listed by name before the revoked ones, and after the press the page shows "This device is not one of your paired devices any more …", and the row reads "revoked" with nothing offered

#### Scenario: A workspace given or deleted in another tab

- **WHEN** a device lacks a workspace the person then gives it in another tab, and they press **Give this device the workspace** on its row; and again for a workspace they then delete in another tab (`scripts/test-v2.mjs` "W2 (ui): ..." and "W1 (ui): ...")
- **THEN** the first shows "This device already has this workspace" and the row lists that workspace and offers it no more; the second shows "This workspace is not one of yours any more (it was deleted, or you left it or were removed from it), so the device was given nothing." (never a bare "Not found") and the workspace is offered no more

#### Scenario: Revoke a device

- **WHEN** a person presses **Revoke** on an active device
- **THEN** the page calls `DELETE /api/v2/devices/<id>` and the device shows a red "revoked" pill instead of the green "active" one; each row shows when it was connected, when it was last seen and its workspaces

#### Scenario: No devices

- **WHEN** the person has no paired device
- **THEN** the page shows "No devices yet. Run align login on your machine to connect one."

### Requirement: Invite acceptance page

The `/app/invite/<token>` page SHALL preview an invite with `GET /api/v2/invites/<token>` and let only the invited
email join with **Join workspace**. When the invitee has paired devices that are not revoked, it SHALL list them under
"Your paired devices" (each with a checkbox, its name and "(last seen <time>)", none ticked) with "Tick the devices
that should reach <workspace> too. Each one picks it up the next time it syncs, without signing in again; its other
workspaces stay as they are." (owner decision 2026-11-01; `workspaces` "Invites give paired devices the workspace").
The devices are listed by name (`last_seen_at` moves at most every 5 minutes, so an order by it could contradict what
the person just did). Ticking needs a sign-in from the last 15 minutes: with an older one the boxes are disabled and the
page says "Giving a device this workspace needs a sign-in from the last 15 minutes. **Sign in again** to choose
devices, or join without them."; **Sign in again** signs out and opens sign-in at once (one press), with the email
filled in and `next` the invite page, and **Join workspace** stays on the page; joining without devices needs no
recent sign-in. A refused Join SHALL say what happened, never a bare "Not found": a ticked device that is no longer one
of the person's paired devices (signed out in another tab) gives the server's message and "Your devices are listed
again: choose again, or join without them.", with the list read again and nothing ticked; an invite the person already
accepted in another tab gives "You already joined <workspace>, in another tab or window." with a link to it; an
invite that is gone otherwise gives "This invite can't be used any more: it was withdrawn, it expired, or it was
already used. You have not joined. …", and then only that: no invite text and no **Join workspace**. When the person
already joined in another tab with devices ticked here, it SHALL also say "The device you ticked was not given
<workspace>: give it to that device on your Devices page." ("The <n> devices you ticked were … give it to them …"),
with a link to `/app/devices`, since a refused Join grants nothing.

#### Scenario: Refused Join, invite gone or joined elsewhere

- **WHEN** the invitee presses Join after the invite was withdrawn, and, on another invite, presses Join with a device ticked after accepting it in another tab (`scripts/test-v2.mjs` "C6-5, Z6 (ui): ...")
- **THEN** the first page shows "This invite can't be used any more: …" alone, with no "You are invited …", no "This invite link is not valid" and no Join button; the second says "You already joined <workspace>, in another tab or window." and "The device you ticked was not given <workspace>: give it to that device on your Devices page." with links to `/app/devices` and the workspace, and the device has no new workspace

#### Scenario: Accept an invite

- **WHEN** the signed-in person's email matches the invite and they press **Join workspace**
- **THEN** the page shows "You are invited to <workspace> as <role>." (adding "and to the team <team> as <team role>." when the invite names a team), posts to `POST /api/v2/invites/<token>/accept` and opens `/app/w/<ws>`

#### Scenario: Accept and give a paired device the workspace

- **WHEN** an invitee with one paired device and one revoked device opens the page with a sign-in 20 minutes old, then with a fresh one ticks the device and presses **Join workspace and give it to this device** (`scripts/test-v2.mjs` "invite (ui, owner decision 2026-11-01) ...")
- **THEN** the first view lists only the live device, unticked and disabled, with the recent sign-in sentence; the second lists it unticked and enabled; the page posts `{device_ids:[<id>]}`, the device gains the workspace (audited `device.workspace_added`) and the workspace opens; when the server answers 403 `reauth_required` the page shows its message with "You have not joined yet." in place, unticks and disables the devices and keeps **Join workspace**, and one press of **Sign in again** opens sign-in, which comes back to the invite (`scripts/test-v2.mjs` "Y2 (ui): ...")

#### Scenario: A device signed out, or the invite used, in another tab

- **WHEN** an invitee ticks two devices, one is signed out in another tab, and they press Join; then they join in another tab and press Join here again (`scripts/test-v2.mjs` "Y1 (ui): ..." and "Y1: accepting an invite the same person already accepted ...")
- **THEN** the first press says "A device you chose is not one of your paired devices any more (it may have been signed out), so nothing was joined. Your devices are listed again: choose again, or join without them." with only the other device listed, unticked; the second says "You already joined <workspace>, in another tab or window." with a link to the workspace

#### Scenario: Wrong account or unusable link

- **WHEN** the signed-in email differs from the invited one, or the token is unknown, accepted, withdrawn or expired
- **THEN** the page says "<invited email> is invited to <workspace> as <role>." then "This invite is for <invited email>. You are signed in as <email>. Sign in with the invited address to join." with no **Join workspace** but **Sign out and use <invited email>**, which signs out and opens sign-in with that address filled in and `next` the invite page; or "This invite link is not valid. It may have been used, withdrawn or expired."

#### Scenario: Invitee without an account

- **WHEN** a signed-out invitee opens the invite link
- **THEN** sign-in opens with `next` set to the invite page; the email code for the invited address creates their account, because an invite for it is pending

### Requirement: Workspace Home

The Home at `/app/w/<ws>`, a workspace's landing view, SHALL show, in this order, a heading that states how many things
need the person, the first-run card (see "Home first-run card"), one Needs list, "Since you last looked" and "Goals".
It reads `GET /api/v2/workspaces/<ws>/home` (goals and apps), `GET .../change-requests` and `GET .../goals`, and the
Needs list makes its own reads: `GET .../change-requests`, `GET .../asks?state=open,accepted,done,declined`,
`GET .../alignments`, `GET .../home`, `GET .../goals`, `GET /api/v2/workspaces`, the requests to agents on up to 12
active goals the person reads (their own first), and the value read of the latest launch on up to 12 goals (newest
first). It SHALL show only what the server holds: a count or a source the server could not read SHALL be said to be
unknown, never zero, and nothing on the page SHALL infer what an agent is doing (no stuck, blocked or diverged state,
"working" only as the live presence line defines it under Requirement: Live workspace, and no claim that an app has the current goal version or is "on the current plan": Align knows only which
versions it sent an app, never which one the app uses; the decision value card names the apps Align sent a launched
version). The page reads when it opens and again after a decision in the review drawer or a request sent from the
"Propose a change" drawer, and again when the workspace's live stream says one of the person's views moved (Requirement:
Live workspace); it does not poll (only its first-run card checks the apps while it is shown, and its "Since you last
looked" section checks for new changes as below, the Needs-you list reading again with it).

The heading SHALL read "<n> things need you" ("1 thing needs you"), or "Nothing needs you"; when a source could not be
read, "At least <n> things need you" ("Some of this could not be read" for none); "Needs you" while the list reads and
"Home" until the Home read lands. In a workspace with no active goal the person can see it SHALL read "No goals here
yet" while nothing needs them; the Needs list is then hidden, and there is no "Since you last looked" and no "Goals".

The Needs list SHALL be one ranked list with the filters "Needs you" (the default), "Waiting on others" and "Done", each
with its count ("Waiting" for "Waiting on others" below 400 px; with a source unread, a count reads "<n>+", or "?" for
none), and a search field ("Search") when the filter holds more than 8 rows. A row SHALL show its kind as a status
pill, the goal's title (a link to what the row opens), a line saying who asked or what caused it and, when it is
someone else's move, whose (such as "Waiting on <names>" or "<names> can launch it"), how long it has waited ("time not recorded" when Align has no time),
its evidence, and at most one outlined action. The kinds are "Approved, not launched" (**Launch v<n>**), "Decision"
(**Review**, its line leading with what the request changes, then "<requester>'s request"), "Your request came back"
(**See the change**, **See the condition** or **Update to v<n>**), "Declined" (**Propose again**), "Agent declined" (a
request to agents that a session declined, **Open the requests**), "Team ask" (**Accept or decline** or **Mark
done**), "Alignment" (**Review** or **Accept the change**) and "Launched, not sent" ("Align has not sent v<n> to the
app <app>.", for a connected app the person can see that has read the goals but was not sent the goal's latest
launched version, with **See apps** when the person connected it); a row waiting on others or done carries its own
word ("Change suggested", "Needs an update", "Launched as v<n>", "Declined", "Withdrawn", "Superseded", "Approved",
"Ask done", and so on). A change request's row opens it in the review drawer over the Home (`?review=<goal>.<id>`),
and closing the drawer returns to the same list; any other row opens the tab that holds it. A row's evidence SHALL be
its change request's evidence summary (a decision with no links says "No evidence attached", an approval recorded
without links "Approved without evidence"), or, for other kinds, chips by class ("Receipt", "Agent reported", "Not
observed", "Self-reported"). With two rows or more a line names the order, "Ranked for someone who approves: launches
and decisions first." or "Ranked for your own requests first.", with **How it's ranked**. A source that could not be
read is named above the list: "Align couldn't read the <sources> just now, so this list may be missing items and its
counts are at least what you see. Reload to try again." A connected app Align has recorded no goal read from is not a
row: one muted line under the list says "Align has recorded no goal read from <app>" (with who connected it when that
isn't the person, and "or <n> other apps"), with **See apps**. A row the person decided in the drawer stays in place,
greyed, as "Decided" with "You decided this just now. It leaves Needs you when you change the filter." until the
filter changes. Empty, "Waiting on others" says "Nothing you're part of is waiting on someone else." and "Done" says
"Nothing decided yet."; "Needs you" says nothing, since the heading has the count.

"Goals" SHALL list one line per active goal from the Home read: its title (a link to the goal page), "v<n>" and
"Company" or its team, a **Work** link (`/app/w/<ws>/work?goal=<goal>`), and chips only where there is something to
say: the goal's latest approved change not launched yet (its state pill, which opens that change in the review
drawer), "Held", the newest launch's delivery and agent time above zero, from the shared evidence summary. **All goals**
links to the Goals tab. When the change requests could not be read it says "Align couldn't read change requests just
now, so the plan state of each goal is unknown."; when the goals could not be read, "Align couldn't read the goals just
now."

Home's "Since you last looked" SHALL compare against the last time this person left this workspace's Home on this
device, in any tab; coming back to Home in the same tab, without a reload, compares against when they left it, and a
reload keeps the comparison the tab had. Only a reload of Home keeps it: leaving Home by any other full page load (a
plain link such as /trust, a typed URL, another site, the browser's back button) is leaving Home, so coming back
compares against when they left. While
Home stays open, it SHALL add new changes without a reload, checking at most once a minute, and the Needs-you list
reads again with it, so its count never trails what Since shows. With no earlier visit on
the device it SHALL say "First visit on this device, so nothing to compare yet." The time is kept in this browser only
and is never sent to the server.
A goal's creation line SHALL name its owner, who created it (Align never reassigns an owner), and a goal the reader
created gets no line, like their other own actions; a later saved version's line still says "Someone".

The read SHALL return, for a workspace member or viewer (cookie only: an `Authorization` header gets `403
bearer_not_allowed`, a non-member `404`), `change_requests` (`waiting_on_me`, `waiting_on_others`, `declined`), `asks`
(`waiting_on_me`), `alignments` (`waiting_on_me`, `waiting_on_others`), `goals` and `apps` (`everyone`, `items`),
each `null` when the server could not read it. Every queue item SHALL carry `next` (what it needs) and `waiting_on`
(the people it waits on). An open change request waits on its approvers to decide (`waiting_on` is the effective
approval set, and empty when nobody can approve it yet); pending behind the goal's current version, on its requester to
update it (`rebase`); countered, on its requester to accept the change (`accept_counter`); pending with a dependency that
would now close a loop (`dependency_loop`), on its approval set to suggest a change without it or decline it
(`resolve_loop`: "Approving it would now make a dependency loop: suggest a change without that dependency, or decline
it." for the person, "Approving it would now make a dependency loop. Waiting on <names> to suggest a change or decline
it." for others). It is waiting on the person when their `waiting_on_me` flag is set or it is their own request to
update; otherwise it is listed under
waiting on others when the person asked for it, is in its approval set, or the goal is theirs, their team's, or (for a
workspace owner) a company goal. An ask waits on the person when its `waiting_on_me` is set (`accept` while open,
`done` once accepted). An alignment the person is part of waits on its requester when countered and, when pending, on
everyone who could satisfy a requirement nobody has satisfied yet; its item SHALL carry its `choice`, `source_goal` and
`sessions` (each `{label, started_at, key_end}` as the alignment view names them, never another person's key) and its
Needs row SHALL lead with them, "From <source goal>: <requester> asks to align with this goal" when there is a source
goal, else "<Contribution only or Work toward, usage moves> · session …<key end>: <requester> asks to align with this
goal" ("sessions …<key end>, …<key end>" for several), so two requests of one person on one goal never read alike
(e2e-reports/acycle1/cross.md A1-cross-9). Active goals are the readable active goals, the
person's own (owned, their team's, or a company goal for a workspace owner) first. An approved change request that is
not launched (`launch` `pending` or `not_yet`) SHALL be listed with `next: "launch"` as "Approved, not launched": waiting
on the person when their `can.launch` flag is set, otherwise under waiting on others, with `waiting_on` its `launchers`,
when the person asked for it or the goal is theirs, their team's, or (for a workspace owner) a company goal. A launched
or superseded request is on no Home, nor is an approved one that would now close a dependency loop (`dependency_loop`):
nobody can launch it as it stands.

The decide card tells an approver who declines that the requester sees their reason, so the requester's Home SHALL
show it (main #53): `change_requests.declined` lists, per active goal, the person's own latest change request there
when it is `rejected`, with the goal (its current version), `reason`, `rejected_by`, `rejection_reason` and
`decided_at`, newest decision first, and is on nobody else's read. On the Home, the person's newest request on an
active goal, when it was declined, SHALL come back to their Needs you (founder ruling, LIM-2472 eaa5cf92) as a
"Declined" row, "Declined by <approver>: “<reason>”", with **Propose again** (the goal page's change requests), and is
counted in the heading. It leaves Needs you, into Done, once the person opens it (its review, or **Propose again**),
which is kept in this browser only, per workspace and person (with storage blocked it keeps coming back), or once they
send a newer request on that goal or the goal closes. It is on nobody else's Needs you.

Every agent-status item SHALL show exactly one evidence class, and the read SHALL return it as `evidence_class`:
`delivery_receipt` (a `received`, `applied` or `enforced` receipt, or a goal read Align served), `agent_reported` (the
agent's own claim or evidence link) or `not_observed` (Align has nothing). Each connected app the read returns carries
what the Apps tab has: its name, who connected it, when it was approved, `last_used_at` and `last_read_at` (the `mcp`
part's goal read); only an app with a `last_read_at` is a delivery receipt. The Home lists no apps (the Apps tab does):
an app's goal read since the last visit is a line in "Since you last looked" ("<app> read the goals", with its evidence
class), and an app with no goal read is the muted line under the Needs list. A connection SHALL never be shown or
counted as a read. A workspace owner's read has every connected app and anyone else's their own, as on the Apps tab.

#### Scenario: Needs you and waiting on others

- **WHEN** a member proposes a change to a team goal and the team's lead opens the Home
- **THEN** the lead's Needs you lists a "Decision" row with the goal's title, "<what it changes> · <requester>'s request" and **Review**, which opens the request in the review drawer, and the requester's "Waiting on others" lists it with "Your request · Waiting on <lead>"; after a counter it is the requester's "Your request came back" row, "An approver suggested a change", with **See the change**, and after the goal's owner saves a newer version the requester's row reads "The goal moved on to v<n>" with **Update to v<n>**

#### Scenario: Asks and alignments

- **WHEN** an ask of the lead's team is open and an alignment request with a company goal is pending
- **THEN** the lead's Needs you lists a "Team ask" row "<who asked> asked <team>" with **Accept or decline**, and the workspace owner's an "Alignment" row with **Review**; each opens its tab

#### Scenario: Two alignment requests on one goal

- **WHEN** Lena asks twice to align with Milo's goal, contribution only with one session and work toward with another, and Milo opens the Home (`scripts/test-v2.mjs` "A1-cross-9 (ui): ...")
- **THEN** the two rows read "Contribution only · session …<key end>: Lena asks to align with this goal" and "Work toward, usage moves · session …<other key end>: Lena asks to align with this goal"

#### Scenario: An app with no goal read

- **WHEN** a workspace owner opens the Home with no launched change, one app that has read the goals and one that has only connected (`initialize` and `tools/list`)
- **THEN** neither app is a row; one muted line under the list says "Align has recorded no goal read from <second app>" with **See apps**, nothing counts the connection as a read, and nothing on the page says "on the current plan"

#### Scenario: A failed read

- **WHEN** one of the Needs list's reads fails
- **THEN** the heading reads "At least <n> things need you" (or "Some of this could not be read"), each filter's count reads "<n>+" (or "?"), and the list says "Align couldn't read the <source> just now, so this list may be missing items and its counts are at least what you see. Reload to try again."; nothing shows zero in its place, and when every read is refused the list says only "Align couldn't read this workspace for you, so what needs you here is unknown. If you aren't a member, ask a workspace owner for an invite."

#### Scenario: Not in the workspace

- **WHEN** a signed-in person who is not a member opens `/app/w/<ws>` or any page under it: the workspace doesn't exist, was deleted, they were removed, or they were never in it
- **THEN** the page shows only the top bar and "This workspace doesn't exist or you're not in it" with a link to `/app` ("Go to your workspaces"): no workspace tabs, no Needs list, no "unknown" and no "Reload" (that is for a read that failed, not for a 404)

#### Scenario: A declined request on the requester's Home

- **WHEN** an approver declines a member's change request with a reason
- **THEN** the member's Needs you shows a "Declined" row with the goal's title, "Declined by <approver>: “<reason>”" and **Propose again**, counted in the heading; on the approver's, the workspace owner's and every other Home it is at most a "Declined" row under Done

#### Scenario: Opened, it moves to Done

- **WHEN** that member opens the declined request's review, or presses **Propose again**
- **THEN** it leaves their Needs you for Done and does not come back in that browser

#### Scenario: A newer request replaces the declined one

- **WHEN** that member instead sends a new request on the same goal, and later withdraws it
- **THEN** the declined request leaves their Needs you when the new one is sent and does not come back after the withdrawal

#### Scenario: First-run card above the list

- **WHEN** the first-run card is shown and something needs the person (`scripts/test-v2.mjs` "U3 (LIM-2472): ...")
- **THEN** the compact card comes above the Needs list

#### Scenario: A workspace with no goals

- **WHEN** a workspace has no active goal the person can see and nothing needs them
- **THEN** the heading reads "No goals here yet", the first-run card leads (see "Home first-run card"), and there is no Needs list, no "Since you last looked" and no "Goals"

#### Scenario: Goal lines

- **WHEN** the person opens the Home of a workspace with active goals
- **THEN** "Goals" has one line per goal: its title linking to the goal page, its version and team, chips only for an approved change not launched (which opens it in the review drawer), "Held", the newest launch's delivery or agent time above zero, and **Work** linking to `/app/w/<ws>/work?goal=<goal>`

#### Scenario: Who created a goal

- **WHEN** another member creates a goal the person can read after the person's last visit, and later saves its version 2
- **THEN** "Since you last looked" says "<owner> created the goal" and "Someone saved v2"; a goal the person created themselves gets no line

#### Scenario: Leaving Home by a full page load

- **WHEN** the person reads Home with lines in "Since you last looked", reloads it, then opens /trust in the same tab and comes back to Home by its URL
- **THEN** the reload shows the same lines, and coming back shows "Nothing changed since your last visit." (it compares against when they left Home, not the tab's earlier comparison); a reload after that keeps the new comparison

### Requirement: Live workspace

A workspace page SHALL show what others change there within about a second, without a reload, through one
Server-Sent Events stream per workspace and tab, `GET /api/v2/workspaces/<ws>/stream` (cookie only; members and
viewers; a non-member `404`, an `Authorization` header `403 bearer_not_allowed`; at most 4 streams of one person on one
workspace, and a cap per workspace and per server well under what the server takes in all, so streams never crowd out
ordinary requests; one more is `429 too_many_streams`). The stream SHALL carry no content of its own: after a write to the workspace
it reads the person's own views again (the Home, the change requests, the goals feed, the sessions, the alignments and
presence) and names the ones that moved for that person (`change`), and the page reads those again through the reads it
already makes, so the stream shows nobody anything their reads would not. A write to another workspace, or one the
person can't read, SHALL send them nothing, and no event id SHALL let them count such writes: an id is an opaque token
of their own stream, never a counter. A browser that reconnects with `Last-Event-ID` SHALL be told what moved meanwhile,
or to read everything again when the id is unknown (a restart). A keep-alive comment every
15 seconds keeps proxies from closing it; every 30 seconds the stream checks the sign-in and membership again and ends
with `gone` when either is lost. A page whose stream can't be opened or keeps failing SHALL say so in its header
("Updates when you act or reload") and keep its reads as before; one with a stream says "Live".

An approval SHALL be seen travelling: on the review's lane map, the card the request moved to lights and the line it came
along draws itself; on Home's goal lines and the Work page's sessions panel, the live presence line shows a member or
owner, per active goal they can read, how many shared sessions bound to it by their current epoch Align heard from
(shared, bound, usage, a receipt or activity) in the last 15 minutes: "<n> agent sessions are working toward this goal
now", with "· <n> paused" for those whose agent is stopped, whose sharing is suspended or whose goal is held, and "(<n>
yours)". Other people's sessions are counts only, with nothing per session. The person's own sessions are a dot each,
filled once the session confirmed the newest directive Align sent it (received, applied or enforced: a delivery receipt)
and hollow while it is only sent; a paused one shows two bars. When a directive reaches one of them its dot is ringed for
a moment and the line says what Align sent ("Align sent the new goal version to 2 sessions."). A viewer sees no presence.
Presence names no person, key or title. With reduced motion the states show without the movement.

#### Scenario: Approve in one window, see it in another

- **WHEN** an approver approves a change request in one window while its requester has Home open in another (`scripts/test-v2.mjs` "live: ...")
- **THEN** the requester's stream sends `change` naming `home` and `changes` within about a second, and the Home's queue and goal lines read again

#### Scenario: Another workspace

- **WHEN** someone acts in a workspace the person is not in, or on a private goal they can't read
- **THEN** the person's streams send nothing for it

#### Scenario: Reconnect

- **WHEN** a stream drops and the browser reconnects with the last event id after a change it missed
- **THEN** the new stream's `hello` names the views that moved; with an id the server doesn't know, `resync: true`

#### Scenario: A paused session

- **WHEN** a workspace owner stops the agent of a session bound to a goal
- **THEN** presence for that goal counts the session paused instead of working: every open page of a member or owner who can read the goal shows "· 1 paused", and the session's own person also sees its dot as paused with the stop sent; a viewer's page shows no presence

### Requirement: Evidence class on every agent-status item

Every item in the web app that says what agents or their sessions did, received or reported SHALL carry exactly one
evidence class, and nothing SHALL be inferred past it (no working, stuck, blocked or diverged state). Every screen
shows it the same way, as one label with an icon, in one set of words: "Receipt" (Align delivered something and
recorded it), "Agent reported" (the agent's own words), "Self-reported" (a link a person added; Align does not check
it) or "Not observed" (Align has nothing; dashed), `app/app/_ui/ds/evidence-label.tsx` (founder ruling, LIM-2513, Nov
13: one evidence wording). That covers the Home's Needs list, the Apps tab, the Requests list, the review drawer, the
Work page, the goal page's Agent activity card ("Agent reported" from the align CLI's bindings, usage and work signals,
else "Not observed"), each session's answer on the Agents on this goal card ("Receipt" for a request received and not
answered, "Agent reported" for an answer, "Not observed" otherwise), the value card's "Agents on the new version" line
("Receipt" once any receipt for the launched version arrived, else "Not observed") and its "Connected AI apps" row
("Receipt" when Align sent the launched version to an app the reader can see, else "Not observed"), and the Sessions
tab's stop or resume progress (the same rule). Running text uses the same words in lower case ("shown as
self-reported", "labelled agent reported"), never another name for a class. Where an MCP
read returns the same item (`align_get_goal_activity`), it SHALL carry the same class as `evidence_class`.

#### Scenario: One class per item

- **WHEN** a goal has two bound sessions that reported activity, a checkpoint request one session's developer accepted and another declined, a launched change whose directive a session received, and a resumed session whose machine sent no receipt yet
- **THEN** the Agent activity card shows "Agent reported", each request answer "Agent reported", the value card's delivery line "Receipt" and the Sessions tab's "Resume sent, not yet received" "Not observed", one label each, the same label the Home and Apps use

### Requirement: Home first-run card

The Home SHALL mount its first-run card ("Get started") once its read returned both the goals and the apps sections
(an unread Home shows no card), right under the heading and above the Needs list. The card ends by rule, never by a
dismiss: it has no **Hide** button and keeps nothing in browser storage. It takes one of these forms:

- In a workspace with no active goal the person can see, for an owner or member: "Start with a goal", "A goal comes
  first: it is what people decide on here, and what Align sends to agents." then "Set the first one, or look around the
  sample first." (when the sample is offered), "Set the first one, or connect one agent first." or "Set the first
  one.", with **Set the first goal** (the one filled action, a link to `/app/w/<ws>/goals?first=1`), **Explore the
  sample** (when the sample can be had, as below) and, until an app the person connected has made a request,
  **Connect one agent**, which opens the connect steps in place ("Hide the steps" closes them). This form shows whether or not the person has connected an agent. For
  a viewer it is one line, "This workspace has no goals yet. A workspace owner or member sets them."
- Once the person can read a goal, for an owner or member while no app they connected has a `last_used_at` or
  `last_read_at`: a compact card, "Connect your agent" and "Your agent reads the goals you can read, as you. It can't
  approve or change a goal.", with **Explore the sample** (a link, when the person has a sample in another workspace)
  and **Connect an agent**, which opens the connect steps in place ("Hide the steps" closes them).
- Otherwise (an app the person connected has made a request, or a viewer with goals to read) no card; on the sample's
  own Home the line "Northstar is fictional. Its company, teams, goals and change request are made up so you can try
  each step." stays (it is also at the top of the compact card there).

A sample is a workspace named "Northstar (sample)" in `GET /api/v2/workspaces`. In the empty-workspace form,
**Explore the sample** links to the person's sample when they have one in another workspace; otherwise, when the
server's creation options are open and need no creation code, it creates one with `POST /api/v2/workspaces/sample`
(the same route and bot check as `/app`'s, the check shown only once the person asks: "The sample is Northstar, a
made-up company in its own workspace, with goals and a change request to try. Nothing in it is real." and "Complete
the check, then press Explore the sample again.") and opens it; a failure reads "Not created. <message>".

Opening the Home with `?connect=1` (the Goals tab's **Connect one agent** after a workspace's first goal: "Next:
connect one agent. It reads this goal at its next turn, as you.") SHALL open the connect steps when the card mounts.

The connect steps SHALL say "Paste this into a terminal (sh, bash or zsh), then choose this workspace and Allow on the
Align page that opens:", show the Claude Code line of the Apps tab (`lib/paste-lines.ts`, from the MCP URL that
`GET /api/v2/workspaces/<ws>/apps` returns) with **Copy** above it, say that it adds Align to Claude Code for the
person's user account (every folder) and starts the sign-in and writes no hooks and no settings in their folder, list
under "It can read, as you" what a connected agent can read, one line per read tool the server lists for a
`goals:read` token (`lib/mcp/read-tools.ts`, the activity line marked "(agent-reported, not observed by Align)"; in
the app's words, "Decision records: who approved or declined a change, and why", never "rejected": `scripts/test-v2.mjs`
"c9 W2: ..."), say that it can't propose, approve, launch or change anything here (and that, if allowed when
connecting, it can add evidence links to change requests, labelled agent reported), and link to the Apps tab ("Using
Codex or another app? See the Apps tab."). Its status line (a polite live region) SHALL say only what Align has seen:
"No AI app is connected to this workspace yet." (to a workspace owner) or "You haven't connected an AI app to this
workspace yet.", or for each app the person connected that is approved with no request "<app>: approved <time>, Align
hasn't seen it connect yet", or "Couldn't check connected AI apps just now. Align tries again in a few seconds."; it
explains that once an app connects, the Apps tab shows when it last connected (any request to Align) and, separately,
when it last read the goals, and that connecting is not a read. While mounted and the tab is visible, the card SHALL
read `GET /api/v2/workspaces/<ws>/apps` at once and then every 5 seconds until an app the person connected has a
`last_used_at` or `last_read_at`; when that happens after the card saw none, the Home reads again, and the compact
card goes (the empty-workspace card stays, without **Connect one agent**).

#### Scenario: An empty workspace

- **WHEN** an owner or member who has connected no agent opens the Home of a workspace with no goals
- **THEN** the card reads "Start with a goal" with **Set the first goal**, **Explore the sample** when the sample can be had, and **Connect one agent**; a viewer sees only "This workspace has no goals yet. A workspace owner or member sets them."

#### Scenario: Compact, above the list

- **WHEN** an owner or member who has connected no agent opens the Home of a workspace with goals, with the Northstar sample in another workspace
- **THEN** the card reads "Connect your agent" with **Explore the sample** linking to the sample's Home and **Connect an agent**, above the Needs list

#### Scenario: Connect steps

- **WHEN** the person presses **Connect an agent** (or **Connect one agent**)
- **THEN** the steps show the Claude Code line with **Copy**, the read list with one line per read tool of the server's `tools/list`, what it can't do and "No AI app is connected to this workspace yet." to a workspace owner

#### Scenario: From the Goals tab

- **WHEN** a person creates a workspace's first goal and presses **Connect one agent** on the Goals tab
- **THEN** the Home opens (`/app/w/<ws>?connect=1`) with the connect steps already open

#### Scenario: In the sample

- **WHEN** the person opens the sample's own Home
- **THEN** it says "Northstar is fictional. Its company, teams, goals and change request are made up so you can try each step."

#### Scenario: Status follows what Align sees

- **WHEN** the person approves an app that has not made a request yet, and later the app makes one
- **THEN** the status first says "<app>: approved <time>, Align hasn't seen it connect yet", and after the request the Home reads again, the compact card is gone, and the Needs list's muted line says "Align has recorded no goal read from <app>" until the app reads the goals

### Requirement: Web app fits a phone

Every `/app` page SHALL fit a 390×844 screen with no sideways scrolling (`document.scrollingElement.scrollWidth` no
wider than the window): the top bar, the workspace tabs and the passkey prompt wrap, padding narrows below 640 px, a
word longer than its line (a link label, a URL, a host or a path) breaks instead of running off the side while button
labels break only between words, and the Spend and Apps tables show each row as lines labelled with their column
names. Below 640 px the chrome SHALL be compact: the top bar drops the person's name (the Account page has it), the
passkey prompt is one short sentence ("Sign in with a passkey instead of an email code."), and the workspace tab row
drops the workspace's name and role (the switcher shows the name), so a workspace page's heading starts above y=300 on
a 390×844 screen; and every action control SHALL be at least 44 px tall below 640 px (in px: the root font is 15 px,
so a rem height falls short): every button and select, the text-styled ones too (the top bar's **Sign out**, the
passkey prompt's **Not now** and **Add a passkey**, **Paste meeting notes**, **Remove** on the People tab). At 320 px
wide every page SHALL still not scroll sideways: a form row that holds several fields (a measure, its target and
**Remove**; a limit's meeting, date and **Remove limit**) puts its first field on its own line below 640 px, so no
field collapses. At every width from 500 to 1440 px the Home, Goals, goal, Requests and Apps pages SHALL not
scroll sideways (page or main column), and a long button label SHALL wrap inside its container. The workspace switcher
SHALL be the browser's own select, listing only the person's workspaces, so its list never runs off a narrow window.
The Apps tab SHALL read the connected apps once, through `GET .../apps`, and SHALL not poll; the Home reads them
through `GET .../home` twice when it opens (its own read and its Needs list's) and again at most once a minute while it
stays open, and its first-run card checks `GET .../apps` as "Home first-run card" says.

#### Scenario: Compact phone chrome

- **WHEN** a signed-in person with the passkey prompt due opens a workspace's Home on a 390×844 screen
- **THEN** the heading starts above y=300, the top bar has no person's name, the prompt reads "Sign in with a passkey instead of an email code." and the tab row has no workspace name; at 1000 px the name and the workspace show again

#### Scenario: Tap targets and widths

- **WHEN** the person opens Goals, a goal, Requests, Apps, Sessions, People, Account or Devices at 390 px, and the Home, Goals, a goal with its tree, Requests and Apps at 500, 600, 700, 768, 1100, 1268 and 1440 px
- **THEN** every button and select in the top bar, the passkey prompt and the page at 390 is at least 44 px tall, no page scrolls sideways, and at 700 px the workspace switcher is on screen and lists exactly the person's workspaces

#### Scenario: A 320 px phone

- **WHEN** the person opens the workspace list, Home, Goals (with the New goal form), a goal page (with its New version form), People, Requests, Asks, Spend, Apps and Account at 320×640
- **THEN** none scrolls sideways, and each measure field is as wide as the form

#### Scenario: Phone

- **WHEN** a signed-in person opens the workspace list, account, device, devices, request access, a workspace's Home (with its first-run card), Goals tab, a goal page, People, Sessions, Alignments, Requests (an open request's decision and confirmation included), Asks, Spend or Apps on a 390 px wide screen
- **THEN** nothing scrolls sideways, approved now and proposed stack, and an Apps connection reads as its name, then "Sends you back to", "Connected by", "Approved", "Last connected" and "Last read the goals" lines, then **Disconnect**

### Requirement: Workspace Goals tab

The Goals tab at `/app/w/<ws>/goals` SHALL list the goals the person can read from `GET /api/v2/workspaces/<ws>/goals`,
and SHALL give everyone but viewers a "New goal" form that posts to `POST /api/v2/workspaces/<ws>/goals`.

#### Scenario: Goal list

- **WHEN** a member opens the tab
- **THEN** each goal links to its goal page and shows its status pill, a "company" pill for a company goal, its visibility ("Only me", "My team", "Everyone in the workspace"), its team, "you can bind sessions" (green) or "needs alignment to bind" (amber), "target <n>%" when it has a target share, "last 7 days <n>%" (amber when 10 or more points from its target) when it has a target or had shared agent time in the last 7 days, its owner ("Yours" for the person's own) and version, its measures, and one chip per limit ("Must", "Must not" or "Out of scope" and its text, at most 5); with none, "No goals you can see yet."

#### Scenario: Create a team goal

- **WHEN** a member fills Goal (up to 300 characters), measures (up to 10, each with an optional target), "Who can see it", Team ("No team" or one of the person's teams; hint "Members of the team can bind their sessions to it"), the optional "Target share of agent time (%)" (hint "Optional. Other active goals you can see already take <n>%, so up to <100-n>% is left (goals you can't see count too). …") and the optional anchors, and presses **Create goal**
- **THEN** the page posts `{title, level:"team", visibility, team_id, measures, anchors, limits, target_share}` (limits from the limit editor, empty rows left out; a blank target is `null`) and lists the new goal; a target that would put the workspace's targets over 100% shows the server's message; "My team" is disabled for a person in no team, and **Create goal** stays disabled for "My team" without a team

#### Scenario: Create a company goal

- **WHEN** a workspace owner chooses Level "Company goal"
- **THEN** the Team field is hidden, visibility is fixed to "Everyone in the workspace", and the page posts `{level:"company", visibility:"workspace", …}` with no `team_id`; members and viewers are not offered the Level choice

### Requirement: Limits from pasted meeting notes

The Goals tab and the goal page's "Limits" card SHALL give everyone but viewers **Paste meeting notes**, which sends
`{notes, source:{title, date}, prefer_goal_id?}` to `POST /api/v2/workspaces/<ws>/limits/suggest` (`prefer_goal_id`
is the goal page's goal) and shows the suggestions grouped by goal, each with a checkbox (ticked unless the goal
already has a limit like it), its kind and text, and the sentence it came from. Nothing is saved until the person acts
on a group: **Add to a new version** (only when the response says `can_edit`) opens that goal's page with the new-version
form filled in with the goal's limits plus the ticked ones, and **Propose these limits** (when `can_propose`) posts a
change request with `changes.limits` set to the goal's current limits plus the ticked ones and the reason
"Limits from <meeting>, <date>".

#### Scenario: Notes with no rule

- **WHEN** a member pastes notes in which no sentence reads like a rule
- **THEN** the page shows "No limits found. Write them as rules, like “The three models must not all fit on the GPU.”"

#### Scenario: Proposing suggested limits

- **WHEN** a member who does not own a suggested goal presses **Propose these limits**
- **THEN** the page reads the goal again, posts `{base_version, changes:{limits}, reason:"Limits from <meeting>, <date>"}` to its change requests, and says the request was proposed with a link to the Requests tab; more than 5 limits in all shows "A goal keeps at most 5 limits …" and sends nothing

#### Scenario: Owner adds suggested limits

- **WHEN** the goal's owner presses **Add to a new version**
- **THEN** the goal page opens at its "New version" form with the limit editor filled in with the goal's limits and the ticked suggestions, and nothing is saved until they press **Save version <n+1>**

### Requirement: Goal page details and new version

The goal page at `/app/w/<ws>/goals/<goal>` SHALL show the goal from `GET /api/v2/workspaces/<ws>/goals/<goal>`, its
tree and every version, and SHALL give a person the server lets edit it (`can_edit`) a "New version" form. On an
active goal that person SHALL also get **Drop this goal**, its own action, whose confirmation ("Drop “<goal>”?") says
that it becomes version <n+1>, marked dropped, that sessions bound to it get that at their next turn, that nobody can
bind new sessions to it and people can no longer ask to change it, and that to bring it back they save a new version
marked active; **Confirm: drop the goal** saves the next version with status `dropped` and every other field as it is
(the same write as the New version form's Status), and **Cancel** closes it. The confirmation SHALL go away as soon as
the drop is recorded, so a second confirm is never offered on the version it replaced.

#### Scenario: Reading a goal

- **WHEN** a member opens a goal
- **THEN** the page shows its title, status, level, visibility, team, version, a "target <n>% of agent time" pill when it has a target share, owner ("you" for the person's own), measures with targets, anchors, contributing goals, a "Limits" card with the version's limits (kind, text, and where and when each was said) or "No limits on this version.", and every version (title, status, its target when it had one, time and the first 12 characters of its content hash); a goal the server does not return shows "This goal does not exist or you can't see it."

#### Scenario: Save a new version

- **WHEN** the owner edits Goal, measures, limits (kind "Must", "Must not" or "Out of scope", text up to 160 characters, an optional meeting and date; at most 5), Status (Active, Achieved, Dropped), "Target share of agent time (%)" (blank for none), anchors and "Depends on" (other active goals, less those in the goal read's `version_loops`, which it counts: "<n> goals aren't offered: they already depend on this goal, so adding them would make a loop.") and presses **Save version <n+1>**
- **THEN** the page posts them with `version` to `POST .../goals/<goal>/versions`; a 409 `cycle` shows "That would make these goals depend on each other in a loop." and other errors show the server's message

#### Scenario: Drop this goal

- **WHEN** the owner presses **Drop this goal** on an active goal at version <n> and then **Confirm: drop the goal**
- **THEN** the page posts the goal's current title, measures, anchors, dependencies, limits and target share with `status: "dropped"` and `version: <n>` to `POST .../goals/<goal>/versions`, the confirmation is gone at once, and the goal reads again at version <n+1>, dropped, with no **Drop this goal**; an error shows the server's message under the confirmation

#### Scenario: Goal tree

- **WHEN** the goal contributes to goals or depends on goals
- **THEN** a "Goal tree" card links each parent with its version, a green "reviewed" or an amber "reviewed against version <n>" / "not reviewed yet" pill, and for an editor, on a parent not reviewed against
  its current version, **Still fits version <n>**, which posts `{parent_id}` to `POST .../goals/<goal>/review`; dependencies are listed as links with their versions. The review prompt ("A goal this one contributes to has a new version, and this goal hasn't changed. Check that it still fits: press Still fits, or save a new version.") is shown to the editor alone, and never says the sessions on the goal have the parent's new version

### Requirement: Ask to align from the goal page

The goal page SHALL offer an "Align with this goal" card on an active goal owned by someone else to every member who
is not a viewer, and SHALL send the request with `POST /api/v2/workspaces/<ws>/alignments`. It SHALL list each of the
person's shared sessions as the Alignments tab does, "<title, repo alias or harness session> · started <time> · …<the
key's last 6 characters> · now on <goal>" (or "no goal yet"), so two sessions of one person in one repository can be
told apart before one is ticked, and SHALL not offer a session already on this goal (following it through an alignment,
or bound to it), saying "1 of your sessions is already on this goal, so it isn't offered." ("<n> of your sessions are
already on this goal, so they aren't offered.") (e2e-reports/acycle1/cross.md A1-cross-4).

#### Scenario: Send an alignment request

- **WHEN** a member picks **Recognize contribution only** (optionally naming one of their own bindable goals) or **Work toward this goal and count future usage here**, ticks shared sessions (at least one for work toward), writes an optional note "never sent to agents" (up to 1000 characters) and presses **Send request**
- **THEN** the page posts `{target_goal_id, source_goal_id, choice, session_keys, note}` and says "Sent. Follow it on Alignments." with a link to the Alignments tab; **Send request** stays disabled until at least one session is ticked (for work toward) or a session or contributing goal is chosen (for contribution only)

#### Scenario: Sessions told apart

- **WHEN** Lena opens Milo's goal with several shared sessions in one repository, one of which already follows the goal (`scripts/test-v2.mjs` "A1-cross-4 (ui): ...")
- **THEN** each offered session reads "claude-code session · started <time> · …<key end> · now on <goal>", no two alike, and the one following the goal is not offered

#### Scenario: Refused request

- **WHEN** the server answers 409 `cycle`, `already_governed`, `sharing_stopped` or `goal_not_active`
- **THEN** the card shows the server's message and nothing is sent again automatically

### Requirement: Propose a change from the goal page

The goal page SHALL offer the **Full change form** on an `active` goal to every member who can read the goal, is not a
viewer and does not own it, as the goal read's `can_propose` says (the page never works the rule out itself), and SHALL
send the proposal with
`POST /api/v2/workspaces/<ws>/goals/<goal>/change-requests`. While the person has their own open request on the goal
(pending or countered; Align takes one per person and goal), the page SHALL say so before any form, "You already have
an open request on this goal, below. Align takes one open request per person and goal: add to it or withdraw it, then
ask again.", and SHALL not offer the form.

Every workspace page SHALL also offer **Propose a change** in the shell, to anyone but a viewer, while the workspace has
goals: a drawer ("Change the plan") with a short form. "Goal" offers the active goals the person does not own (the one
whose page or `?goal=` they are on is chosen), marking a goal with "· your request is open" when they have one; once
such a goal is chosen the drawer SHALL say so before any field, "You already have an open request on this goal." with
"It is waiting for a decision." (or "An approver suggested a change to it; accept it or withdraw it.") and "Align takes
one open request per person and goal: open yours to add to it or withdraw it, then ask again.", with **Open your
request** (its review on the Home) and **Not now**, and SHALL offer no form. Otherwise "What should change" offers the
title, each measure, "Add a measure" (under 10 measures), "Mark the goal achieved" and "Drop the goal", with "It should
say" or "The new measure" (up to 300 characters) and an optional "Target" for a measure; it links to "the goal page's
full change form" for limits and dependencies. "Why" is required (up to 2000 characters) and "A link" (an https link)
is optional. "Who decides" SHALL name the people in the goal read's `deciders` (the server's effective set for a
request from this person), "<names>. You can't decide your own request.", or say "Nobody can decide it yet. It stays
open until someone can, or until you withdraw it."; the drawer never works the set out itself. A missing or unchanged
field is said beside it and nothing is sent; **Send for approval** posts `{base_version, changes, reason}` and then
adds the link as the person's own evidence, and the drawer says "Sent for approval." with who can decide, **Open the
request** and **Close**. A refusal (`stale_version`, `already_open`, `own_goal`, `goal_not_active`) shows the server's
message beside "Goal".

#### Scenario: Propose a change

- **WHEN** a member presses **Full change form**, edits the pre-filled Goal, measures, limits, Status and "Depends on", writes "Why this change" (required, 1 to 2000 characters) and presses **Send for approval**
- **THEN** the page posts `{base_version:<current version>, changes:<only the fields that differ>, reason}` and the new request appears in the goal's "Change requests" list as "waiting for approval"; **Send for approval** stays disabled while nothing differs or the reason is empty

#### Scenario: An open request is named first

- **WHEN** a member with a pending request on a goal opens that goal's page, or chooses that goal in the **Propose a change** drawer
- **THEN** the goal page says "You already have an open request on this goal, below. …" and offers no **Full change form**, and the drawer says "You already have an open request on this goal." with **Open your request**, before anything is typed

#### Scenario: Propose from the drawer

- **WHEN** a member opens **Propose a change** on a goal's page, picks a measure, changes its words, writes why and presses **Send for approval**
- **THEN** "Who decides" named the goal read's `deciders` before sending, the request is posted, and the drawer says "Sent for approval." with the request's approvers and **Open the request**; a Home that is open reads its counts again

#### Scenario: Only dependencies the deciders can see are offered

- **WHEN** a member opens **Propose a change** on a goal whose effective approval set can't read some goals the member can (their private goal, another team's team-only goal)
- **THEN** "Depends on" offers as new dependencies only the goals in the goal read's `dependency_choices` (the goal's current dependencies stay listed), and says "<n> goals you can see aren't offered: someone who decides on this goal can't see them." ("1 goal you can see isn't offered" for one), and leaves out the goals in `dependency_loops` (they already depend on this goal), saying "<n> goals aren't offered: they already depend on this goal, so adding them would make a loop." ("1 goal isn't offered: it already depends on this goal, so adding it would make a loop." for one), so the form never offers what the server would refuse; dependencies on the goal the member can't see read "Also depends on a goal you can't see. Sending keeps it; only someone who can see it can remove it."

#### Scenario: Suggest a limit

- **WHEN** a member who can propose a change presses **Suggest a limit** in the goal's "Limits" card, adds a limit to the editor (pre-filled with the goal's limits), writes "Why this limit" and presses **Send for approval**
- **THEN** the page posts `{base_version, changes:{limits}, reason}` to the goal's change requests and the goal's "Change requests" list reloads with it; change request cards show a "Limits" row with the limits before and after

#### Scenario: Stale or duplicate proposal

- **WHEN** the server answers 409 `stale_version` or 409 `already_open`
- **THEN** the form shows "This goal changed while you were editing. Reload to start from version <n>." or "You already have an open change request on this goal. See it below." with a link to the goal's "Change requests" list

#### Scenario: Who does not see it

- **WHEN** the goal's owner or a viewer opens the goal page, or anyone opens an achieved or dropped goal
- **THEN** there is no **Full change form**, and the **Propose a change** drawer doesn't offer that goal (a viewer has no **Propose a change** at all); the owner uses the "New version" form instead

### Requirement: Change request controls on the goal page

The goal page SHALL list the goal's change requests from `GET .../goals/<goal>/change-requests` to everyone who can
read the goal, and SHALL show on each request only the actions its `can` flags allow, posting them to
`POST .../goals/<goal>/change-requests/<id>/<action>`. A decided request (approved, declined, withdrawn or superseded)
SHALL be its record. An open request (pending or countered) SHALL be shown to be understood, then decided, in this
order: approved now beside proposed; what would change beside the evidence; the person's decision; a confirmation;
and a closed "Details" disclosure.

#### Scenario: Reading a request

- **WHEN** a member opens a request in "Change requests"
- **THEN** the card, built from the list response, shows the requester and a state pill ("waiting for approval", "approver suggested a change", "approved", "declined", "withdrawn" or "superseded": a request in state `rejected` reads "declined", the app's word for what **Decline** did, as target changes and alignments say it, never "rejected"); a decided request shows the base version, the revision, the reason, a before and after view of each changed field, who approved or declined it ("Declined by <name>", "Declined by you" to the person who declined it) and when, an approver's note, and the decline reason only to the requester, the person who declined it and the request's approvers (every other reader, a viewer included, sees who declined it and when, without the reason), and every revision with its author and note under "Revisions" once there is more than one; a superseded request says "Closed because the goal was marked achieved or dropped."

#### Scenario: Understand an open request

- **WHEN** anyone who can read the goal opens a pending or countered request
- **THEN** "Approved now · version <base>" (or, when the goal moved on, "Request made against version <base> · goal now at <n>") and "Proposed · revision <r>" show each changed field side by side (stacked below 640 px), with the facts Version ("Goal at version <n>", and the request's base when the goal moved on), Requested by, Decides (who can approve, or "Nobody can approve this yet") and State; "What would change", tagged "the request's own text, not evidence", says field by field what the request would change (a dependency the reader can't read as "a goal you can't see", never left out; after named ones as "<names> and 1 other goal you can't see" ("… and <n> other goals you can't see"), never "<name>, a goal you can't see", which reads as if the named goal were the hidden one; the same on both sides, in "Depends on would be" and in the goal tree), quotes the requester's reason "as written" and the latest counter's note ("Your note on revision <r>" when the reader wrote it, else "<name>'s note …"), and shows any "Accept if…" condition with "Not confirmed yet" until acknowledged; beside it "Evidence for revision <r>" shows Align's snapshot and the links (self-reported or agent reported, never verified) or "No evidence attached."; "Details", closed, lists the request, goal, requester and approver ids, the state, revision and base version, the evidence ids and the times

#### Scenario: Choose a decision

- **WHEN** a person with at least one decision flag opens an open request
- **THEN** "Your decision" offers only the decisions their `can` flags allow, none selected: **Approve** (`approve`), **Approve and launch** (`approve_and_launch`), **Accept if…** and **Suggest a change** (`counter`), **Decline** (`reject`), **Accept the change** (`accept_counter`), **Confirm the condition is met** (`acknowledge`, with a condition) and **Withdraw** (`withdraw`); choosing one reveals only its input and moves focus to it (to **Review this decision** when it needs none): Approve and Approve and launch an optional note behind "Add a note (optional)" (with no evidence links, "Approve without evidence?" and that the record and the audit log will say so); Accept if… the condition and a note to the requester, both required; Suggest a change the request's fields pre-filled on the goal as it is now, a required note and an optional "Accept if… (optional condition the requester confirms)"; Decline "Why you're declining", required; the others "This needs no text."; a missing required input shows a focused error and sends nothing; someone with no decision sees whom the request waits on

#### Scenario: Confirm before sending

- **WHEN** the person presses **Review this decision**
- **THEN** a focused "Confirm: <decision>" shows Acting as (their name and part), On (the exact revision, whose request on which goal, and its base version), Decision, what they entered (or "Nothing. This decision needs no text."), What happens (the expected state change) and Launch ("Approval is not launch. Agents stay on version <n> until someone who can launch it does.", or for Approve and launch that it does both, or for Decline and Withdraw that nothing goes to launch); **Back** returns with the input kept; **Confirm: <decision>** sends the same body as before (`{revision, note}` to `approve` or `approve_and_launch`; `{revision, changes, note, condition}` to `counter`, Accept if… sending the request's own changes; `{revision, reason}` to `reject`; `{revision}` to `accept_counter` and `withdraw`; `{revision}` of the condition to `acknowledge`) and then shows "Recorded: …" on the reloaded card

#### Scenario: The request changed before sending

- **WHEN** the request's revision or state changed after the person opened it and they confirm
- **THEN** the page reads the request again first, sends nothing, and shows a focused alert on the reloaded card: when its state changed, "Not recorded. <its `state_note`> Nothing was sent. Read it again and decide again.", in the server's own words for that state (for a request declined in another tab, "Not recorded. This request was declined by <name>, so nothing changes. …", never "rejected": `scripts/test-v2.mjs` "W2 (ui): ..."); when only its revision changed, "Not recorded. This request changed after you opened it: it is now at revision <r>. Nothing was sent. Read it again and decide again."

#### Scenario: Refused by the server

- **WHEN** the server answers a decision with 409 (for example `stale_version`, `wrong_state` or `stale_revision`)
- **THEN** the card shows a focused alert "Not recorded. <the server's message>", closes the "Confirm: <decision>" panel (even when the reload leaves the request's revision and state as they were) and reloads, so it offers only the decisions the request now allows (`scripts/test-v2.mjs` "C4-1 (ui): a refused Approve closes the Confirm panel ..."); for `stale_version` that message is "The goal changed after this request was made. <requester> needs to update it before it can be approved." and the request stays pending

#### Scenario: Decline while a counter waits

- **WHEN** an approver opens a request they countered, while it waits on the requester to accept
- **THEN** "Your decision" says "Waiting on <requester> to accept your suggested change. You can still decline instead of waiting." and offers only **Decline**, with a required reason, which posts `{revision, reason}` to `reject`; the requester sees no such line and is offered **Accept the change** and **Withdraw**

#### Scenario: Approved, not launched

- **WHEN** a request is approved and not launched
- **THEN** the card says "Approved, agents still on v<n> until launch" (n its base version), who approved it and when, and after a not yet "Not launched yet: <name> decided not yet, <time>."; never "agents on v<n+1>"; it lists who can launch ("Can launch: …" from `launchers`), and for someone whose `can.launch` is set offers **Launch version <n+1> to agents** (`launch`) and, unless the last decision already was not yet, **Not yet** (`not_yet`), both posting `{revision}` (the revision on screen; the server refuses a stale one with 409 `stale_revision`, shown as "Not recorded. <message>", and a **Not yet** on a card left open while someone said not yet elsewhere with 409 `wrong_state` "<name> already decided not yet, so nothing changes: …", shown the same way: E2E-WEB cycle 11 W2). A "Not recorded. <message>" line keeps the server's message as it was written, adding only a full stop when it has none: a message that opens with a person's name keeps the name as they wrote it ("Not recorded. carol already decided not yet, …" on a card that says "carol decided not yet"), never capitalised (`scripts/test-v2.mjs` "c12 C12-1 (ui, E2E-WEB cycle 12): ..."). Each then shows "Recorded: …" on the reloaded card like every other decision: "Recorded: you launched version <n+1>." (the review drawer's wording) or "Recorded: you decided not yet. Agents stay on version <n> until someone launches version <n+1>." A card names each person one way: the reader is "you" in every line ("Approved by you", "Launched by you", "Declined by you"), anyone else by name

#### Scenario: The list after a launch

- **WHEN** a person presses **Not yet** or **Launch version <n+1> to agents** (or decides any request) on the goal page
- **THEN** the "Change requests" list is fetched again once, in place, and the goal is read again after it: the list never shows "Loading…" or disappears, and a goal version the launch itself made does not reload or remount the list again (only a version the list doesn't reflect, such as one saved in the New version form, reloads it, in place)

#### Scenario: Suggest a change keeps dependencies the approver can't see

- **WHEN** an approver chooses **Suggest a change** on a request that depends on a goal they can't see
- **THEN** the form says "Also depends on a goal you can't see. Sending keeps it; only someone who can see it can remove it.", the confirmation shows it in "Depends on would be" ("<names> and 1 other goal you can't see") with a "Kept" line "A goal you can't see stays a dependency: your suggestion keeps it, and only someone who can see it can remove it.", and the counter keeps it

#### Scenario: Suggest a change offers only dependencies a counter may add

- **WHEN** an approver chooses **Suggest a change** on a request, and can read goals that the requester or someone else who decides on the goal can't (another team's team-only goal, their own private goal)
- **THEN** the form reads the goal with `?counter=<request id>` and "Depends on" offers as new dependencies only the goals in its `dependency_choices` (the request's dependencies stay listed), saying "<n> goals you can see aren't offered: <requester> or someone who decides on this goal can't see them." ("1 goal you can see isn't offered" for one), and counts the goals in its `dependency_loops` on their own ("<n> goals aren't offered: they already depend on this goal, so adding them would make a loop.", for the goal's owner too), so the form never offers what the server would refuse. Each goal that isn't offered is left out for exactly one reason, decided once and said once: the request's own dependency that would loop (named, as "A request that would now close a dependency loop" says), else a goal in `dependency_loops`, else a goal someone who decides can't see; so the "can't see" count holds only goals left out because someone who decides can't see them (`scripts/test-v2.mjs` "C7-1 (ui): ..."). **Review this decision** is offered only while the suggestion changes something: each field it would send compared with the request's base version (the read's `counter_base`, every field, not only those the request changes, exactly what the server compares, so on a request behind its goal removing what only the newer version has is no change either: `scripts/test-v2.mjs` "C8-2 (ui): ..."), plus dependencies the approver can't see that the request changes; a suggestion that changes nothing would be refused 409 `no_change`, which reads "This suggestion changes nothing on the goal, so there is nothing to suggest. Change a field to suggest something else, or decline the request." While it changes nothing, next to the disabled button the form says "This suggestion is the same as the request's base; change a field to suggest something." ("… the request's base, version <b> (the goal is now at version <n>); …" when the request is behind its goal; `scripts/test-v2.mjs` "W3 (ui): ..."). A suggestion that asks for exactly what the request asks, with no "Accept if…" condition, is refused by the server too, so **Review this decision** stays disabled from the start (the form opens with the request's own fields) and the form says "That's what the request already asks for: approve it instead." ("… approve it once <requester> updates it to version <n>." when the request is behind its goal) until a field changes or a condition is written (`scripts/test-v2.mjs` "W4 (ui): ...")

#### Scenario: A dependency the decider can't see

- **WHEN** someone who decides on a request opens it after it added a dependency they can't read (their approval set changed since), so its `dependency_not_visible` is set
- **THEN** the card offers neither **Approve** nor **Approve and launch** (on an approved request, no **Launch version <n+1> to agents**) and says "You can't approve this. This request adds a dependency on a goal you can't see, so you can't approve what it asks. Ask <requester> to withdraw it, or to rebase it without that dependency." (for a launch, "You can't launch this. This change adds a dependency on a goal you can't see, so you can't launch what it publishes. …"), naming no goal; "Decides", "Waiting on …" and "Can launch" leave them out; the Home's Needs list never offers them **Launch v<n>** on it, and lists an open one under their Needs you as a "Decision" only because they may still decline it or suggest a change; and if they decided before the read changed (they could see it when they opened the card), the refusal reads "Not recorded. <that message>", the Confirm panel closes and nothing is recorded (`scripts/test-v2.mjs` "C4-1 (ui): ...")

#### Scenario: A request that would now close a dependency loop

- **WHEN** anyone opens a request whose `dependency_loop` is set (a goal it adds as a dependency has come to depend on its goal since it was made)
- **THEN** an open request offers neither **Approve** nor **Approve and launch** and says "This can't be approved as it stands. <dependency_loop>", its waiting line reads "Waiting on <names> to suggest a change or decline it.", and **Suggest a change** and **Decline** stay for its deciders, but not **Accept if…** (it keeps the change as asked, which the server refuses 409 `cycle`); **Suggest a change** opens with the request's looping dependency unticked and not offered, saying "The request's dependency on “<goal>” is left out: it already depends on this goal, so keeping it would make a loop." (`scripts/test-v2.mjs` "C6-1 (ui): ..."); when that dependency was all the request changed, the form also says "Without its dependency on “<goal>”, this request changes nothing, so there is nothing left to suggest. To close it, choose **Decline** above (or <requester> can withdraw it); to suggest something else, change a field here." and keeps **Review this decision** disabled until a field changes, so no confirmation of an empty suggestion is offered (`scripts/test-v2.mjs` "C7-2 (ui): ..."); one that is also behind its goal shows the same note with **Update to version <n>** for its requester, which is recorded (`goals-and-proposals` "A request that would now close a loop is not approved or launched"); an approved one offers no **Launch version <n+1> to agents** and, instead of "Can launch: …", says "Nobody can launch this as it stands. <dependency_loop>" (`scripts/test-v2.mjs` "C5-1 (ui): ...")

#### Scenario: Launched or superseded before launch

- **WHEN** a request is launched, or superseded after its approval
- **THEN** the card says "Launched, agents on v<n+1>" with who launched it and when, or "Approved, then superseded before launch: the goal got a newer version or was closed first. It never reached agents. <requester> can propose it again."; no card says that an agent did or executed anything

#### Scenario: Accept if condition

- **WHEN** an approver chooses **Accept if…**, or adds the optional condition to **Suggest a change** (at most 2000 characters), and the request is countered with it
- **THEN** the card shows "Accept if: <condition>" with "Not confirmed yet" until the requester acknowledges it, then "Acknowledged by <name>, <time>" (a request declined, withdrawn or superseded first says "Never confirmed: the request was declined", "… withdrawn" or "… superseded"); the requester, when `can.acknowledge` is set, gets **Confirm the condition is met**, a decision on an open request and a button on an approved one, which posts `{revision}` to `acknowledge`; nothing says verified

#### Scenario: Requester acts

- **WHEN** the requester views their own open request
- **THEN** a countered request offers **Accept the change** (`accept_counter`, back to pending) and **Withdraw**; a pending one offers **Withdraw** (`withdraw`) and, with an unacknowledged condition, **Confirm the condition is met**; and one whose base version is behind the goal and whose `can.rebase` flag is set shows "Made against version <b>. The goal is now at version <n>." with **Update to version <n>**, which posts `{revision, base_version:<n>}` to `rebase` and then shows "Recorded: you updated your request to version <n> (revision <r>). It waits for approval again." like every other decision

#### Scenario: A refused update to the goal's version

- **WHEN** the requester presses **Update to version <n>** and the server refuses it (409, for example `stale_version` because the goal moved on again, `dependency_not_visible` or `cycle`, or `wrong_state` because an approver countered it meanwhile) (`scripts/test-v2.mjs` "C3-5 (ui): a refused Update to version n reads \"Not recorded. ..." and "W6 (ui): ...")
- **THEN** the card shows a focused alert "Not recorded. <the server's message>" like every other refused decision and reloads, so it shows the request as it is now (for `stale_version`, **Update to version <the goal's new version>**; for a counter, "Not recorded. This request was countered by <name>; review the counter." and the counter with **Accept the change** and **Withdraw**)

#### Scenario: Viewer

- **WHEN** a viewer opens the goal page
- **THEN** the change requests are listed with no decision and no action buttons; an open one says whom it waits on

A change request opened in the review drawer (from the Home, the Requests tab, or any link with
`?review=<goal>.<id>`) SHALL follow the same rules: who asked, the reason once, the change, the evidence and whom it
waits on, and only the actions its `can` flags allow, each confirmed before it is sent, with the request read again
first so nothing is sent if it changed. A declined request's reason SHALL be shown in the drawer only to the person who
declined it and to the request's approvers ("Reason: “<reason>”"), and to its requester as "<name> declined your
request" with the reason quoted, "A declined request is closed. To try again, propose a revised change on the goal."
and **Open the goal to propose again**; a viewer, and anyone else outside the approval set, sees no reason there
(founder ruling, LIM-2472 60253f95). The goal page's request card SHALL follow the same rule (founder ruling, Nov 11):
every reader sees "Declined by <name>, <time>.", and only the requester, the person who declined it and the request's
approvers also see "Reason: <reason>". A recorded decision says "Recorded: …" in its own words, among them "Recorded: you
approved revision <r> and launched version <m>." for **Approve and launch**, "Recorded: you launched version <m>." for
a launch, and "Recorded: you approved revision <r>. Not launched yet." for an approval alone. On the Home, the drawer
then says what comes next from the Needs list: "Next: <kind> · <title>" (a link) with **Back to the list**, "Nothing
else waits on a decision from you." when only rows the person can't act on are left, or "Nothing else waits on you."
when nothing is.

#### Scenario: A declined request in the review drawer

- **WHEN** an approver declines a request with a reason, and the requester, another approver, a viewer and the person who declined it each open it in the review drawer
- **THEN** the requester reads "<approver> declined your request" with the reason, the other approver and the person who declined it read "Reason: “<reason>”", and the viewer sees no reason

#### Scenario: Approve and launch from the drawer

- **WHEN** an approver opens the last request waiting on them from the Home and confirms **Approve and launch**
- **THEN** the drawer says "Recorded: you approved revision <r> and launched version <m>." and then "Nothing else waits on you." with **Back to the list**

### Requirement: Evidence on change request cards

Every change request card on the goal page SHALL show (the Requests tab lists requests as one Desk list and opens each in the review drawer, which has its own evidence summary; see "Workspace Requests tab"), under "Evidence for revision <n>"
(or "No evidence attached." when the current revision has no links), the Align snapshot of the current revision as "Recorded by Align at revision <n>" (the goal's estimated spend in the last 30 days, by the money rule the MCP snapshot line uses (`lib/v2/money.mts`: rounded to four decimals first, then "$0.0010" under one cent, "under $0.0001" for a cost that is not zero but would round to "$0.0000", and two decimals from one cent, so 9,999 micro-dollars reads "$0.01" as 10,000 does; `scripts/test-v2.mjs` "C7-3: ..."), with its request count, "1 request" for one as in the MCP snapshot line (one count-and-noun helper, `lib/v2/plural.mts`, for both: `scripts/test-v2.mjs` "C5-4: ..."), and its models, or "Spend on this goal is hidden from you.", the sessions bound to it and its last activity), and each link on the current revision with its kind ("Pull request", "CI run", "Incident", "Dashboard", "Doc" or "Link"), its label as a link to its URL that opens in a new tab with `rel="noopener noreferrer"`, the URL's host, who added it ("you" for the person) and "Self-reported" or "Agent reported" (the evidence label). It SHALL never call a link verified. Links on earlier revisions SHALL be listed under "From revision <n>". When `can.add_evidence` is set, **Add evidence** SHALL open a form with a kind, an https link and "What it shows" (at most 120 characters) whose **Add link** posts `{kind, url, label, revision}` to `.../change-requests/<id>/evidence` (a 409, for a request declined, withdrawn, approved or countered meanwhile or a link already there, is refused like any decision: the form closes, the card shows a focused alert "Not recorded. <the server's message>", such as "Not recorded. This request was declined by <name>, so nothing changes.", and reloads to show the request as it is now: `scripts/test-v2.mjs` "C8-1 (ui): ..."); a link whose `can_remove` is set SHALL offer **Remove**, which sends `DELETE .../evidence/<evidence id>` (a 409, for a request declined, withdrawn or countered meanwhile, is refused as **Add link**'s is: a focused alert "Not recorded. <the server's message>", such as "Not recorded. This request was declined by <name>, so nothing changes.", and the card reloads to show the request as it is now: `scripts/test-v2.mjs` "c9 W1 (ui): ..."). Once approved, the card SHALL say "Approved without evidence on the approved revision (<r>)." (links on earlier revisions are still listed under "From revision <n>") or "Approved with <n> evidence link(s), none verified." An **Add link** for a link that can no longer become an `https://` one (`http://…`) SHALL stay disabled with the hint "Use an https:// link: Align keeps only https links."

#### Scenario: Approve without evidence

- **WHEN** an approver chooses **Approve** on a revision with no evidence links
- **THEN** its input asks "Approve without evidence?" and explains that the decision record and the audit log will say so, and the confirmation's Evidence row says "None"; once approved the record says "Approved without evidence on the approved revision (<r>)."

#### Scenario: A link is added

- **WHEN** the requester adds a pull request link labelled "Pen-test vendor contract"
- **THEN** the card lists "Pull request", "Pen-test vendor contract" linking to the URL in a new tab with `rel="noopener noreferrer"`, the URL's host, "by you" and "Self-reported", and approving it afterwards shows "Approved with 1 evidence link, none verified."

### Requirement: Workspace Requests tab

The Requests tab at `/app/w/<ws>/requests`, headed "Change requests", SHALL show the change requests the person can
see, from one read of `GET /api/v2/workspaces/<ws>/change-requests`, as one list with the filters "Waiting on me",
"Waiting on others", "Decided" and "All", each with its count ("On me" and "Waiting" below 400 px), starting on
"Waiting on me" when anything waits on the person and on "All" otherwise, and a search field ("Search goal, person,
reason"). A line above it says "<n> decisions waiting on you. <m> waiting on others." ("1 decision …", or "Nothing is
waiting on you. <m> waiting on others."). Each row SHALL show Request (the goal's title, then what the request changes
in words, its first change and "and <n> more changes" when there are more, and "your request" or "<requester>'s
request"), State (the Home's word for it as a status pill), Versions ("Asks for v<n>", "Approved v<n>", "Launched v<n>"
or "Not approved"), Evidence ("No evidence attached" when the current revision has no link, and the shared evidence
summary) and Updated (how long ago). A row opens the request in the review drawer (`?review=<goal>.<id>`); its action
is the Home's for that request (**Review**, **Launch v<n>**, **See the change** and so on), else **Review** when its
`can` flags give the person anything to do, else "No action" for a decided one or whom it waits on ("<names> can
decide", "… can launch it"). Beside **Review**, a quiet **Approve only** SHALL be offered only when the request has
evidence on its current revision and the person's `can.approve` is set, never on a row whose action is a launch; it
sends the approval through the review's own path, reading the request again first and sending nothing if it changed or
its evidence was removed meanwhile, and the row then says "Recorded: you approved revision <r>. Not launched yet." (or
"Not recorded. …"). A row never launches.

#### Scenario: Filters

- **WHEN** a member opens the tab
- **THEN** "Waiting on me" holds the requests whose `waiting_on_me` is true for the person (pending requests they may approve, their own countered requests waiting for them to accept, and approved requests they may launch that nobody has launched yet, including ones someone put off with not yet: the same rule as the Home's "Approved, not launched"), "Waiting on others" the other open ones, "Decided" the rest, and "All" every request they can see; each row opens the review drawer, with the same actions as on the goal page

#### Scenario: One-click approval

- **WHEN** an approver presses **Approve only** on a row whose request has an evidence link
- **THEN** the request is approved, not launched, and the row says "Recorded: you approved revision <r>. Not launched yet."; a row with no evidence offers only **Review**

#### Scenario: Nothing to show

- **WHEN** the person can read no change request, or a filter has nothing
- **THEN** the tab says "No change requests yet" ("Nobody has asked to change a goal you can see. …"), or the filter says "Nothing is waiting on you", "Nothing is waiting on others" or "No decided requests" with "Pick another view above."; a failed read says "Change requests unknown" with **Try again**, never that nothing waits

### Requirement: Decision value card

An approved change request's card on the goal page SHALL show a "What this decision gave you" card to the person who
approved it (the request's `approved_by`) and to nobody else (founder ruling, Nov 11), from
`GET /api/v2/workspaces/<ws>/goals/<goal>/change-requests/<id>/value` (`lib/v2/value.ts`; `409 not_approved` for any
other state, `404` for a request the person can't read); for anyone else the page SHALL not make that read, so nothing
is fetched or recorded for them, and they read the decision record without the card. The card has these
rows: "Accepted change" (each change in words, one line each, the same lines as the MCP decision record: "<measure>
target 500 → 600", "Added measure …", "Removed measure …", "Title … → …", "Status … → …", "Added limit …", "Now
depends on <title>", never a count like "Measures: 1 → 1"; a dependency the reader can't read counted after the named
ones, as on the rest of the card, "Now depends on <title> and 1 other goal you can't see" ("Now depends on a goal you
can't see" when it is the only one), never left out: `scripts/test-v2.mjs` "C5-3: ..."; and the version it became once launched, or "Approved, agents
still on v<n> until launch"), "Who approved" (the approver, "You" for the reader, and time, and "approved without
evidence" when so), "Affected goals and
teams" (the goal and its team, the readable goals it contributes to and the readable goals that depend on or contribute
to it), "Agents on the new version" (before the launch "Not launched yet: agents stay on v<n> until launch."; after it,
of the bound sessions the launch's `goal_version` directive reached: how many have it in context, received but not used
yet, and not reached; "No shared sessions work toward this goal yet." when none; marked "Receipt" when any of
those sessions' machines sent a receipt for it, else "Not observed", as in "Evidence class on every agent-status
item"), once launched "Connected AI apps" (the apps the reader can see on the Apps tab, a workspace owner every one,
that Align sent the version the launch made when they read the goals, the `mcp` part's "Goal versions Align sent an
app are recorded": "<app> (connected by <person>): Align sent it version <n> on <time>", and that Align can't see what
the app does next; with none, "Align hasn't sent version <n> to a connected app yet" ("an app you connected" for anyone
but a workspace owner); marked "Receipt" when it lists any app, else "Not observed"; main #56), "Measured in
Align" (proposal to
approval, approval to launch, and approval to the first `applied` receipt of the launch's directive, from server
timestamps only; "not yet" while there is none), one optional question with a note, "What others said" (other
people's reports, when the read's `sees_all_reports` is set and there are any), and the follow-up link.

#### Scenario: The optional question

- **WHEN** the approver answers "Before Align, how long would getting this decision usually take?" with one of five answers (Same day, 2–3 days, About a week, Longer, It wouldn't get decided) and an optional note of at most 500 characters
- **THEN** `POST .../value {action: "reported", estimate, note?}` saves their value report (`v2_value_reports`, one per person per request; control, bidi and zero-width characters removed from the note), records `value_reported` with the estimate only, and the card shows "Your estimate: … · Measured here: …" with the note; for 7 days after it was saved they may change it (**Change my answer**), after that the server answers `409 edit_closed`

#### Scenario: Who sees the card

- **WHEN** the request's approver, its requester, a member of its approval set who did not approve it, a workspace owner and a viewer open the approved request on the goal page
- **THEN** only the approver sees "What this decision gave you" (with "What others said" listing every other person's estimate and note when the read's `sees_all_reports` is set); for everyone else the card is not shown and `GET .../value` is not read

#### Scenario: Viewed once it is seen

- **WHEN** the card loads below the fold and the person scrolls until at least 75% of its top 240 px is on screen (clipped by the window and any scroll column) and stays there for one second
- **THEN** the page posts `{action: "viewed"}` once (the server keeps one `value_card_viewed` per person per workspace); a card nobody scrolled to, or whose top was seen for less than a second, records nothing. The card is taller than the screen, so its top, not half of it, is what a reader sees (LIM-2445, #38)

#### Scenario: Apps Align sent the launched version

- **WHEN** a workspace owner approves a change that is launched as version 2, one member's app then reads the goals, and the owner's app last read them at version 1
- **THEN** the owner's card shows "Connected AI apps" marked "Receipt" with "<member's app> (connected by <member>): Align sent it version 2 on <time>" and not the owner's own app; before the launch the row is not shown (`apps` is `null`), and once the member disconnects the app it is gone

#### Scenario: Follow-up link

- **WHEN** a follow-up link is set (`ALIGN_FOLLOW_UP_URL`, shown only if it is an https URL without credentials or a non-default port, or a `mailto:` with one address and only a subject; when hosted and unset, `<public origin>/app/request-access?interest=evaluate&via=value_card`; in Mode L and unset, none)
- **THEN** the card shows the pitch and "Want to evaluate Align on a real workflow? Ask for a follow-up; it can end with an optional, non-binding letter of intent." opening it in a new tab (`noopener noreferrer`), and a click posts `{action: "follow_up"}`; with no valid link the row is not shown

### Requirement: Workspace People tab members

The People tab SHALL list the workspace's members from `GET /api/v2/workspaces/<ws>`, let a workspace owner change a
member's role or remove a member, and let any member leave.

#### Scenario: Change a role

- **WHEN** an owner picks Owner, Member or Viewer next to a member
- **THEN** the page posts `{role}` to `POST /api/v2/workspaces/<ws>/members/<user>` and the list shows the new role; members and viewers see roles as pills only

#### Scenario: Remove a member

- **WHEN** an owner presses **Remove** next to another member
- **THEN** a panel under the member says "Remove <name> from <workspace>? Their team places, device access and connected apps for this workspace end. Their goals, sessions and history stay, under their name for 30 days and then as "Former member"." with an unticked "Also delete their shared sessions in this workspace now" box, **Remove <name>** and **Cancel**; **Remove <name>** calls `DELETE /api/v2/workspaces/<ws>/members/<user>` (with `?delete_sessions=1` when the box is ticked) and the member disappears from the list

#### Scenario: Delete the workspace

- **WHEN** an owner presses **Delete workspace** in the "Delete this workspace" card and confirms "Delete <workspace>? Everyone loses access now. Owners can restore it for 30 days, then it is erased."
- **THEN** the page calls `DELETE /api/v2/workspaces/<ws>` and opens `/app`, where the workspace is under "Deleted workspaces"; members who are not owners see no such card

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

- **WHEN** an owner enters an email, picks a Role (Member, "Viewer (read only)", Owner), optionally a Team and, once a team is picked, a team role (Member by default, or Lead; the field is not shown with "No team"), and presses **Create invite link**
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

#### Scenario: Remove someone from a team

- **WHEN** an owner or the team's lead presses **Remove** next to a team member
- **THEN** a panel under the person asks first: "Remove <name> from <team>? They stop seeing the goals only <team>'s members can see (for a lead, "and deciding on <team>'s goals"; for a workspace owner, who sees every team goal, neither). Their goals, sessions and history stay, and they stay in the workspace." ("Leave <team>?" … for oneself), with **Remove <name>** (or **Leave <team>**) and **Cancel**; nothing is removed until **Remove <name>**, which calls `DELETE .../teams/<team>/members/<user>`

#### Scenario: Leads are owner-only

- **WHEN** a team lead who is not a workspace owner manages the team
- **THEN** the role choice offers only Member, and other leads have no **Remove** or role control; a workspace owner can make anyone a lead, change a lead's role (posting the new role to `.../teams/<team>/members`) and remove anyone with **Remove** (`DELETE .../teams/<team>/members/<user>`)

### Requirement: Workspace Sessions tab

The Sessions tab SHALL list the person's own shared sessions with their usage and controls, and for workspace owners
everyone's shared sessions with stop and resume, from `GET /api/v2/workspaces/<ws>/sessions`.

#### Scenario: Own sessions

- **WHEN** a member opens the tab
- **THEN** each of their sessions shows its title (or repo alias or "<harness> session"), harness, state ("shared", "suspended", "not shared", "ended: device signed out" or "ended: left the workspace", the two ended states with no **Stop agent**, **Resume agent** or **Stop sharing**, only **Stop sharing for good** and **Delete shared history**, and "Stopped; can't be resumed from here" when its agent was stopped), its stop or resume progress ("Stop sent, not yet received", "Stop received by the machine", "Local stop active", "Resume sent, not yet received", "Resumed") marked "Receipt" once the machine sent any receipt for it and "Not observed" before, the goal it counts under and follows (for a session no longer shared, "Sharing stopped <time>, so nothing more counts" or "Sharing ended <time>, …" for an ended one, never "Counting under: no goal"), and its requests and tokens, with **Stop agent** or **Resume agent**, **Stop sharing** and **Delete shared history**

#### Scenario: A session whose device signed out

- **WHEN** a member opens the tab after the machine that shared one of their sessions signed out of Align (`align logout`, removal on the web, or Sign out everywhere with "Also unpair all my devices")
- **THEN** that session reads "ended: device signed out" with the note "The machine that shared this session signed out of Align, so sharing ended and Stop or Resume can't reach it. ... To share it again, run align login on that machine, then ::align share in the session. To keep it from being shared again, press Stop sharing for good." ("It stays stopped on that machine until it is shared again and you resume it here." in between when its agent was stopped)

#### Scenario: A session ended by leaving the workspace

- **WHEN** a member who was removed from the workspace (or left it) while a session of theirs was shared is invited back and opens the tab, without the machine that shared it ticked on Join; then once that machine has the workspace again (from the Devices page, or ticked on Join); then once it has signed out (`scripts/test-v2.mjs` "S1, W7 (ui): ..." and "W7 (ui): ...")
- **THEN** that session reads "ended: left the workspace" with the note "Sharing ended when you left this workspace (or were removed from it), so Stop or Resume can't reach it. ... <how to share it again> To keep it from being shared again, press Stop sharing for good." ("It stays stopped on your machine until it is shared again and you resume it here." in between when its agent was stopped), where how to share it again follows where that machine (the session list's `device`) stands now, in the words Stop and Resume's `member_removed` refusal uses too (`directives` "The session's person left the workspace"): still paired without the workspace, "To share it again now that you are back, give its machine, <device name>, this workspace on your Devices page (Give this device the workspace), then run ::align share in the session." with a link to `/app/devices` (never `align login`, which would end that machine's shares in its other workspaces); given the workspace again, "Its machine, <device name>, has this workspace again: to share it again, run ::align share in the session."; signed out, "To share it again now that you are back, run align login on that machine (it has signed out of Align) and give it this workspace, then ::align share in the session."

#### Scenario: Stopping an ended session for good

- **WHEN** the person presses **Stop sharing for good** on a session that ended "ended: left the workspace" or "ended: device signed out" (`scripts/test-v2.mjs` "W8 (ui): ...")
- **THEN** the page asks "Stop sharing this session for good? It won't be shared again, even if its machine runs ::align share. What was already shared stays until you delete it." and on confirm posts to `.../sessions/<key>/stop-sharing` (`workspaces` "Stopping a session that had ended"), and the row reads "not shared", with no ended state and no **Stop sharing for good**

#### Scenario: Confirmed actions

- **WHEN** the person presses **Stop sharing** or **Delete shared history**
- **THEN** the page asks "Stop sharing this session? Nothing more will be uploaded. What was already shared stays until you delete it." or "Delete this session's shared history? Its usage is removed from every total, so goal and team totals will change. This can't be undone." and on confirm posts to `.../sessions/<key>/stop-sharing` or calls `DELETE .../sessions/<key>`

#### Scenario: History already deleted elsewhere

- **WHEN** the person deletes a session's shared history that was already deleted in another tab, window or from its machine (`DELETE` answers 410 `history_deleted`; `scripts/test-v2.mjs` "Z3 (ui): ...")
- **THEN** the deletion counts as done: the list is read again, so the row is gone, and the page says "That session's shared history was already deleted, in another tab or window or from its machine, so it is no longer listed." instead of an error, until the person's next action on the tab (**Stop sharing** on another row, say), which clears it (`scripts/test-v2.mjs` "W5 (ui): ...")

#### Scenario: Owners see everyone's sessions

- **WHEN** a workspace owner opens the tab
- **THEN** an "Everyone's shared sessions (workspace owners)" card lists each session's owner, repo alias and harness, and "started <time> · …<the key's last 6 characters>" so two sessions of one person in one repository can be told apart (`scripts/test-v2.mjs` "W3 (ui): each row of the owner's Everyone list ..."), with **Stop agent** or **Resume agent** (`POST .../sessions/<key>/stop` or `/resume`), never titles or usage; a suspended own session shows "The alignment this session counted under was revoked. Pick a goal for it on your machine to resume uploads."

### Requirement: Workspace Alignments tab

The Alignments tab SHALL show the alignment requests the person is part of, from
`GET /api/v2/workspaces/<ws>/alignments`, under "Waiting on you", "Your requests" and "Others you are part of", with
only the actions the server allows.

#### Scenario: Alignment card

- **WHEN** a member opens the tab
- **THEN** each card shows "<requester> asks to align with <goal>" ("You ask to align with <goal>" for the requester; goals the person can't read show as "a goal you can't see"), the state, the choice, the revision, its effects, its sessions (each with "started <time> · …<the key's last 6 characters>", so two sessions of one person in one repository can be told apart), each approval requirement with the people who can satisfy it and whether it is satisfied ("you" for the reader, as everywhere on the card) while it is open or approved, the note and the history, and the buttons its `can` flags allow: **Approve**, **Suggest a change**, **Accept the change**, **Decline**, **Withdraw**, **Revoke**

#### Scenario: A closed request shows its decision

- **WHEN** a person opens the tab with a request that was declined, withdrawn or revoked (`scripts/test-v2.mjs` "A1-cross-8 (ui): ...")
- **THEN** in place of "Approvals needed" (none is waited for any more) its card says who closed it and when, from the view's `closed_by` and `closed_at`: "Declined by <name>, <time>. Nothing changes.", "Withdrawn by <name>, <time>. Nothing changes." or "Revoked by <name>, <time>. It has no effect from then on; past usage did not move.", with "you" for the reader ("Declined by you, …"), and never "waiting"

#### Scenario: Alignment decisions are confirmed

- **WHEN** a person decides on an alignment from its card (`scripts/test-v2.mjs` "X2 (ui): approving an alignment request leaves a \"Recorded: …\" line ...")
- **THEN** the card shows a "Recorded: …" line as change-request and target-change decisions do, kept when the reload moves the card to another section: "Recorded: you approved revision <r>. Every approval it needs is in, so it takes effect now." (or "… It still needs another approval before it takes effect."); "Recorded: you suggested a change to <requester>. They accept it, then it needs approval again."; "Recorded: you accepted the suggested change. It waits for approval again." (or "… Every approval it needs is in, so it takes effect now."); "Recorded: you declined this request. Nothing changes."; "Recorded: you withdrew your request. Nothing changes."; "Recorded: you revoked this alignment. It has no effect from now on; past usage does not move."; a refusal reads "Not recorded. <the server's message>", and a 409 reloads the card

#### Scenario: Alignment decisions name the revision on screen

- **WHEN** a person presses **Approve**, **Accept the change**, **Decline**, **Withdraw**, **Revoke** or sends a counter on a card showing revision <r>
- **THEN** the button posts `{revision: <r>}` (with the counter's fields for a counter), so a card left open while someone else countered the request records nothing: **Decline** reads, focused, "Not recorded. This request changed after you read it: <name> countered it, and it is now at revision <r+1>. Read it again and decide again." and the card reloads at the new revision (`scripts/test-v2.mjs` "c10 C10-2 (ui): ...")

#### Scenario: Counter and revoke

- **WHEN** an approver presses **Suggest a change**, or someone involved presses **Revoke**
- **THEN** a counter form (choice, sessions to keep, note) posts `{revision, choice, keep, note}` to `.../alignments/<id>/counter`, and revoking first confirms "Revoke this alignment? From now on it has no effect. Sessions that counted under the goal only because of it stop uploading until their owner picks a goal. Past usage does not move."

#### Scenario: Target changes

- **WHEN** a member opens the tab
- **THEN** a "Target changes" card (anchor `#target-changes`) lists the reallocations from `GET /api/v2/workspaces/<ws>/reallocations` the person can read, each as "<requester or You> proposed new targets", its state ("waiting for approval", "approver suggested other targets", "approved", "declined", "withdrawn", "superseded"), each goal as "<title>: <from> → <to>" ("A goal you can't see: changes" otherwise) with "(approved by <name>)" or, while the proposal is open, "(needs one of: <names>)" (a declined, withdrawn or superseded one needs nobody, so it says neither for a goal it never got approved: `scripts/test-v2.mjs` "c9 W7 (ui): ..."); the reader is "you" in every line of the card ("(approved by you)", "Launched by you", "Declined by you: “…”", never their own name: "c9 W3 (ui): ..."), and a declined proposal says who declined it, with the reason when there is one; the requester's reason ("<requester>'s reason: “…”", from their first revision, kept whatever a counter says or leaves out) and the latest counter's note ("<name>'s note on revision <r>: “…”") (`scripts/test-v2.mjs` "X3 (ui): ..."), where the launch stands ("Approved, waiting for launch. Agents still have the old targets.", "Approved, not launched yet: …", "Launched by <name>, <time>. Agents on these goals hear the new targets at their next turn.", or why it was superseded), and the buttons its `can` flags allow: **Approve (agents switch at launch)**, **Approve and launch**, **Launch**, **Not yet**, **Accept the counter**, **Counter** (a target field per goal and a note), **Decline**, **Withdraw**, each posting the revision on screen (`{revision}`, a 409 `stale_revision` when someone countered meanwhile); for everyone but viewers a "Propose new targets" form lists each active goal ("<title> (now <n>% | no target)") with a blank field meaning unchanged, an optional "Why", and **Propose <n> change(s)**, which posts `{targets, note}` to `POST /api/v2/workspaces/<ws>/reallocations`

#### Scenario: Target-change decisions are confirmed

- **WHEN** a person proposes new targets or takes a decision on a proposal (approve, approve and launch, launch, not yet, counter, accept the counter, decline, withdraw) (`scripts/test-v2.mjs` "W2 (ui): approving and launching new targets on the Alignments tab ...")
- **THEN** the page shows a "Recorded: …" line as change-request decisions do: "Recorded: you proposed new targets for <n> goals. Someone who can approve for each goal decides on its part."; "Recorded: you approved revision <r>. Every goal in it is approved; agents keep the old targets until someone launches it." (or "… for the goals you decide on. Other goals in it still need an approval."); "Recorded: you approved revision <r> and launched it. Agents on these goals hear the new targets at their next turn."; "Recorded: you launched the new targets. Agents on these goals hear them at their next turn."; "Recorded: you decided not yet. Agents keep the old targets until someone launches the new ones." (the words of the refusal of a second not yet: `scripts/test-v2.mjs` "c12 W4 (ui, E2E-WEB cycle 12): ..."); "Recorded: you suggested other targets to <requester>. …"; "Recorded: you accepted the suggested targets. …"; "Recorded: you declined these targets. …"; "Recorded: you withdrew your proposal. …"; a refusal reads "Not recorded. <the server's message>", and a 409 reloads the proposal

#### Scenario: Approval would make a loop

- **WHEN** **Approve** gets 409 `cycle`
- **THEN** the card shows "Not recorded. Approving this would make these goals contribute to each other in a loop." and the request stays pending

### Requirement: Workspace Asks tab

The Asks tab at `/app/w/<ws>/asks` SHALL show the asks the person reads, from `GET /api/v2/workspaces/<ws>/asks`, under
"Waiting on you" (asks whose `waiting_on_me` is set), "Asked of your teams", "Your asks" and, for workspace owners,
"Others", each card with only the buttons its `can` flags allow; it SHALL give owners and members a "Record an ask"
form and workspace owners an import.

#### Scenario: Ask card

- **WHEN** a member opens the tab
- **THEN** each card shows "<who asked> asked <team>" (the requester's name when nobody is named, "You" for the requester), the state pill (open amber, accepted violet, done green, declined and withdrawn neutral), the goal it concerns as a link when the person can read it, the text in quotes, "<meeting>, <date>" (just the date for an ask recorded by hand) followed by " · came up again <n> times, last on <date> (<where>)" when it has mentions, who recorded and who last decided it ("Recorded by you · declined by you" for the reader; a done ask "marked done by <name>", the refusal's words, never "done by": `scripts/test-v2.mjs` "c10 W3 (ui): ..."), the mentions under "When it came up again", and **Accept**, **Mark done**, **Decline**, **Reopen**, **Came up again** and **Withdraw**, which post to `.../asks/<id>/<action>` (a 409, for an ask decided meanwhile in another tab, is refused as a change request's decision is: a focused alert "Not recorded. <the server's message>", such as "Not recorded. This ask was declined by <name>, so nothing changes.", and the card reloads: `scripts/test-v2.mjs` "c9 W4 (ui): ..."); with none in a section, "Nothing is waiting on you." or "No asks yet.", except that "Asked of your teams" and "Your asks" say "No other asks of your teams. The ones that need you are under Waiting on you." (or "No other asks of yours. …") when the asks that would be theirs are all waiting on the person

#### Scenario: Came up again

- **WHEN** a person presses **Came up again**
- **THEN** a form with When (a date), What was said (up to 300 characters) and Where (up to 120) posts `{date, text, source_title}` to `.../asks/<id>/mention`

#### Scenario: Record an ask

- **WHEN** an owner or member fills Team asked, What they were asked (up to 400 characters), Who asked (optional, up to 80), Where it was asked ("In a meeting" with its title, or "Recorded by hand"), Date and the optional goal it concerns (the selected team's active goals) and presses **Record ask**
- **THEN** the page posts `{team_id, text, from_label, goal_id, source:{kind, title, date}}` to `POST .../asks` and lists the new ask; viewers see no form, and a workspace with no teams says "This workspace has no teams yet. A workspace owner adds them on the People tab."

#### Scenario: Import asks

- **WHEN** a workspace owner opens "Import asks (JSON, at most 60)", pastes a list of asks (or `{"asks": [...]}`) and presses **Import**
- **THEN** the help names each field (a team by `team`, its name, or `team_id`) and lists "Teams here: <name> (team_id <id>), …", the page posts `{asks}` to `POST .../asks/import` and shows "Imported: <created> new, <merged> came up again, <unchanged> already recorded."

### Requirement: Agent activity on the goal page

The goal page SHALL show an "Agent activity" card from `GET /api/v2/workspaces/<ws>/goals/<goal>/activity`, marked
with the response's one evidence class ("Agent reported", or "Not observed" with nothing in the window) and saying
"Sessions people shared toward this goal, last 14 days. Counts come from bindings, not from what agents wrote.", with
Sessions (and how many per harness, as "<n> Claude Code, <n> Codex"), "Reported activity, last 90 min" (what the align
CLI reported in the last 90 minutes, never "active now") and "Last reported activity" ("None yet" when there is none),
and, when the response has `detail`, "Files these sessions reported working on" (its paths, then "and
<n> more whose paths aren't shared"; with no path shared, only "These sessions reported working on <n> files whose
paths aren't shared.", never the heading over an empty list) and "Your sessions" (harness, a state pill and the last
activity). Nothing on the
card says what agents are doing: the files are what the sessions' align CLI reported.

#### Scenario: Activity card

- **WHEN** a member of the goal's team opens a goal with two bound sessions, one active, and work signals with paths
- **THEN** the card is marked "Agent reported" and shows "Sessions 2 (1 Claude Code, 1 Codex)", "Reported activity, last 90 min 1", the paths and their own sessions; a reader without the detail sees only the counts, and with no sessions the card is marked "Not observed" and says "No shared sessions worked toward this goal in the last 14 days."

### Requirement: Agents on this goal card

The goal page SHALL show, under the "Agent activity" card, an "Agents on this goal" card from
`GET /api/v2/workspaces/<ws>/goals/<goal>/requests`, shown when the reader may send requests or hold the goal or
when the goal has requests. For a person who may hold the goal it SHALL offer **Hold all agents on this goal** with an
optional reason (at most 280 characters, "shown to the developers") while the goal is active and not held, and
**Release** while it is held, calling `PUT` and `DELETE /api/v2/workspaces/<ws>/goals/<goal>/hold` and showing
**Sign in again** on 403 `reauth_required`. Each button SHALL say before it is pressed that it needs a sign-in from the
last 15 minutes (a developer told to lift a hold "from the web" otherwise meets it only as a refusal: E2E-AGENT cycle
13, section 5): under **Release** "Releasing needs a sign-in from the last 15 minutes: with an older one, Align asks you
to sign in again and brings you back here to press Release again." (`scripts/test-v2.mjs` "c13 recent sign-in ..."),
and under **Hold all agents on this goal** "Align blocks their tools until someone who can approve for the goal
releases it. Holding, like releasing, needs a sign-in from the last 15 minutes: with an older one, Align asks you to
sign in again and brings you back here." For a person who may send requests it SHALL offer "Send a request" with
the type choices Replan, Checkpoint and Switch goal (each with a sentence saying what the agent does and whether the
developer is asked first), for Switch goal a checkbox per session on the goal (its name, then "started <time> · …<the
key's last 6 characters>", so two sessions of one person in one repository can be told apart) and a target-goal picker of the other
active goals, an optional note (at most 280 characters, "shown to the developer and the agent, quoted") and
**Send** (`POST …/requests`), or "No shared session is working on this goal, so there is no one to send a request
to." when there is no session. Each request SHALL be listed with its type, a pill (waiting, answered, cancelled, "expired: the goal closed", or "expired: its sessions ended" when its `expired_reason` is `sessions_ended`), its
sender and time, the goal version it was sent at, the target goal ("a goal you can't see" when hidden), the quoted
note, who cancelled it, the counts ("<n> accepted by the developer, <n> delivered and not declined"), and per visible
session its name, "started <time> · …<the key's last 6 characters>" (so two sessions of one person in one repository
can be told apart) and a pill: pending, accepted by the developer, "delivered, not declined" (an `auto_accepted` accept: the request
reached the agent and the developer did not decline it by the end of that turn; it never says the agent did it),
declined, expired, or for a session that ended before it answered "ended: device signed out" or "ended: left the workspace" (its row's `ended_reason`), each with one evidence class: "Receipt" for a request the session's machine received and
has not answered and for one delivered and not declined, "Agent reported" for the developer's answer (accepted or
declined, sent from their machine), "Not observed" for one sent with nothing back, expired or ended; with **Cancel** when its
`can_cancel` is true.

#### Scenario: A new goal version reloads the card in place

- **WHEN** the goal gets a new version while the page is open (a launch from the Change requests card, a version saved in the New version form, the goal closing), with a hold reason or a request note typed into the card (`scripts/test-v2.mjs` "C3-4 (ui): launching version 2 from the goal page reloads ...")
- **THEN** the card's requests are fetched again in place: it never shows "Loading…", disappears or appears twice, and what was typed into it stays

#### Scenario: A request whose sessions ended

- **WHEN** a goal's checkpoint waited only on sessions that then ended (their person was removed or deleted their account, or their device signed out, alone or through Sign out everywhere with "Also unpair all my devices") (`scripts/test-v2.mjs` "C3-1 (ui): on the goal page a request whose sessions ended reads ...")
- **THEN** the request reads "expired: its sessions ended", never "expired: the goal closed" while the goal is active, and each session "ended: left the workspace" or "ended: device signed out"; a request that expired because its goal closed still reads "expired: the goal closed"

#### Scenario: Approver sends a replan

- **WHEN** a goal's lead picks Replan, types a note and presses **Send** while sessions work on the goal
- **THEN** the request is created (201) and listed with "waiting", the lead as sender and the quoted note

#### Scenario: A checkpoint delivered and not declined

- **WHEN** a checkpoint reached one session's agent and its developer did not decline it by the end of that turn, and another session's developer accepted it
- **THEN** the request's sessions show "delivered, not declined" marked "Receipt" and "accepted by the developer" marked "Agent reported"; nothing reads "done by the agent"

### Requirement: Hold banner

The app SHALL show, while a goal is held, a banner "All agents on this goal are on hold." naming who paused them
("You paused them" to that person, never their own name),
when, and the reason, saying their tools are blocked until someone who can approve for the goal releases it: at the
top of the goal page (from `GET …/goals/<goal>/hold`), and on the Sessions tab for each held goal the reader can read
(from `GET /api/v2/workspaces/<ws>/holds`, naming the goal); the Goals tab SHALL mark a held goal's row with an
"agents on hold" pill.

#### Scenario: Member's Sessions tab during a hold

- **WHEN** a member whose sessions work on a held goal opens the Sessions tab
- **THEN** a banner says all agents on that goal, by its title, are on hold, with who held it and the reason

### Requirement: Workspace Spend tab

The Spend tab SHALL show token usage and estimated list cost from
`GET /api/v2/workspaces/<ws>/spend?by=goal|team|session` with a "Group by" choice of By goal, By team and By my
sessions.

#### Scenario: Usage table

- **WHEN** a member (viewers included) opens the tab
- **THEN** a table shows, per row, requests, input, output, cache read, cache write and estimated list cost (by the money rule of the change request snapshot, `lib/v2/money.mts`), with the billing basis per row, then "Not bound to a goal" and "Total", the server's note, "Goals you can't see are grouped without names. There is no per-person view.", and a count of unpriced requests when there are any; by my sessions, usage of rolled-up sessions older than 13 months is one "Older sessions (rolled up)" row

#### Scenario: Agent time against targets

- **WHEN** a member (viewers included) opens the tab
- **THEN** above the usage table an "Agent time against targets" card (pill "steering on" or "steering off") reads `GET /api/v2/workspaces/<ws>/allocation?weeks=6` and shows, for the last 7 days, one line per row ("<goal>", "Goals you can't see" or "Not bound to a goal") with "<share>% of agent time · target <n>%", a pill "<n> points over", "<n> points under" ("1 point over", "1 point under" for one), "on target" or "no target" (the number of points rounds toward zero, and the pill is amber at 10 points or more, the same threshold steering uses on the same one-decimal gap the goals feed sends devices as `allocation.gap_7d`, so a 9.6-point gap reads "9 points over" in grey and no agent is steered from that goal, while 10.0 reads "10 points over" in amber and is: `scripts/test-v2.mjs` "C5-2: ..."), a bar with the target marked, and its fresh tokens, list price, unpriced requests ("1 unpriced request" for one) and sessions ("1 session"); a table of each goal's share per week (weeks start Monday, UTC); "Steering is <on|off>. …" with how many lines were shown in the last 7 days; a "Propose new targets" link to the Alignments tab's target changes; and, for a workspace owner only, **Turn steering on** / **Turn steering off**, which PATCHes `{steering}` to `/api/v2/workspaces/<ws>`

#### Scenario: One point from the target

- **WHEN** goals are 1 point over, 1 point under and 5 points under their targets (`scripts/test-v2.mjs` "C3-2 (ui): the Spend tab says ...")
- **THEN** their pills read "1 point over", "1 point under" and "5 points under", never "1 points"

### Requirement: Workspace Apps tab

The Apps tab at `/app/w/<ws>/apps` SHALL list the AI apps connected to the workspace from
`GET /api/v2/workspaces/<ws>/apps` and explain how to connect one; a person sees their own connections, and a
workspace owner sees everyone's.

#### Scenario: Connected apps

- **WHEN** a member opens the tab
- **THEN** each connection shows the app's name with its evidence label, "Receipt" when it has read the goals and "Not observed" when it hasn't, and "Reads only" or, for a grant holding `changes:evidence`, "Reads, and adds evidence links", its redirect host, the person who connected it, when it was approved, **Last connected** (its last request to Align, `Never` when none) and **Last read the goals** (its last call that returned goals, "Not seen yet" when none), under a note that connecting and listing tools is not a read and that Align doesn't see which goal version an app has, with **Disconnect** on the person's own connections (an owner sees **Disconnect** on every connection), which calls `DELETE /api/v2/workspaces/<ws>/apps/<id>`; with none, "No AI apps are connected to this workspace." for a workspace owner and "None of your AI apps is connected." for anyone else. A "Connected is not the same as read" panel names **Last connected** (it says the app reached Align, not that it read anything), **Last read the goals**, labelled "Receipt" (Align served goals and recorded it), and "Never read", labelled "Not observed", and a panel counts the apps "Connected", "Have read the goals" and "Never read"

#### Scenario: How to connect

- **WHEN** a member who is not a viewer opens the tab
- **THEN** a "Connect an AI app" card shows the MCP URL `<origin>/api/mcp` with **Copy** and says the app will send them to Align to sign in and choose this workspace; a viewer sees "Viewers can't connect apps to this workspace. A member or an owner can." instead

#### Scenario: Terminal lines

- **WHEN** a member who is not a viewer opens the tab
- **THEN** under "Paste into a sh, bash or zsh terminal" it shows a **Claude Code** line, `claude mcp add --transport http --scope user align '<url>'; claude mcp login align`, and a **Codex** line, `codex mcp add align --url '<url>'`, each with its own **Copy**, built by `lib/paste-lines.ts` from the URL alone (single-quoted, never a workspace, team or company name, no hooks and no agent instruction file), and says "For goal context inside Claude Code and Codex sessions, install the align CLI (`align login`, `align install`)."

#### Scenario: A URL Align couldn't have made

- **WHEN** the URL is not `http(s)://` followed by a host name or bracketed IPv6 address, an optional numeric port and `/api/mcp`
- **THEN** each line reads "This server's address can't be turned into a command. Copy the URL instead." and no command is shown

### Requirement: OAuth consent screen

The `/oauth/authorize` page SHALL, in the same look as the web app, let a signed-in person with a recent sign-in grant
an AI app read-only access to one workspace in which they are an owner or member, acting as themselves (and, only when the app asks for the scope `changes:evidence`, also let it add agent-reported evidence links to change requests), and SHALL
refuse requests it cannot trust without redirecting.

#### Scenario: What the page shows

- **WHEN** a signed-in person with a recent sign-in arrives with a valid request
- **THEN** the page shows "Connect <app> to Align", "This app named itself." unless it is a known AI provider's client document, "After you allow it, Align sends you back to <redirect host>.", "Signed in as <name> (<email>).", and "What it can do": it reads goals, change requests, decision records and directives in the workspace they choose, as them and with their role; it can’t propose, approve or change anything; it never sees captured prompts; what it reads is sent to <provider>; they or a workspace owner can disconnect it on the workspace’s Apps tab, and it is disconnected if they leave the workspace

#### Scenario: App asks to add evidence

- **WHEN** the request's `scope` names `changes:evidence`
- **THEN** "What it can do" has the same lines plus "It may also attach links to change requests you can act on, as evidence. Align labels them agent reported.", and the button reads **Allow access** instead of **Allow read-only access**

#### Scenario: Choose a workspace and allow

- **WHEN** the person picks one workspace under "Which workspace" and presses **Allow read-only access**
- **THEN** the page posts `{params, decision:"approve", workspace_id}` to `POST /api/oauth/approve` and follows the returned redirect; **Cancel** posts `decision:"deny"`; **Allow read-only access** stays disabled until a workspace is picked (a person with exactly one such workspace has it picked already)

#### Scenario: Viewer workspaces

- **WHEN** the person is a viewer in some workspaces
- **THEN** those workspaces are not offered; with no workspace they own or are a member of, the page shows "You have no workspace where you can connect an app. Viewers can't connect apps." and no **Allow** button, at once: such a person is never first asked to sign in again

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

### Requirement: Form fields are named by their labels

Every labelled field in the web app (a text field, a text area or a select under a visible label) SHALL have as its
accessible name the label's text alone, and its hint, when it has one, as its description; a select's options SHALL
never be part of its name.

#### Scenario: A select in a form

- **WHEN** a screen reader reaches the invite form's Role select or the Team select
- **THEN** it reads "Role" or "Team (optional)", not "Role Member Viewer (read only) Owner"

### Requirement: No prerender errors in the server log

Pages that read the signed-in session SHALL wait for the request before reading it (the session read checks the
time), so a production server (`next start`) logs no "encountered the unstable value `Date.now()` while prerendering"
error for `/app`, `/app/sign-in` or any other page.

#### Scenario: Opening the app

- **WHEN** a production server starts and `/app` and `/app/sign-in` are opened
- **THEN** both render, and the server's output holds no prerender error

### Requirement: Web app status pills

Pages under `/app` SHALL mark states with plain-word pills of two kinds. Plain pills follow one rule: green for a
settled good state, amber for something waiting or needing attention, red for revoked or stopped, violet for names and
labels that are not states (a team, a "company" goal, an active goal's status) and for an accepted ask (agreed, under
way, like an active goal), neutral otherwise. Status pills, for the state of a change request, an alignment or an
alignment requirement wherever they are shown (the Home's Needs list and goal lines, the Requests tab, the review
drawer, the decision page and the Alignments tab), always carry a word and an icon shape, and follow their own rule:
orchid for an in-between state (pending, countered, held), green for approved, blue for launched, red for declined, and
a neutral dashed pill for a withdrawn or superseded change request (a withdrawn or revoked alignment is a plain neutral
pill). The answers on the Agents on this goal card are plain
pills with their own colors: "accepted by the developer" green, "declined" red and "pending" violet.

#### Scenario: Pill colors

- **WHEN** a page shows a state
- **THEN** an approved change request on the goal page, an active device, a linked sign-in method, a shared session, an achieved goal, a goal "you can bind sessions" to and a reviewed parent goal are green; a pending or countered change request on the goal page, a suspended session, "needs alignment to bind" and a parent not reviewed against its current version are amber; a declined change request on the goal page is neutral; a revoked device, a stopped agent and "agents on hold" are red; an open ask is amber, an accepted ask violet, a done ask green, and a declined or withdrawn ask neutral

#### Scenario: Status pill colors

- **WHEN** a page shows the state of a change request, an alignment or an alignment requirement as a status pill
- **THEN** a pending or countered one, a requirement still waiting and a held one are orchid, an approved one or an approved requirement green, a launched one blue, a declined one red, and a withdrawn or superseded change request a neutral dashed pill

## Open questions

- Should a person be able to propose reopening an achieved or dropped goal? The server refuses change requests on
  such goals (409 `goal_not_active`), so this spec offers **Propose a change** only on active goals.
- Should the account page also let a person unlink a provider? The owner's decision names only linking, so this
  spec offers no unlink.
- Who should the requester's Home and card name as able to launch (or decide on) a request when someone in the launch
  set can't see a dependency it adds? Today "Waiting on …" and "Can launch: …" list the whole set (only that person's
  own views leave them out), so the requester may be told it waits on someone the server will always refuse. Leaving
  that person out would tell the requester, who can see the dependency and the people, exactly who can't see it, which
  "Nobody approves or launches a dependency they can't see" forbids; an unnamed "someone who can see every goal it
  depends on" says the same thing whenever the set is small. No safe wording is chosen yet, so the full set stays.

## Sources

- `proxy.ts`
- `app/page.tsx`
- `app/layout.tsx`
- `app/error.tsx`
- `app/global-error.tsx`
- `app/app/_ui/server.ts`
- `app/app/_ui/kit.tsx`
- `app/app/_ui/passkey.ts`
- `app/app/_ui/types.ts`
- `app/app/_ui/goalform.tsx`
- `app/app/_ui/limits.tsx`
- `app/app/_ui/changes.tsx`
- `app/app/_ui/crparts.tsx`
- `app/app/_ui/decide.tsx`
- `lib/v2/launch-words.ts`
- `lib/v2/change-words.mts`
- `lib/v2/plural.mts`
- `lib/v2/money.mts`
- `app/app/_ui/missing.tsx`
- `app/app/_ui/value.tsx`
- `lib/v2/value-core.mts`
- `lib/paste-lines.ts`
- `app/app/_ui/words.ts`
- `app/app/_ui/error-notice.tsx`
- `app/app/page.tsx`
- `app/app/view.tsx`
- `app/app/sign-in/page.tsx`
- `app/app/sign-in/view.tsx`
- `app/app/request-access/page.tsx`
- `app/app/request-access/view.tsx`
- `app/app/_ui/turnstile.tsx`
- `app/privacy/page.tsx`
- `app/trust/page.tsx`
- `app/_trust/doc.tsx`
- `lib/trust/markdown.mts`
- `lib/trust/docs.ts`
- `lib/trust/entity.ts`
- `docs/trust/privacy-policy.md`
- `docs/trust/security-overview.md`
- `docs/trust/subprocessors.md`
- `docs/trust/dpa.md`
- `docs/trust/questionnaire.md`
- `app/app/account/page.tsx`
- `app/app/device/page.tsx`
- `app/app/account/view.tsx`
- `app/app/device/view.tsx`
- `app/app/devices/view.tsx`
- `app/app/invite/[token]/page.tsx`
- `app/app/invite/[token]/view.tsx`
- `app/app/w/[ws]/view.tsx`
- `app/app/w/[ws]/first-run.tsx`
- `lib/mcp/read-tools.ts`
- `app/app/w/[ws]/goals/view.tsx`
- `app/api/v2/workspaces/[ws]/home/route.ts`
- `lib/v2/home.ts`
- `lib/v2/home-core.mts`
- `app/app/w/[ws]/goals/[goal]/view.tsx`
- `app/app/w/[ws]/people/view.tsx`
- `app/app/w/[ws]/sessions/view.tsx`
- `app/app/w/[ws]/alignments/view.tsx`
- `app/app/w/[ws]/requests/view.tsx`
- `app/app/w/[ws]/asks/page.tsx`
- `app/app/w/[ws]/asks/view.tsx`
- `app/app/_ui/activity.tsx`
- `app/app/_ui/evidence.tsx`
- `app/app/_ui/requests.tsx`
- `app/app/w/[ws]/spend/view.tsx`
- `app/app/w/[ws]/spend/allocation.tsx`
- `app/app/_ui/reallocations.tsx`
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
