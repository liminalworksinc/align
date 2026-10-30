---
name: Identity and workspaces
summary: How people sign in as themselves (Google, GitHub or an emailed one-time code, printed locally in Mode L), and how workspaces, roles, invites, teams, the audit trail, paired devices, shared sessions, usage and spend, activity, rate limits and the local and hosted edges work.
kind: area
---

# Identity and workspaces

Everyone who uses Align is a **person** with their own Better Auth account (`ba_user`). Nothing is reached with a
shared secret: there are no role passcodes, access codes or shared agent tokens. A person signs in with Google or
GitHub (each only when configured) or with a one-time code sent to their email address. When hosted, the code is
emailed; in **Mode L** (the default, loopback-only mode) it is printed to the server's terminal and written to a
private file, and the server creates one local owner account on first start.

Signed in, a person creates **workspaces** (`ws_…`) or joins one by an email-bound **invite**. Each member has one
workspace **role**: `owner`, `member` or `viewer`. Members are grouped into flat **teams** with a `lead` or `member`
team role. A person pairs a **device** (the `align` CLI on their machine) with a key-bound device-code flow, grants it
some of their workspaces, and the device then shares chosen coding-agent **sessions**, opens binding **epochs**,
uploads **usage** and posts **activity** signals. Members read **spend** reports and the workspace's people, teams
and devices; owners also read the **audit** trail.

Goals, goal visibility, approval sets, alignments and change requests are specified in `goals-and-proposals`.
Directives (including stop and resume) are in `directives`, the MCP endpoint and OAuth consent in `mcp`, the CLI in
`local-agent`, and the screens under `/app` in `interface`.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Person | A Better Auth user (`ba_user`, id `u_…`). Signs in with Google, GitHub or an email one-time code |
| Mode L | The default mode: `npm start` binds `127.0.0.1:3100`, and the server answers only loopback `Host` names |
| Hosted | `HOSTED=1`: one public origin (`ALIGN_PUBLIC_ORIGIN`) behind an HTTPS edge, with a route allowlist |
| Web route | An `/api/v2` route authenticated by the Better Auth session cookie (a browser) |
| Device route | An `/api/v2` route authenticated by a device access token `Bearer alnd_…` (the `align` CLI) |
| Workspace | `ws_…`: one organization's goals, people, teams, sessions and usage |
| Workspace role | `owner`, `member` or `viewer`; viewers can read but never change anything |
| Team | A named group of workspace members (stored as `pod`, id `pod_…`); team role `lead` or `member` |
| Invite | A single-use, 7-day link for one email address, optionally naming a team |
| Device | A paired machine (`dv_…`) with an Ed25519 key, workspace grants, a 1-hour access token and a rotating 30-day refresh token |
| Shared session | A coding-agent session a device chose to share, addressed by a 43-character `session_key` |
| Epoch | A period of a shared session bound to one goal (or none); usage counts under its epoch's goal |
| Audit row | `{at, actor, action, object_id}` written by each change a person makes (and by a few automatic events); `actor` is null only for system actions |

**Person lifecycle.** Sign in (provider or email code) → create a workspace or accept an invite → pair a device →
share sessions → change role, leave or be removed (team memberships, device grants and OAuth grants for that
workspace end; goals, sessions and history stay attributed to the person).

**Device lifecycle.** `POST /api/v2/device/authorize` → the person approves the user code at `/app/device` (with a
recent sign-in) → the device polls `POST /api/v2/device/token` and receives tokens once → it refreshes with a
signature → it is revoked by itself, by its owner, by refresh-token reuse, or loses a workspace when its owner leaves
that workspace.

## Requirements

### Requirement: Sign-in providers

The server SHALL mount Better Auth at `/api/v2/auth/*`, offer Google sign-in only when `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are both set, GitHub sign-in only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are both
set, and email one-time-code sign-in always in Mode L and, when hosted, whenever the email settings are set.

#### Scenario: Only configured providers

- **WHEN** a Mode L server starts with GitHub's client id and secret set and no Google settings
- **THEN** the sign-in page offers GitHub and email code, a Google sign-in request is refused by Better Auth, and no other sign-in method exists

#### Scenario: Hosted without email settings

- **WHEN** a hosted server has Google configured and none of the email settings
- **THEN** sign-in is Google only, and a request to send an email code is refused with 404 (the email-code routes are not mounted) without sending anything

### Requirement: Email one-time codes

The server SHALL implement email sign-in with Better Auth `emailOtp` (type `sign-in`) using 6-digit codes that are
stored hashed, are valid for 5 minutes and allow 3 attempts, and SHALL sign a person in only by a POST that presents
the code.

#### Scenario: Requesting and using a code

- **WHEN** a client POSTs `{email, type:"sign-in"}` to `/api/v2/auth/email-otp/send-verification-otp` and then, within 5 minutes, POSTs `{email, otp}` with that code to `/api/v2/auth/sign-in/email-otp`
- **THEN** the second request sets the Better Auth session cookie, the code is spent, and the database holds only a hash of the code, never the code itself

#### Scenario: Wrong, expired or exhausted code

- **WHEN** a wrong code is presented, or the code is older than 5 minutes, or a fourth attempt is made after 3 wrong ones
- **THEN** Better Auth refuses with 400 `INVALID_OTP`, 400 `OTP_EXPIRED`, or 403 `TOO_MANY_ATTEMPTS` (the code is deleted after the third wrong attempt) and nobody is signed in

#### Scenario: Link in the message only fills the form

- **WHEN** a browser opens `/app/sign-in?email=<email>&code=<code>`
- **THEN** the page shows the email and code filled in and a button to sign in; no session is created until the person submits the form, because no GET signs anyone in

### Requirement: Email code send limits

The server SHALL send at most 3 sign-in codes per email address per 10 minutes and at most 10 per client per hour,
refusing further sends with 429 and sending nothing.

#### Scenario: Too many codes for one address

- **WHEN** a fourth code is requested for the same email address within 10 minutes, from any clients
- **THEN** the server responds 429, sends and prints nothing, and the earlier codes stay as they were

#### Scenario: Too many codes from one client

- **WHEN** one client (hosted: its `Fly-Client-IP`, IPv6 keyed by its /64) requests an 11th code within an hour, for any addresses
- **THEN** the server responds 429 and sends nothing

### Requirement: Email code delivery when hosted

The server SHALL, when hosted, deliver each sign-in code through `lib/v2/mail.ts` (called by Better Auth's
`sendVerificationOTP`) as one HTTPS POST of JSON `{from, to, subject, text}` to `ALIGN_EMAIL_API_URL` with
`Authorization: Bearer <ALIGN_EMAIL_API_KEY>` and `from` equal to `ALIGN_EMAIL_FROM`, never print or log the code, and
answer the send request the same way whether or not an account exists for the address.

#### Scenario: Code email

- **WHEN** a hosted client requests a code for an address
- **THEN** the email API receives `to` equal to that address, the subject `Your Align sign-in code`, and a text holding the 6-digit code, the link `<ALIGN_PUBLIC_ORIGIN>/app/sign-in?email=<email>&code=<code>` and the 5-minute expiry

#### Scenario: Unknown address

- **WHEN** a hosted client requests a code for an address with no account and no pending invite
- **THEN** the response is the same success response as for an address with an account, so the send request never reveals whether an account exists

#### Scenario: Email API failure

- **WHEN** the email API answers a non-2xx status, or does not answer within 10 seconds
- **THEN** the send request fails with a server error, the code it made cannot be used, and the server log names only the HTTP status or error name, never the address, code or key

### Requirement: Email code delivery in Mode L

The server SHALL, in Mode L, email nothing and instead print each sign-in link to its standard output as
`Align sign-in for <email>: <url>` and write the same line to `<data>/v2/sign-in.txt` with mode 0600, for any email
address.

#### Scenario: Printed link

- **WHEN** a Mode L client requests a code for `ana@example.com`
- **THEN** stdout shows `Align sign-in for ana@example.com: http://<this request's host>/app/sign-in?email=ana%40example.com&code=<6 digits>`, and `sign-in.txt` (replaced on every send, mode 0600 in the 0700 `v2` directory) holds that line

#### Scenario: Loopback is not a credential

- **WHEN** a browser on the same machine calls any web route without a Better Auth session cookie
- **THEN** the server responds 401 `unauthorized`; being on loopback never signs anyone in, and only someone who can read the server's terminal or `sign-in.txt` can use a printed code

### Requirement: Accounts created by email code

The server SHALL, on a valid email code, sign in the account whose verified email equals the code's address
(compared case-insensitively), and create a new account only when none exists and the address has a pending invite,
or the server is in Mode L, or the server is hosted with no account yet and the address equals `ALIGN_FIRST_OWNER_EMAIL`
(the hosted server's first person); a new account's email is marked verified.

#### Scenario: New person with an invite

- **WHEN** a hosted client signs in with a valid code for an address that has no account but a pending invite
- **THEN** an account is created with that verified email and signed in, and the person can then accept the invite

#### Scenario: New person without an invite

- **WHEN** a hosted client presents a valid code for an address with no account and no pending invite
- **THEN** the sign-in fails with 403 and the message `This email can't sign in here yet. Ask a workspace owner to invite you.`, no account is created and nobody is signed in

#### Scenario: First person on a hosted server

- **WHEN** a hosted server with no accounts and `ALIGN_FIRST_OWNER_EMAIL=ops@example.com` receives a valid code for `ops@example.com`
- **THEN** the account is created and signed in, and the same address gets no such exception once any account exists

#### Scenario: Unverified match

- **WHEN** the only account holding the code's address has an unverified email
- **THEN** the server refuses with 403 `email_unverified` and does not sign in or change that account

### Requirement: Mode L local owner account

The server SHALL, on its first start in Mode L when no Better Auth user exists, create one account named
`Local owner` with the email `ALIGN_LOCAL_OWNER_EMAIL` (default `owner@align.localhost`) and send it a sign-in code,
printed as for any Mode L code.

#### Scenario: First start

- **WHEN** a Mode L server starts on an empty data directory
- **THEN** `ba_user` holds exactly one account, `Local owner` <`owner@align.localhost`>, belonging to no workspace, and stdout shows `Align sign-in for owner@align.localhost: http://127.0.0.1:<PORT or 3100>/app/sign-in?…`

#### Scenario: Later starts

- **WHEN** the server starts and at least one Better Auth user exists
- **THEN** no account is created and no code is sent

### Requirement: Sign-in link script

The command `npm run sign-in-link [email]` SHALL ask the running Mode L server at `http://127.0.0.1:<PORT or 3100>`
to send a fresh sign-in code for the given email (default `ALIGN_LOCAL_OWNER_EMAIL` or `owner@align.localhost`)
through the ordinary send request, so the server prints the link.

#### Scenario: Fresh link

- **WHEN** the owner's first code expired and they run `npm run sign-in-link`
- **THEN** the server prints a new `Align sign-in for owner@align.localhost: …` line and rewrites `sign-in.txt`, and the script exits 0 telling them where the link was printed

#### Scenario: Server not running

- **WHEN** no server answers at that address, or it answers 429
- **THEN** the script exits 1 with a message saying the server is not running or that too many codes were sent, and prints no code itself

### Requirement: Explicit account linking

The server SHALL keep implicit account linking off and let a signed-in person link Google or GitHub to their own
account only by an explicit request from `/app/account`.

#### Scenario: Same email, no link

- **WHEN** a person who signed up with an email code later signs in with GitHub whose email is the same address, without linking first
- **THEN** Better Auth does not attach the GitHub account to the existing account, and the person is not signed in to it through GitHub

#### Scenario: Linking from the account page

- **WHEN** a signed-in person chooses Link GitHub on `/app/account` and completes GitHub's consent
- **THEN** that GitHub account is linked to their account and can sign them in afterwards; a GitHub account already linked to another Align account is refused and stays where it was

### Requirement: Test identity provider

The server SHALL offer Better Auth email-and-password sign-up and sign-in only when `ALIGN_TEST_IDP=1` and the server
is not hosted, for tests.

#### Scenario: Off by default

- **WHEN** `ALIGN_TEST_IDP` is unset and a client POSTs to `/api/v2/auth/sign-up/email`
- **THEN** Better Auth refuses the request and no account is created

#### Scenario: Never hosted

- **WHEN** a hosted server's environment sets `ALIGN_TEST_IDP` to any value
- **THEN** the server refuses to start and names `ALIGN_TEST_IDP is not allowed when hosted`

### Requirement: Recent sign-in for device and app approval

The server SHALL require a sign-in no older than 15 minutes to approve a device on `POST /api/v2/device/approve` and
to approve an MCP app at `/oauth/authorize`, and otherwise ask the person to sign in again.

#### Scenario: Old session approving a device

- **WHEN** a person whose Better Auth session was created 20 minutes ago POSTs `/api/v2/device/approve`
- **THEN** the server responds 403 `reauth_required` and approves nothing, and `/app/device` asks them to sign in again and then shows the same code

#### Scenario: Fresh session

- **WHEN** the same person signs in again and approves within 15 minutes
- **THEN** the approval succeeds; looking up a code and denying it need no recent sign-in

### Requirement: Web and device credentials

The server SHALL accept only the Better Auth session cookie `align_v2.session_token` (`__Secure-align_v2.session_token`
when hosted) on web routes and only `Bearer alnd_…` device access tokens on device routes, with the pairing routes
`device/authorize`, `device/token` and `device/refresh` taking no token but still refusing browsers.

#### Scenario: Wrong credential kind

- **WHEN** a web route (including `/api/v2/auth/*`) receives an `Authorization` header, or a device route receives an `Origin` or `Cookie` header
- **THEN** the server responds 403 `bearer_not_allowed`, `browser_not_allowed` or `cookies_not_allowed` respectively

#### Scenario: Missing credential or cross-site write

- **WHEN** a device route gets no valid `alnd_` token (missing, unknown, expired or revoked), a web route has no Better Auth session, or a cookie-authenticated write carries an `Origin` other than this server (hosted: not exactly `https://<Host>`, or no `Origin` at all) or a `Sec-Fetch-Site` other than `same-origin` or `none`
- **THEN** the server responds 401 `invalid_token`, 401 `unauthorized`, or 403 `cross_site` (checked before the session is read) respectively

### Requirement: v2 request bodies and error envelope

The server SHALL answer every `/api/v2` error (outside Better Auth's own routes) as `{error:<code>, message}`, accept
only JSON object bodies up to each route's size cap, and reject reserved keys anywhere in a body.

#### Scenario: Body refusals

- **WHEN** a non-empty body is not `application/json`, exceeds the route's cap (declared or streamed), is not a JSON object, or contains a `__proto__`, `constructor` or `prototype` key at any depth
- **THEN** the server responds 415 `unsupported_media_type`, 413 `too_large`, 400 `bad_request`, or 400 `bad_request` respectively, and changes nothing

#### Scenario: Unexpected failure

- **WHEN** a route throws an unexpected error
- **THEN** the response is 500 `{error:"server_error", message:"Server error"}`, and when hosted the log names only the error's name

### Requirement: Local edge in Mode L

The server SHALL, in Mode L, bind `127.0.0.1` on `npm start`, answer only requests whose `Host` is a loopback name
(`localhost`, `127.0.0.1` or `[::1]`, any port), let Better Auth trust only this server's own loopback origins (those three
names on its own `PORT`, default 3100), refuse
cross-origin cookie writes including those from another localhost port, and refuse any browser `Origin` on `/api/mcp`.

#### Scenario: DNS-rebound host

- **WHEN** a Mode L request arrives with `Host: evil.example`
- **THEN** the server responds 421 `Misdirected request: this server answers to localhost only`

#### Scenario: Another local port

- **WHEN** a cookie-authenticated write arrives with `Origin: http://localhost:5555` while `Host` is `localhost:3100`
- **THEN** the server responds 403 `cross_site`, and Better Auth rejects the same origin on its own routes

#### Scenario: Browser calling the MCP endpoint

- **WHEN** a request to `/api/mcp` carries any `Origin` header, in either mode
- **THEN** the server responds 403 without reading its token

### Requirement: Served paths in both modes

The server SHALL redirect `/` to `/app`, serve every path under `/app`, and answer every path under `/api/v2`, in
both modes and without any feature flag.

#### Scenario: Root

- **WHEN** a browser requests `/` on a Mode L or hosted server
- **THEN** the server responds 307 with `Location` ending in `/app`

#### Scenario: Retired paths

- **WHEN** a Mode L client requests `/setup`, `/new`, `/w/<id>`, `/api/session` or `/api/proposals`
- **THEN** the server responds 404

### Requirement: Hosted edge and route allowlist

The server SHALL, when `HOSTED=1`, answer at the request edge 503 when misconfigured, 421 for a `Host` not in `ALIGN_HOSTS`, 403 without `X-Forwarded-Proto: https` or
without `Fly-Client-IP`, and 404 `{"error":"Not found"}` for every path outside `/app*`, `/api/v2/*`, `/api/mcp`,
`/oauth/*`, `/.well-known/*`, `/api/oauth/*` and the static assets.

#### Scenario: Paths outside the allowlist

- **WHEN** a hosted server receives `GET /api/state`, `POST /api/sessions/events` or `GET /setup`
- **THEN** it responds 404 `{"error":"Not found"}`

#### Scenario: Edge checks

- **WHEN** a hosted request has `Host: other.example`, or lacks `X-Forwarded-Proto: https`, or lacks `Fly-Client-IP`
- **THEN** the server responds 421 `Misdirected request: this server answers to its own host name only`, 403 `{"error":"Use https"}`, or 403 `{"error":"Use the public address"}` respectively

#### Scenario: No closing date

- **WHEN** a hosted server starts with a past `ALIGN_DELETE_BY` left in its environment
- **THEN** it ignores the setting and serves normally: a hosted server never shuts itself down, and how long data is kept follows the retention schedule

### Requirement: Hosted startup checks

The server SHALL refuse to start when hosted, naming each problem, unless `ALIGN_HOSTS` lists the public host names
(no loopback names), `ALIGN_SECRET` and `BETTER_AUTH_SECRET` each have 32+ characters, `ALIGN_DATA_DIR` is an absolute
path outside the app directory, `ALIGN_PUBLIC_ORIGIN` is a bare `https://host`
origin whose host is in `ALIGN_HOSTS`, and sign-in is possible: all three of `ALIGN_EMAIL_API_URL` (https),
`ALIGN_EMAIL_API_KEY` and `ALIGN_EMAIL_FROM` are set, or Google's or GitHub's client id and secret are.

#### Scenario: No way to sign in

- **WHEN** a hosted server starts with none of the email settings and neither provider's id and secret
- **THEN** it refuses to start and names that it needs the email settings or a Google or GitHub client

#### Scenario: Partial or unsafe settings

- **WHEN** a hosted server starts with only some of the three email settings, an `http:` `ALIGN_EMAIL_API_URL`, a Google or GitHub client id without its secret (or the reverse), `ALIGN_TEST_IDP` or `ALIGN_LOCAL_OWNER_EMAIL` set, or `ALIGN_PUBLIC=1`
- **THEN** it refuses to start and names each problem; any mode refuses `ALIGN_PUBLIC=1`

#### Scenario: Email only

- **WHEN** a hosted server starts with all three email settings and no Google or GitHub settings, and every other check passes
- **THEN** it starts, and sign-in is by email code only

### Requirement: Server data and single server

The server SHALL keep its database (people, sessions, workspaces and everything in them) in one SQLite file (WAL) at
`<ALIGN_DATA_DIR or ./data>/v2/align.sqlite` in a 0700 directory with the file at 0600, generate Better Auth's secret into `.auth-secret` (0600) in that directory in Mode L
when `BETTER_AUTH_SECRET` is unset, migrate the database before serving, and run only one server per data directory.

#### Scenario: Second server

- **WHEN** a second process starts on the same data directory while the pid file `<data>/.pid` names a live process
- **THEN** it exits with `Another Align server (pid <n>) is using <dir>. Stop it first.` and does not serve

#### Scenario: First request during migration

- **WHEN** a request reaches an `/api/v2` route before the database has been opened and migrated
- **THEN** the route waits for the migration to finish and never runs against an unmigrated file

### Requirement: Workspace creation by any signed-in person

The server SHALL let any signed-in person, in either mode, create a workspace on `POST /api/v2/workspaces {name}`
(1 to 100 characters) as its only owner.

#### Scenario: Create

- **WHEN** a signed-in person POSTs `{name:"Acme"}`
- **THEN** the response is 201 `{id:"ws_…", name:"Acme", role:"owner"}`, and the audit records `workspace.created` with them as actor

#### Scenario: Creation limits

- **WHEN** the person creates an 11th workspace within an hour, or already owns 50, counting workspaces made with `POST /api/v2/workspaces/sample`
- **THEN** the server responds 429 `rate_limited`, or 409 `too_many_workspaces` respectively

### Requirement: Workspace rename and deletion

The server SHALL let a workspace owner rename the workspace on `PATCH /api/v2/workspaces/{ws} {name}` and delete it on
`DELETE /api/v2/workspaces/{ws}`, where deletion removes everything in the workspace and revokes every device grant and
OAuth grant for it.

#### Scenario: Rename

- **WHEN** an owner PATCHes `{name:"Acme Robotics"}`
- **THEN** the response is `{id, name:"Acme Robotics"}` and the audit records `workspace.renamed`; a member gets 403 `owner_only`, a viewer 403 `read_only`

#### Scenario: Delete

- **WHEN** an owner DELETEs the workspace
- **THEN** the server responds 204, the workspace's members, invites, teams, goals, alignments, change requests, sessions, epochs, usage, activity, directives and audit rows are gone, devices lose their grant for it, its OAuth grants stop working, and a later request for it is 404 `not_found`

### Requirement: Workspace visibility and roles

The server SHALL decide every workspace action from the caller's workspace role and team roles, answering 404
`not_found` for a workspace the caller is not a member of (or a device was not granted) and 403 with a code for a
visible action the role does not allow.

#### Scenario: Hidden workspace

- **WHEN** a non-member, or a device without a grant for that workspace, requests any route under `/api/v2/workspaces/{ws}`
- **THEN** the server responds 404 `not_found`, the same as for a workspace that does not exist

#### Scenario: Role refusals

- **WHEN** a viewer attempts any change other than leaving, a member attempts an owner-only action (invites, creating teams, member roles and removal, renaming or deleting the workspace, reading the audit trail), or a member who is neither owner nor that team's lead changes a team's membership
- **THEN** the server responds 403 `read_only`, `owner_only` or `not_team_lead` respectively

### Requirement: Workspace and account read views

The server SHALL serve, to a signed-in browser session, the caller's workspaces on `GET /api/v2/workspaces`, one
workspace on `GET /api/v2/workspaces/{ws}`, and the caller's paired devices on `GET /api/v2/devices`, and to either
credential the caller's identity on `GET /api/v2/me`.

#### Scenario: Workspace views

- **WHEN** a member calls `GET /api/v2/workspaces` and `GET /api/v2/workspaces/{ws}`
- **THEN** the responses are `{workspaces:[{id, name, role, teams:[{id, name, role}]}]}` and `{workspace:{id, name, created_at}, role, me, members:[{id, name, email, role}], teams:[{id, name, my_role, members:[{id, name, role}]}]}`

#### Scenario: Who am I

- **WHEN** a device token or a browser session calls `GET /api/v2/me`
- **THEN** the response is `{user:{id, name, email}, device, workspaces}`, where `device` is `{id, name}` only for a device token, and for a device `workspaces` lists only the workspaces granted to it while the person is still a member

#### Scenario: Devices list

- **WHEN** a person calls `GET /api/v2/devices`
- **THEN** the response is `{devices:[{id, name, created_at, last_seen_at, revoked_at, revoked_reason, workspaces:[{id, name}]}]}` listing only their own devices

### Requirement: Email-bound invites

The server SHALL let workspace owners create invites on `POST /api/v2/workspaces/{ws}/invites {email, role}`, list them
on `GET`, and withdraw an unaccepted one on `DELETE .../invites/{id}`, each invite being a single-use link valid for 7
days that only the invited email address can accept.

#### Scenario: Creating an invite

- **WHEN** an owner invites a new email address
- **THEN** the response is 201 `{id, email, role, team_id, team_role, path:"/app/invite/<token>", token}` with the email lowercased; an existing member's email is 409 `already_member`, an invalid address 400, and more than 50 invites per workspace per hour 429 `rate_limited`

#### Scenario: Previewing an invite

- **WHEN** a signed-in person calls `GET /api/v2/invites/{token}`
- **THEN** the response is `{workspace:{id, name}, role, team, team_role, email_matches, invited_email}` (`team` is `{id, name}` or null), or 404 `not_found` for an unknown, accepted, withdrawn or expired token

#### Scenario: Accepting an invite

- **WHEN** a signed-in person POSTs `/api/v2/invites/{token}/accept`
- **THEN** they join with the invited role and the response is `{workspace_id, role, team_id}`; another email is 403 `email_mismatch`, an unverified email when hosted 403 `email_unverified`, an existing member 409 `already_member`, and an unknown, accepted or expired token 404 `not_found`

### Requirement: Invites that name a team

The server SHALL accept an optional `team_id` and `team_role` (`lead` or `member`, default `member`) on an invite and,
when the invite is accepted, add the person to that team with that role in the same transaction as the membership.

#### Scenario: Team invite accepted

- **WHEN** an owner invites `bo@example.com` with `{role:"member", team_id:<Product>}` and Bo accepts
- **THEN** Bo is a workspace member and a `member` of the Product team, and the audit records `invite.accepted` with Bo as actor

#### Scenario: Invalid team on an invite

- **WHEN** the invite names a team that is not in this workspace, or a `team_role` other than `lead` or `member`, or a `team_role` without a `team_id`
- **THEN** the server responds 404 `not_found`, 400 `bad_request` or 400 `bad_request` respectively and creates no invite

### Requirement: Teams and team membership

The server SHALL let workspace owners create teams on `POST /api/v2/workspaces/{ws}/teams {name}` (1 to 100
characters), let an owner or the team's lead add, change or remove team members on `.../teams/{team}/members`, and
allow a person in any number of teams, with no team inside another.

#### Scenario: Create a team

- **WHEN** an owner POSTs `{name:"Security"}`
- **THEN** the response is 201 `{id:"pod_…", name:"Security"}` and the audit records `team.created`

#### Scenario: Team members

- **WHEN** an owner or the team's lead POSTs `{user_id, role:"member"}` to `.../teams/{team}/members` or DELETEs `.../teams/{team}/members/{user}`
- **THEN** the member is set (`{team_id, user_id, role}`) or removed (204); a person who is not a workspace member, an unknown team or a missing team member is 404 `not_found`

#### Scenario: Several teams

- **WHEN** an owner adds the same person to the Product and Security teams
- **THEN** both memberships exist, and `GET /api/v2/workspaces/{ws}` lists the person under both teams

### Requirement: Team lead rules

The server SHALL let only a workspace owner make someone a team lead, change a lead's team role, or remove another
person who is a lead, while a lead may add and remove the team's members and remove themselves.

#### Scenario: Lead promoting someone

- **WHEN** a team lead who is not a workspace owner POSTs `{user_id, role:"lead"}`, or changes another lead to `member`, or removes another lead
- **THEN** the server responds 403 `owner_only` and changes nothing

#### Scenario: Lead leaving the team

- **WHEN** a lead DELETEs their own team membership
- **THEN** the server responds 204 and they are no longer in the team

### Requirement: Team naming and pod aliases

The server SHALL call a team "Team" in everything a person or agent sees (UI, API paths and JSON keys, MCP and CLI
text), using JSON keys `team`, `team_id` and `teams`, while storage keeps its `pod` names and ids keep the `pod_`
prefix, and SHALL answer the old `/api/v2/workspaces/{ws}/pods…` paths as aliases of `/teams…`.

#### Scenario: Old path

- **WHEN** a client POSTs `{user_id, role}` to `/api/v2/workspaces/{ws}/pods/{team}/members`
- **THEN** the result and response are exactly those of `/teams/{team}/members`, including the `team_id` key

#### Scenario: Visible words

- **WHEN** a person reads any `/api/v2` response, error message or audit action about teams
- **THEN** it says team (for example `not_team_lead`, `Only a workspace owner can make someone a team lead`, `team.member_set`), never pod; audit rows stored as `pod.*` are shown as `team.*`

### Requirement: Member role changes and removal

The server SHALL let a workspace owner change a member's role on `POST /api/v2/workspaces/{ws}/members/{user} {role}`
and remove a member on `DELETE .../members/{user}`, let any member (viewers included) leave by deleting their own
membership, and on removal or leaving delete the person's team memberships and revoke their device grants and OAuth
grants for that workspace while keeping their goals, sessions and history attributed to them.

#### Scenario: Change a role

- **WHEN** an owner POSTs `{role:"viewer"}` for a member
- **THEN** the response is `{user_id, role:"viewer"}` and the audit records `member.role_changed`; a non-owner gets 403 (`owner_only` or `read_only`) and an unknown person 404 `not_found`

#### Scenario: Remove a member

- **WHEN** an owner DELETEs another member who has a paired device granted this workspace and an approved MCP app for it
- **THEN** the server responds 204, the person is in no team of the workspace, their device gets 404 for the workspace while keeping its other grants, their MCP app's tokens for the workspace stop working, their goals and shared sessions remain under their name, and the audit records `member.removed`

#### Scenario: Leave

- **WHEN** a member or viewer DELETEs `.../members/{their own id}`
- **THEN** the server responds 204 with the same effects and the audit records `member.left`; a member removing someone else gets 403 `owner_only`

### Requirement: Last owner protection

The server SHALL refuse, with 409 `last_owner`, any role change, removal or leaving that would leave a workspace with no
owner.

#### Scenario: Only owner leaves

- **WHEN** the workspace's only owner tries to leave, demote themselves, or be removed
- **THEN** the server responds 409 `last_owner` and nothing changes

#### Scenario: Second owner exists

- **WHEN** a workspace has two owners and one of them demotes themselves to member
- **THEN** the change succeeds

### Requirement: Connected apps per workspace

The server SHALL list a workspace's connected MCP apps (OAuth grants, each bound to one person and this workspace) on
`GET /api/v2/workspaces/{ws}/apps` and revoke one on `DELETE /api/v2/workspaces/{ws}/apps/{grant}`, where workspace
owners see and revoke every grant and other members only their own.

#### Scenario: Member revokes their app

- **WHEN** a member DELETEs one of their own grants
- **THEN** the server responds 204, that app's access and refresh tokens stop working, and the audit records `oauth.app_revoked` with the member as actor

#### Scenario: Someone else's grant

- **WHEN** a member who is not an owner lists apps or DELETEs another person's grant
- **THEN** the list holds only their own grants and the DELETE is 404 `not_found`; an owner's DELETE of any grant succeeds

### Requirement: Workspace audit trail

The server SHALL write an audit row naming its actor for every change a person makes to a workspace's settings,
members, invites, teams, goals, alignments, change requests, connected-app revocations and session controls (stop sharing, history
deletion, agent stop and resume), with actor null only for system actions, and serve the newest 200 rows of that
workspace to workspace owners only on `GET /api/v2/workspaces/{ws}/audit`. Device uploads (sharing a session, opening an
epoch, usage and activity) write no audit row, and device pairing and revocation are recorded without a workspace, so
they never appear in a workspace's audit.

#### Scenario: Reading the audit

- **WHEN** an owner calls `GET /api/v2/workspaces/{ws}/audit`
- **THEN** the response is `{audit:[{at, actor:{id, name}|null, action, object_id}]}`, newest first, at most 200 rows; a member gets 403 `owner_only`, a viewer 403 `read_only`

#### Scenario: Attributed actions

- **WHEN** an owner withdraws an invite, a lead changes a team member, or a person revokes their own device
- **THEN** each writes a row (`invite.withdrawn` and `team.member_set` in the workspace's audit, `device.revoked` with no workspace) whose actor is that person; only automatic events such as revocation for refresh-token reuse have a null actor

### Requirement: Device pairing flow

The server SHALL pair a device by a key-bound device-code flow: `POST /api/v2/device/authorize {device_name,
public_key}` (a 32-byte base64url Ed25519 key, name at most 100 characters) returns a code for the person to approve,
and `POST /api/v2/device/token` returns the tokens exactly once after approval.

#### Scenario: Starting a pairing

- **WHEN** the CLI POSTs `/api/v2/device/authorize`
- **THEN** the response is `{device_code, user_code:"XXXX-XXXX", verification_uri:"<origin>/app/device", expires_in:600, interval:5}`, where the user code uses only the letters `BCDFGHJKLMNPQRSTVWXZ`; more than 10 requests per client per hour get 429 `rate_limited`

#### Scenario: Polling before and after a decision

- **WHEN** a device polls with `grant_type` `urn:ietf:params:oauth:grant-type:device_code` and its `device_code`
- **THEN** a pending code answers 400 `authorization_pending`, a denied code 400 `access_denied`, an expired (10-minute) code 400 `expired_token`, an unknown device code 400 `invalid_grant`, another `grant_type` 400 `unsupported_grant_type`, and a poll sooner than the interval 400 `slow_down` with 5 seconds added to the interval

#### Scenario: Tokens once

- **WHEN** a device polls an approved code
- **THEN** the response is `{device_id, access_token:"alnd_…", expires_in:3600, refresh_token:"alnr_…", user:{id, name, email}}` with grants for the approved workspaces the person still belongs to, and the next poll gets 400 `expired_token`; only SHA-256 hashes of the tokens are stored

### Requirement: Device approval, refresh and revocation

The server SHALL let a signed-in person look up a pending code on `GET /api/v2/device/requests/{code}`, approve it for
workspaces they belong to on `POST /api/v2/device/approve {user_code, workspace_ids}` or deny it on
`POST /api/v2/device/deny {user_code}`, rotate refresh tokens on `POST /api/v2/device/refresh` only with an Ed25519
signature from the paired key, and revoke a device on `DELETE /api/v2/devices/self` (its own token) or
`DELETE /api/v2/devices/{id}` (its owner's browser session).

#### Scenario: Approving a code

- **WHEN** a person with a recent sign-in approves a pending, unexpired code (in any letter case, with or without the hyphen)
- **THEN** the response is `{state:"approved"}`; an empty `workspace_ids` is 400 `Choose at least one workspace for this device`, a workspace they are not a member of or an unknown, expired or decided code 404, and more than 20 lookups, or more than 20 decisions, per person in 10 minutes 429 `rate_limited`

#### Scenario: Refresh token reuse

- **WHEN** a device presents, with a valid signature, a refresh token that was already rotated
- **THEN** the server responds 401 `invalid_grant` and revokes the whole device; a bad signature, a timestamp more than 5 minutes off, an expired token or a revoked device also get 401 `invalid_grant`

#### Scenario: Revoking a device

- **WHEN** a device calls `DELETE /api/v2/devices/self`, or its owner calls `DELETE /api/v2/devices/{id}` from the browser
- **THEN** the server responds 204, every token of that device stops working, and the audit records `device.revoked` with the person as actor; another person's device id is 404

### Requirement: Shared session ownership

The server SHALL accept a shared session on `PUT /api/v2/workspaces/{ws}/sessions/{key} {harness, repo_key,
repo_alias?, started_at, title?}` only from a device granted that workspace (members and owners, never viewers), keep
every session private to the device and person that shared it, let that person stop sharing on
`POST .../sessions/{key}/stop-sharing` or hard-delete the history on `DELETE .../sessions/{key}`, and list sessions on
`GET /api/v2/workspaces/{ws}/sessions` as `{mine, all}`.

#### Scenario: Sharing

- **WHEN** a device PUTs a new session key with `harness` `claude-code` or `codex` and a 43-character base64url `repo_key`
- **THEN** the response is `{session_key, state:"shared", current_epoch:null}`; the same key with another harness or repo is 409 `session_conflict`, a stopped session 409 `sharing_stopped`, and a key shared by another person or device 404

#### Scenario: Stop sharing and delete

- **WHEN** the session's person stops sharing, then deletes it
- **THEN** stop-sharing returns `{session_key, state:"stopped"}`, ends the open epoch and refuses later uploads with 409 `sharing_stopped`; the delete returns 204 and removes the session, its epochs, usage, directive deliveries and receipts, so spend totals change

#### Scenario: Session list

- **WHEN** a member calls `GET .../sessions`
- **THEN** `mine` lists their own sessions in full (state, current epoch and goal, governing goal, stop status, conflicts and token totals), and `all` is null except for workspace owners, for whom it lists every non-stopped session's alias, owner, harness, state and stop status, never its title or usage

### Requirement: Binding epochs

The server SHALL let the sharing device open a binding epoch on `POST .../sessions/{key}/epochs {epoch_id, goal_id,
starts_at, root_turn?, cause}`, closing the previous epoch at `starts_at`, only toward a goal the person has authority
to bind (as defined in `goals-and-proposals`).

#### Scenario: Opening an epoch

- **WHEN** a device POSTs `{epoch_id:"ep_…", goal_id|null, starts_at, cause:"manual"|"directive:<dir id>"}`
- **THEN** the response is `{epoch_id, goal_id, goal_version_at_start, starts_at, ends_at:null}` and the previous epoch ends at `starts_at`; the session becomes `shared` again if it was suspended

#### Scenario: Epoch refusals

- **WHEN** the epoch id is reused with other values, `starts_at` is before the open epoch's start or the last epoch's end, `starts_at` is more than 5 minutes ahead or before the session started, the goal cannot be bound, the goal is not active, `cause` names a directive not sent to this session, or sharing stopped
- **THEN** the server responds 409 `epoch_conflict`, 409 `epoch_overlap`, 400, 403 `alignment_required`, 409 `goal_not_active`, 400, or 409 `sharing_stopped` respectively; the same epoch sent again returns it unchanged

### Requirement: Usage upload

The server SHALL accept usage from the sharing device on `POST .../sessions/{key}/usage {rows}` (at most 500 rows and
256 KB), store each row once by its `request_key`, and never overwrite a stored row.

#### Scenario: Usage batch

- **WHEN** a device POSTs rows for its session
- **THEN** the response is `{accepted, duplicates, conflicts}`, where a repeated `request_key` with identical values is a duplicate, and one with other values or a row for an epoch this session does not have is a conflict that is counted on the session and never stored

#### Scenario: Oversized batch

- **WHEN** a batch has 501 rows, or its body exceeds 256 KB
- **THEN** the server responds 413 `too_many_rows`, or 413 `too_large`, and stores nothing

### Requirement: Spend report

The server SHALL report token usage and estimated list cost on
`GET /api/v2/workspaces/{ws}/spend?by=goal|team|session&from&to` (browser session) to every workspace member, viewers
included, counting each request under the goal of the epoch it was uploaded with and never naming a goal or session
the caller may not see.

#### Scenario: Spend by goal

- **WHEN** a member requests spend by goal
- **THEN** the response is `{by, from, to, note, total, unallocated, unpriced_requests, rows}`, `note` says costs are list-price estimates, not a bill, usage in epochs without a goal is `unallocated`, and usage on goals the caller cannot read is one `Private goals` row

#### Scenario: Spend by team and session

- **WHEN** a member requests `by=team` or `by=session`
- **THEN** team rows carry `team:{id, name}` with goals that have no team in one `Goals without a team` row, and session rows name only the caller's own sessions with everyone else's in one `Other people's sessions` row; `by=pod` is accepted as `by=team`, and another `by` or a `from` not before `to` is 400

### Requirement: Activity signals

The server SHALL accept in-flight work signals from a device on `POST /api/v2/workspaces/{ws}/activity {items}` (at
most 200 items and 128 KB; kinds `edit`, `commit`, `task`, `claim`) and serve unexpired ones to devices on
`GET .../activity?after=<seq>` (at most 500, oldest first) only for goals the caller may read and, for unbound
sessions, only the caller's own.

#### Scenario: Posting activity

- **WHEN** a device posts items for its own shared sessions
- **THEN** the response is `{accepted}`; items for sessions it did not share or that are not `shared`, or dated more than 5 minutes ahead or more than 24 hours back, are skipped; an invalid kind, `repo_id`, `path_hash` or a path that is absolute or climbs with `..` is 400; items expire after 24 hours (claims after 1 hour)

#### Scenario: Reading activity

- **WHEN** a device calls `GET .../activity?after=<seq>`
- **THEN** the response is `{cursor, items}`, each item with `seq, session_key, harness, user:{id, name}, mine, goal_id, repo_id, kind, path_hash, path, text, at, expires_at`, leaving out items on goals the caller cannot read and other people's unbound sessions

### Requirement: Account and workspace rate limits

The server SHALL limit v2 requests and email-code sends with in-memory sliding windows (at most 10,000 keys, oldest
evicted first), keying clients by `Fly-Client-IP` when hosted (IPv6 by its /64) and as one local client in Mode L, and
answer a v2 limit with 429 `rate_limited`; Better Auth's own per-path limits apply only when hosted, since Mode L turns
off its IP tracking.

#### Scenario: Better Auth limits

- **WHEN** a hosted client exceeds 10 requests per minute to `/api/v2/auth/sign-in/email-otp`, `/sign-in/email` or `/sign-up/email`, 20 to `/sign-in/social` or `/email-otp/send-verification-otp`, or 100 per minute elsewhere under `/api/v2/auth`
- **THEN** Better Auth refuses the request with 429; a Mode L server applies none of these, only the email-code send limits and the v2 limits

#### Scenario: v2 limits

- **WHEN** a person creates an 11th workspace in an hour, a workspace gets a 51st invite in an hour, a client starts an 11th device pairing in an hour, or a person makes a 21st device-code lookup, or a 21st approve-or-deny decision, in 10 minutes (lookups and decisions are counted separately)
- **THEN** the server responds 429 `rate_limited` and does nothing else

## Open questions

- Who may create hosted workspaces (Owner decision 2026-10-30 keeps it open): today any signed-in account can create up to 10 per hour and own 50.
- Passkeys, SSO, SAML and SCIM are out of scope for now.
- Unlinking a Google or GitHub account from `/app/account` is out of scope; should a person be able to unlink a provider while another sign-in method remains?
- Removing or leaving keeps a person's goals and sessions. Their open alignments, change requests and pending approvals, and goals they own that others depend on, are not reassigned; whether an owner can transfer goal ownership is not decided.

## Sources

- proxy.ts
- instrumentation.ts
- package.json
- lib/config.ts
- lib/startup.ts
- lib/http.ts
- lib/secret.ts
- lib/ratelimit.ts
- lib/oauth/grants.ts
- lib/v2/config.ts
- lib/v2/auth.ts
- lib/v2/mail.ts
- lib/v2/local-owner.ts
- lib/v2/http.ts
- lib/v2/limits.ts
- lib/v2/errors.ts
- lib/v2/ids.ts
- lib/v2/init.ts
- lib/v2/db.ts
- lib/v2/policy.ts
- lib/v2/validate.ts
- lib/v2/workspaces.ts
- lib/v2/lifecycle.ts
- lib/v2/devices.ts
- lib/v2/sessions.ts
- lib/v2/activity.ts
- lib/v2/spend.ts
- scripts/sign-in-link.mjs
- docs/v2/WIRE.md
- docs/HOSTING.md
- app/page.tsx
- app/app/sign-in/page.tsx
- app/app/account/page.tsx
- app/api/v2/auth/[...all]/route.ts
- app/api/v2/me/route.ts
- app/api/v2/workspaces/route.ts
- app/api/v2/workspaces/[ws]/route.ts
- app/api/v2/workspaces/[ws]/audit/route.ts
- app/api/v2/workspaces/[ws]/apps/route.ts
- app/api/v2/workspaces/[ws]/apps/[grant]/route.ts
- app/api/v2/workspaces/[ws]/members/[user]/route.ts
- app/api/v2/workspaces/[ws]/invites/route.ts
- app/api/v2/workspaces/[ws]/invites/[id]/route.ts
- app/api/v2/invites/[token]/route.ts
- app/api/v2/invites/[token]/accept/route.ts
- app/api/v2/workspaces/[ws]/teams/route.ts
- app/api/v2/workspaces/[ws]/teams/[team]/members/route.ts
- app/api/v2/workspaces/[ws]/teams/[team]/members/[user]/route.ts
- app/api/v2/workspaces/[ws]/pods/route.ts
- app/api/v2/workspaces/[ws]/pods/[pod]/members/route.ts
- app/api/v2/workspaces/[ws]/pods/[pod]/members/[user]/route.ts
- app/api/v2/device/authorize/route.ts
- app/api/v2/device/token/route.ts
- app/api/v2/device/approve/route.ts
- app/api/v2/device/deny/route.ts
- app/api/v2/device/refresh/route.ts
- app/api/v2/device/requests/[code]/route.ts
- app/api/v2/devices/route.ts
- app/api/v2/devices/self/route.ts
- app/api/v2/devices/[id]/route.ts
- app/api/v2/workspaces/[ws]/sessions/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/epochs/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/usage/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/stop-sharing/route.ts
- app/api/v2/workspaces/[ws]/spend/route.ts
- app/api/v2/workspaces/[ws]/activity/route.ts
